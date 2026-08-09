import pino from 'pino';
import { env, isProd } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: isProd ? undefined : { target: 'pino/file', options: { destination: 1 } },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.code',
      '*.passwordHash',
      '*.codeHash',
      '*.tokenHash',
      '*.accessToken',
      '*.refreshToken',
      '*.secret_value',
    ],
    censor: '[redacted]',
  },
});
