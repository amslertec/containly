import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238, HMAC-SHA1, 6 Stellen, 30 s) — kompatibel zu Google
 * Authenticator, Aegis, 1Password, etc. Keine externe Abhängigkeit.
 */
const DIGITS = 6;
const PERIOD = 30;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 (RFC 4648, ohne Padding) — Kodierung für das Shared Secret. */
function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Neues zufälliges Secret (160 Bit) als Base32-String. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** otpauth://-URL für QR-Code / manuelle Einrichtung. */
export function otpauthUrl(secret: string, account: string, issuer = 'Containly'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (bin % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

/**
 * Prüft ein TOTP-Token gegen das Secret mit ±1 Zeitfenster (Uhr-Drift-Toleranz).
 * Konstantzeit-Vergleich gegen Timing-Angriffe.
 */
export function verifyTotp(secret: string, token: string, epochMs = Date.now()): boolean {
  const clean = token.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(epochMs / 1000 / PERIOD);
  for (let w = -1; w <= 1; w++) {
    const expected = hotp(secret, counter + w);
    const a = Buffer.from(expected);
    const b = Buffer.from(clean);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** Erzeugt n gut lesbare Recovery-Codes (Format `xxxxx-xxxxx`, Base32-Alphabet). */
export function generateRecoveryCodes(n = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    const raw = randomBytes(8);
    const s = base32Encode(raw).slice(0, 10).toLowerCase();
    codes.push(`${s.slice(0, 5)}-${s.slice(5, 10)}`);
  }
  return codes;
}
