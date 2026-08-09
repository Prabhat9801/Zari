import { api } from '@/lib/apiClient';
import { formatINR, formatRange } from '@/types';

/**
 * The designer side of the API.
 *
 * Same contract as the other services: raw API rows come in, *view* types go
 * out, so a designer screen never has to know about Prisma shapes, ISO strings,
 * or paise arithmetic. Every amount the API sends is an integer number of
 * paise — it is turned into a "₹8,240" label here and nowhere else.
 */

// --- View types -------------------------------------------------------------

export interface DesignerMetrics {
  /** Paise. */
  revenueThisMonth: number;
  /** Paise. */
  revenueLifetime: number;
  activeOrders: number;
  pendingBids: number;
  onTimePercent: number;
  qualityScore: number;
  capacityPercent: number;
  rating: number;
  reviewsCount: number;
}

export interface DesignerOrderCard {
  id: string;
  code: string;
  title: string;
  status: string;
  statusLabel: string;
  /** Paise. The agreed final price, not an estimate. */
  finalPrice: number;
  priceLabel: string;
  promisedLabel: string;
  /** Whole days until the promised date. Negative when it has passed. */
  daysLeft: number | null;
  nextMilestone: string | null;
}

export interface DesignerDashboardView {
  studioName: string;
  metrics: DesignerMetrics;
  needsAttention: DesignerOrderCard[];
  atRisk: DesignerOrderCard[];
  unreadMessages: number;
}

export interface BidView {
  id: string;
  requestId: string;
  requestCode: string;
  title: string;
  status: string;
  statusLabel: string;
  /** Paise. A quote is a point value — never a range. */
  price: number;
  priceLabel: string;
  leadTimeDays: number;
  message: string | null;
  budgetLabel: string | null;
  neededByLabel: string | null;
  submittedLabel: string;
  canWithdraw: boolean;
}

export interface OpportunityView {
  /** The match id. The request id is what a bid is posted against. */
  id: string;
  requestId: string;
  requestCode: string;
  title: string;
  category: string | null;
  brief: string | null;
  matchScore: number;
  rank: number;
  /** Zari's itemised estimate for the version — a range, never a quote. */
  estimateLabel: string | null;
  budgetLabel: string | null;
  neededByLabel: string | null;
  city: string | null;
  existingBid: { id: string; status: string; priceLabel: string } | null;
}

export interface CopilotTask {
  title: string;
  detail: string;
  action: string;
  entityId?: string | null;
}

export interface CopilotView {
  headline: string;
  tasks: CopilotTask[];
  /** 'ai' when the digest came from Claude, 'rules' when it fell back. */
  source: string;
}

export interface PayoutView {
  id: string;
  orderCode: string;
  /** Paise. */
  amount: number;
  amountLabel: string;
  status: string;
  statusLabel: string;
  dateLabel: string;
  failureReason: string | null;
}

export interface EarningsView {
  /** Paise. */
  paid: number;
  /** Paise. */
  pending: number;
  /** Paise. Still held by Zari until quality control passes. */
  inEscrow: number;
  payouts: PayoutView[];
  note: string;
}

export interface QualityComponent {
  key: string;
  label: string;
  source: string;
  weightPercent: number;
  /** 0–100. Null when there is no history to score yet. */
  value: number | null;
}

export interface MatchingComponent {
  key: string;
  label: string;
  weightPercent: number;
}

export interface DesignerQualityView {
  studioName: string;
  qualityScore: number;
  scoreLabel: string;
  measuredLabel: string | null;
  components: QualityComponent[];
  matching: MatchingComponent[];
  qualityNote: string;
  matchingNote: string;
  stats: {
    onTimePercent: number;
    fitSuccessPercent: number;
    completedOrders: number;
    rating: string;
    reviewsCount: number;
  };
}

// --- API rows ---------------------------------------------------------------

