import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Isolierte Datenverzeichnisse VOR jedem Import, der config/db lädt.
const dataDir = mkdtempSync(join(tmpdir(), 'containly-test-'));
process.env.CONTAINLY_DATA_DIR = dataDir;
process.env.CONTAINLY_STACKS_DIR = join(dataDir, 'stacks');
process.env.CONTAINLY_SECURE_COOKIES = 'false';
process.env.DOCKER_SOCKET = '/nonexistent/docker.sock';
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'test';

const STRONG = 'Sup3rSecret!Pass';

let app: FastifyInstance;
let setupToken: string;

function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const arr = Array.isArray(raw) ? raw : [raw];
  const found = arr.find((c) => typeof c === 'string' && c.startsWith('containly_session='));
  return typeof found === 'string' ? found.split(';')[0]! : '';
}

beforeAll(async () => {
  const { buildApp } = await import('../src/app.js');
  const { ensureLocalEndpoint } = await import('../src/docker/endpoints.js');
  const { ensureSetupToken } = await import('../src/services/setup-token.js');
  ensureLocalEndpoint();
  ensureSetupToken();
  setupToken = readFileSync(join(dataDir, 'setup.token'), 'utf8').trim();
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Setup-Flow', () => {
  it('meldet setupComplete=false vor dem ersten Admin', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/setup/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ setupComplete: false });
  });

  it('lehnt schwaches Passwort mit 400 ab (Validierung)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { username: 'admin', password: 'weak', setupToken },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_error');
  });

  it('lehnt falschen Setup-Token mit 403 ab', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { username: 'admin', password: STRONG, setupToken: 'falsch' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('legt den ersten Admin an und setzt ein Session-Cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { username: 'admin', password: STRONG, setupToken },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user.role).toBe('admin');
    expect(res.json().csrfToken).toBeTruthy();
    expect(cookieFrom(res)).toContain('containly_session=');
  });

  it('verweigert erneutes Setup mit 409 (einmalig)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { username: 'x', password: STRONG, setupToken },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('Authentifizierung & Autorisierung', () => {
  it('verweigert geschützte Routen ohne Session (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/containers?endpoint=local' });
    expect(res.statusCode).toBe(401);
  });

  it('lehnt falsches Passwort mit 401 ab', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'falschesPasswort' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('CSRF: Mutation mit gültiger Session, aber ohne Token → 403', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: STRONG },
    });
    const cookie = cookieFrom(login);
    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/abc/stop?endpoint=local',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('csrf');
  });

  it('Viewer darf keine Mutation auslösen (serverseitig, 403)', async () => {
    // Admin legt einen Viewer an
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: STRONG },
    });
    const adminCookie = cookieFrom(adminLogin);
    const adminCsrf = adminLogin.json().csrfToken as string;

    const created = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { username: 'leser', password: STRONG, role: 'viewer' },
    });
    expect(created.statusCode).toBe(200);

    // Viewer meldet sich an und versucht eine Mutation
    const viewerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'leser', password: STRONG },
    });
    const viewerCookie = cookieFrom(viewerLogin);
    const viewerCsrf = viewerLogin.json().csrfToken as string;

    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/abc/stop?endpoint=local',
      headers: { cookie: viewerCookie, 'x-csrf-token': viewerCsrf },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('forbidden');
  });

  it('Viewer darf keine Benutzer anlegen (Admin-Route, 403)', async () => {
    const viewerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'leser', password: STRONG },
    });
    const cookie = cookieFrom(viewerLogin);
    const csrf = viewerLogin.json().csrfToken as string;
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie, 'x-csrf-token': csrf },
      payload: { username: 'neu', password: STRONG, role: 'admin' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('Eingabevalidierung', () => {
  it('lehnt ungültige Container-Aktion mit 400 ab', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: STRONG },
    });
    const cookie = cookieFrom(login);
    const csrf = login.json().csrfToken as string;
    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/abc/zerstoere?endpoint=local',
      headers: { cookie, 'x-csrf-token': csrf },
    });
    expect(res.statusCode).toBe(400);
  });

  it('lehnt neuen Benutzer mit schwachem Passwort ab (400)', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: STRONG },
    });
    const cookie = cookieFrom(login);
    const csrf = login.json().csrfToken as string;
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie, 'x-csrf-token': csrf },
      payload: { username: 'schwach', password: '123', role: 'viewer' },
    });
    expect(res.statusCode).toBe(400);
  });
});
