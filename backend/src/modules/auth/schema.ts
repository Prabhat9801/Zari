import { z } from 'zod';

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{9,14}$/, 'Enter a valid phone number with country code.');

export const requestOtpSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(['LOGIN', 'SIGNUP']).default('LOGIN'),
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().length(6, 'Enter the 6-digit code we sent you.'),
  name: z.string().trim().min(1).max(80).optional(),
  /** When present, guest designs created under this token are claimed. */
  guestToken: z.string().trim().optional(),
});

export const emailSignupSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(128),
  name: z.string().trim().min(1).max(80),
  role: z.enum(['CUSTOMER', 'DESIGNER']).default('CUSTOMER'),
  guestToken: z.string().trim().optional(),
});

export const emailLoginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
  guestToken: z.string().trim().optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export const claimGuestSchema = z.object({
  guestToken: z.string().trim().min(4),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type EmailSignupInput = z.infer<typeof emailSignupSchema>;
export type EmailLoginInput = z.infer<typeof emailLoginSchema>;
