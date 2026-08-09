import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { corsOrigins, isProd } from './config/env.js';
import { logger } from './lib/logger.js';
import { attachIdentity } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { generalLimiter } from './middleware/rateLimit.js';
import paymentRoutes from './modules/payments/routes.js';
import router from './routes.js';

export function createApp(): Express {
  const app = express();

  // Render terminates TLS at its proxy, so req.ip must come from the header.
  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req: IncomingMessage) => req.url === '/api/health',
      },
      serializers: {
        req: (req: IncomingMessage & { id?: unknown }) => ({
          id: req.id,
          method: req.method,
          url: req.url?.split('?')[0],
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Guest-Token'],
    }),
  );

  /**
   * The payment webhook must be registered BEFORE express.json(): its HMAC is
   * computed over the exact request bytes, and a parsed-then-reserialised body
   * would never verify.
   */
  app.use('/api/payments', paymentRoutes);

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.use(attachIdentity);
  app.use(generalLimiter);

  app.use('/api', router);

  app.get('/', (_req, res) =>
    res.json({
      service: 'Zari API',
      tagline: 'From Inspiration to Stitching.',
      docs: '/api/health',
      environment: isProd ? 'production' : 'development',
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
