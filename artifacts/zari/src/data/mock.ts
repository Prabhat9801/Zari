import type {
  DesignDetail,
  DesignSummary,
  DesignerProfileView,
  DesignerSummary,
  OrderSummary,
} from '@/types';
import type {
  BidView,
  CopilotView,
  DesignerDashboardView,
  DesignerQualityView,
  EarningsView,
  OpportunityView,
} from '@/services/designer';

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

/**
 * The designer-side demo set.
 *
 * Same promise as above: nothing here is Lorem ipsum, and every amount is an
 * integer number of paise so the demo and the API render through exactly the
 * same formatting path.
 */

export const mockDesignerDashboard: DesignerDashboardView = {
  studioName: 'Aanya Studio',
  metrics: {
    revenueThisMonth: 12450000,
    revenueLifetime: 98640000,
    activeOrders: 3,
    pendingBids: 3,
    onTimePercent: 96,
    qualityScore: 94,
    capacityPercent: 82,
    rating: 4.8,
    reviewsCount: 38,
  },
  needsAttention: [
    {
      id: 'ZR-1048',
      code: 'ZR-1048',
      title: 'Pastel Lavender Engagement Lehenga',
      status: 'IN_PRODUCTION',
      statusLabel: 'IN PRODUCTION',
      finalPrice: 640000,
      priceLabel: '₹6,400',
      promisedLabel: 'Promised 28 Nov',
      daysLeft: 2,
      nextMilestone: 'Resham embroidery on the skirt panels',
    },
    {
      id: 'ZR-1039',
      code: 'ZR-1039',
      title: 'Indigo Silk Sari Set',
      status: 'CONFIRMED',
      statusLabel: 'CONFIRMED',
      finalPrice: 710000,
      priceLabel: '₹7,100',
      promisedLabel: 'Promised 04 Dec',
      daysLeft: 8,
      nextMilestone: 'Source the handloom silk',
    },
    {
      id: 'ZR-1021',
      code: 'ZR-1021',
      title: 'Marigold Organza Kurta',
      status: 'QC_FAILED',
      statusLabel: 'CORRECTION NEEDED',
      finalPrice: 385000,
      priceLabel: '₹3,850',
      promisedLabel: 'Promised 26 Nov',
      daysLeft: -1,
      nextMilestone: 'Redo the hem finishing flagged by quality control',
    },
  ],
  atRisk: [
    {
      id: 'ZR-1048',
      code: 'ZR-1048',
      title: 'Pastel Lavender Engagement Lehenga',
      status: 'IN_PRODUCTION',
      statusLabel: 'IN PRODUCTION',
      finalPrice: 640000,
      priceLabel: '₹6,400',
      promisedLabel: 'Promised 28 Nov',
      daysLeft: 2,
      nextMilestone: 'Resham embroidery on the skirt panels',
    },
    {
      id: 'ZR-1021',
      code: 'ZR-1021',
      title: 'Marigold Organza Kurta',
      status: 'QC_FAILED',
      statusLabel: 'CORRECTION NEEDED',
      finalPrice: 385000,
      priceLabel: '₹3,850',
      promisedLabel: 'Promised 26 Nov',
      daysLeft: -1,
      nextMilestone: 'Redo the hem finishing flagged by quality control',
    },
  ],
  unreadMessages: 2,
};

export const mockDesignerBids: BidView[] = [
  {
    id: 'bid-2041',
    requestId: 'req-2041',
    requestCode: 'ZRQ-2041',
    title: 'Rose Quartz Anarkali',
    status: 'SUBMITTED',
    statusLabel: 'SENT',
    price: 588000,
    priceLabel: '₹5,880',
    leadTimeDays: 16,
    message: 'I would cut this in a softer georgette so the flare moves without adding weight.',
    budgetLabel: '₹5,000–₹7,000',
    neededByLabel: 'Needed by 12 Dec',
    submittedLabel: 'Sent 18 Nov',
    canWithdraw: true,
  },
  {
    id: 'bid-2036',
    requestId: 'req-2036',
    requestCode: 'ZRQ-2036',
    title: 'Ivory Chikankari Kurta Set',
    status: 'SHORTLISTED',
    statusLabel: 'SHORTLISTED',
    price: 442000,
    priceLabel: '₹4,420',
    leadTimeDays: 14,
    message: 'Hand chikankari on mul cotton, with a lined slip so the work reads clearly.',
    budgetLabel: 'Up to ₹5,000',
    neededByLabel: 'Needed by 02 Dec',
    submittedLabel: 'Sent 14 Nov',
    canWithdraw: true,
  },
  {
    id: 'bid-1998',
    requestId: 'req-1998',
    requestCode: 'ZRQ-1998',
    title: 'Emerald Velvet Blouse',
    status: 'ACCEPTED',
    statusLabel: 'ACCEPTED',
    price: 268000,
    priceLabel: '₹2,680',
    leadTimeDays: 10,
    message: 'Silk velvet with a boned princess-line fit and a covered hook placket.',
    budgetLabel: '₹2,400–₹3,200',
    neededByLabel: 'Needed by 24 Nov',
    submittedLabel: 'Sent 03 Nov',
    canWithdraw: false,
  },
];