interface ApiDashboardOrder {
  id: string;
  code: string;
  status: string;
  promisedDate?: string | null;
  finalPrice: number;
  version?: { design?: { title?: string | null } | null } | null;
  milestones?: { type: string; title: string; status: string }[];
}

interface ApiDashboard {
  metrics: {
    revenueThisMonth: number;
    revenueLifetime: number;
    activeOrders: number;
    pendingBids: number;
    onTimePercent: number;
    qualityScore: number;
    capacityPercent: number;
    rating: number;
    reviewsCount: number;
  };
  needsAttention: ApiDashboardOrder[];
  atRisk: ApiDashboardOrder[];
  unreadMessages: number;
  studioName: string;
}

interface ApiBid {
  id: string;
  requestId: string;
  price: number;
  leadTimeDays: number;
  message?: string | null;
  status: string;
  createdAt: string;
  request?: {
    id: string;
    code: string;
    status: string;
    budgetMin?: number | null;
    budgetMax?: number | null;
    neededBy?: string | null;
    design?: { title?: string | null; coverUrl?: string | null; category?: string | null } | null;
  } | null;
}

interface ApiOpportunity {
  id: string;
  requestId: string;
  matchScore: number;
  rank: number;
  request?: {
    id: string;
    code: string;
    status: string;
    city?: string | null;
    budgetMin?: number | null;
    budgetMax?: number | null;
    neededBy?: string | null;
    design?: {
      title?: string | null;
      coverUrl?: string | null;
      category?: string | null;
      briefText?: string | null;
    } | null;
    version?: { costEstimate?: { minTotal: number; maxTotal: number } | null } | null;
    bids?: { id: string; status: string; price: number }[];
  } | null;
}

interface ApiPayout {
  id: string;
  amount: number;
  status: string;
  processedAt?: string | null;
  createdAt: string;
  failureReason?: string | null;
  order?: { code?: string | null; finalPrice?: number | null } | null;
}

interface ApiEarnings {
  paid: number;
  pending: number;
  inEscrow: number;
  payouts: ApiPayout[];
  note: string;
}

interface ApiOwnProfile {
  studioName: string;
  qualityScore: number;
  onTimeRate?: number;
  fitSuccessRate?: number;
  completedOrders?: number;
  ratingAvg?: number;
  reviewsCount?: number;
  qualityScoreLog?: {
    score: number;
    breakdown?: Record<string, number> | null;
    createdAt: string;
  }[];
}

interface ApiScoring {
  qualityScore: {
    weights: Record<string, number>;
    components: { key: string; label: string; source: string }[];
    note: string;
  };
  matching: { weights: Record<string, number>; note: string };
}

// --- Labels -----------------------------------------------------------------

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'AWAITING PAYMENT',
  CONFIRMED: 'CONFIRMED',
  IN_PRODUCTION: 'IN PRODUCTION',
  QC_PENDING: 'IN QUALITY CHECK',
  QC_FAILED: 'CORRECTION NEEDED',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  FIT_WINDOW: 'FIT WINDOW OPEN',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  DISPUTED: 'IN DISPUTE',
};

const BID_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'SENT',
  SHORTLISTED: 'SHORTLISTED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'NOT CHOSEN',
  WITHDRAWN: 'WITHDRAWN',
  EXPIRED: 'EXPIRED',
};

const PAYOUT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'QUEUED',
  PROCESSING: 'ON ITS WAY',
  PAID: 'PAID',
  FAILED: 'NEEDS ATTENTION',
};

const MATCHING_LABELS: Record<string, string> = {
  similarityMatch: 'Portfolio similarity',
  craftMatch: 'Craft and fabric fit',
  quality: 'Zari Quality Score',
  capacityFit: 'Capacity right now',
  locationFit: 'Same city as the customer',
};

const titleCase = (value: string): string =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ');

export const orderStatusLabel = (status: string): string =>
  ORDER_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');

export const bidStatusLabel = (status: string): string =>
  BID_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');

const dateLabel = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '';

const daysUntil = (iso?: string | null): number | null => {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.ceil((then - Date.now()) / 86_400_000);
};

