import { api } from '@/lib/apiClient';
import { formatINR, initialsFor, toneFor, type Tone } from '@/types';

/**
 * The ops console's view of the API.
 *
 * Same contract as the other services: raw API rows in, view types out, so a
 * screen never has to know the shape Prisma returned. Every amount crossing
 * this file is an integer number of PAISE — including cost rule rates — and is
 * only turned into rupees at the edge, by `formatINR` or `rupeesToPaise`.
 */

interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

const dateLabel = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '';

const daysSince = (iso?: string | null): number => {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
};

const dayCountLabel = (days: number, verb: string): string =>
  days === 0 ? `${verb} today` : `${verb} ${days} day${days === 1 ? '' : 's'} ago`;

/** Rupees typed by a human -> paise for the API. Returns null when unusable. */
export const rupeesToPaise = (rupees: string): number | null => {
  const trimmed = rupees.trim().replace(/,/g, '');
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
};

/** Paise from the API -> a plain rupee string, for putting back into a field. */
export const paiseToRupeeInput = (paise: number): string => String(paise / 100);

// --- Overview ---------------------------------------------------------------

export interface OpsOverview {
  qcQueue: number;
  pendingVerifications: number;
  openDisputes: number;
  activeOrders: number;
  pendingPayouts: { count: number; amount: number };
}

// --- Quality control --------------------------------------------------------

/** The five checks every garment goes through. Fixed, and shown verbatim. */
export const QC_CRITERIA = [
  'DESIGN_SIMILARITY',
  'STITCHING',
  'MEASUREMENTS',
  'EMBROIDERY',
  'FINISHING',
] as const;

export type QcCriterion = (typeof QC_CRITERIA)[number];

export const QC_CRITERION_COPY: Record<QcCriterion, { label: string; help: string }> = {
  DESIGN_SIMILARITY: {
    label: 'Design similarity',
    help: 'Does the garment read as the approved version — silhouette, colour, proportion.',
  },
  STITCHING: {
    label: 'Stitching',
    help: 'Seam strength, straightness, and finish on the inside as well as the outside.',
  },
  MEASUREMENTS: {
    label: 'Measurements',
    help: 'Against the measurement snapshot taken at order time, not a later change.',
  },
  EMBROIDERY: {
    label: 'Embroidery',
    help: 'Placement, density, and thread quality against the specified surface work.',
  },
  FINISHING: {
    label: 'Finishing',
    help: 'Pressing, hems, fastenings, trims, and the absence of loose threads.',
  },
};

export const QC_PHOTO_VIEWS = ['FRONT', 'BACK', 'DETAIL', 'TAG'] as const;
export type QcPhotoViewName = (typeof QC_PHOTO_VIEWS)[number];

const QC_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'NOT STARTED',
  IN_REVIEW: 'IN REVIEW',
  PASSED: 'PASSED',
  PASSED_WITH_NOTES: 'PASSED WITH NOTES',
  FAILED: 'CORRECTION NEEDED',
};

export interface QcPhotoView {
  id: string;
  url: string;
  caption: string;
  view: string;
}

export interface QcItemView {
  criterion: QcCriterion;
  passed: boolean | null;
  note: string;
}

export interface QcCheckView {
  id: string;
  orderId: string;
  orderCode: string;
  round: number;
  status: string;
  statusLabel: string;
  designTitle: string;
  studioName: string;
  city: string;
  qualityScore: number | null;
  /** Paise. The order total. Context only — a pass does NOT release this. */
  finalPrice: number;
  /**
   * Paise. What is actually held in escrow right now — the advance alone until
   * the balance is captured. This, less the fee, is what a pass moves.
   */
  heldInEscrow: number;
  /** Paise. Zari's cut, deducted from the held amount before the payout. */
  platformFee: number;
  /** Paise. `heldInEscrow` less `platformFee`. What the designer receives. */
  payoutAmount: number;
  promisedLabel: string;
  waitingLabel: string;
  waitingDays: number;
  aiSimilarityScore: number | null;
  overallNote: string;
  photos: QcPhotoView[];
  items: QcItemView[];
  tone: Tone;
}

interface ApiQcPhoto {
  id: string;
  url: string;
  caption?: string | null;
  view?: string | null;
}

interface ApiQcItem {
  criterion: string;
  passed?: boolean | null;
  note?: string | null;
}

interface ApiQcCheck {
  id: string;
  orderId: string;
  round: number;
  status: string;
  overallNote?: string | null;
  aiSimilarityScore?: number | null;
  createdAt?: string | null;
  photos?: ApiQcPhoto[];
  items?: ApiQcItem[];
  order?: {
    id: string;
    code: string;
    finalPrice: number;
    platformFee?: number | null;
    /** Paise. Only the queue sends this; the write endpoints return a bare check. */
    heldInEscrow?: number | null;
    releasableToDesigner?: number | null;
    promisedDate?: string | null;
    designer?: { studioName: string; city?: string | null; qualityScore?: number | null } | null;
    version?: { design?: { title: string } | null } | null;
  } | null;
}

