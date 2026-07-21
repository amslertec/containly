import argon2 from 'argon2';

/**
 * Argon2id mit bewusst konservativen, sicheren Parametern (OWASP-Richtwerte 2024+).
 * memoryCost in KiB. Kein Pepper — der Master-Key schützt bereits Endpoint-Secrets;
 * Passwort-Hashes liegen in der lokalen SQLite mit 0600-Rechten.
 */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** True, wenn der Hash mit veralteten Parametern erzeugt wurde und neu gehasht werden sollte. */
export function needsRehash(hash: string): boolean {
  try {
    return argon2.needsRehash(hash, OPTIONS);
  } catch {
    return false;
  }
}