/** Budgets are a range the customer set; a missing one is said plainly. */
const budgetLabel = (min?: number | null, max?: number | null): string | null => {
  if (min && max) return formatRange(min, max);
  if (max) return `Up to ${formatINR(max)}`;
  if (min) return `From ${formatINR(min)}`;
  return null;
};

// --- Normalisers ------------------------------------------------------------

const toOrderCard = (o: ApiDashboardOrder): DesignerOrderCard => ({
  id: o.id,
  code: o.code,
  title: o.version?.design?.title ?? 'Your commission',
  status: o.status,
  statusLabel: orderStatusLabel(o.status),
  finalPrice: o.finalPrice,
  priceLabel: formatINR(o.finalPrice),
  promisedLabel: o.promisedDate ? `Promised ${dateLabel(o.promisedDate)}` : 'No promised date yet',
  daysLeft: daysUntil(o.promisedDate),
  nextMilestone: o.milestones?.[0]?.title ?? null,
});

const toBidView = (b: ApiBid): BidView => ({
  id: b.id,
  requestId: b.request?.id ?? b.requestId,
  requestCode: b.request?.code ?? '',
  title: b.request?.design?.title ?? 'A customer design',
  status: b.status,
  statusLabel: bidStatusLabel(b.status),
  price: b.price,
  priceLabel: formatINR(b.price),
  leadTimeDays: b.leadTimeDays,
  message: b.message ?? null,
  budgetLabel: budgetLabel(b.request?.budgetMin, b.request?.budgetMax),
  neededByLabel: b.request?.neededBy ? `Needed by ${dateLabel(b.request.neededBy)}` : null,
  submittedLabel: b.createdAt ? `Sent ${dateLabel(b.createdAt)}` : '',
  // An accepted quote is a commitment, and a closed request has moved on.
  canWithdraw: ['SUBMITTED', 'SHORTLISTED'].includes(b.status) && b.request?.status === 'OPEN',
});

const toOpportunityView = (m: ApiOpportunity): OpportunityView => {
  const estimate = m.request?.version?.costEstimate;
  const bid = m.request?.bids?.[0];
  return {
    id: m.id,
    requestId: m.request?.id ?? m.requestId,
    requestCode: m.request?.code ?? '',
    title: m.request?.design?.title ?? 'A customer design',
    category: m.request?.design?.category ?? null,
    brief: m.request?.design?.briefText ?? null,
    matchScore: m.matchScore,
    rank: m.rank,
    estimateLabel: estimate ? formatRange(estimate.minTotal, estimate.maxTotal) : null,
    budgetLabel: budgetLabel(m.request?.budgetMin, m.request?.budgetMax),
    neededByLabel: m.request?.neededBy ? `Needed by ${dateLabel(m.request.neededBy)}` : null,
    city: m.request?.city ?? null,
    existingBid: bid
      ? { id: bid.id, status: bid.status, priceLabel: formatINR(bid.price) }
      : null,
  };
};

const toPayoutView = (p: ApiPayout): PayoutView => ({
  id: p.id,
  orderCode: p.order?.code ?? '—',
  amount: p.amount,
  amountLabel: formatINR(p.amount),
  status: p.status,
  statusLabel: PAYOUT_STATUS_LABELS[p.status] ?? p.status,
  dateLabel: dateLabel(p.processedAt ?? p.createdAt),
  failureReason: p.failureReason ?? null,
});

/** Mirrors the backend's scoreLabel() so the two never disagree. */
export const scoreLabel = (score: number): string => {
  if (score >= 90) return 'Excellent match';
  if (score >= 80) return 'Strong match';
  if (score >= 70) return 'Good match';
  if (score >= 60) return 'New to Zari';
  return 'Building a record';
};