export const mockDesignerOpportunities: OpportunityView[] = [
  {
    id: 'match-2052',
    requestId: 'req-2052',
    requestCode: 'ZRQ-2052',
    title: 'Champagne Tissue Sari Set',
    category: 'Sari set',
    brief: 'Something quiet and gold for a morning wedding. Light enough to move in all day.',
    matchScore: 92,
    rank: 1,
    estimateLabel: '₹9,200–₹10,600',
    budgetLabel: '₹8,000–₹11,000',
    neededByLabel: 'Needed by 20 Dec',
    city: 'Bengaluru',
    existingBid: null,
  },
  {
    id: 'match-2049',
    requestId: 'req-2049',
    requestCode: 'ZRQ-2049',
    title: 'Powder Blue Sharara',
    category: 'Sharara set',
    brief: 'For a mehendi morning. Soft blue, wide leg, and no heavy embroidery.',
    matchScore: 88,
    rank: 2,
    estimateLabel: '₹6,300–₹7,200',
    budgetLabel: 'Up to ₹7,500',
    neededByLabel: 'Needed by 14 Dec',
    city: 'Hyderabad',
    existingBid: null,
  },
  {
    id: 'match-2044',
    requestId: 'req-2044',
    requestCode: 'ZRQ-2044',
    title: 'Handloom Cotton Co-ord',
    category: 'Co-ord set',
    brief: 'An everyday set in handloom cotton with deep pockets and a relaxed fit.',
    matchScore: 84,
    rank: 3,
    estimateLabel: '₹3,100–₹3,700',
    budgetLabel: null,
    neededByLabel: null,
    city: 'Bengaluru',
    existingBid: { id: 'bid-2044', status: 'SUBMITTED', priceLabel: '₹3,400' },
  },
];

export const mockDesignerCopilot: CopilotView = {
  headline: 'Three things are worth your attention today.',
  tasks: [
    {
      title: 'ZR-1021 needs a correction before it can ship',
      detail:
        'Quality control flagged the hem finishing. Reworking it today keeps the promised date intact.',
      action: 'Update milestone',
    },
    {
      title: 'Two customers are waiting on a reply',
      detail: 'Studios that answer within a day are chosen far more often.',
      action: 'Reply',
    },
    {
      title: 'ZRQ-2052 closes for quotes in two days',
      detail:
        'Champagne tissue is close to the work in your portfolio, and the budget covers your usual rate.',
      action: 'Send a quote',
    },
  ],
  source: 'rules',
};

export const mockDesignerEarnings: EarningsView = {
  paid: 98640000,
  pending: 1280000,
  inEscrow: 2560000,
  payouts: [
    {
      id: 'payout-0962',
      orderCode: 'ZR-0962',
      amount: 426000,
      amountLabel: '₹4,260',
      status: 'PAID',
      statusLabel: 'PAID',
      dateLabel: '03 Oct',
      failureReason: null,
    },
    {
      id: 'payout-0938',
      orderCode: 'ZR-0938',
      amount: 351000,
      amountLabel: '₹3,510',
      status: 'PAID',
      statusLabel: 'PAID',
      dateLabel: '21 Sep',
      failureReason: null,
    },
    {
      id: 'payout-1048',
      orderCode: 'ZR-1048',
      amount: 384000,
      amountLabel: '₹3,840',
      status: 'PENDING',
      statusLabel: 'QUEUED',
      dateLabel: '16 Nov',
      failureReason: null,
    },
    {
      id: 'payout-0921',
      orderCode: 'ZR-0921',
      amount: 268000,
      amountLabel: '₹2,680',
      status: 'FAILED',
      statusLabel: 'NEEDS ATTENTION',
      dateLabel: '12 Sep',
      failureReason: 'The bank details need re-verification before we can send this.',
    },
  ],
  note: 'Funds move to you once Zari’s quality check passes on each order.',
};

