import { z } from 'zod';

/**
 * Single source of truth for configuration. The process refuses to boot if a
 * required variable is missing — a container that starts with a broken config
 * and fails on the first request is worse than one that never starts.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // --- Database (Supabase Postgres) -------------------------------------
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),

  // --- Auth --------------------------------------------------------------
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // --- CORS --------------------------------------------------------------
  // Comma-separated list of allowed origins, or "*" for local development.
  CORS_ORIGINS: z.string().default('*'),

  // --- AI service (the separate Python deployment) -----------------------
  AI_SERVICE_URL: z.string().url(),
  AI_SERVICE_TOKEN: z.string().min(16),
  AI_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),

  // --- Supabase Storage (images) -----------------------------------------
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('zari-media'),

  // --- Payments (Razorpay) ------------------------------------------------
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // --- OTP / SMS ----------------------------------------------------------
  OTP_PROVIDER: z.enum(['console', 'msg91', 'twilio']).default('console'),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  // --- Business rules -----------------------------------------------------
  ADVANCE_PERCENT: z.coerce.number().int().min(0).max(100).default(40),
  PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(50).default(10),
  FIT_WINDOW_DAYS: z.coerce.number().int().positive().default(7),
  GUEST_FREE_GENERATIONS: z.coerce.number().int().nonnegative().default(1),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';

export const corsOrigins =
  env.CORS_ORIGINS === '*'
    ? true
    : env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);

export const paymentsEnabled = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
export const storageEnabled = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
