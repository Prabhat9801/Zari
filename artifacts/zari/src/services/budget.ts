import { api } from '@/lib/apiClient';

/**
 * The budget optimizer's slice of the API.
 *
 * Money is an integer number of PAISE everywhere in here, including
 * `targetAmount`. Rupees exist only at the two edges: the number the customer
 * types (`rupeeInputToPaise`) and the number they read (`formatINR` /
 * `formatRange` from `@/types`). Nothing in between is ever a float.
 *
 * The arithmetic behind a toggle lives on the server on purpose, so the price
 * shown always matches the toggles set. `computeLive` below is a deliberate
 * mirror of that same formula — it is used to keep the panel responsive while
 * the PATCH is in flight, and as the honest answer when the panel is running on
 * the demo set. The server response always wins when it arrives.
 */

export type BudgetRunStatus = 'READY' | 'INFEASIBLE' | 'FAILED';

export type SubstitutionComponent =
  | 'FABRIC'
  | 'LINING'
  | 'EMBROIDERY'
  | 'TRIMS'
  | 'FINISHING'
  | 'STITCHING'
  | 'OTHER';

export const COMPONENT_LABELS: Record<string, string> = {
  FABRIC: 'Fabric',
  LINING: 'Lining',
  EMBROIDERY: 'Embroidery',
  TRIMS: 'Trims',
  FINISHING: 'Finishing',
  STITCHING: 'Stitching',
  OTHER: 'Other',
};

export interface BudgetSubstitution {
  id: string;
  component: SubstitutionComponent;
  fromValue: string;
  toValue: string;
  /** NEGATIVE paise — a saving. Read it through `savingOf`, never raw. */
  costDelta: number;
  /** One concrete sentence about what the customer will actually see. */
  visualImpact: string;
  /** Similarity points this single change costs. */
  similarityDelta: number;
  isSelected: boolean;
  /** False when the change is structural and the plan collapses without it. */
  isOptional: boolean;
}

export interface BudgetPlan {
  id: string;
  label: string;
  similarityPercent: number;
  resultingMin: number;
  resultingMax: number;
  savings: number;
  rationale: string;
  substitutions: BudgetSubstitution[];
}

export interface BudgetRun {
  id: string;
  targetAmount: number;
  currentMin: number;
  currentMax: number;
  status: BudgetRunStatus;
  /** The binding constraint, in words, when the target cannot be reached. */
  infeasibleReason: string | null;
  alternatives: string[];
  plans: BudgetPlan[];
}

/** What a toggle recomputes. Server-authored; mirrored by `computeLive`. */
export interface BudgetLiveTotals {
  savings: number;
  resultingMin: number;
  resultingMax: number;
  similarityPercent: number;
}

export interface ToggleResult {
  plan: BudgetPlan;
  live: BudgetLiveTotals;
}

export interface ApplyResult {
  versionId: string;
  savings: number;
  appliedSubstitutions: number;
}

// --- Normalising -------------------------------------------------------------

const int = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() ? value : fallback;

const toSubstitution = (raw: Record<string, unknown>): BudgetSubstitution => ({
  id: str(raw.id),
  component: str(raw.component, 'OTHER') as SubstitutionComponent,
  fromValue: str(raw.fromValue, 'Current choice'),
  toValue: str(raw.toValue, 'Alternative'),
  costDelta: int(raw.costDelta),
  visualImpact: str(raw.visualImpact, 'Zari has not described this change yet.'),
  similarityDelta: int(raw.similarityDelta),
  isSelected: raw.isSelected !== false,
  isOptional: raw.isOptional !== false,
});

const toPlan = (raw: Record<string, unknown>): BudgetPlan => ({
  id: str(raw.id),
  label: str(raw.label, 'Option'),
  similarityPercent: int(raw.similarityPercent),
  resultingMin: int(raw.resultingMin),
  resultingMax: int(raw.resultingMax),
  savings: int(raw.savings),
  rationale: str(raw.rationale),
  substitutions: (Array.isArray(raw.substitutions) ? raw.substitutions : []).map((s) =>
    toSubstitution(s as Record<string, unknown>),
  ),
});

