import { request } from 'undici';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { unmanufacturable, upstreamFailure } from '../lib/errors.js';

/**
 * Thin typed client for the separate Python AI service (ai-service/).
 * The AI service is deployed independently on Render; this backend never
 * talks to an LLM provider directly.
 */

export interface DesignSpec {
  category: string;
  silhouette: string;
  fabric: string;
  lining?: string | null;
  neckline?: string | null;
  sleeves?: string | null;
  embroidery?: string | null;
  motifs?: string[];
  motifDensity?: string | null;
  palette?: string[];
  occasion?: string | null;
  closures?: string | null;
  hemline?: string | null;
  notes?: string | null;
}

export interface Manufacturability {
  score: number;
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  leadTimeDays: number;
  isManufacturable: boolean;
  blockers: string[];
  warnings: string[];
  alternatives: string[];
}

export interface AiCostLineItem {
  component: 'FABRIC' | 'LINING' | 'EMBROIDERY' | 'STITCHING' | 'TRIMS' | 'FINISHING' | 'OTHER';
  label: string;
  minAmount: number;
  maxAmount: number;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
}

export interface AiCostEstimate {
  minTotal: number;
  maxTotal: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  lineItems: AiCostLineItem[];
  basis?: Record<string, unknown>;
}

export interface AiConcept {
  name: string;
  spec: DesignSpec;
  attributeConfidence: Record<string, 'LOW' | 'MEDIUM' | 'HIGH'>;
  summary: string;
  manufacturability: Manufacturability;
  costEstimate: AiCostEstimate;
  imagePrompt: string;
  imageUrls?: { view: string; url: string }[];
}

export interface GenerateResult {
  concepts: AiConcept[];
  usage?: AiUsage;
}

export interface EditResult {
  spec: DesignSpec;
  attributeConfidence: Record<string, 'LOW' | 'MEDIUM' | 'HIGH'>;
  summary: string;
  manufacturability: Manufacturability;
  costEstimate: AiCostEstimate;
  imageUrls?: { view: string; url: string }[];
  usage?: AiUsage;
}

export interface AiSubstitution {
  component: AiCostLineItem['component'];
  fromValue: string;
  toValue: string;
  costDelta: number;
  visualImpact: string;
  similarityDelta: number;
  isOptional: boolean;
}

export interface AiBudgetPlan {
  label: string;
  similarityPercent: number;
  resultingMin: number;
  resultingMax: number;
  savings: number;
  rationale: string;
  substitutions: AiSubstitution[];
}

export interface BudgetResult {
  feasible: boolean;
  infeasibleReason?: string | null;
  alternatives?: string[];
  plans: AiBudgetPlan[];
  usage?: AiUsage;
}

export interface AutoTagResult {
  category?: string | null;
  occasion?: string | null;
  fabric?: string | null;
  embroidery?: string | null;
  palette: string[];
  tags: string[];
  usage?: AiUsage;
}

export interface QcSimilarityResult {
  similarityScore: number;
  findings: { criterion: string; passed: boolean; note: string }[];
  usage?: AiUsage;
}

export interface CopilotResult {
  headline: string;
  tasks: { title: string; detail: string; action: string; entityId?: string | null }[];
  usage?: AiUsage;
}

export interface AiUsage {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costPaise?: number;
  latencyMs?: number;
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const started = Date.now();
  try {
    const res = await request(`${env.AI_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-service-token': env.AI_SERVICE_TOKEN,
      },
      body: JSON.stringify(body),
      headersTimeout: env.AI_SERVICE_TIMEOUT_MS,
      bodyTimeout: env.AI_SERVICE_TIMEOUT_MS,
    });

    const text = await res.body.text();

    if (res.statusCode === 422) {
      // The AI service uses 422 for "this cannot be reliably stitched".
      const parsed = JSON.parse(text) as {
        detail?: { message?: string; alternatives?: string[] };
      };
      throw unmanufacturable(
        parsed.detail?.message ??
          "That combination can't be reliably stitched by our current designer network.",
        parsed.detail?.alternatives ?? [],
      );
    }

    if (res.statusCode >= 400) {
      logger.error({ path, status: res.statusCode, text }, 'AI service returned an error');
      throw upstreamFailure();
    }

    const parsed = JSON.parse(text) as T & { usage?: AiUsage };
    if (parsed.usage) parsed.usage.latencyMs = Date.now() - started;
    return parsed;
  } catch (err) {
    if (err && typeof err === 'object' && 'statusCode' in err) throw err;
    logger.error({ err, path }, 'AI service call failed');
    throw upstreamFailure();
  }
}

export const aiClient = {
  generateDesign: (input: {
    brief: string;
    inspirationUrls?: string[];
    targetBudget?: number | null;
    conceptCount?: number;
    costRules?: unknown[];
  }) => call<GenerateResult>('/v1/design/generate', input),

  editDesign: (input: {
    spec: DesignSpec;
    instruction: string;
    currentEstimate?: { minTotal: number; maxTotal: number } | null;
    costRules?: unknown[];
  }) => call<EditResult>('/v1/design/edit', input),

  optimizeBudget: (input: {
    spec: DesignSpec;
    currentEstimate: { minTotal: number; maxTotal: number };
    targetAmount: number;
    costRules?: unknown[];
  }) => call<BudgetResult>('/v1/design/budget-optimize', input),

  checkManufacturability: (input: { spec: DesignSpec }) =>
    call<{ manufacturability: Manufacturability; usage?: AiUsage }>(
      '/v1/design/manufacturability',
      input,
    ),

  autoTagPortfolio: (input: { imageUrls: string[]; title?: string | null }) =>
    call<AutoTagResult>('/v1/portfolio/autotag', input),

  qcSimilarity: (input: { spec: DesignSpec; photoUrls: string[] }) =>
    call<QcSimilarityResult>('/v1/qc/similarity', input),

  copilotDigest: (input: {
    designerName: string;
    capacityPercent: number;
    openBids: number;
    unreadMessages: number;
    orders: { code: string; status: string; promisedDate?: string | null; nextMilestone?: string }[];
  }) => call<CopilotResult>('/v1/copilot/digest', input),

  health: async (): Promise<boolean> => {
    try {
      const res = await request(`${env.AI_SERVICE_URL}/health`, {
        method: 'GET',
        headersTimeout: 5_000,
        bodyTimeout: 5_000,
      });
      await res.body.dump();
      return res.statusCode === 200;
    } catch {
      return false;
    }
  },
};
