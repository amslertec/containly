/** Anwendungsfehler mit stabilem Code + HTTP-Status für einheitliche API-Antworten. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  unauthorized: (msg = 'Nicht authentifiziert') => new AppError(401, 'unauthorized', msg),
  forbidden: (msg = 'Keine Berechtigung') => new AppError(403, 'forbidden', msg),
  notFound: (msg = 'Nicht gefunden') => new AppError(404, 'not_found', msg),
  badRequest: (msg = 'Ungültige Anfrage', details?: unknown) =>
    new AppError(400, 'bad_request', msg, details),
  conflict: (msg = 'Konflikt') => new AppError(409, 'conflict', msg),
  setupDone: () => new AppError(409, 'setup_complete', 'Setup ist bereits abgeschlossen'),
  csrf: () => new AppError(403, 'csrf', 'CSRF-Token fehlt oder ist ungültig'),
  docker: (msg: string, status = 502) => new AppError(status, 'docker_error', msg),
} as const;

/** Übersetzt einen dockerode-Fehler in einen AppError mit passendem Status. */
export function fromDockerError(err: unknown): AppError {
  const e = err as { statusCode?: number; message?: string; reason?: string; json?: { message?: string } };
  const status = e.statusCode ?? 502;
  const message = e.json?.message ?? e.reason ?? e.message ?? 'Docker-Fehler';
  if (status === 404) return Errors.notFound(message);
  if (status === 409) return Errors.conflict(message);
  return Errors.docker(message, status >= 400 && status < 600 ? status : 502);
}
