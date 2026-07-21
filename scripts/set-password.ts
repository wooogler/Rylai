// Reset a user's password from the server (no email needed).
//
// Usage:
//   npm run set-password                      # interactive (prompts for both)
//   npm run set-password -- <username>        # prompts for the new password
//   npm run set-password -- <username> <pw>   # fully non-interactive
//   npm run set-password -- <username> <pw> --educator=<educatorUsername>
//
// Works for any account (student or educator). Preserves the account and all of its
// conversation/feedback data — only the password hash is replaced.
//
// Student usernames are unique per educator, so a bare username can be ambiguous. Without
// --educator this resolves the educator account of that name; pass --educator=<name> to
// target a student inside that educator's class. If the name is still ambiguous the script
// lists the candidates and refuses rather than resetting the wrong account.

import bcrypt from 'bcryptjs';
import { and, eq, isNull } from 'drizzle-orm';
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
  const args = process.argv.slice(2);
  const educatorFlag = args.find((a) => a.startsWith('--educator='))?.slice('--educator='.length).trim();
  const [argUsername, argPassword] = args.filter((a) => !a.startsWith('--'));

  const username = (argUsername ?? (await prompt('Username: '))).trim();
  if (!username) {
    console.error('Username is required.');
    process.exit(1);
  }

  let user;
  if (educatorFlag) {
    const educator = await db.query.users.findFirst({
      where: and(eq(users.username, educatorFlag), eq(users.userType, 'admin'), isNull(users.educatorId)),
    });
    if (!educator) {
      console.error(`No educator found with username "${educatorFlag}".`);
      process.exit(1);
    }
    user = await db.query.users.findFirst({
      where: and(eq(users.username, username), eq(users.educatorId, educator.id)),
    });
    if (!user) {
      console.error(`No student named "${username}" in ${educatorFlag}'s class.`);
      process.exit(1);
    }
  } else {
    const matches = await db.query.users.findMany({ where: eq(users.username, username) });
    if (matches.length === 0) {
      console.error(`No account found with username "${username}".`);
      process.exit(1);
    }
    // Prefer the educator account of that name; otherwise it must be unambiguous.
    const educatorMatch = matches.find((m) => m.educatorId === null);
    if (educatorMatch) {
      user = educatorMatch;
    } else if (matches.length === 1) {
      user = matches[0];
    } else {
      const educatorIds = [...new Set(matches.map((m) => m.educatorId!))];
      const educatorRows = await db.query.users.findMany({ where: eq(users.userType, 'admin') });
      const nameById = new Map(educatorRows.map((e) => [e.id, e.username]));
      console.error(`"${username}" exists in ${matches.length} classes. Re-run with one of:`);
      for (const id of educatorIds) {
        console.error(`  npm run set-password -- ${username} --educator=${nameById.get(id) ?? id}`);
      }
      process.exit(1);
    }
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
