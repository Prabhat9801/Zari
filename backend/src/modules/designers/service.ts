import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { conflict, notFound } from '../../lib/errors.js';
import { slugify } from '../../lib/ids.js';
import { aiClient } from '../../services/aiClient.js';
import { logger } from '../../lib/logger.js';

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'studio';
  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const taken = await prisma.designerProfile.findUnique({ where: { slug: candidate } });
    if (!taken) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export const designerService = {
  /** Creates the studio profile and flips the account to the DESIGNER role. */
  async createProfile(
    userId: string,
    input: {
      studioName: string;
      city: string;
      state?: string | null;
      bio?: string | null;
      specialties?: string[];
      crafts?: string[];
      fabricSkills?: string[];
      leadTimeMinDays?: number;
      leadTimeMaxDays?: number;
    },
  ) {
    const existing = await prisma.designerProfile.findUnique({ where: { userId } });
    if (existing) throw conflict('You already have a studio profile.');

    return prisma.$transaction(async (tx) => {
      const profile = await tx.designerProfile.create({
        data: {
          userId,
          studioName: input.studioName,
          slug: await uniqueSlug(input.studioName),
          city: input.city,
          state: input.state ?? null,
          bio: input.bio ?? null,
          specialties: input.specialties ?? [],
          crafts: input.crafts ?? [],
          fabricSkills: input.fabricSkills ?? [],
          leadTimeMinDays: input.leadTimeMinDays ?? 12,
          leadTimeMaxDays: input.leadTimeMaxDays ?? 21,
        },
      });
      await tx.user.update({ where: { id: userId }, data: { role: 'DESIGNER' } });
      return profile;
    });
  },

  async getOwnProfile(designerId: string) {
    const profile = await prisma.designerProfile.findUnique({
      where: { id: designerId },
      include: {
        portfolioItems: { orderBy: { sortOrder: 'asc' } },
        payoutAccount: true,
        verification: true,
        qualityScoreLog: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!profile) throw notFound('Your studio profile');

    // A designer should always know what is still missing before publishing.
    const checklist = {
      studioIdentity: Boolean(profile.studioName && profile.city && profile.bio),
      specialties: profile.specialties.length > 0,
      portfolio: profile.portfolioItems.length >= 3,
      payoutAccount: Boolean(profile.payoutAccount?.providerRef ?? profile.payoutAccount),
      verification: profile.verificationStatus === 'VERIFIED',
    };
    const completion = Math.round(
      (Object.values(checklist).filter(Boolean).length / Object.keys(checklist).length) * 100,
    );

    return { ...profile, checklist, completion };
  },

  async updateProfile(designerId: string, data: Prisma.DesignerProfileUpdateInput) {
    return prisma.designerProfile.update({ where: { id: designerId }, data });
  },

  async publish(designerId: string) {
    const profile = await designerService.getOwnProfile(designerId);
    if (!profile.checklist.studioIdentity) {
      throw conflict('Add your studio name, city and introduction before publishing.');
    }
    if (!profile.checklist.portfolio) {
      throw conflict('Add at least three pieces of work before publishing.');
    }
    if (profile.verificationStatus !== 'VERIFIED') {
      throw conflict('Your studio is still in review. We will publish it as soon as that clears.');
    }
    return prisma.designerProfile.update({
      where: { id: designerId },
      data: { isPublished: true },
    });
  },

  /**
   * Portfolio upload. Auto-tagging runs on create; the designer can then edit
   * the tags, and the edited set is what matching uses.
   */
  async addPortfolioItem(
    designerId: string,
    input: { title: string; description?: string | null; imageUrls: string[] },
  ) {
    let autoTags: Awaited<ReturnType<typeof aiClient.autoTagPortfolio>> | null = null;
    try {
      autoTags = await aiClient.autoTagPortfolio({
        imageUrls: input.imageUrls,
        title: input.title,
      });
    } catch (err) {
      logger.warn({ err, designerId }, 'Portfolio auto-tagging failed; saving untagged');
    }

    const count = await prisma.portfolioItem.count({ where: { designerId } });

    return prisma.portfolioItem.create({
      data: {
        designerId,
        title: input.title,
        description: input.description ?? null,
        imageUrls: input.imageUrls,
        coverUrl: input.imageUrls[0] ?? null,
        sortOrder: count,
        aiTags: (autoTags ?? {}) as Prisma.InputJsonValue,
        tags: autoTags?.tags ?? [],
        category: autoTags?.category ?? null,
        occasion: autoTags?.occasion ?? null,
        fabric: autoTags?.fabric ?? null,
        embroidery: autoTags?.embroidery ?? null,
        palette: autoTags?.palette ?? [],
      },
    });
  },

  async updatePortfolioItem(
    designerId: string,
    itemId: string,
    data: Prisma.PortfolioItemUpdateInput,
  ) {
    const item = await prisma.portfolioItem.findFirst({ where: { id: itemId, designerId } });
    if (!item) throw notFound('That portfolio piece');
    return prisma.portfolioItem.update({ where: { id: itemId }, data });
  },

  async deletePortfolioItem(designerId: string, itemId: string) {
    const item = await prisma.portfolioItem.findFirst({ where: { id: itemId, designerId } });
    if (!item) throw notFound('That portfolio piece');
    await prisma.portfolioItem.delete({ where: { id: itemId } });
  },

  /** The designer dashboard — a boutique business operating system, not a chart wall. */
  async dashboard(designerId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [profile, activeOrders, pendingBids, monthPayouts, lifetimePayouts, needsAttention, unread] =
      await Promise.all([
        prisma.designerProfile.findUniqueOrThrow({
          where: { id: designerId },
          select: {
            studioName: true,
            qualityScore: true,
            onTimeRate: true,
            capacityPercent: true,
            maxActiveOrders: true,
            completedOrders: true,
            ratingAvg: true,
            reviewsCount: true,
          },
        }),
        prisma.order.count({
          where: {
            designerId,
            status: { in: ['CONFIRMED', 'IN_PRODUCTION', 'QC_PENDING', 'QC_FAILED'] },
          },
        }),
        prisma.bid.count({ where: { designerId, status: { in: ['SUBMITTED', 'SHORTLISTED'] } } }),
        prisma.payout.aggregate({
          where: { designerId, status: 'PAID', processedAt: { gte: monthStart } },
          _sum: { amount: true },
        }),
        prisma.payout.aggregate({
          where: { designerId, status: 'PAID' },
          _sum: { amount: true },
        }),
        prisma.order.findMany({
          where: {
            designerId,
            status: { in: ['CONFIRMED', 'IN_PRODUCTION', 'QC_FAILED'] },
          },
          orderBy: { promisedDate: 'asc' },
          take: 8,
          select: {
            id: true,
            code: true,
            status: true,
            promisedDate: true,
            finalPrice: true,
            version: { select: { design: { select: { title: true } } } },
            milestones: {
              where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
              orderBy: { sortOrder: 'asc' },
              take: 1,
              select: { type: true, title: true, status: true },
            },
          },
        }),
        prisma.message.count({
          where: {
            isSystem: false,
            conversation: {
              order: { designerId },
              participants: { some: { user: { designerProfile: { id: designerId } } } },
            },
          },
        }),
      ]);

    const atRisk = needsAttention.filter(
      (o) => o.promisedDate && o.promisedDate.getTime() - now.getTime() < 3 * 24 * 60 * 60 * 1000,
    );

    return {
      metrics: {
        revenueThisMonth: monthPayouts._sum.amount ?? 0,
        revenueLifetime: lifetimePayouts._sum.amount ?? 0,
        activeOrders,
        pendingBids,
        onTimePercent: Math.round(profile.onTimeRate * 100),
        qualityScore: profile.qualityScore,
        capacityPercent: profile.capacityPercent,
        rating: profile.ratingAvg,
        reviewsCount: profile.reviewsCount,
      },
      needsAttention,
      atRisk,
      unreadMessages: unread,
      studioName: profile.studioName,
    };
  },

  /** Zari Copilot — assistive, never in the way of the actual work. */
  async copilot(designerId: string) {
    const dashboard = await designerService.dashboard(designerId);

    try {
      const digest = await aiClient.copilotDigest({
        designerName: dashboard.studioName,
        capacityPercent: dashboard.metrics.capacityPercent,
        openBids: dashboard.metrics.pendingBids,
        unreadMessages: dashboard.unreadMessages,
        orders: dashboard.needsAttention.map((o) => ({
          code: o.code,
          status: o.status,
          promisedDate: o.promisedDate?.toISOString() ?? null,
          nextMilestone: o.milestones[0]?.title,
        })),
      });
      return { ...digest, source: 'ai' as const };
    } catch (err) {
      logger.warn({ err, designerId }, 'Copilot digest failed; falling back to rules');
      // A deterministic fallback so the panel is never empty or broken.
      const tasks: { title: string; detail: string; action: string }[] = [];
      if (dashboard.unreadMessages > 0) {
        tasks.push({
          title: `${dashboard.unreadMessages} message${dashboard.unreadMessages === 1 ? '' : 's'} need replies`,
          detail: 'Customers who hear back quickly are far more likely to place the order.',
          action: 'Reply',
        });
      }
      if (dashboard.metrics.pendingBids > 0) {
        tasks.push({
          title: `${dashboard.metrics.pendingBids} quote${dashboard.metrics.pendingBids === 1 ? '' : 's'} awaiting a decision`,
          detail: 'Follow up or revise while the request is still open.',
          action: 'Review',
        });
      }
      for (const order of dashboard.atRisk) {
        tasks.push({
          title: `${order.code} is close to its promised date`,
          detail: `Next step: ${order.milestones[0]?.title ?? 'update production'}.`,
          action: 'Update milestone',
        });
      }
      return {
        headline: `You have ${tasks.length} task${tasks.length === 1 ? '' : 's'} today.`,
        tasks,
        source: 'rules' as const,
      };
    }
  },

  async earnings(designerId: string) {
    const [payouts, pending, held] = await Promise.all([
      prisma.payout.findMany({
        where: { designerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { order: { select: { code: true, finalPrice: true } } },
      }),
      prisma.payout.aggregate({
        where: { designerId, status: { in: ['PENDING', 'PROCESSING'] } },
        _sum: { amount: true },
      }),
      prisma.ledgerEntry.aggregate({
        where: { state: 'HELD', direction: 'CREDIT', order: { designerId } },
        _sum: { amount: true },
      }),
    ]);

    const paid = payouts
      .filter((p) => p.status === 'PAID')
      .reduce((sum, p) => sum + p.amount, 0);

    return {
      paid,
      pending: pending._sum.amount ?? 0,
      inEscrow: held._sum.amount ?? 0,
      payouts,
      note: 'Funds move to you once Zari’s quality check passes on each order.',
    };
  },

  async savePayoutAccount(
    designerId: string,
    input: {
      accountHolder: string;
      accountLast4: string;
      ifsc: string;
      bankName?: string | null;
      upiId?: string | null;
    },
  ) {
    return prisma.payoutAccount.upsert({
      where: { designerId },
      create: { designerId, ...input, bankName: input.bankName ?? null, upiId: input.upiId ?? null },
      update: { ...input, bankName: input.bankName ?? null, upiId: input.upiId ?? null },
    });
  },

  async submitVerification(designerId: string, documents: { type: string; url: string }[]) {
    return prisma.designerVerification.upsert({
      where: { designerId },
      create: {
        designerId,
        status: 'PENDING',
        documents: documents as unknown as Prisma.InputJsonValue,
        submittedAt: new Date(),
      },
      update: {
        status: 'PENDING',
        documents: documents as unknown as Prisma.InputJsonValue,
        submittedAt: new Date(),
        reviewNotes: null,
      },
    });
  },
};
