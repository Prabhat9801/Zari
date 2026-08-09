import { Router } from 'express';
import { prisma } from './lib/prisma.js';
import { aiClient } from './services/aiClient.js';
import { asyncHandler, ok } from './lib/http.js';
import { env } from './config/env.js';

import authRoutes from './modules/auth/routes.js';
import userRoutes from './modules/users/routes.js';
import designRoutes from './modules/designs/routes.js';
import budgetRoutes from './modules/budget/routes.js';
import marketplaceRoutes from './modules/marketplace/routes.js';
import orderRoutes from './modules/orders/routes.js';
import paymentRoutes from './modules/payments/routes.js';
import qcRoutes from './modules/qc/routes.js';
import designerRoutes from './modules/designers/routes.js';
import messagingRoutes from './modules/messaging/routes.js';
import uploadRoutes from './modules/uploads/routes.js';
import opsRoutes from './modules/ops/routes.js';

const router: Router = Router();

/** Liveness — must stay dependency-free so Render never restarts a healthy box. */
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'zari-api' }));

/** Readiness — checks the things a request actually needs. */
router.get(
  '/health/ready',
  asyncHandler(async (_req, res) => {
    const [db, ai] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      aiClient.health(),
    ]);
    const status = db ? 'ok' : 'degraded';
    res.status(db ? 200 : 503).json({ status, checks: { database: db, aiService: ai } });
  }),
);

/** Public config the frontend reads on boot. */
router.get('/config', (_req, res) =>
  ok(res, {
    advancePercent: env.ADVANCE_PERCENT,
    fitWindowDays: env.FIT_WINDOW_DAYS,
    guestFreeGenerations: env.GUEST_FREE_GENERATIONS,
    currency: 'INR',
  }),
);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/designs', designRoutes);
// Budget routes are nested under a design, so they share the /designs prefix.
router.use('/designs', budgetRoutes);
router.use('/marketplace', marketplaceRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/qc', qcRoutes);
router.use('/designers', designerRoutes);
router.use('/messages', messagingRoutes);
router.use('/uploads', uploadRoutes);
router.use('/ops', opsRoutes);

export default router;
