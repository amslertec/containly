import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { logger } from './logger.js';
import { registerErrorHandler } from './plugins/errors.js';
import { registerAuth } from './plugins/auth.js';
import { setupRoutes } from './routes/setup.js';
import { authRoutes } from './routes/auth.js';
import { endpointRoutes } from './routes/endpoints.js';
import { containerRoutes } from './routes/containers.js';
import { resourceRoutes } from './routes/resources.js';
import { updateRoutes } from './routes/updates.js';
import { stackRoutes } from './routes/stacks.js';
import { userRoutes } from './routes/users.js';
import { systemRoutes } from './routes/system.js';
import { backupRoutes } from './routes/backup.js';
import { registryRoutes } from './routes/registries.js';
import { versionRoutes } from './routes/version.js';
import { registerLogsWs } from './ws/logs.js';
import { registerStatsWs } from './ws/stats.js';
import { registerExecWs } from './ws/exec.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // Cast hält den FastifyInstance-Generic auf dem Default-Logger-Typ,
    // damit die Route-Registrar-Funktionen (FastifyInstance) kompatibel bleiben.
    loggerInstance: logger as FastifyBaseLogger,
    trustProxy: config.trustProxy,
    bodyLimit: 5 * 1024 * 1024, // 5 MB (Compose-Dateien)
  });

  // Sicherheits-Header. CSP passend zur SPA (self + inline-styles für Radix/xterm).
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // 'self' + Hash des Inline-Theme-Scripts in index.html (kein Theme-Flash, CSP-konform).
        scriptSrc: ["'self'", "'sha256-U/oJPd92kEwAhleUai0DpJ88ftPXjC6NPoYJ6fBySGY='"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // NUR hinter TLS: HTTP-Subrequests auf HTTPS hochstufen. Über reines HTTP
        // (z. B. http://<LAN-IP>:8420) würde das Assets/API auf nicht existentes HTTPS
        // umbiegen → leere Seite. Daher ohne TLS entfernen (null).
        upgradeInsecureRequests: config.secureCookies ? [] : null,
      },
    },
    // HSTS nur sinnvoll hinter TLS; Traefik terminiert TLS.
    hsts: config.secureCookies ? { maxAge: 31536000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false,
    // COOP/Origin-Agent-Cluster brauchen HTTPS — über reines HTTP nur Konsolen-Warnungen.
    crossOriginOpenerPolicy: config.secureCookies ? { policy: 'same-origin' } : false,
    originAgentCluster: config.secureCookies,
  });

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    hook: 'preHandler',
    // WebSocket-Upgrades und statische Assets sollen das Limit nicht triggern.
    allowList: () => false,
  });

  await app.register(websocket, {
    options: { maxPayload: 1 * 1024 * 1024 },
  });

  registerErrorHandler(app);
  await registerAuth(app);

  // API-Routen
  await app.register(setupRoutes);
  await app.register(authRoutes);
  await app.register(endpointRoutes);
  await app.register(containerRoutes);
  await app.register(resourceRoutes);
  await app.register(updateRoutes);
  await app.register(stackRoutes);
  await app.register(userRoutes);
  await app.register(systemRoutes);
  await app.register(backupRoutes);
  await app.register(registryRoutes);
  await app.register(versionRoutes);

  // WebSocket-Routen
  await registerLogsWs(app);
  await registerStatsWs(app);
  await registerExecWs(app);

  app.get('/healthz', async () => ({ ok: true }));

  // Statisches Frontend im Produktions-Container. SPA-Fallback auf index.html.
  const serveWeb = existsSync(config.webRoot) && existsSync(join(config.webRoot, 'index.html'));
  if (serveWeb) {
    await app.register(fastifyStatic, {
      root: config.webRoot,
      wildcard: false,
      // Gehashte Assets sind unveränderlich → lange cachen. index.html NIE cachen,
      // sonst zeigt ein alter HTML-Stand nach einem Rebuild auf gelöschte Dateien (leere Seite).
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.header('Cache-Control', 'no-cache, must-revalidate');
        } else if (path.includes(`${sep}assets${sep}`)) {
          res.header('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    });
    logger.info({ webRoot: config.webRoot }, 'Frontend wird ausgeliefert');
  }

  // Zentraler NotFound-Handler.
  app.setNotFoundHandler((req, reply) => {
    const path = (req.url.split('?')[0] ?? '').split('/').pop() ?? '';
    // Datei-artige Pfade (mit Endung, z. B. veraltete /assets/*.js|css) NIE als index.html
    // ausliefern — sonst MIME-Fehler "text/html". Stattdessen echtes 404.
    const looksLikeFile = path.includes('.');
    if (!serveWeb || req.url.startsWith('/api') || req.url.startsWith('/healthz') || looksLikeFile) {
      return reply.status(404).send({
        error: { code: 'not_found', message: `Nicht gefunden: ${req.method} ${req.url}` },
      });
    }
    // Echte Navigations-Route → SPA-Fallback (index.html, nie cachen).
    return reply.header('Cache-Control', 'no-cache, must-revalidate').sendFile('index.html');
  });

  return app;
}
