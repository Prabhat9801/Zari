/**
 * Seeds the reference data the system needs to function, plus a small set of
 * realistic demo records so the frontend has something to render.
 *
 * Idempotent — safe to run repeatedly. Run with: npm run seed
 */
import { PrismaClient, type CostComponent } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const R = (rupees: number): number => Math.round(rupees * 100); // rupees -> paise

/**
 * COST RULES — the pricing knowledge base the AI service is grounded in.
 * These are ops-editable at /ops/cost-rules. Rates are per unit, in paise.
 */
const costRules: {
  component: CostComponent;
  key: string;
  label: string;
  minRate: number;
  maxRate: number;
  unit: string;
}[] = [
  // Fabrics — per metre
  { component: 'FABRIC', key: 'chanderi-silk', label: 'Chanderi silk', minRate: R(650), maxRate: R(1100), unit: 'm' },
  { component: 'FABRIC', key: 'raw-silk', label: 'Raw silk', minRate: R(550), maxRate: R(950), unit: 'm' },
  { component: 'FABRIC', key: 'silk-blend-satin', label: 'Silk-blend satin', minRate: R(280), maxRate: R(480), unit: 'm' },
  { component: 'FABRIC', key: 'georgette', label: 'Georgette', minRate: R(220), maxRate: R(420), unit: 'm' },
  { component: 'FABRIC', key: 'organza', label: 'Organza', minRate: R(300), maxRate: R(560), unit: 'm' },
  { component: 'FABRIC', key: 'cotton-mul', label: 'Cotton mul', minRate: R(150), maxRate: R(280), unit: 'm' },
  { component: 'FABRIC', key: 'velvet', label: 'Velvet', minRate: R(700), maxRate: R(1400), unit: 'm' },

  // Lining — per metre
  { component: 'LINING', key: 'cotton-cambric', label: 'Cotton cambric lining', minRate: R(90), maxRate: R(160), unit: 'm' },
  { component: 'LINING', key: 'satin-lining', label: 'Satin lining', minRate: R(140), maxRate: R(260), unit: 'm' },

  // Embroidery — per square foot of worked area
  { component: 'EMBROIDERY', key: 'resham-light', label: 'Resham thread — light', minRate: R(350), maxRate: R(600), unit: 'sqft' },
  { component: 'EMBROIDERY', key: 'resham-medium', label: 'Resham thread — medium', minRate: R(600), maxRate: R(1100), unit: 'sqft' },
  { component: 'EMBROIDERY', key: 'sequin-medium', label: 'Sequin work — medium', minRate: R(800), maxRate: R(1500), unit: 'sqft' },
  { component: 'EMBROIDERY', key: 'zardozi-dense', label: 'Zardozi — dense', minRate: R(1800), maxRate: R(3600), unit: 'sqft' },
  { component: 'EMBROIDERY', key: 'gota-patti', label: 'Gota patti', minRate: R(700), maxRate: R(1400), unit: 'sqft' },
  { component: 'EMBROIDERY', key: 'mirrorwork', label: 'Mirror work', minRate: R(650), maxRate: R(1200), unit: 'sqft' },

  // Stitching — per garment
  { component: 'STITCHING', key: 'lehenga', label: 'Lehenga construction', minRate: R(2200), maxRate: R(4500), unit: 'pcs' },
  { component: 'STITCHING', key: 'blouse', label: 'Blouse construction', minRate: R(900), maxRate: R(1800), unit: 'pcs' },
  { component: 'STITCHING', key: 'anarkali', label: 'Anarkali construction', minRate: R(1800), maxRate: R(3400), unit: 'pcs' },
  { component: 'STITCHING', key: 'sari-set', label: 'Sari set construction', minRate: R(1500), maxRate: R(3000), unit: 'pcs' },
  { component: 'STITCHING', key: 'kurta', label: 'Kurta construction', minRate: R(700), maxRate: R(1500), unit: 'pcs' },

  // Trims & finishing — per garment
  { component: 'TRIMS', key: 'standard-trims', label: 'Hooks, piping, tassels', minRate: R(180), maxRate: R(450), unit: 'pcs' },
  { component: 'TRIMS', key: 'premium-trims', label: 'Premium trims and latkans', minRate: R(400), maxRate: R(900), unit: 'pcs' },
  { component: 'FINISHING', key: 'standard-finishing', label: 'Pressing, packing, hand-finish', minRate: R(350), maxRate: R(700), unit: 'pcs' },
  { component: 'FINISHING', key: 'made-to-measure', label: 'Made-to-measure fitting allowance', minRate: R(500), maxRate: R(1200), unit: 'pcs' },
];