/**
 * The five criteria always render, in order, whether or not the round has rows
 * for them yet — a reviewer should never have a checklist that changes shape.
 */
const toItems = (rows: ApiQcItem[] | undefined): QcItemView[] =>
  QC_CRITERIA.map((criterion) => {
    const row = (rows ?? []).find((r) => r.criterion === criterion);
    return { criterion, passed: row?.passed ?? null, note: row?.note ?? '' };
  });

const toCheck = (c: ApiQcCheck): QcCheckView => {
  const days = daysSince(c.createdAt);
  const heldInEscrow = c.order?.heldInEscrow ?? 0;
  const platformFee = c.order?.platformFee ?? 0;
  // Mirrors payoutFor() in the backend: never negative, always net of the fee.
  const payoutAmount = c.order?.releasableToDesigner ?? Math.max(0, heldInEscrow - platformFee);
  return {
    id: c.id,
    orderId: c.orderId,
    orderCode: c.order?.code ?? '',
    round: c.round,
    status: c.status,
    statusLabel: QC_STATUS_LABELS[c.status] ?? c.status.replace(/_/g, ' '),
    designTitle: c.order?.version?.design?.title ?? 'Untitled design',
    studioName: c.order?.designer?.studioName ?? 'Unassigned studio',
    city: c.order?.designer?.city ?? '',
    qualityScore: c.order?.designer?.qualityScore ?? null,
    finalPrice: c.order?.finalPrice ?? 0,
    heldInEscrow,
    platformFee,
    payoutAmount,
    promisedLabel: dateLabel(c.order?.promisedDate),
    waitingLabel: days === 0 ? 'In the queue today' : `In the queue ${days} day${days === 1 ? '' : 's'}`,
    waitingDays: days,
    aiSimilarityScore: c.aiSimilarityScore ?? null,
    overallNote: c.overallNote ?? '',
    photos: (c.photos ?? []).map((p) => ({
      id: p.id,
      url: p.url,
      caption: p.caption ?? '',
      view: p.view ?? '',
    })),
    items: toItems(c.items),
    tone: toneFor(c.id),
  };
};

export interface QcPhotoInput {
  url: string;
  view?: QcPhotoViewName;
  caption?: string;
}

export interface QcDecisionInput {
  items: { criterion: QcCriterion; passed: boolean; note?: string }[];
  overallNote?: string;
}

// --- Designer verification --------------------------------------------------

export const VERIFICATION_DECISIONS = ['IN_REVIEW', 'VERIFIED', 'REJECTED'] as const;
export type VerificationDecision = (typeof VERIFICATION_DECISIONS)[number];

const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'AWAITING REVIEW',
  IN_REVIEW: 'IN REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
};

export interface VerificationView {
  id: string;
  designerId: string;
  slug: string;
  studioName: string;
  city: string;
  initials: string;
  tone: Tone;
  status: string;
  statusLabel: string;
  reviewNotes: string;
  submittedLabel: string;
  waitingDays: number;
  documents: { label: string; url: string | null }[];
  portfolio: { title: string; coverUrl: string | null }[];
}

interface ApiVerification {
  id: string;
  designerId: string;
  status: string;
  reviewNotes?: string | null;
  submittedAt?: string | null;
  createdAt?: string | null;
  documents?: unknown;
  designer?: {
    id: string;
    studioName: string;
    city?: string | null;
    slug?: string | null;
    portfolioItems?: { title: string; coverUrl?: string | null }[];
  } | null;
}

/** `documents` is a free-form Json column, so read it defensively. */
const toDocuments = (raw: unknown): { label: string; url: string | null }[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, index) => {
    if (entry && typeof entry === 'object') {
      const row = entry as Record<string, unknown>;
      const label = typeof row.type === 'string' ? row.type : `Document ${index + 1}`;
      return { label, url: typeof row.url === 'string' ? row.url : null };
    }
    return { label: `Document ${index + 1}`, url: typeof entry === 'string' ? entry : null };
  });
};

