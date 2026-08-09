import { api } from '@/lib/apiClient';
import {
  formatINR,
  formatRange,
  relativeTime,
  toneFor,
  type DesignDetail,
  type DesignSummary,
} from '@/types';

/** Raw API shapes — only the fields the UI actually reads. */
interface ApiEstimate {
  minTotal: number;
  maxTotal: number;
  confidence?: string;
  lineItems?: { component: string; label: string; minAmount: number; maxAmount: number }[];
}

interface ApiVersion {
  id: string;
  versionNumber: number;
  aiSummary?: string | null;
  editInstruction?: string | null;
  spec?: Record<string, unknown>;
  manufacturability?: { score?: number; complexity?: string; leadTimeDays?: number } | null;
  images?: { view: string; url: string }[];
  costEstimate?: ApiEstimate | null;
}

interface ApiDesign {
  id: string;
  title: string;
  updatedAt: string;
  coverUrl?: string | null;
  currentVersion?: ApiVersion | null;
  versions?: ApiVersion[];
}

const toSummary = (d: ApiDesign): DesignSummary => ({
  id: d.id,
  name: d.title,
  meta: relativeTime(d.updatedAt),
  tone: toneFor(d.id),
  coverUrl: d.coverUrl ?? null,
  estimateMin: d.currentVersion?.costEstimate?.minTotal ?? null,
  estimateMax: d.currentVersion?.costEstimate?.maxTotal ?? null,
});

const titleCase = (value: string): string =>
  value.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();

/** Only the attributes worth showing in the panel, in a deliberate order. */
const PANEL_KEYS = ['silhouette', 'fabric', 'neckline', 'sleeves', 'embroidery', 'motifDensity'];

function toDetail(design: ApiDesign): DesignDetail {
  const version = design.currentVersion;
  const spec = (version?.spec ?? {}) as Record<string, unknown>;
  const estimate = version?.costEstimate;

  const attributes = PANEL_KEYS.filter((k) => spec[k]).map((k) => ({
    label: titleCase(k),
    value: String(spec[k]),
  }));

  const costLines = (estimate?.lineItems ?? []).map((li) => ({
    label: li.label,
    amount: formatINR(li.maxAmount),
  }));

  const m = version?.manufacturability;

  return {
    id: design.id,
    title: design.title,
    versionNumber: version?.versionNumber ?? 1,
    attributes,
    costLines,
    estimateLabel: estimate ? formatRange(estimate.minTotal, estimate.maxTotal) : 'Not priced yet',
    makeability: {
      score: m?.score ? `${m.score}%` : '—',
      complexity: m?.complexity ? titleCase(m.complexity.toLowerCase()) : '—',
      leadTime: m?.leadTimeDays ? String(m.leadTimeDays) : '—',
    },
    conversation: [version?.aiSummary, version?.editInstruction].filter(
      (v): v is string => Boolean(v),
    ),
  };
}

export interface GenerateJob {
  jobId: string;
  designs: ApiDesign[];
}

export const designsService = {
  async list(): Promise<DesignSummary[]> {
    const page = await api.get<{ items: ApiDesign[] }>('/designs?limit=24');
    return page.items.map(toSummary);
  },

  async get(designId: string): Promise<DesignDetail> {
    const design = await api.get<ApiDesign>(`/designs/${designId}`);
    return toDetail(design);
  },

  /** Brief -> concepts. Returns the created designs plus the AiJob id. */
  async generate(input: {
    brief: string;
    inspirationUrls?: string[];
    targetBudget?: number | null;
  }): Promise<{ jobId: string; designs: DesignSummary[] }> {
    const result = await api.post<GenerateJob>('/designs/generate', {
      brief: input.brief,
      inspirationUrls: input.inspirationUrls ?? [],
      targetBudget: input.targetBudget ?? null,
      conceptCount: 4,
    });
    return { jobId: result.jobId, designs: result.designs.map(toSummary) };
  },

  /** Conversational edit. Always produces a new immutable version. */
  async edit(designId: string, instruction: string): Promise<ApiVersion> {
    return api.post<ApiVersion>(`/designs/${designId}/edit`, { instruction });
  },

  async duplicate(designId: string): Promise<{ id: string }> {
    return api.post<{ id: string }>(`/designs/${designId}/duplicate`);
  },

  async remove(designId: string): Promise<void> {
    await api.delete<void>(`/designs/${designId}`);
  },

  async optimizeBudget(designId: string, targetAmount: number) {
    return api.post(`/designs/${designId}/budget/optimize`, { targetAmount });
  },
};
