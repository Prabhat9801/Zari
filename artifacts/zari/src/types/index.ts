/**
 * Shapes the UI works with.
 *
 * These are deliberately the *view* types, not raw API rows: the mock data and
 * the API both normalise into these, so a component never has to know which
 * source it is rendering.
 */

export type Tone = 'lavender' | 'peach' | 'sage' | 'lilac';

export interface DesignSummary {
  id: string;
  name: string;
  meta: string;
  tone: Tone;
  coverUrl?: string | null;
  /** Paise. Null when the design has no estimate yet. */
  estimateMin?: number | null;
  estimateMax?: number | null;
}

export interface DesignerSummary {
  id: string;
  slug: string;
  name: string;
  city: string;
  score: string;
  bid: string;
  days: string;
  initials: string;
  tone: Tone;
  /** First public portfolio piece, when the studio has uploaded one. */
  coverUrl?: string | null;
}

export interface PortfolioPiece {
  name: string;
  category: string;
  tone: Tone;
  imageUrl?: string | null;
}

export interface DesignerProfileView {
  id: string;
  slug: string;
  name: string;
  city: string;
  score: string;
  initials: string;
  tone: Tone;
  bio: string;
  specialties: string[];
  leadTime: string;
  capacity: string;
  rating: string;
  reviews: number;
  portfolio: PortfolioPiece[];
}

export interface OrderSummary {
  id: string;
  code: string;
  title: string;
  designerName: string;
  status: string;
  statusLabel: string;
  meta: string;
  tone: Tone;
}

export interface CostLine {
  label: string;
  amount: string;
}

export interface DesignImage {
  view: string;
  url: string;
}

export interface DesignDetail {
  id: string;
  title: string;
  versionNumber: number;
  images: DesignImage[];
  attributes: { label: string; value: string }[];
  costLines: CostLine[];
  estimateLabel: string;
  makeability: { score: string; complexity: string; leadTime: string };
  conversation: string[];
}

/**
 * Picks the render for a tab. Only FRONT is generated today, so BACK and DETAIL
 * fall back to it rather than dropping the customer onto an empty canvas.
 */
export const imageForView = (images: DesignImage[], view: string): string | null =>
  images.find((i) => i.view.toLowerCase() === view.toLowerCase())?.url ?? images[0]?.url ?? null;

/** Rupee formatting. Always "₹8,240" — never "Rs 8240". */
export const formatINR = (paise: number): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);

export const formatRange = (min: number, max: number): string =>
  min === max ? formatINR(min) : `${formatINR(min)}–${formatINR(max)}`;

const TONES: Tone[] = ['lavender', 'peach', 'sage', 'lilac'];

/** Stable tone per id, so a design keeps the same colour between renders. */
export const toneFor = (id: string): Tone => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length]!;
};

export const initialsFor = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'Edited just now';
  if (mins < 60) return `Edited ${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Edited ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `Edited ${days} day${days === 1 ? '' : 's'} ago`;
};