export const mockDesignerQuality: DesignerQualityView = {
  studioName: 'Aanya Studio',
  qualityScore: 94,
  scoreLabel: 'Excellent match',
  measuredLabel: 'Last measured 18 Nov',
  components: [
    { key: 'craftSkill', label: 'Craft skill', source: 'Customer reviews of finished work', weightPercent: 25, value: 96 },
    { key: 'pastSuccess', label: 'Past success', source: 'Orders that passed QC first time', weightPercent: 20, value: 92 },
    { key: 'onTimeDelivery', label: 'On-time delivery', source: 'Delivered by the promised date', weightPercent: 25, value: 96 },
    { key: 'communication', label: 'Communication', source: 'Customer ratings for responsiveness', weightPercent: 15, value: 95 },
    { key: 'customerRating', label: 'Customer rating', source: 'Overall review score', weightPercent: 15, value: 92 },
  ],
  matching: [
    { key: 'similarityMatch', label: 'Portfolio similarity', weightPercent: 30 },
    { key: 'craftMatch', label: 'Craft and fabric fit', weightPercent: 25 },
    { key: 'quality', label: 'Zari Quality Score', weightPercent: 25 },
    { key: 'capacityFit', label: 'Capacity right now', weightPercent: 12 },
    { key: 'locationFit', label: 'Same city as the customer', weightPercent: 8 },
  ],
  qualityNote: 'Placement is never paid for. Price is not part of the Quality Score.',
  matchingNote: 'Designers are ranked on fit and quality, not on the lowest price.',
  stats: {
    onTimePercent: 96,
    fitSuccessPercent: 94,
    completedOrders: 41,
    rating: '4.8',
    reviewsCount: 38,
  },
};

// ---------------------------------------------------------------------------
// Ops console demo set.
//
// Appended, never woven into the blocks above, so the customer-facing demo set
// stays exactly as it was. Same rule applies: realistic Indian studios, cities
// and prices, and every amount an integer number of paise.
// ---------------------------------------------------------------------------

import type {
  CostRuleView,
  DisputeView,
  OpsOverview,
  QcCheckView,
  VerificationView,
} from '@/services/ops';

export const mockOpsOverview: OpsOverview = {
  qcQueue: 3,
  pendingVerifications: 2,
  openDisputes: 1,
  activeOrders: 14,
  pendingPayouts: { count: 4, amount: 1_842_000 },
};

