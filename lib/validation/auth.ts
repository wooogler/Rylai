import { z } from 'zod';

// Password rule (prototype): minimum length only. Shared by client and server.
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) return { valid: false, error: 'Password must be at least 8 characters long' };
  return { valid: true };
}

export const signupSchema = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(40),
  password: z.string().min(1, 'Please enter a password'),
  passcode: z.string().optional(),
  // Participant access code — required for learner signups (gates registration). Educators
  // use the passcode instead. Validated server-side against the access_codes table.
  accessCode: z.string().optional(),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Please enter your username'),
  password: z.string().min(1, 'Please enter a password'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
