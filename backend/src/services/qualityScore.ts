import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/**
 * Zari Quality Score — 0-100, fully transparent.
 *
 * PRODUCT RULE: this must be explainable. Every component below is surfaced in
 * the "How is this score calculated?" panel, and nothing secret is added here.
 * There is no paid placement input and there never should be.
 */
const WEIGHTS = {
  craftSkill: 0.25, // average review rating for craft
  pastSuccess: 0.2, // completed orders that passed QC first time
  onTimeDelivery: 0.25,
  communication: 0.15,
  customerRating: 0.15,
} as const;

export interface ScoreBreakdown {
  craftSkill: number;
  pastSuccess: number;
  onTimeDelivery: number;
  communication: number;
  customerRating: number;
  reviewsCount: number;
  completedOrders: number;
}

const pct = (value: number, max: number): number =>
  max <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((value / max) * 100)));

/**
 * Recomputes and persists a designer's score. Call this after any event that
 * changes the inputs: QC result, delivery, review, dispute resolution.
 */
export async function recomputeQualityScore(
  designerId: string,
  reason: string,
): Promise<number> {
  const [orders, reviews] = await Promise.all([
    prisma.order.findMany({
      where: { designerId, status: { in: ['COMPLETED', 'DELIVERED', 'FIT_WINDOW'] } },
      select: {
        promisedDate: true,
        deliveredAt: true,
        qualityChecks: { select: { status: true, round: true } },
        fitFeedback: { select: { rating: true } },
      },
    }),
    prisma.review.findMany({
      where: { designerId, isPublished: true },
      select: { rating: true, aspects: true },
    }),
  ]);

  const completedOrders = orders.length;

  const onTime = orders.filter(
    (o) => o.promisedDate && o.deliveredAt && o.deliveredAt <= o.promisedDate,
  ).length;
  const onTimeRate = completedOrders > 0 ? onTime / completedOrders : 0;

  const firstPassQc = orders.filter((o) =>
    o.qualityChecks.some((q) => q.round === 1 && q.status === 'PASSED'),
  ).length;

  const goodFit = orders.filter(
    (o) => o.fitFeedback && ['PERFECT', 'SLIGHT_ALTERATION'].includes(o.fitFeedback.rating),
  ).length;
  const fitSuccessRate = completedOrders > 0 ? goodFit / completedOrders : 0;

  const ratingAvg =
    reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  const aspectAvg = (key: string): number => {
    const values = reviews
      .map((r) => (r.aspects as Record<string, number> | null)?.[key])
      .filter((v): v is number => typeof v === 'number');
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  };

  const breakdown: ScoreBreakdown = {
    craftSkill: pct(aspectAvg('craft') || ratingAvg, 5),
    pastSuccess: pct(firstPassQc, Math.max(1, completedOrders)),
    onTimeDelivery: Math.round(onTimeRate * 100),
    communication: pct(aspectAvg('communication') || ratingAvg, 5),
    customerRating: pct(ratingAvg, 5),
    reviewsCount: reviews.length,
    completedOrders,
  };

  let score = Math.round(
    breakdown.craftSkill * WEIGHTS.craftSkill +
      breakdown.pastSuccess * WEIGHTS.pastSuccess +
      breakdown.onTimeDelivery * WEIGHTS.onTimeDelivery +
      breakdown.communication * WEIGHTS.communication +
      breakdown.customerRating * WEIGHTS.customerRating,
  );

  // A brand-new studio with no history is shown as "new", not as a zero — the
  // score is damped toward a neutral 60 until there is real evidence.
  if (completedOrders < 3) {
    const evidence = completedOrders / 3;
    score = Math.round(60 * (1 - evidence) + score * evidence);
  }

  await prisma.$transaction([
    prisma.designerProfile.update({
      where: { id: designerId },
      data: {
        qualityScore: score,
        ratingAvg,
        reviewsCount: reviews.length,
        onTimeRate,
        completedOrders,
        fitSuccessRate,
      },
    }),
    prisma.qualityScoreSnapshot.create({
      data: {
        designerId,
        score,
        breakdown: breakdown as unknown as Prisma.InputJsonValue,
        reason,
      },
    }),
  ]);

  return score;
}

export const qualityWeights = WEIGHTS;

export function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent match';
  if (score >= 80) return 'Strong match';
  if (score >= 70) return 'Good match';
  if (score >= 60) return 'New to Zari';
  return 'Building a record';
}
