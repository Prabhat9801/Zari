import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { disconnectPrisma, prisma } from './lib/prisma.js';

const app = createApp();

const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV },
    'Zari API listening — from inspiration to stitching',
  );
});

// Render sends SIGTERM on deploy. Drain in-flight requests before exiting so a
// customer mid-checkout does not see a dropped connection.
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down');
  server.close(async () => {
    await disconnectPrisma();
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 15_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

// Fail fast if the database is unreachable at boot.
prisma
  .$queryRaw`SELECT 1`
  .then(() => logger.info('Database connection established'))
  .catch((err: unknown) => {
    logger.error({ err }, 'Cannot reach the database');
    process.exit(1);
  });
