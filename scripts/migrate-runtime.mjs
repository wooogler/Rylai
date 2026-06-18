// Runtime database migration runner.
//
// Unlike `lib/db/migrate.ts` (run via tsx during local dev / image build), this
// script runs with plain `node` and only production dependencies, so it can run
// inside the standalone container at startup (see Dockerfile CMD).
//
// It is idempotent: drizzle tracks applied migrations in `__drizzle_migrations`
// and only applies pending ones. On an empty volume this creates the full schema;
// on an up-to-date volume it is a no-op.

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import fs from 'node:fs';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_URL || path.join(dataDir, 'rylai.db');
const migrationsFolder = path.join(process.cwd(), 'lib', 'db', 'migrations');

console.log(`[migrate] db=${dbPath} migrations=${migrationsFolder}`);

const sqlite = new Database(dbPath);
try {
  migrate(drizzle(sqlite), { migrationsFolder });
  console.log('[migrate] up to date');
} finally {
  sqlite.close();
}