export const mockQcQueue: QcCheckView[] = [
  {
    id: 'qc-1048',
    orderId: 'order-1048',
    orderCode: 'ZR-1048',
    round: 1,
    status: 'IN_REVIEW',
    statusLabel: 'IN REVIEW',
    designTitle: 'Pastel Lavender Engagement Lehenga',
    studioName: 'Aanya Studio',
    city: 'Bengaluru',
    qualityScore: 94,
    // The 40% advance is captured; the balance is not due until QC passes, so
    // that advance less Zari's 10% is all a pass actually moves.
    finalPrice: 640_000,
    heldInEscrow: 256_000,
    platformFee: 64_000,
    payoutAmount: 192_000,
    promisedLabel: '28 Nov',
    waitingLabel: 'In the queue 2 days',
    waitingDays: 2,
    aiSimilarityScore: 93,
    overallNote: '',
    photos: [],
    items: [
      { criterion: 'DESIGN_SIMILARITY', passed: null, note: '' },
      { criterion: 'STITCHING', passed: null, note: '' },
      { criterion: 'MEASUREMENTS', passed: null, note: '' },
      { criterion: 'EMBROIDERY', passed: null, note: '' },
      { criterion: 'FINISHING', passed: null, note: '' },
    ],
    tone: 'lavender',
  },
  {
    id: 'qc-0962',
    orderId: 'order-0962',
    orderCode: 'ZR-0962',
    round: 2,
    status: 'NOT_STARTED',
    statusLabel: 'NOT STARTED',
    designTitle: 'Indigo Silk Sari Set',
    studioName: 'Mira Atelier',
    city: 'Mumbai',
    qualityScore: 91,
    finalPrice: 710_000,
    heldInEscrow: 284_000,
    platformFee: 71_000,
    payoutAmount: 213_000,
    promisedLabel: '04 Dec',
    waitingLabel: 'In the queue today',
    waitingDays: 0,
    aiSimilarityScore: null,
    overallNote: '',
    photos: [],
    items: [
      { criterion: 'DESIGN_SIMILARITY', passed: null, note: '' },
      { criterion: 'STITCHING', passed: null, note: '' },
      { criterion: 'MEASUREMENTS', passed: null, note: '' },
      { criterion: 'EMBROIDERY', passed: null, note: '' },
      { criterion: 'FINISHING', passed: null, note: '' },
    ],
    tone: 'sage',
  },
  {
    id: 'qc-0917',
    orderId: 'order-0917',
    orderCode: 'ZR-0917',
    round: 1,
    status: 'IN_REVIEW',
    statusLabel: 'IN REVIEW',
    designTitle: 'Marigold Organza Kurta',
    studioName: 'Rekha & Thread',
    city: 'Jaipur',
    qualityScore: 89,
    // Deliberately unfunded: the advance was never captured, so a pass on this
    // round has no money to release. The screen has to say so rather than
    // quoting a figure.
    finalPrice: 424_000,
    heldInEscrow: 0,
    platformFee: 42_400,
    payoutAmount: 0,
    promisedLabel: '30 Nov',
    waitingLabel: 'In the queue 4 days',
    waitingDays: 4,
    aiSimilarityScore: 78,
    overallNote: '',
    photos: [],
    items: [
      { criterion: 'DESIGN_SIMILARITY', passed: null, note: '' },
      { criterion: 'STITCHING', passed: null, note: '' },
      { criterion: 'MEASUREMENTS', passed: null, note: '' },
      { criterion: 'EMBROIDERY', passed: null, note: '' },
      { criterion: 'FINISHING', passed: null, note: '' },
    ],
    tone: 'peach',
  },
];

export const mockPendingVerifications: VerificationView[] = [
  {
    id: 'ver-kalindi',
    designerId: 'designer-kalindi',
    slug: 'kalindi-workroom',
    studioName: 'Kalindi Workroom',
    city: 'Kolkata',
    initials: 'KW',
    tone: 'lilac',
    status: 'PENDING',
    statusLabel: 'AWAITING REVIEW',
    reviewNotes: '',
    submittedLabel: 'Submitted 14 Nov',
    waitingDays: 3,
    documents: [
      { label: 'GST', url: null },
      { label: 'Studio address proof', url: null },
    ],
    portfolio: [
      { title: 'Jamdani evening set', coverUrl: null },
      { title: 'Quiet white blouse', coverUrl: null },
      { title: 'Bengal cotton kurta', coverUrl: null },
    ],
  },
  {
    id: 'ver-surkh',
    designerId: 'designer-surkh',
    slug: 'surkh-atelier',
    studioName: 'Surkh Atelier',
    city: 'Lucknow',
    initials: 'SA',
    tone: 'peach',
    status: 'IN_REVIEW',
    statusLabel: 'IN REVIEW',
    reviewNotes: 'Waiting on a clearer photograph of the workroom.',
    submittedLabel: 'Submitted 09 Nov',
    waitingDays: 8,
    documents: [{ label: 'GST', url: null }],
    portfolio: [
      { title: 'Chikankari anarkali', coverUrl: null },
      { title: 'Mukaish dupatta', coverUrl: null },
    ],
  },
];