const toVerification = (v: ApiVerification): VerificationView => {
  const submitted = v.submittedAt ?? v.createdAt ?? null;
  const studioName = v.designer?.studioName ?? 'Unnamed studio';
  return {
    id: v.id,
    designerId: v.designerId,
    slug: v.designer?.slug ?? '',
    studioName,
    city: v.designer?.city ?? '',
    initials: initialsFor(studioName),
    tone: toneFor(v.designerId),
    status: v.status,
    statusLabel: VERIFICATION_STATUS_LABELS[v.status] ?? v.status.replace(/_/g, ' '),
    reviewNotes: v.reviewNotes ?? '',
    submittedLabel: submitted ? `Submitted ${dateLabel(submitted)}` : 'Submission date unknown',
    waitingDays: daysSince(submitted),
    documents: toDocuments(v.documents),
    portfolio: (v.designer?.portfolioItems ?? []).map((p) => ({
      title: p.title,
      coverUrl: p.coverUrl ?? null,
    })),
  };
};

// --- Disputes ---------------------------------------------------------------

export const DISPUTE_RESOLUTIONS = [
  'RESOLVED_CUSTOMER',
  'RESOLVED_DESIGNER',
  'RESOLVED_SPLIT',
] as const;
export type DisputeResolution = (typeof DISPUTE_RESOLUTIONS)[number];

/**
 * What each outcome actually does downstream, so nobody picks one from its name
 * alone. RESOLVED_CUSTOMER cancels the order; the other two complete it.
 */
export const DISPUTE_RESOLUTION_COPY: Record<
  DisputeResolution,
  { label: string; effect: string }
> = {
  RESOLVED_CUSTOMER: {
    label: 'For the customer',
    effect: 'The order is marked cancelled.',
  },
  RESOLVED_DESIGNER: {
    label: 'For the designer',
    effect: 'The order is marked completed.',
  },
  RESOLVED_SPLIT: {
    label: 'Split between both',
    effect: 'The order is marked completed.',
  },
};

const DISPUTE_STATUS_LABELS: Record<string, string> = {
  OPEN: 'OPEN',
  IN_REVIEW: 'IN REVIEW',
  RESOLVED_CUSTOMER: 'RESOLVED · CUSTOMER',
  RESOLVED_DESIGNER: 'RESOLVED · DESIGNER',
  RESOLVED_SPLIT: 'RESOLVED · SPLIT',
};

export interface DisputeMessageView {
  id: string;
  body: string;
  isInternal: boolean;
  whenLabel: string;
}

export interface DisputeView {
  id: string;
  orderId: string;
  orderCode: string;
  status: string;
  statusLabel: string;
  reason: string;
  description: string;
  customerName: string;
  studioName: string;
  /** Paise. */
  finalPrice: number;
  openedLabel: string;
  ageDays: number;
  /** Older cases are more urgent; encoded in form as well as in words. */
  severity: 'watch' | 'urgent';
  evidenceUrls: string[];
  messages: DisputeMessageView[];
}

interface ApiDispute {
  id: string;
  orderId: string;
  status: string;
  reason: string;
  description?: string | null;
  evidenceUrls?: string[];
  createdAt?: string | null;
  order?: {
    id: string;
    code: string;
    finalPrice: number;
    customer?: { name?: string | null } | null;
    designer?: { studioName?: string | null } | null;
  } | null;
  messages?: { id: string; body: string; isInternal?: boolean; createdAt?: string | null }[];
}

const toDispute = (d: ApiDispute): DisputeView => {
  const age = daysSince(d.createdAt);
  return {
    id: d.id,
    orderId: d.orderId,
    orderCode: d.order?.code ?? '',
    status: d.status,
    statusLabel: DISPUTE_STATUS_LABELS[d.status] ?? d.status.replace(/_/g, ' '),
    reason: d.reason,
    description: d.description ?? '',
    customerName: d.order?.customer?.name ?? 'The customer',
    studioName: d.order?.designer?.studioName ?? 'The studio',
    finalPrice: d.order?.finalPrice ?? 0,
    openedLabel: dayCountLabel(age, 'Opened'),
    ageDays: age,
    severity: age >= 3 ? 'urgent' : 'watch',
    evidenceUrls: d.evidenceUrls ?? [],
    messages: (d.messages ?? []).map((m) => ({
      id: m.id,
      body: m.body,
      isInternal: m.isInternal ?? false,
      whenLabel: dateLabel(m.createdAt),
    })),
  };
};

export interface DisputeResolutionInput {
  status: DisputeResolution;
  resolutionNote: string;
  /** Paise. Omitted when there is no refund. */
  refundAmount?: number;
}

// --- Cost rules -------------------------------------------------------------

export const COST_COMPONENTS = [
  'FABRIC',
  'LINING',
  'EMBROIDERY',
  'STITCHING',
  'TRIMS',
  'FINISHING',
  'OTHER',
] as const;
export type CostComponent = (typeof COST_COMPONENTS)[number];

export const COST_COMPONENT_LABELS: Record<CostComponent, string> = {
  FABRIC: 'Fabric',
  LINING: 'Lining',
  EMBROIDERY: 'Embroidery',
  STITCHING: 'Stitching',
  TRIMS: 'Trims',
  FINISHING: 'Finishing',
  OTHER: 'Other',
};

