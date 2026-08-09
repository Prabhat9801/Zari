import type {
  DesignDetail,
  DesignSummary,
  DesignerProfileView,
  DesignerSummary,
  OrderSummary,
} from '@/types';

/**
 * The demo set.
 *
 * Every screen falls back to this when the API is unreachable or has nothing
 * yet, so the site is never empty or broken. Keep it realistic — real Indian
 * studios, cities, garments and prices. No Lorem ipsum, no John Doe.
 */

export const mockDesigns: DesignSummary[] = [
  { id: 'lavender-lehenga', name: 'Pastel Lavender Engagement Lehenga', meta: 'Edited 2 hours ago', tone: 'lavender' },
  { id: 'indigo-sari', name: 'Indigo Silk Sari Set', meta: 'Edited 5 days ago', tone: 'sage' },
  { id: 'marigold-kurta', name: 'Marigold Organza Kurta', meta: 'Edited 12 days ago', tone: 'peach' },
  { id: 'rose-anarkali', name: 'Rose Quartz Anarkali', meta: 'Edited 18 days ago', tone: 'lilac' },
];

export const mockDesigners: DesignerSummary[] = [
  { id: 'aanya', slug: 'aanya-studio', name: 'Aanya Studio', city: 'Bengaluru', score: '94', bid: '₹6,400', days: '12 days', initials: 'AS', tone: 'peach' },
  { id: 'mira', slug: 'mira-atelier', name: 'Mira Atelier', city: 'Mumbai', score: '91', bid: '₹7,100', days: '15 days', initials: 'MA', tone: 'sage' },
  { id: 'rekha', slug: 'rekha-thread', name: 'Rekha & Thread', city: 'Jaipur', score: '89', bid: '₹5,900', days: '18 days', initials: 'RT', tone: 'lavender' },
];

export const mockDesignerProfiles: Record<string, DesignerProfileView> = {
  'aanya-studio': {
    ...mockDesigners[0]!,
    bio: 'A small occasionwear studio making soft, considered silhouettes with a sharp eye for fit. Every piece is cut in our Bengaluru atelier and finished by hand.',
    specialties: ['Lehenga', 'Occasionwear', 'Resham embroidery', 'Made-to-measure fit'],
    leadTime: '12–16 days',
    capacity: '82% full',
    rating: '4.8',
    reviews: 38,
    portfolio: [
      { name: 'Lavender movement', category: 'Lehenga · Engagement', tone: 'lavender' },
      { name: 'Rose petal set', category: 'Anarkali · Festive', tone: 'peach' },
      { name: 'Quiet gold', category: 'Sari set · Occasion', tone: 'sage' },
      { name: 'Pearl neckline', category: 'Blouse · Bridal guest', tone: 'lilac' },
    ],
  },
  'mira-atelier': {
    ...mockDesigners[1]!,
    bio: 'Mira Atelier works with fluid silks, hand-dyed colour, and clean construction for celebrations that call for ease rather than excess.',
    specialties: ['Sari sets', 'Silk drape', 'Hand-dyed colour', 'Minimal embellishment'],
    leadTime: '15–18 days',
    capacity: '68% full',
    rating: '4.7',
    reviews: 26,
    portfolio: [
      { name: 'Indigo evening', category: 'Sari set · Occasion', tone: 'sage' },
      { name: 'Soft architecture', category: 'Gown · Festive', tone: 'lavender' },
      { name: 'Cinnamon silk', category: 'Blouse · Occasion', tone: 'peach' },
      { name: 'The easy drape', category: 'Sari · Everyday luxury', tone: 'lilac' },
    ],
  },
  'rekha-thread': {
    ...mockDesigners[2]!,
    bio: 'Rekha & Thread brings Jaipur craft traditions into modern, wearable occasion pieces, with a special love for thoughtful surface work.',
    specialties: ['Gota patti', 'Lehenga', 'Festive tailoring', 'Textile craft'],
    leadTime: '18–21 days',
    capacity: '74% full',
    rating: '4.6',
    reviews: 21,
    portfolio: [
      { name: 'Marigold court', category: 'Lehenga · Festive', tone: 'peach' },
      { name: 'Threaded dusk', category: 'Anarkali · Occasion', tone: 'lavender' },
      { name: 'Jaipur line', category: 'Kurta · Celebration', tone: 'sage' },
      { name: 'Quiet mirrorwork', category: 'Blouse · Festive', tone: 'lilac' },
    ],
  },
};

/** Legacy short ids still used by some links (/designers/aanya). */
export const mockProfileAliases: Record<string, string> = {
  aanya: 'aanya-studio',
  mira: 'mira-atelier',
  rekha: 'rekha-thread',
};

export const mockOrders: OrderSummary[] = [
  {
    id: 'ZR-1048',
    code: 'ZR-1048',
    title: 'Pastel Lavender Engagement Lehenga',
    designerName: 'Aanya Studio',
    status: 'IN_PRODUCTION',
    statusLabel: 'IN PRODUCTION',
    meta: 'With Aanya Studio · Order ZR-1048 · Est. delivery 28 Nov',
    tone: 'lavender',
  },
  {
    id: 'ZR-0962',
    code: 'ZR-0962',
    title: 'Indigo Silk Sari Set',
    designerName: 'Mira Atelier',
    status: 'FIT_WINDOW',
    statusLabel: 'FIT WINDOW OPEN',
    meta: 'With Mira Atelier · Order ZR-0962 · Delivered 03 Oct',
    tone: 'sage',
  },
];

export const mockDesignDetail: DesignDetail = {
  id: 'lavender-lehenga',
  title: 'Pastel Lavender Engagement Lehenga',
  versionNumber: 1,
  // No renders in the demo set — the canvas falls back to its illustration.
  images: [],
  attributes: [
    { label: 'Silhouette', value: 'Flared A-line' },
    { label: 'Fabric', value: 'Chanderi silk' },
    { label: 'Embellishment', value: 'Resham + pearls' },
    { label: 'Complexity', value: 'Moderate' },
  ],
  costLines: [
    { label: 'Materials & lining', amount: '₹3,150' },
    { label: 'Craft & construction', amount: '₹3,100' },
    { label: 'Finishing allowance', amount: '₹1,150' },
  ],
  estimateLabel: '₹7,400–₹8,400',
  makeability: { score: '94%', complexity: 'Medium', leadTime: '12–16' },
  conversation: [
    'I have kept the skirt fluid and light for movement. Would you like more structure at the waist?',
    'The estimate includes lining, hand-finishing, and a standard made-to-measure fit.',
  ],
};
