import http from 'node:http';
import type { Duplex } from 'node:stream';
import { Client } from 'ssh2';

export interface SshAgentOptions {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

type ConnectFn = (options: unknown, cb: (err: Error | null, socket?: Duplex) => void) => void;

/**
 * HTTP-Agent, der Docker-API-Requests über einen SSH-Tunnel leitet
 * (`docker system dial-stdio`). Anders als docker-modems eingebautes SSH behandelt
 * dieser Agent zusätzlich `keyboard-interactive` — nötig für Server, die Passwörter
 * nur interaktiv (PAM) anbieten. Key-Auth funktioniert ebenso.
 *
 * Jede Verbindung öffnet eine eigene SSH-Session (einfach & korrekt für parallele Streams).
 */
export function createSshAgent(opt: SshAgentOptions): http.Agent {
  const agent = new http.Agent({ keepAlive: false });

  const createConnection: ConnectFn = (_options, cb) => {
    const conn = new Client();
    let settled = false;
    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      conn.end();
      cb(err);
    };

    conn
      .once('ready', () => {
        conn.exec('docker system dial-stdio', (err, stream) => {
          if (err) return fail(err);
          settled = true;
          cb(null, stream as unknown as Duplex);
          stream.on('error', () => conn.end());
          stream.once('close', () => conn.end());
        });
      })
      .on('error', fail);

    // Server, die Passwörter über keyboard-interactive (PAM) abfragen.
    if (opt.password) {
      conn.on('keyboard-interactive', (_name, _instr, _lang, _prompts, finish) => {
        finish([opt.password ?? '']);
      });
    }

    conn.connect({
      host: opt.host,
      port: opt.port,
      username: opt.username,
      readyTimeout: 15_000,
      ...(opt.privateKey
        ? { privateKey: opt.privateKey, passphrase: opt.passphrase }
        : { password: opt.password, tryKeyboard: true }),
    });
  };

  (agent as unknown as { createConnection: ConnectFn }).createConnection = createConnection;
  return agent;
}
