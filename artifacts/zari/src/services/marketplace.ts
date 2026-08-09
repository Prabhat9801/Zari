import { api } from '@/lib/apiClient';
import {
  formatINR,
  initialsFor,
  toneFor,
  type DesignerProfileView,
  type DesignerSummary,
} from '@/types';

interface ApiDesigner {
  id: string;
  slug: string;
  studioName: string;
  city: string;
  bio?: string | null;
  logoUrl?: string | null;
  specialties?: string[];
  qualityScore: number;
  ratingAvg?: number;
  reviewsCount?: number;
  leadTimeMinDays?: number;
  leadTimeMaxDays?: number;
  capacityPercent?: number;
  minOrderValue?: number | null;
  portfolioItems?: {
    id: string;
    title: string;
    category?: string | null;
    occasion?: string | null;
    coverUrl?: string | null;
    imageUrls?: string[];
  }[];
}

const leadTimeLabel = (d: ApiDesigner): string =>
  d.leadTimeMinDays && d.leadTimeMaxDays
    ? `${d.leadTimeMinDays}–${d.leadTimeMaxDays} days`
    : `${d.leadTimeMinDays ?? 14} days`;

const toSummary = (d: ApiDesigner): DesignerSummary => ({
  id: d.id,
  slug: d.slug,
  name: d.studioName,
  city: d.city,
  score: String(d.qualityScore),
  // A studio's floor price is a real number; when it has none, say so rather
  // than inventing one — the product never shows a fake price.
  bid: d.minOrderValue ? `From ${formatINR(d.minOrderValue)}` : 'Quote on request',
  days: leadTimeLabel(d),
  initials: initialsFor(d.studioName),
  tone: toneFor(d.id),
});

const toProfile = (d: ApiDesigner): DesignerProfileView => ({
  ...toSummary(d),
  bio: d.bio ?? '',
  specialties: d.specialties ?? [],
  leadTime: leadTimeLabel(d),
  capacity: d.capacityPercent === undefined ? 'Accepting work' : `${d.capacityPercent}% full`,
  rating: (d.ratingAvg ?? 0).toFixed(1),
  reviews: d.reviewsCount ?? 0,
  portfolio: (d.portfolioItems ?? []).map((p) => ({
    name: p.title,
    category: [p.category, p.occasion].filter(Boolean).join(' · ') || 'Selected work',
    tone: toneFor(p.id),
    imageUrl: p.coverUrl ?? p.imageUrls?.[0] ?? null,
  })),
});

export const marketplaceService = {
  async listDesigners(): Promise<DesignerSummary[]> {
    const page = await api.get<{ items: ApiDesigner[] }>('/marketplace/designers?limit=24');
    return page.items.map(toSummary);
  },

  async getDesigner(slug: string): Promise<DesignerProfileView> {
    const designer = await api.get<ApiDesigner>(`/marketplace/designers/${slug}`);
    return toProfile(designer);
  },

  /** The public weights behind the Quality Score and matching. */
  async getScoring() {
    return api.get<{
      qualityScore: { weights: Record<string, number>; components: { key: string; label: string; source: string }[]; note: string };
      matching: { weights: Record<string, number>; note: string };
    }>('/marketplace/scoring');
  },

  async requestQuotes(input: { designId: string; city?: string | null; notes?: string | null }) {
    return api.post<{ request: { id: string; code: string }; matchCount: number }>(
      '/marketplace/requests',
      input,
    );
  },
};
