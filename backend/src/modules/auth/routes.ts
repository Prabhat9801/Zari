import { Router } from 'express';
import { asyncHandler, created, noContent, ok } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { requireAuth } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { authService } from './service.js';
import {
  claimGuestSchema,
  emailLoginSchema,
  emailSignupSchema,
  refreshSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from './schema.js';

const router: Router = Router();

const meta = (req: { headers: Record<string, unknown>; ip?: string }) => ({
  userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
  ip: req.ip,
});

/** POST /api/auth/guest — start designing without an account. */
router.post(
  '/guest',
  asyncHandler(async (_req, res) => created(res, authService.createGuestToken())),
);

router.post(
  '/otp/request',
  authLimiter,
  validate(requestOtpSchema),
  asyncHandler(async (req, res) => ok(res, await authService.requestOtp(req.body))),
);

router.post(
  '/otp/verify',
  authLimiter,
  validate(verifyOtpSchema),
  asyncHandler(async (req, res) => ok(res, await authService.verifyOtp(req.body, meta(req)))),
);

router.post(
  '/signup',
  authLimiter,
  validate(emailSignupSchema),
  asyncHandler(async (req, res) =>
    created(res, await authService.signupWithEmail(req.body, meta(req))),
  ),
);

router.post(
  '/login',
  authLimiter,
  validate(emailLoginSchema),
  asyncHandler(async (req, res) => ok(res, await authService.loginWithEmail(req.body, meta(req)))),
);

router.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req, res) =>
    ok(res, await authService.refresh(req.body.refreshToken, meta(req))),
  ),
);

router.post(
  '/logout',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    await authService.logout(req.body.refreshToken);
    return noContent(res);
  }),
);

/** Claim guest designs after the fact (e.g. signed in via a different tab). */
router.post(
  '/claim-guest',
  requireAuth,
  validate(claimGuestSchema),
  asyncHandler(async (req, res) => {
    const count = await authService.claimGuestDesigns(req.user!.id, req.body.guestToken);
    return ok(res, { claimedDesigns: count });
  }),
);

/** GET /api/auth/me — the shape the app shell needs on boot. */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
        customerProfile: { select: { id: true, city: true, displayName: true } },
        designerProfile: {
          select: {
            id: true,
            studioName: true,
            slug: true,
            city: true,
            qualityScore: true,
            verificationStatus: true,
            isPublished: true,
          },
        },
        subscription: { select: { plan: true, status: true, currentPeriodEnd: true } },
      },
    });
    if (!user) throw notFound('Your account');
    return ok(res, user);
  }),
);

export default router;