export interface CostRuleView {
  id: string;
  component: CostComponent;
  key: string;
  label: string;
  /** Paise per unit. */
  minRate: number;
  maxRate: number;
  unit: string;
  region: string | null;
  multiplier: number;
  isActive: boolean;
  notes: string;
  rangeLabel: string;
  scopeLabel: string;
}

interface ApiCostRule {
  id: string;
  component: string;
  key: string;
  label: string;
  minRate: number;
  maxRate: number;
  unit?: string | null;
  region?: string | null;
  multiplier?: number | null;
  isActive: boolean;
  notes?: string | null;
}

const toCostRule = (r: ApiCostRule): CostRuleView => {
  const unit = r.unit ?? 'm';
  const range =
    r.minRate === r.maxRate
      ? formatINR(r.minRate)
      : `${formatINR(r.minRate)}–${formatINR(r.maxRate)}`;
  return {
    id: r.id,
    component: (COST_COMPONENTS as readonly string[]).includes(r.component)
      ? (r.component as CostComponent)
      : 'OTHER',
    key: r.key,
    label: r.label,
    minRate: r.minRate,
    maxRate: r.maxRate,
    unit,
    region: r.region ?? null,
    multiplier: r.multiplier ?? 1,
    isActive: r.isActive,
    notes: r.notes ?? '',
    rangeLabel: `${range} per ${unit}`,
    scopeLabel: r.region ? `${r.region} only` : 'Applies everywhere',
  };
};

export interface CostRuleInput {
  component: CostComponent;
  key: string;
  label: string;
  /** Paise per unit. Convert with `rupeesToPaise` before you get here. */
  minRate: number;
  maxRate: number;
  unit: string;
  region?: string | null;
  multiplier: number;
  isActive: boolean;
  notes?: string | null;
}

// --- The service ------------------------------------------------------------

export const opsService = {
  async overview(): Promise<OpsOverview> {
    return api.get<OpsOverview>('/ops/overview');
  },

  async qcQueue(): Promise<QcCheckView[]> {
    const page = await api.get<Page<ApiQcCheck>>('/qc/queue?limit=50');
    return page.items.map(toCheck);
  },

  /** Opens a new review round on the order. Moves it into quality check. */
  async startQcRound(orderId: string): Promise<QcCheckView> {
    return toCheck(await api.post<ApiQcCheck>('/qc/start', { orderId }));
  },

  /** Also runs the advisory AI similarity pass; a human still decides. */
  async addQcPhotos(
    checkId: string,
    photos: QcPhotoInput[],
  ): Promise<{ check: QcCheckView; aiSimilarityScore: number | null }> {
    const result = await api.post<{ check: ApiQcCheck; aiSimilarityScore: number | null }>(
      `/qc/${checkId}/photos`,
      { photos },
    );
    return { check: toCheck(result.check), aiSimilarityScore: result.aiSimilarityScore };
  },

  /**
   * The decision. All five criteria must be sent. A pass — and only a pass —
   * releases the escrow balance to the designer.
   */
  async decideQc(checkId: string, input: QcDecisionInput): Promise<QcCheckView> {
    return toCheck(await api.post<ApiQcCheck>(`/qc/${checkId}/decide`, input));
  },

  async pendingVerifications(): Promise<VerificationView[]> {
    const page = await api.get<Page<ApiVerification>>('/ops/designers?limit=50');
    return page.items.map(toVerification);
  },

  async verifyDesigner(
    designerId: string,
    input: { status: VerificationDecision; reviewNotes?: string | null },
  ): Promise<void> {
    await api.post(`/ops/designers/${designerId}/verify`, input);
  },

  async disputes(): Promise<DisputeView[]> {
    const page = await api.get<Page<ApiDispute>>('/ops/disputes?limit=50');
    return page.items.map(toDispute);
  },

  async resolveDispute(disputeId: string, input: DisputeResolutionInput): Promise<void> {
    await api.post(`/ops/disputes/${disputeId}/resolve`, input);
  },

  /** Returns retired rules too, so the table can show what was withdrawn. */
  async costRules(): Promise<CostRuleView[]> {
    const rows = await api.get<ApiCostRule[]>('/ops/cost-rules');
    return rows.map(toCostRule);
  },

  /** Creates, or updates in place when component + key + region already exist. */
  async saveCostRule(input: CostRuleInput): Promise<CostRuleView> {
    return toCostRule(await api.post<ApiCostRule>('/ops/cost-rules', input));
  },

  /** Retires the rule — it stops pricing new estimates but is never deleted. */
  async retireCostRule(id: string): Promise<void> {
    await api.delete(`/ops/cost-rules/${id}`);
  },
};
