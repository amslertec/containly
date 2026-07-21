export interface PasswordChecks {
  length: boolean;
  lower: boolean;
  upper: boolean;
  digit: boolean;
  special: boolean;
}

export interface StrengthResult {
  checks: PasswordChecks;
  /** 0–4 erfüllte Grundregeln (Länge zählt separat als Gate). */
  score: number;
  valid: boolean;
  level: 'weak' | 'fair' | 'good' | 'strong';
}

/** Spiegelt die serverseitige Policy (siehe shared/PasswordSchema). */
export function evaluatePassword(pw: string): StrengthResult {
  const checks: PasswordChecks = {
    length: pw.length >= 12,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    digit: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
  const classes = [checks.lower, checks.upper, checks.digit, checks.special].filter(Boolean).length;
  const valid = checks.length && classes === 4;

  // Bonus für zusätzliche Länge, um „stark" von „gut" zu trennen.
  let score = classes;
  if (checks.length && pw.length >= 16) score = Math.min(4, score + 1);

  const level: StrengthResult['level'] =
    !checks.length || classes <= 1
      ? 'weak'
      : classes === 2
        ? 'fair'
        : classes === 3
          ? 'good'
          : 'strong';

  return { checks, score, valid, level };
}
