import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { DesignSpec } from './aiClient.js';

/**
 * Designer matching.
 *
 * PRODUCT RULE: price is never the only ranking factor, and it is never the
 * dominant one. The weights below are the whole ranking policy — if you change
 * them, change the "How is this score calculated?" copy in the frontend too.
 */
const WEIGHTS = {
  similarityMatch: 0.3, // does their portfolio look like this design?
  craftMatch: 0.25, // do they actually do this embroidery/fabric?
  quality: 0.25, // Zari Quality Score (on-time, fit, communication)
  capacityFit: 0.12, // can they take the work right now?
  locationFit: 0.08, // same city = easier fittings and faster shipping
} as const;

export interface MatchBreakdown {
  similarityMatch: number;
  craftMatch: number;
  quality: number;
  capacityFit: number;
  locationFit: number;
}

function overlapScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const lower = new Set(b.map((v) => v.toLowerCase()));
  const hits = a.filter((v) => lower.has(v.toLowerCase())).length;
  return Math.min(100, Math.round((hits / a.length) * 100));
}

function specTerms(spec: DesignSpec): string[] {
  return [
    spec.category,
    spec.silhouette,
    spec.fabric,
    spec.embroidery,
    spec.occasion,
    ...(spec.motifs ?? []),
  ].filter((v): v is string => Boolean(v));
}

/**
 * Scores every published, verified, accepting-work designer against a request
 * and stores the top N as DesignerMatch rows.
 */
export async function computeMatches(
  tx: Prisma.TransactionClient,
  params: {
    requestId: string;
    spec: DesignSpec;
    city?: string | null;
    limit?: number;
  },
): Promise<number> {
  const limit = params.limit ?? 12;
  const terms = specTerms(params.spec);

  const designers = await tx.designerProfile.findMany({
    where: {
      isPublished: true,
      isAcceptingWork: true,
      verificationStatus: 'VERIFIED',
    },
    select: {
      id: true,
      city: true,
      specialties: true,
      crafts: true,
      fabricSkills: true,
      capacityPercent: true,
      qualityScore: true,
      portfolioItems: {
        where: { isVisible: true },
        select: { tags: true, category: true, fabric: true, embroidery: true, occasion: true },
        take: 40,
      },
    },
  });

  const scored = designers.map((d) => {
    const portfolioTerms = d.portfolioItems.flatMap((p) =>
      [p.category, p.fabric, p.embroidery, p.occasion, ...p.tags].filter(
        (v): v is string => Boolean(v),
      ),
    );

    const breakdown: MatchBreakdown = {
      similarityMatch: overlapScore(terms, portfolioTerms),
      craftMatch: overlapScore(terms, [...d.specialties, ...d.crafts, ...d.fabricSkills]),
      quality: d.qualityScore,
      capacityFit: Math.max(0, 100 - d.capacityPercent),
      locationFit:
        params.city && d.city.toLowerCase() === params.city.toLowerCase() ? 100 : 40,
    };

    const matchScore = Math.round(
      breakdown.similarityMatch * WEIGHTS.similarityMatch +
        breakdown.craftMatch * WEIGHTS.craftMatch +
        breakdown.quality * WEIGHTS.quality +
        breakdown.capacityFit * WEIGHTS.capacityFit +
        breakdown.locationFit * WEIGHTS.locationFit,
    );

    return { designerId: d.id, matchScore, breakdown };
  });

  const top = scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, limit);

  if (top.length === 0) return 0;

  await tx.designerMatch.createMany({
    data: top.map((m, index) => ({
      requestId: params.requestId,
      designerId: m.designerId,
      matchScore: m.matchScore,
      breakdown: m.breakdown as unknown as Prisma.InputJsonValue,
      rank: index + 1,
    })),
    skipDuplicates: true,
  });

  return top.length;
}

export const matchWeights = WEIGHTS;
