import { z } from 'zod';

/**
 * WebSocket-Nachrichtenprotokoll (Server → Client) für Logs/Stats/Exec.
 * Ein Envelope mit `type` diskriminiert die Payload.
 */
export const LogLineSchema = z.object({
  type: z.literal('log'),
  stream: z.enum(['stdout', 'stderr']),
  message: z.string(),
  timestamp: z.string().nullable(),
});

export const WsErrorSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
});

export const WsEndSchema = z.object({
  type: z.literal('end'),
  message: z.string().optional(),
});

export const WsReadySchema = z.object({
  type: z.literal('ready'),
});

export const ServerLogMessageSchema = z.discriminatedUnion('type', [
  LogLineSchema,
  WsErrorSchema,
  WsEndSchema,
  WsReadySchema,
]);
export type ServerLogMessage = z.infer<typeof ServerLogMessageSchema>;

/** Client → Server für Exec/Terminal: Eingaben und Resize. */
export const ExecClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stdin'), data: z.string() }),
  z.object({
    type: z.literal('resize'),
    cols: z.number().int().min(1).max(1000),
    rows: z.number().int().min(1).max(1000),
  }),
]);
export type ExecClientMessage = z.infer<typeof ExecClientMessageSchema>;