export const mockOpsDisputes: DisputeView[] = [
  {
    id: 'dispute-0871',
    orderId: 'order-0871',
    orderCode: 'ZR-0871',
    status: 'IN_REVIEW',
    statusLabel: 'IN REVIEW',
    reason: 'Fit not as measured',
    description:
      'The customer reports the bodice is tight across the back despite the approved measurements. The studio believes the measurement snapshot was taken over a different blouse.',
    customerName: 'Anika Narang',
    studioName: 'Rekha & Thread',
    finalPrice: 528_000,
    openedLabel: 'Opened 5 days ago',
    ageDays: 5,
    severity: 'urgent',
    evidenceUrls: [],
    messages: [
      {
        id: 'dm-3',
        body: 'Happy to alter at no cost if the customer can send the garment back this week.',
        isInternal: false,
        whenLabel: '15 Nov',
      },
      {
        id: 'dm-2',
        body: 'Measurement snapshot matches the order. Alteration looks like the fair outcome.',
        isInternal: true,
        whenLabel: '14 Nov',
      },
    ],
  },
];

export const mockCostRules: CostRuleView[] = [
  {
    id: 'rule-chanderi',
    component: 'FABRIC',
    key: 'chanderi-silk',
    label: 'Chanderi silk',
    minRate: 62_000,
    maxRate: 78_000,
    unit: 'm',
    region: null,
    multiplier: 1,
    isActive: true,
    notes: 'Handloom, 44 inch width.',
    rangeLabel: '₹620–₹780 per m',
    scopeLabel: 'Applies everywhere',
  },
  {
    id: 'rule-cambric',
    component: 'LINING',
    key: 'cotton-cambric',
    label: 'Cotton cambric lining',
    minRate: 11_000,
    maxRate: 16_000,
    unit: 'm',
    region: null,
    multiplier: 1,
    isActive: true,
    notes: '',
    rangeLabel: '₹110–₹160 per m',
    scopeLabel: 'Applies everywhere',
  },
  {
    id: 'rule-resham',
    component: 'EMBROIDERY',
    key: 'resham-medium',
    label: 'Resham embroidery — medium density',
    minRate: 180_000,
    maxRate: 240_000,
    unit: 'panel',
    region: null,
    multiplier: 1,
    isActive: true,
    notes: 'Machine-assisted base, hand-finished motifs.',
    rangeLabel: '₹1,800–₹2,400 per panel',
    scopeLabel: 'Applies everywhere',
  },
  {
    id: 'rule-lehenga-stitch',
    component: 'STITCHING',
    key: 'stitching-lehenga',
    label: 'Lehenga construction',
    minRate: 160_000,
    maxRate: 220_000,
    unit: 'piece',
    region: null,
    multiplier: 1,
    isActive: true,
    notes: '',
    rangeLabel: '₹1,600–₹2,200 per piece',
    scopeLabel: 'Applies everywhere',
  },
  {
    id: 'rule-gota',
    component: 'TRIMS',
    key: 'gota-border',
    label: 'Gota patti border',
    minRate: 24_000,
    maxRate: 39_000,
    unit: 'm',
    region: 'Jaipur',
    multiplier: 1.1,
    isActive: true,
    notes: 'Jaipur workshops price this above the national range.',
    rangeLabel: '₹240–₹390 per m',
    scopeLabel: 'Jaipur only',
  },
  {
    id: 'rule-zari-old',
    component: 'TRIMS',
    key: 'gold-zari-border',
    label: 'Gold zari border',
    minRate: 88_000,
    maxRate: 130_000,
    unit: 'm',
    region: null,
    multiplier: 1,
    isActive: false,
    notes: 'Retired while the metal price settles.',
    rangeLabel: '₹880–₹1,300 per m',
    scopeLabel: 'Applies everywhere',
  },
];

/**
 * Budget optimizer runs.
 *
 * The newest run is a reachable target so the panel has something to show; the
 * older one is deliberately INFEASIBLE, because that state is a first-class
 * outcome of this feature and not an error — a demo that never shows it is
 * hiding the most honest thing the optimizer does.
 *
 * Every figure is paise. ₹7,400–₹8,400 is the lavender lehenga's estimate.
 */
