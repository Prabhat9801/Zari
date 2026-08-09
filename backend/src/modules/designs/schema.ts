import { z } from 'zod';

/**
 * The garment spec contract. This is the shape the AI service must return and
 * the shape the frontend's attribute panel renders. Anything the model sends
 * that isn't in here is dropped — the schema is the boundary, not a suggestion.
 */
export const designSpecSchema = z.object({
  category: z.string().min(1).max(60), // "Lehenga", "Sari set", "Anarkali"
  silhouette: z.string().min(1).max(60), // "Flared A-line"
  fabric: z.string().min(1).max(80), // "Chanderi silk"
  lining: z.string().max(80).nullish(),
  neckline: z.string().max(60).nullish(),
  sleeves: z.string().max(60).nullish(),
  embroidery: z.string().max(80).nullish(),
  motifs: z.array(z.string().max(40)).max(12).default([]),
  motifDensity: z.enum(['NONE', 'LIGHT', 'MEDIUM', 'DENSE']).nullish(),
  palette: z.array(z.string().max(40)).max(8).default([]),
  occasion: z.string().max(60).nullish(),
  closures: z.string().max(60).nullish(),
  hemline: z.string().max(60).nullish(),
  notes: z.string().max(1000).nullish(),
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
