import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

const keyByUserOrIp = (req: Request): string =>
  req.user?.id ?? req.guestToken ?? req.ip ?? 'unknown';

const message = {
  error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment.' },
};

export const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 240,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message,
});

/** OTP and login are the endpoints worth guarding hardest. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${(req.body as { phone?: string })?.phone ?? ''}`,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Try again in a few minutes.',
    },
  },
});

/** AI generation is the expensive path — cap it per identity. */
export const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'You are designing faster than we can keep up. Give it a few seconds.',
    },
  },
});