export const mockBudgetRuns: import('@/services/budget').BudgetRun[] = [
  {
    id: 'run-lavender-5000',
    targetAmount: 500_000,
    currentMin: 740_000,
    currentMax: 840_000,
    status: 'READY',
    infeasibleReason: null,
    alternatives: [],
    plans: [
      {
        id: 'plan-balance',
        label: 'Best balance',
        similarityPercent: 94,
        resultingMin: 410_000,
        resultingMax: 510_000,
        savings: 330_000,
        rationale: 'Keeps the silhouette and the embroidery layout, and moves the money out of the base cloth and the metal thread.',
        substitutions: [
          { id: 'sub-balance-fabric', component: 'FABRIC', fromValue: 'Chanderi silk', toValue: 'Silk-blend satin', costDelta: -120_000, visualImpact: 'Slightly less texture in daylight; the drape is very close.', similarityDelta: 3, isSelected: true, isOptional: true },
          { id: 'sub-balance-zari', component: 'TRIMS', fromValue: 'Gold zari border', toValue: 'Tonal resham border', costDelta: -90_000, visualImpact: 'Reads quieter up close, near-identical from across a room.', similarityDelta: 2, isSelected: true, isOptional: true },
          { id: 'sub-balance-embroidery', component: 'EMBROIDERY', fromValue: 'Dense resham embroidery', toValue: 'Medium density', costDelta: -120_000, visualImpact: 'Open space between the motifs; the layout is unchanged.', similarityDelta: 1, isSelected: true, isOptional: true },
        ],
      },
      {
        id: 'plan-craft',
        label: 'Keep the craft',
        similarityPercent: 97,
        resultingMin: 515_000,
        resultingMax: 615_000,
        savings: 225_000,
        rationale: 'Protects the chanderi and the hand embroidery, and takes the saving from the parts nobody sees.',
        substitutions: [
          { id: 'sub-craft-lining', component: 'LINING', fromValue: 'Cotton cambric lining', toValue: 'Cotton mull lining', costDelta: -35_000, visualImpact: 'The inner layer sits a little lighter; nothing changes from outside.', similarityDelta: 1, isSelected: true, isOptional: true },
          { id: 'sub-craft-pearls', component: 'TRIMS', fromValue: 'Pearl-work dupatta border', toValue: 'Resham scallop border', costDelta: -105_000, visualImpact: 'The border loses its catch of light; the scallop shape stays.', similarityDelta: 1, isSelected: true, isOptional: true },
          { id: 'sub-craft-hem', component: 'FINISHING', fromValue: 'Fully hand-finished hem', toValue: 'Machine hem with hand tacking', costDelta: -85_000, visualImpact: 'Visible only at the hem edge, and only from close up.', similarityDelta: 1, isSelected: true, isOptional: true },
        ],
      },
      {
        id: 'plan-reach',
        label: 'Reach the target',
        similarityPercent: 88,
        resultingMin: 400_000,
        resultingMax: 500_000,
        savings: 340_000,
        rationale: 'The most direct route to ₹5,000. The base cloth has to change for this one to work.',
        substitutions: [
          { id: 'sub-reach-fabric', component: 'FABRIC', fromValue: 'Chanderi silk', toValue: 'Chanderi-look poly blend', costDelta: -160_000, visualImpact: 'Less depth in the weave; it photographs close but feels different in hand.', similarityDelta: 6, isSelected: true, isOptional: false },
          { id: 'sub-reach-embroidery', component: 'EMBROIDERY', fromValue: 'Dense resham embroidery', toValue: 'Light placement embroidery', costDelta: -140_000, visualImpact: 'Motifs sit on the panels and the border only; the mid-skirt is plain.', similarityDelta: 5, isSelected: true, isOptional: true },
          { id: 'sub-reach-zari', component: 'TRIMS', fromValue: 'Gold zari border', toValue: 'Tonal resham border', costDelta: -40_000, visualImpact: 'Reads quieter up close, near-identical from across a room.', similarityDelta: 1, isSelected: true, isOptional: true },
        ],
      },
    ],
  },
  {
    id: 'run-lavender-3000',
    targetAmount: 300_000,
    currentMin: 740_000,
    currentMax: 840_000,
    status: 'INFEASIBLE',
    infeasibleReason: 'The chanderi alone is ₹3,150 for the 4.5 metres this silhouette needs, before any lining, stitching or finishing. Below roughly ₹4,600 the lehenga has to change construction, not just materials.',
    alternatives: [
      'Set the target at ₹4,600 and keep this construction — every substitution stays optional.',
      'Move the base to a lighter georgette. The fall changes, and it reaches about ₹3,400.',
      'Keep the lehenga as designed and order the dupatta separately later.',
    ],
    plans: [],
  },
];
