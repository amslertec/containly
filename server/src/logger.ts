import { pino } from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,
  transport: config.isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'password', 'newPassword', '*.key'],
    censor: '[redacted]',
  },
});
