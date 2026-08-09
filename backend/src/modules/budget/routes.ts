import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, param, created, ok } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { requireIdentity } from '../../middleware/auth.js';
import { aiLimiter } from '../../middleware/rateLimit.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { aiClient, type DesignSpec } from '../../services/aiClient.js';
import { loadActiveCostRules } from '../../services/costing.js';
import { designService, type Identity } from '../designs/service.js';
import { designSpecSchema } from '../designs/schema.js';

const router: Router = Router();

const identityOf = (req: { user?: { id: string }; guestToken?: string }): Identity => ({
  userId: req.user?.id ?? null,
  guestToken: req.guestToken ?? null,
});

const optimizeSchema = z.object({
  targetAmount: z.number().int().positive('Enter a target above zero.'), // paise
  versionId: z.string().cuid().optional(),
});

const toggleSchema = z.object({
  substitutionIds: z.array(z.string().cuid()).min(0).max(30),
});

const planInclude = {
  substitutions: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.BudgetPlanInclude;

/**
 * POST /api/designs/:designId/budget/optimize
 *
 * PRODUCT RULE: this is never a slider. Every plan lists concrete substitutions
 * with a cost delta and a plain-language visual impact, so the customer knows
 * exactly what they are giving up. When the target is impossible we say so and
 * explain the binding constraint �?" never a generic error.
 */
router.post(
  '/:designId/budget/optimize',
  requireIdentity,
  aiLimiter,
  validate(optimizeSchema),
  asyncHandler(async (req, res) => {
    const designId = param(req, 'designId');
    const identity = identityOf(req);
    const design = await designService.loadOwnedDesign(designId, identity);

    const versionId = (req.body.versionId as string | undefined) ?? design.currentVersionId;
    if (!versionId) throw badRequest('Create a design before setting a budget.');

    const version = await prisma.designVersion.findFirst({
      where: { id: versionId, designId },
      include: { costEstimate: true },
    });
    if (!version?.costEstimate) throw notFound('An estimate for that version');

    const target = req.body.targetAmount as number;
    const costRules = await loadActiveCostRules();

    const result = await aiClient.optimizeBudget({
      spec: version.spec as unknown as DesignSpec,
      currentEstimate: {
        minTotal: version.costEstimate.minTotal,
        maxTotal: version.costEstimate.maxTotal,
      },
      targetAmount: target,
      costRules,
    });

    const run = await prisma.budgetRun.create({
      data: {
        designId,
        versionId,
        targetAmount: target,
        currentMin: version.costEstimate.minTotal,
        currentMax: version.costEstimate.maxTotal,
        status: result.feasible ? 'READY' : 'INFEASIBLE',
        infeasibleReason: result.infeasibleReason ?? null,
        alternatives: (result.alternatives ?? []) as unknown as Prisma.InputJsonValue,
        plans: {
          create: result.plans.map((plan, planIndex) => ({
            label: plan.label,
            similarityPercent: plan.similarityPercent,
            resultingMin: plan.resultingMin,
            resultingMax: plan.resultingMax,
            savings: plan.savings,
            rationale: plan.rationale,
            sortOrder: planIndex,
            substitutions: {
              create: plan.substitutions.map((sub, subIndex) => ({
                component: sub.component,
                fromValue: sub.fromValue,
                toValue: sub.toValue,
                costDelta: sub.costDelta,
                visualImpact: sub.visualImpact,
                similarityDelta: sub.similarityDelta,
                isOptional: sub.isOptional,
                sortOrder: subIndex,
              })),
            },
          })),
        },
      },
      include: { plans: { include: planInclude, orderBy: { sortOrder: 'asc' } } },
    });

    await prisma.design.update({ where: { id: designId }, data: { targetBudget: target } });

    return created(res, run);
  }),
);

/** Latest budget run for a design, so the panel can rehydrate on reload. */
router.get(
  '/:designId/budget/runs',
  requireIdentity,
  asyncHandler(async (req, res) => {
    const designId = param(req, 'designId');
    await designService.loadOwnedDesign(designId, identityOf(req));
    const runs = await prisma.budgetRun.findMany({
      where: { designId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { plans: { include: planInclude, orderBy: { sortOrder: 'asc' } } },
    });
    return ok(res, runs);
  }),
);

/**
 * Toggling individual substitutions recomputes price and similarity live.
 * The maths is deterministic and done here, not by the model, so the number
 * the customer sees always matches the toggles they set.
 */
router.patch(
  '/:designId/budget/plans/:planId/substitutions',
  requireIdentity,
  validate(toggleSchema),
  asyncHandler(async (req, res) => {
    const designId = param(req, 'designId');
    await designService.loadOwnedDesign(designId, identityOf(req));

    const plan = await prisma.budgetPlan.findUnique({
      where: { id: param(req, 'planId') },
      include: { substitutions: true, run: true },
    });
    if (!plan || plan.run.designId !== designId) throw notFound('That plan');

    const selected = new Set(req.body.substitutionIds as string[]);

    await prisma.$transaction(
      plan.substitutions.map((sub) =>
        prisma.budgetSubstitution.update({
          where: { id: sub.id },
          // Non-optional substitutions are structural and can't be turned off.
          data: { isSelected: sub.isOptional ? selected.has(sub.id) : true },
        }),
      ),
    );

    const updated = await prisma.budgetPlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: planInclude,
    });

    const active = updated.substitutions.filter((s) => s.isSelected);
    const savings = active.reduce((sum, s) => sum + Math.abs(s.costDelta), 0);
    const similarityLoss = active.reduce((sum, s) => sum + s.similarityDelta, 0);

    return ok(res, {
      plan: updated,
      live: {
        savings,
        resultingMin: Math.max(0, plan.run.currentMin - savings),
        resultingMax: Math.max(0, plan.run.currentMax - savings),
        similarityPercent: Math.max(0, Math.min(100, 100 - similarityLoss)),
      },
    });
  }),
);

