import { z } from 'zod';

/**
 * The garment spec contract — the shape the AI service returns and the frontend's
 * attribute panel renders.
 *
 * This parses MODEL OUTPUT, not user input, so it coerces rather than rejects.
 * A model that answers "Medium" instead of "MEDIUM", or writes a fabric name
 * two characters over the limit, has still done its job; throwing there would
 * turn a good generation into a 500 and lose the customer's work. Anything
 * genuinely unusable becomes null and the UI shows it as unconfirmed.
 */

/** Trim, drop empties, and truncate instead of failing on an over-long value. */
const text = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      return trimmed ? trimmed.slice(0, max) : null;
    },
    z.string().nullable(),
  );

/** Same, but falls back to a placeholder so required columns are never empty. */
const requiredText = (max: number, fallback: string) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : fallback;
  }, z.string());

const stringList = (maxItems: number, maxLength: number) =>
  z.preprocess((value) => {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim().slice(0, maxLength))
      .slice(0, maxItems);
  }, z.array(z.string()));

const DENSITIES = ['NONE', 'LIGHT', 'MEDIUM', 'DENSE'] as const;

/** Accepts any casing, and common synonyms the model reaches for. */
const motifDensity = z.preprocess((value) => {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  if ((DENSITIES as readonly string[]).includes(upper)) return upper;
  if (['MODERATE', 'MID', 'BALANCED'].includes(upper)) return 'MEDIUM';
  if (['HEAVY', 'RICH', 'ORNATE', 'HIGH'].includes(upper)) return 'DENSE';
  if (['MINIMAL', 'SUBTLE', 'SPARSE', 'LOW'].includes(upper)) return 'LIGHT';
  if (['NONE', 'PLAIN', 'UNEMBELLISHED'].includes(upper)) return 'NONE';
  return null;
}, z.enum(DENSITIES).nullable());

export const designSpecSchema = z.object({
  category: requiredText(60, 'Occasionwear'), // "Lehenga", "Sari set", "Anarkali"
  silhouette: requiredText(60, 'Not specified'), // "Flared A-line"
  fabric: requiredText(80, 'To be confirmed'), // "Chanderi silk"
  lining: text(80),
  neckline: text(60),
  sleeves: text(60),
  embroidery: text(80),
  motifs: stringList(12, 40),
  motifDensity,
  palette: stringList(8, 40),
  occasion: text(60),
  closures: text(60),
  hemline: text(60),
  notes: text(2000),
});

export type DesignSpecInput = z.infer<typeof designSpecSchema>;

export const confidenceMapSchema = z.record(z.enum(['LOW', 'MEDIUM', 'HIGH']));

export const generateDesignSchema = z.object({
  brief: z
    .string()
    .trim()
    .min(4, 'Tell us one detail to begin — a colour, an occasion, or a silhouette.')
    .max(2000),
  inspirationUrls: z.array(z.string().url()).max(6).default([]),
  targetBudget: z.number().int().positive().nullish(), // paise
  conceptCount: z.number().int().min(1).max(4).default(4),
});

export const editDesignSchema = z.object({
  instruction: z
    .string()
    .trim()
    .min(2, 'Tell Zari what to change.')
    .max(1000),
  /** Edit from a specific version to create a branch instead of a linear edit. */
  fromVersionId: z.string().cuid().optional(),
});

export const manualUpdateSchema = z.object({
  spec: designSpecSchema.partial(),
  fromVersionId: z.string().cuid().optional(),
  note: z.string().max(300).optional(),
});

export const listDesignsSchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['DRAFT', 'ACTIVE', 'QUOTED', 'ORDERED', 'ARCHIVED']).optional(),
  q: z.string().trim().max(120).optional(),
});

export const updateDesignSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  targetBudget: z.number().int().positive().nullish(),
});

export const compareVersionsSchema = z.object({
  a: z.string().cuid(),
  b: z.string().cuid(),
});

export const confirmAttributeSchema = z.object({
  attribute: z.string().min(1).max(40),
  value: z.string().min(1).max(120),
});

export type GenerateDesignInput = z.infer<typeof generateDesignSchema>;
export type EditDesignInput = z.infer<typeof editDesignSchema>;
export type ListDesignsQuery = z.infer<typeof listDesignsSchema>;
