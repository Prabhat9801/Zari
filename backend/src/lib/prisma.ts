import { PrismaClient } from '@prisma/client';
import { env, isDev } from '../config/env.js';

/**
 * A single PrismaClient for the process. In dev, `tsx watch` reloads the module
 * on every save, so we stash the client on globalThis to avoid exhausting the
 * Supabase connection pool with a new client per reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.LOG_LEVEL === 'debug' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (isDev) globalForPrisma.prisma = prisma;

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