async function seedCostRules(): Promise<void> {
  for (const rule of costRules) {
    // Prisma cannot target a compound unique containing a NULL column, and
    // region is null for rules that apply everywhere — so find, then write.
    const existing = await prisma.costRule.findFirst({
      where: { component: rule.component, key: rule.key, region: null },
      select: { id: true },
    });

    if (existing) {
      await prisma.costRule.update({
        where: { id: existing.id },
        data: { label: rule.label, minRate: rule.minRate, maxRate: rule.maxRate, unit: rule.unit },
      });
    } else {
      await prisma.costRule.create({
        data: { ...rule, region: null, multiplier: 1, isActive: true },
      });
    }
  }
  console.log(`Seeded ${costRules.length} cost rules`);
}

/** Demo designers so the marketplace is not empty on a fresh environment. */
const demoDesigners = [
  {
    email: 'aanya@zari.demo',
    name: 'Aanya Mehta',
    studioName: 'Aanya Studio',
    city: 'Bengaluru',
    state: 'Karnataka',
    bio: 'A small occasionwear studio making soft, considered silhouettes with a sharp eye for fit. Every piece is cut in our Bengaluru atelier and finished by hand.',
    specialties: ['Lehenga', 'Occasionwear', 'Resham embroidery', 'Made-to-measure fit'],
    crafts: ['resham', 'pearl-work'],
    fabricSkills: ['Chanderi silk', 'Raw silk', 'Organza'],
    leadTimeMinDays: 12,
    leadTimeMaxDays: 16,
    capacityPercent: 82,
  },
  {
    email: 'mira@zari.demo',
    name: 'Mira Raghavan',
    studioName: 'Mira Atelier',
    city: 'Mumbai',
    state: 'Maharashtra',
    bio: 'Mira Atelier works with fluid silks, hand-dyed colour, and clean construction for celebrations that call for ease rather than excess.',
    specialties: ['Sari sets', 'Silk drape', 'Hand-dyed colour', 'Minimal embellishment'],
    crafts: ['hand-dye', 'shibori'],
    fabricSkills: ['Georgette', 'Silk-blend satin', 'Raw silk'],
    leadTimeMinDays: 15,
    leadTimeMaxDays: 18,
    capacityPercent: 68,
  },
  {
    email: 'rekha@zari.demo',
    name: 'Rekha Solanki',
    studioName: 'Rekha & Thread',
    city: 'Jaipur',
    state: 'Rajasthan',
    bio: 'Rekha & Thread brings Jaipur craft traditions into modern, wearable occasion pieces, with a special love for thoughtful surface work.',
    specialties: ['Gota patti', 'Lehenga', 'Festive tailoring', 'Textile craft'],
    crafts: ['gota-patti', 'mirrorwork', 'zardozi'],
    fabricSkills: ['Velvet', 'Chanderi silk', 'Cotton mul'],
    leadTimeMinDays: 18,
    leadTimeMaxDays: 21,
    capacityPercent: 74,
  },
];

async function seedDesigners(): Promise<void> {
  const passwordHash = await argon2.hash('zari-demo-2026');

  for (const d of demoDesigners) {
    const user = await prisma.user.upsert({
      where: { email: d.email },
      create: { email: d.email, name: d.name, role: 'DESIGNER', passwordHash },
      update: {},
    });

    const slug = d.studioName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    await prisma.designerProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        studioName: d.studioName,
        slug,
        city: d.city,
        state: d.state,
        bio: d.bio,
        specialties: d.specialties,
        crafts: d.crafts,
        fabricSkills: d.fabricSkills,
        leadTimeMinDays: d.leadTimeMinDays,
        leadTimeMaxDays: d.leadTimeMaxDays,
        capacityPercent: d.capacityPercent,
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        isPublished: true,
        // Seeded scores stand in until real orders recompute them.
        qualityScore: 88,
        ratingAvg: 4.7,
        reviewsCount: 0,
        onTimeRate: 0.95,
      },
      update: {},
    });
  }
  console.log(`Seeded ${demoDesigners.length} demo designers (password: zari-demo-2026)`);
}

async function seedOpsUser(): Promise<void> {
  const email = 'ops@zari.demo';
  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: 'Zari Quality Team',
      role: 'OPS',
      passwordHash: await argon2.hash('zari-demo-2026'),
    },
    update: {},
  });
  console.log('Seeded ops account: ops@zari.demo / zari-demo-2026');
}

async function main(): Promise<void> {
  await seedCostRules();
  await seedDesigners();
  await seedOpsUser();
  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
