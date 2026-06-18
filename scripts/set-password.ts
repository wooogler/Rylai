// Reset a user's password from the server (no email needed).
//
// Usage:
//   npm run set-password                      # interactive (prompts for both)
//   npm run set-password -- <username>        # prompts for the new password
//   npm run set-password -- <username> <pw>   # fully non-interactive
//
// Works for any account (learner or educator). Preserves the account and all of
// its conversation/feedback data — only the password hash is replaced.

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import * as readline from 'node:readline';
import { db } from '../lib/db/client';
import { users } from '../lib/db/schema';
import { validatePassword } from '../lib/validation/auth';

const SALT_ROUNDS = 10;

function prompt(query: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Print the prompt ourselves, then mute character echo for the typed password.
      process.stdout.write(query);
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
      rl.question('', (answer) => {
        rl.close();
        process.stdout.write('\n');
        resolve(answer);
      });
    } else {
      rl.question(query, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

async function main() {
  const [argUsername, argPassword] = process.argv.slice(2);

  const username = (argUsername ?? (await prompt('Username: '))).trim();
  if (!username) {
    console.error('Username is required.');
    process.exit(1);
  }

  const user = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (!user) {
    console.error(`No account found with username "${username}".`);
    process.exit(1);
  }

  const password = argPassword ?? (await prompt(`New password for "${username}" (${user.userType}): `, true));
  const check = validatePassword(password);
  if (!check.valid) {
    console.error(check.error);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

  console.log(`✓ Password updated for "${username}" (${user.userType}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to set password:', err);
  process.exit(1);
});
