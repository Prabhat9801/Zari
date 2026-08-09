import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, param, created, noContent, ok, cursorArgs, toPage } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { notFound } from '../../lib/errors.js';

const router: Router = Router();

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  avatarUrl: z.string().url().nullish(),
  displayName: z.string().trim().max(80).nullish(),
  city: z.string().trim().max(60).nullish(),
  bio: z.string().trim().max(1000).nullish(),
  preferences: z.record(z.unknown()).optional(),
});

const measurementSchema = z.object({
  label: z.string().trim().min(1, 'Give this set a name.').max(60),
  unit: z.enum(['cm', 'in']).default('cm'),
  values: z.record(z.number().positive()).refine((v) => Object.keys(v).length > 0, {
    message: 'Add at least one measurement.',
  }),
  notes: z.string().trim().max(500).nullish(),
  isDefault: z.boolean().default(false),
});

const addressSchema = z.object({
  label: z.string().trim().max(40).default('Home'),
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(160).nullish(),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit pincode.'),
  phone: z.string().trim().max(20).nullish(),
  isDefault: z.boolean().default(false),
});

const collectionSchema = z.object({
  name: z.string().trim().min(1, 'Name your collection.').max(80),
  description: z.string().trim().max(500).nullish(),
  isPublic: z.boolean().default(false),
});

const pageSchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.use(requireAuth);

async function ensureCustomerProfile(userId: string): Promise<string> {
  const profile = await prisma.customerProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true },
  });
  return profile.id;
}

// --- Profile ----------------------------------------------------------------

router.patch(
  '/me',
  validate(profileSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof profileSchema>;
    await ensureCustomerProfile(req.user!.id);

    const profileData: Prisma.CustomerProfileUpdateWithoutUserInput = {};
    if (body.displayName !== undefined) profileData.displayName = body.displayName;
    if (body.city !== undefined) profileData.city = body.city;
    if (body.bio !== undefined) profileData.bio = body.bio;
    if (body.preferences !== undefined) {
      profileData.preferences = body.preferences as Prisma.InputJsonValue;
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
        customerProfile: { update: profileData },
      },
      include: { customerProfile: true },
    });
    return ok(res, user);
  }),
);

// --- Measurements -----------------------------------------------------------

router.get(
  '/me/measurements',
  asyncHandler(async (req, res) => {
    const profileId = await ensureCustomerProfile(req.user!.id);
    return ok(
      res,
      await prisma.measurement.findMany({
        where: { profileId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      }),
    );
  }),
);

router.post(
  '/me/measurements',
  validate(measurementSchema),
  asyncHandler(async (req, res) => {
    const profileId = await ensureCustomerProfile(req.user!.id);
    const body = req.body as z.infer<typeof measurementSchema>;

    if (body.isDefault) {
      await prisma.measurement.updateMany({ where: { profileId }, data: { isDefault: false } });
    }
    return created(
      res,
      await prisma.measurement.create({
        data: { profileId, ...body, notes: body.notes ?? null },
      }),
    );
  }),
);

router.delete(
  '/me/measurements/:id',
  asyncHandler(async (req, res) => {
    const profileId = await ensureCustomerProfile(req.user!.id);
    const row = await prisma.measurement.findFirst({ where: { id: param(req, 'id'), profileId } });
    if (!row) throw notFound('That measurement set');
    await prisma.measurement.delete({ where: { id: row.id } });
    return noContent(res);
  }),
);

// --- Addresses --------------------------------------------------------------

router.get(
  '/me/addresses',
  asyncHandler(async (req, res) => {
    const profileId = await ensureCustomerProfile(req.user!.id);
    return ok(
      res,
      await prisma.address.findMany({
        where: { profileId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      }),
    );
  }),
);

router.post(
  '/me/addresses',
  validate(addressSchema),
  asyncHandler(async (req, res) => {
    const profileId = await ensureCustomerProfile(req.user!.id);
    const body = req.body as z.infer<typeof addressSchema>;

    if (body.isDefault) {
      await prisma.address.updateMany({ where: { profileId }, data: { isDefault: false } });
    }
    return created(
      res,
      await prisma.address.create({
        data: {
          profileId,
          ...body,
          line2: body.line2 ?? null,
          phone: body.phone ?? null,
        },
      }),
    );
  }),
);

router.delete(
  '/me/addresses/:id',
  asyncHandler(async (req, res) => {
    const profileId = await ensureCustomerProfile(req.user!.id);
    const row = await prisma.address.findFirst({ where: { id: param(req, 'id'), profileId } });
    if (!row) throw notFound('That address');
    await prisma.address.delete({ where: { id: row.id } });
    return noContent(res);
  }),
);

// --- Collections ------------------------------------------------------------

router.get(
  '/me/collections',
  asyncHandler(async (req, res) =>
    ok(
      res,
      await prisma.collection.findMany({
        where: { ownerId: req.user!.id },
        orderBy: { updatedAt: 'desc' },
        include: {
          items: {
            take: 4,
            orderBy: { sortOrder: 'asc' },
            include: { design: { select: { id: true, title: true, coverUrl: true } } },
          },
          _count: { select: { items: true } },
        },
      }),
    ),
  ),
);

router.post(
  '/me/collections',
  validate(collectionSchema),
  asyncHandler(async (req, res) =>
    created(
      res,
      await prisma.collection.create({
        data: { ownerId: req.user!.id, ...req.body, description: req.body.description ?? null },
      }),
    ),
  ),
);

router.post(
  '/me/collections/:id/designs/:designId',
  asyncHandler(async (req, res) => {
    const collection = await prisma.collection.findFirst({
      where: { id: param(req, 'id'), ownerId: req.user!.id },
    });
    if (!collection) throw notFound('That collection');

    const item = await prisma.collectionItem.upsert({
      where: {
        collectionId_designId: { collectionId: collection.id, designId: param(req, 'designId') },
      },
      create: { collectionId: collection.id, designId: param(req, 'designId') },
      update: {},
    });
    return created(res, item);
  }),
);

router.delete(
  '/me/collections/:id/designs/:designId',
  asyncHandler(async (req, res) => {
    const collection = await prisma.collection.findFirst({
      where: { id: param(req, 'id'), ownerId: req.user!.id },
    });
    if (!collection) throw notFound('That collection');
    await prisma.collectionItem.deleteMany({
      where: { collectionId: collection.id, designId: param(req, 'designId') },
    });
    return noContent(res);
  }),
);

// --- Notifications ----------------------------------------------------------

router.get(
  '/me/notifications',
  validate(pageSchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof pageSchema>;
    const rows = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      ...cursorArgs(query.cursor, query.limit),
    });
    const unread = await prisma.notification.count({
      where: { userId: req.user!.id, readAt: null },
    });
    return ok(res, { ...toPage(rows, query.limit), unread });
  }),
);

router.post(
  '/me/notifications/read',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    return noContent(res);
  }),
);

export default router;
