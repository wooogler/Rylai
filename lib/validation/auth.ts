import { z } from 'zod';

// Password rule (prototype): minimum length only. Shared by client and server.
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) return { valid: false, error: 'Password must be at least 8 characters long' };
  return { valid: true };
}

const usernameField = z.string().trim().min(2, 'Username must be at least 2 characters').max(40);
const passwordField = z.string().min(1, 'Please enter a password');

// Educator sign-up — only from the root page, and only with the educator passcode. There is
// no passcode-less path any more: a missing passcode used to silently create a learner
// account, which is exactly what the distribution-link model removes.
export const educatorSignupSchema = z.object({
  username: usernameField,
  password: passwordField,
  // `error` covers the omitted-field case too, which would otherwise surface Zod's raw
  // "expected string, received undefined" to an educator who just left the box empty.
  passcode: z.string({ error: 'The educator passcode is required' }).min(1, 'The educator passcode is required'),
});

// Student sign-up — only from an educator's distribution link, so `educator` (that educator's
// username, taken from the URL segment) is mandatory and names the namespace the account is
// created in. `accessCode` is optional unless the educator turned off open enrollment.
export const studentSignupSchema = z.object({
  username: usernameField,
  password: passwordField,
  educator: z.string().trim().min(1, 'Missing educator'),
  accessCode: z.string().trim().optional(),
});

// Login. `educator` present = a student logging in on `/<educator>`; absent = an educator
// logging in at the root. The two never resolve to the same account, so the lookup must be
// scoped by it — usernames are only unique within their own namespace.
export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Please enter your username'),
  password: passwordField,
  educator: z.string().trim().optional(),
});

export type EducatorSignupInput = z.infer<typeof educatorSignupSchema>;
export type StudentSignupInput = z.infer<typeof studentSignupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