/**
 * Accepting a plan creates a NEW design version from the selected substitutions.
 * PRODUCT RULE: the design is never silently changed �?" this is an explicit step.
 */
router.post(
  '/:designId/budget/plans/:planId/apply',
  requireIdentity,
  asyncHandler(async (req, res) => {
    const designId = param(req, 'designId');
    const identity = identityOf(req);
    await designService.loadOwnedDesign(designId, identity);

    const plan = await prisma.budgetPlan.findUnique({
      where: { id: param(req, 'planId') },
      include: {
        substitutions: true,
        run: { include: { version: { include: { costEstimate: { include: { lineItems: true } } } } } },
      },
    });
    if (!plan || plan.run.designId !== designId) throw notFound('That plan');

    const baseVersion = plan.run.version;
    const baseSpec = designSpecSchema.parse(baseVersion.spec);
    const active = plan.substitutions.filter((s) => s.isSelected);

    // Apply the substitutions onto the spec. Only fields the optimizer can
    // legitimately touch are mapped �?" a substitution can never rewrite the
    // silhouette or category, which would break visual identity.
    const nextSpec: Record<string, unknown> = { ...baseSpec };
    for (const sub of active) {
      switch (sub.component) {
        case 'FABRIC':
          nextSpec.fabric = sub.toValue;
          break;
        case 'LINING':
          nextSpec.lining = sub.toValue;
          break;
        case 'EMBROIDERY':
          nextSpec.embroidery = sub.toValue;
          break;
        case 'TRIMS':
        case 'FINISHING':
        case 'STITCHING':
        case 'OTHER':
          nextSpec.notes = [nextSpec.notes, `${sub.fromValue} �?' ${sub.toValue}`]
            .filter(Boolean)
            .join('. ');
          break;
      }
    }

    const savings = active.reduce((sum, s) => sum + Math.abs(s.costDelta), 0);
    const base = baseVersion.costEstimate;

    const version = await prisma.$transaction(async (tx) => {
      const v = await designService.createVersion(tx, {
        designId,
        parentVersionId: baseVersion.id,
        source: 'BUDGET_PLAN',
        spec: designSpecSchema.parse(nextSpec) as never,
        attributeConfidence: baseVersion.attributeConfidence as Record<string, string> | null,
        editInstruction: `Fit to budget �?" ${plan.label}`,
        aiSummary: plan.rationale,
        manufacturability: baseVersion.manufacturability,
        isManufacturable: true,
        costEstimate: base
          ? {
              minTotal: Math.max(0, base.minTotal - savings),
              maxTotal: Math.max(0, base.maxTotal - savings),
              confidence: 'MEDIUM',
              lineItems: base.lineItems.map((li) => ({
                component: li.component,
                label: li.label,
                minAmount: li.minAmount,
                maxAmount: li.maxAmount,
                quantity: li.quantity,
                unit: li.unit,
                notes: li.notes,
              })),
            }
          : null,
      });

      await tx.budgetPlan.update({ where: { id: plan.id }, data: { resultVersionId: v.id } });
      return v;
    });

    return created(res, {
      versionId: version.id,
      savings,
      appliedSubstitutions: active.length,
    });
  }),
);

export default router;
