import type { CostComponent, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { AiCostEstimate } from './aiClient.js';

/**
 * The AI service does not invent prices. It is handed the active CostRule rows
 * (managed by ops at /ops/cost-rules) and grounds every line item in them.
 * This module is the bridge: load the rules, and persist the returned estimate.
 */

export interface CostRuleDto {
  component: CostComponent;
  key: string;
  label: string;
  minRate: number;
  maxRate: number;
  unit: string;
  region: string | null;
  multiplier: number;
}

export async function loadActiveCostRules(region?: string | null): Promise<CostRuleDto[]> {
  const rules = await prisma.costRule.findMany({
    where: {
      isActive: true,
      OR: [{ region: null }, ...(region ? [{ region }] : [])],
    },
    orderBy: [{ component: 'asc' }, { key: 'asc' }],
  });

  return rules.map((r) => ({
    component: r.component,
    key: r.key,
    label: r.label,
    minRate: r.minRate,
    maxRate: r.maxRate,
    unit: r.unit,
    region: r.region,
    multiplier: r.multiplier,
  }));
}

/**
 * Writes a CostEstimate + its line items for a design version.
 * Runs inside the caller's transaction so a version never exists without a price.
 */
export async function persistEstimate(
  tx: Prisma.TransactionClient,
  versionId: string,
  estimate: AiCostEstimate,
): Promise<void> {
  await tx.costEstimate.create({
    data: {
      versionId,
      minTotal: estimate.minTotal,
      maxTotal: estimate.maxTotal,
      confidence: estimate.confidence,
      basis: (estimate.basis ?? {}) as Prisma.InputJsonValue,
      lineItems: {
        create: estimate.lineItems.map((item, index) => ({
          component: item.component,
          label: item.label,
          minAmount: item.minAmount,
          maxAmount: item.maxAmount,
          quantity: item.quantity ?? null,
          unit: item.unit ?? null,
          notes: item.notes ?? null,
          sortOrder: index,
        })),
      },
    },
  });
}

/**
 * A bid is a firm quote; an estimate is a range. We only warn when a bid sits
 * far outside the estimate so the customer can be told why, never to block it.
 */
export function bidVarianceNote(
  bidPrice: number,
  estimate: { minTotal: number; maxTotal: number } | null,
): string | null {
  if (!estimate) return null;
  if (bidPrice > estimate.maxTotal * 1.25) {
    return 'This quote is meaningfully above the estimate — ask the designer what it covers.';
  }
  if (bidPrice < estimate.minTotal * 0.75) {
    return 'This quote is well below the estimate. Confirm the fabric and finishing before accepting.';
  }
  return null;
}