const toQualityView = (profile: ApiOwnProfile, scoring: ApiScoring): DesignerQualityView => {
  const snapshot = profile.qualityScoreLog?.[0];
  const breakdown = snapshot?.breakdown ?? null;

  return {
    studioName: profile.studioName,
    qualityScore: profile.qualityScore,
    scoreLabel: scoreLabel(profile.qualityScore),
    measuredLabel: snapshot?.createdAt ? `Last measured ${dateLabel(snapshot.createdAt)}` : null,
    components: scoring.qualityScore.components.map((component) => {
      const value = breakdown?.[component.key];
      return {
        key: component.key,
        label: component.label,
        source: component.source,
        weightPercent: Math.round((scoring.qualityScore.weights[component.key] ?? 0) * 100),
        value: typeof value === 'number' ? Math.round(value) : null,
      };
    }),
    matching: Object.entries(scoring.matching.weights).map(([key, weight]) => ({
      key,
      label: MATCHING_LABELS[key] ?? titleCase(key),
      weightPercent: Math.round(weight * 100),
    })),
    qualityNote: scoring.qualityScore.note,
    matchingNote: scoring.matching.note,
    stats: {
      onTimePercent: Math.round((profile.onTimeRate ?? 0) * 100),
      fitSuccessPercent: Math.round((profile.fitSuccessRate ?? 0) * 100),
      completedOrders: profile.completedOrders ?? 0,
      rating: (profile.ratingAvg ?? 0).toFixed(1),
      reviewsCount: profile.reviewsCount ?? 0,
    },
  };
};

// --- Service ----------------------------------------------------------------

export const designerService = {
  async dashboard(): Promise<DesignerDashboardView> {
    const data = await api.get<ApiDashboard>('/designers/dashboard');
    return {
      studioName: data.studioName,
      metrics: data.metrics,
      needsAttention: (data.needsAttention ?? []).map(toOrderCard),
      atRisk: (data.atRisk ?? []).map(toOrderCard),
      unreadMessages: data.unreadMessages ?? 0,
    };
  },

  async listBids(): Promise<BidView[]> {
    const page = await api.get<{ items: ApiBid[] }>('/marketplace/bids?limit=30');
    return page.items.map(toBidView);
  },

  async listOpportunities(): Promise<OpportunityView[]> {
    const page = await api.get<{ items: ApiOpportunity[] }>('/marketplace/opportunities?limit=20');
    return page.items.map(toOpportunityView);
  },

  async submitBid(
    requestId: string,
    input: { price: number; leadTimeDays: number; message?: string | null },
  ): Promise<BidView> {
    const bid = await api.post<ApiBid>(`/marketplace/requests/${requestId}/bids`, {
      price: input.price,
      leadTimeDays: input.leadTimeDays,
      message: input.message?.trim() ? input.message.trim() : null,
      portfolioRefs: [],
    });
    return toBidView(bid);
  },

  async withdrawBid(bidId: string): Promise<BidView> {
    const bid = await api.post<ApiBid>(`/marketplace/bids/${bidId}/withdraw`);
    return toBidView(bid);
  },

  async copilot(): Promise<CopilotView> {
    const data = await api.get<{ headline: string; tasks: CopilotTask[]; source?: string }>(
      '/designers/copilot',
    );
    return { headline: data.headline, tasks: data.tasks ?? [], source: data.source ?? 'rules' };
  },

  async earnings(): Promise<EarningsView> {
    const data = await api.get<ApiEarnings>('/designers/earnings');
    return {
      paid: data.paid,
      pending: data.pending,
      inEscrow: data.inEscrow,
      payouts: (data.payouts ?? []).map(toPayoutView),
      note: data.note,
    };
  },

  /**
   * The quality panel needs both halves to say anything honest: the studio's own
   * measured breakdown, and the public weights it was measured against.
   */
  async quality(): Promise<DesignerQualityView> {
    const [profile, scoring] = await Promise.all([
      api.get<ApiOwnProfile>('/designers/profile'),
      api.get<ApiScoring>('/marketplace/scoring'),
    ]);
    return toQualityView(profile, scoring);
  },
};
