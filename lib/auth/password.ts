import bcrypt from 'bcryptjs';

// bcryptjs (pure JS) is used instead of bcrypt for portability across runtimes.
const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Re-export the shared strength rule so server code can import it from one place.
export { validatePassword } from '@/lib/validation/auth';