/**
 * `alternatives` is a JSON column, so it arrives untyped. The AI service writes
 * a list of strings; anything else is dropped rather than rendered as `[object
 * Object]` in front of a customer who has just been told no.
 */
const toAlternatives = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string' && !!item.trim()) : [];

export const toRun = (raw: Record<string, unknown>): BudgetRun => ({
  id: str(raw.id),
  targetAmount: int(raw.targetAmount),
  currentMin: int(raw.currentMin),
  currentMax: int(raw.currentMax),
  status: str(raw.status, 'READY') as BudgetRunStatus,
  infeasibleReason: typeof raw.infeasibleReason === 'string' ? raw.infeasibleReason : null,
  alternatives: toAlternatives(raw.alternatives),
  plans: (Array.isArray(raw.plans) ? raw.plans : []).map((p) => toPlan(p as Record<string, unknown>)),
});

// --- Money at the edges ------------------------------------------------------

/** A rupee string from the customer -> paise. Null when it is not a number. */
export const rupeeInputToPaise = (rupees: string): number | null => {
  const trimmed = rupees.trim().replace(/[,\s₹]/g, '');
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
};

/** Paise -> a plain rupee string, for putting a saved target back in the field. */
export const paiseToRupeeInput = (paise: number): string => String(Math.round(paise) / 100);

/** A substitution's saving as a positive number of paise. */
export const savingOf = (sub: BudgetSubstitution): number => Math.abs(sub.costDelta);

// --- The toggle arithmetic, mirrored ----------------------------------------

/** The ids a plan starts with: everything selected, plus everything structural. */
export const defaultSelection = (plan: BudgetPlan): string[] =>
  plan.substitutions.filter((s) => s.isSelected || !s.isOptional).map((s) => s.id);

/** Exactly the formula in `backend/src/modules/budget/routes.ts`. */
export const computeLive = (
  run: Pick<BudgetRun, 'currentMin' | 'currentMax'>,
  plan: BudgetPlan,
  selectedIds: string[],
): BudgetLiveTotals => {
  const active = plan.substitutions.filter((s) => !s.isOptional || selectedIds.includes(s.id));
  const savings = active.reduce((sum, s) => sum + savingOf(s), 0);
  const similarityLoss = active.reduce((sum, s) => sum + s.similarityDelta, 0);
  return {
    savings,
    resultingMin: Math.max(0, run.currentMin - savings),
    resultingMax: Math.max(0, run.currentMax - savings),
    similarityPercent: Math.max(0, Math.min(100, 100 - similarityLoss)),
  };
};

// --- Calls -------------------------------------------------------------------

export const budgetService = {
  /** The last five runs, newest first, so the panel rehydrates on reload. */
  async listRuns(designId: string): Promise<BudgetRun[]> {
    const runs = await api.get<Record<string, unknown>[]>(`/designs/${designId}/budget/runs`);
    return (runs ?? []).map(toRun);
  },

  async optimize(
    designId: string,
    input: { targetAmount: number; versionId?: string },
  ): Promise<BudgetRun> {
    const run = await api.post<Record<string, unknown>>(`/designs/${designId}/budget/optimize`, {
      targetAmount: input.targetAmount,
      ...(input.versionId ? { versionId: input.versionId } : {}),
    });
    return toRun(run);
  },

  /** `substitutionIds` is the set to KEEP selected. The server does the maths. */
  async setSubstitutions(
    designId: string,
    planId: string,
    substitutionIds: string[],
  ): Promise<ToggleResult> {
    const result = await api.patch<{ plan: Record<string, unknown>; live: BudgetLiveTotals }>(
      `/designs/${designId}/budget/plans/${planId}/substitutions`,
      { substitutionIds },
    );
    return { plan: toPlan(result.plan), live: result.live };
  },

  /** Explicit, never automatic: this creates a new design version. */
  async applyPlan(designId: string, planId: string): Promise<ApplyResult> {
    return api.post<ApplyResult>(`/designs/${designId}/budget/plans/${planId}/apply`);
  },
};
