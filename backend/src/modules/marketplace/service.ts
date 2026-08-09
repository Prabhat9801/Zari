import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { requestCode } from '../../lib/ids.js';
import { cursorArgs, toPage } from '../../lib/http.js';
import { computeMatches } from '../../services/matching.js';
import { bidVarianceNote } from '../../services/costing.js';
import { notify, notifyMany } from '../../services/notifications.js';
import { scoreLabel } from '../../services/qualityScore.js';
import type { DesignSpec } from '../../services/aiClient.js';

const designerCard = {
  id: true,
  studioName: true,
  slug: true,
  city: true,
  logoUrl: true,
  coverUrl: true,
  specialties: true,
  qualityScore: true,
  ratingAvg: true,
  reviewsCount: true,
  onTimeRate: true,
  fitSuccessRate: true,
  leadTimeMinDays: true,
  leadTimeMaxDays: true,
  capacityPercent: true,
} satisfies Prisma.DesignerProfileSelect;

export const marketplaceService = {
  /** Publishes a design version to the marketplace and matches designers to it. */
  async createRequest(
    customerId: string,
    input: {
      designId: string;
      versionId?: string;
      budgetMin?: number | null;
      budgetMax?: number | null;
      neededBy?: string | null;
      city?: string | null;
      notes?: string | null;
    },
  ) {
    const design = await prisma.design.findUnique({
      where: { id: input.designId },
      include: { currentVersion: true },
    });
    if (!design) throw notFound('That design');
    if (design.ownerId !== customerId) throw forbidden('This design belongs to someone else.');

    const versionId = input.versionId ?? design.currentVersionId;
    if (!versionId) throw badRequest('This design has no version to quote yet.');

    const version = await prisma.designVersion.findFirst({
      where: { id: versionId, designId: design.id },
    });
    if (!version) throw notFound('That version');
    if (!version.isManufacturable) {
      throw badRequest('This version needs a change before designers can quote on it.');
    }

    const existing = await prisma.designRequest.findFirst({
      where: { designId: design.id, status: 'OPEN' },
    });
    if (existing) throw conflict('This design is already out for quotes.');

    return prisma.$transaction(async (tx) => {
      const request = await tx.designRequest.create({
        data: {
          customerId,
          designId: design.id,
          versionId,
          code: requestCode(),
          budgetMin: input.budgetMin ?? null,
          budgetMax: input.budgetMax ?? design.targetBudget ?? null,
          neededBy: input.neededBy ? new Date(input.neededBy) : null,
          city: input.city ?? null,
          notes: input.notes ?? null,
          bidsCloseAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const matchCount = await computeMatches(tx, {
        requestId: request.id,
        spec: version.spec as unknown as DesignSpec,
        city: input.city ?? null,
      });

      await tx.design.update({ where: { id: design.id }, data: { status: 'QUOTED' } });

      const matched = await tx.designerMatch.findMany({
        where: { requestId: request.id },
        select: { designer: { select: { userId: true } } },
      });

      await notifyMany(
        tx,
        matched.map((m) => m.designer.userId),
        {
          type: 'BID_RECEIVED',
          title: 'A new design matches your studio',
          body: `${design.title} — ${version.spec ? (version.spec as { category?: string }).category ?? '' : ''}`,
          linkUrl: `/designer/bids?request=${request.id}`,
          data: { requestId: request.id },
        },
      );

      return { request, matchCount };
    });
  },

  /** The customer-facing "Designers matched to your design" list. */
  async listMatches(requestId: string, customerId: string) {
    const request = await prisma.designRequest.findUnique({
      where: { id: requestId },
      include: { version: { include: { costEstimate: true } } },
    });
    if (!request) throw notFound('That request');
    if (request.customerId !== customerId) throw forbidden('This request belongs to someone else.');

    const matches = await prisma.designerMatch.findMany({
      where: { requestId },
      orderBy: { rank: 'asc' },
      include: { designer: { select: designerCard } },
    });

    return matches.map((m) => ({
      ...m,
      scoreLabel: scoreLabel(m.designer.qualityScore),
    }));
  },

  /** Public designer directory. Sorting is never price-only. */
  async browseDesigners(query: {
    cursor?: string;
    limit: number;
    city?: string;
    specialty?: string;
    q?: string;
    sort: 'quality' | 'leadTime' | 'rating';
  }) {
    const where: Prisma.DesignerProfileWhereInput = {
      isPublished: true,
      verificationStatus: 'VERIFIED',
    };
    if (query.city) where.city = { equals: query.city, mode: 'insensitive' };
    if (query.specialty) where.specialties = { has: query.specialty };
    if (query.q) {
      where.OR = [
        { studioName: { contains: query.q, mode: 'insensitive' } },
        { bio: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.DesignerProfileOrderByWithRelationInput =
      query.sort === 'leadTime'
        ? { leadTimeMinDays: 'asc' }
        : query.sort === 'rating'
          ? { ratingAvg: 'desc' }
          : { qualityScore: 'desc' };

    const rows = await prisma.designerProfile.findMany({
      where,
      orderBy,
      ...cursorArgs(query.cursor, query.limit),
      select: {
        ...designerCard,
        bio: true,
        portfolioItems: {
          where: { isVisible: true },
          orderBy: { sortOrder: 'asc' },
          take: 4,
          select: { id: true, title: true, coverUrl: true, imageUrls: true, category: true },
        },
      },
    });

    return toPage(rows, query.limit);
  },

  async getDesignerPublic(slug: string) {
    const designer = await prisma.designerProfile.findUnique({
      where: { slug },
      select: {
        ...designerCard,
        bio: true,
        state: true,
        crafts: true,
        fabricSkills: true,
        verificationStatus: true,
        verifiedAt: true,
        completedOrders: true,
        portfolioItems: {
          where: { isVisible: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            title: true,
            description: true,
            coverUrl: true,
            imageUrls: true,
            category: true,
            occasion: true,
            fabric: true,
            embroidery: true,
            palette: true,
            tags: true,
          },
        },
        reviews: {
          where: { isPublished: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            rating: true,
            title: true,
            body: true,
            aspects: true,
            createdAt: true,
            author: { select: { name: true, avatarUrl: true } },
          },
        },
        qualityScoreLog: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { score: true, breakdown: true, createdAt: true },
        },
      },
    });
    if (!designer) throw notFound('That studio');

    return { ...designer, scoreLabel: scoreLabel(designer.qualityScore) };
  },

  /** Designer submits a bid. One bid per designer per request; update to change it. */
  async submitBid(
    designerId: string,
    requestId: string,
    input: {
      price: number;
      leadTimeDays: number;
      message?: string | null;
      proposedModification?: string | null;
      proposedPriceDelta?: number | null;
      portfolioRefs?: string[];
    },
  ) {
    const request = await prisma.designRequest.findUnique({
      where: { id: requestId },
      include: { design: { select: { title: true } } },
    });
    if (!request) throw notFound('That request');
    if (request.status !== 'OPEN') throw conflict('This request is no longer accepting quotes.');

    return prisma.$transaction(async (tx) => {
      const bid = await tx.bid.upsert({
        where: { requestId_designerId: { requestId, designerId } },
        create: {
          requestId,
          designerId,
          price: input.price,
          leadTimeDays: input.leadTimeDays,
          message: input.message ?? null,
          proposedModification: input.proposedModification ?? null,
          proposedPriceDelta: input.proposedPriceDelta ?? null,
          portfolioRefs: input.portfolioRefs ?? [],
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
        update: {
          price: input.price,
          leadTimeDays: input.leadTimeDays,
          message: input.message ?? null,
          proposedModification: input.proposedModification ?? null,
          proposedPriceDelta: input.proposedPriceDelta ?? null,
          portfolioRefs: input.portfolioRefs ?? [],
          status: 'SUBMITTED',
        },
      });

      const designer = await tx.designerProfile.findUniqueOrThrow({
        where: { id: designerId },
        select: { studioName: true },
      });

      await notify(tx, {
        userId: request.customerId,
        type: 'BID_RECEIVED',
        title: `${designer.studioName} sent a quote`,
        body: request.design.title,
        linkUrl: `/app/marketplace?request=${requestId}`,
        data: { requestId, bidId: bid.id },
      });

      return bid;
    });
  },

  /** Customer's bid comparison view. */
  async listBids(requestId: string, customerId: string) {
    const request = await prisma.designRequest.findUnique({
      where: { id: requestId },
      include: { version: { include: { costEstimate: true } } },
    });
    if (!request) throw notFound('That request');
    if (request.customerId !== customerId) throw forbidden('This request belongs to someone else.');

    const bids = await prisma.bid.findMany({
      where: { requestId, status: { in: ['SUBMITTED', 'SHORTLISTED', 'ACCEPTED'] } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      include: { designer: { select: designerCard } },
    });

    const estimate = request.version.costEstimate;

    return bids.map((bid) => ({
      ...bid,
      scoreLabel: scoreLabel(bid.designer.qualityScore),
      // A quote is not an estimate. Flag, don't block, when they diverge.
      varianceNote: bidVarianceNote(
        bid.price,
        estimate ? { minTotal: estimate.minTotal, maxTotal: estimate.maxTotal } : null,
      ),
    }));
  },

  /** Designer's own bid list for /designer/bids. */
  async listDesignerBids(designerId: string, query: { cursor?: string; limit: number }) {
    const rows = await prisma.bid.findMany({
      where: { designerId },
      orderBy: { createdAt: 'desc' },
      ...cursorArgs(query.cursor, query.limit),
      include: {
        request: {
          select: {
            id: true,
            code: true,
            status: true,
            budgetMin: true,
            budgetMax: true,
            neededBy: true,
            design: { select: { title: true, coverUrl: true, category: true } },
          },
        },
      },
    });
    return toPage(rows, query.limit);
  },

  /** Matched requests a designer can bid on. */
  async listDesignerOpportunities(designerId: string, query: { cursor?: string; limit: number }) {
    const rows = await prisma.designerMatch.findMany({
      where: {
        designerId,
        dismissedAt: null,
        request: { status: 'OPEN' },
      },
      orderBy: { createdAt: 'desc' },
      ...cursorArgs(query.cursor, query.limit),
      include: {
        request: {
          include: {
            design: { select: { title: true, coverUrl: true, category: true, briefText: true } },
            version: {
              include: { costEstimate: { select: { minTotal: true, maxTotal: true } } },
            },
            bids: { where: { designerId }, select: { id: true, status: true, price: true } },
          },
        },
      },
    });
    return toPage(rows, query.limit);
  },

  async withdrawBid(bidId: string, designerId: string) {
    const bid = await prisma.bid.findUnique({ where: { id: bidId } });
    if (!bid) throw notFound('That bid');
    if (bid.designerId !== designerId) throw forbidden('That is not your bid.');
    if (bid.status === 'ACCEPTED') throw conflict('An accepted quote cannot be withdrawn.');
    return prisma.bid.update({ where: { id: bidId }, data: { status: 'WITHDRAWN' } });
  },
};
