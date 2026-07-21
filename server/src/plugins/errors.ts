import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../errors.js';

/** Zentraler Error-Handler: übersetzt alles in das einheitliche ApiError-Format. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      if (err.status >= 500) req.log.error({ err }, 'AppError');
      return reply.status(err.status).send({
        error: { code: err.code, message: err.message, details: err.details },
      });
    }

    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'validation_error',
          message: 'Eingabevalidierung fehlgeschlagen',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
    }

    // Fastify-eigene Validierungs-/Rate-Limit-Fehler
    const fe = err as { statusCode?: number; code?: string; message?: string };
    if (typeof fe.statusCode === 'number' && fe.statusCode < 500) {
      return reply.status(fe.statusCode).send({
        error: { code: fe.code ?? 'error', message: fe.message ?? 'Fehler' },
      });
    }

    req.log.error({ err }, 'Unbehandelter Fehler');
    return reply.status(500).send({
      error: { code: 'internal_error', message: 'Interner Serverfehler' },
    });
  });
  // Der NotFound-Handler wird zentral in buildApp() gesetzt (SPA-Fallback vs. JSON-404).
}
