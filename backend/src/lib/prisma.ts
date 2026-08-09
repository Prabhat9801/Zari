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
    /**
     * Prisma's defaults are maxWait 2s and timeout 5s, which assume a database
     * on the same continent and a pool with room in it. Here the API runs in
     * Singapore against Supabase in Seoul through a pooler, so a transaction
     * doing a dozen round trips spends seconds on latency alone — and with
     * connection_limit=1 a second concurrent request waits for the pool itself.
     * Both showed up in production as P2028.
     *
     * These are floors for every transaction; individual call sites still pass
     * their own where they need more.
     */
    transactionOptions: {
      maxWait: 10_000,
      timeout: 20_000,
    },
  });

if (isDev) globalForPrisma.prisma = prisma;

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
