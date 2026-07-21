import { describe, expect, it } from 'vitest';
import {
  CreateEndpointSchema,
  DockerIdSchema,
  PasswordSchema,
  StackNameSchema,
} from '@containly/shared';

describe('Eingabe-Schemas (Sicherheitsgrenzen)', () => {
  it('DockerIdSchema blockt Injection-/Traversal-Zeichen', () => {
    expect(DockerIdSchema.safeParse('a1b2c3d4e5f6').success).toBe(true);
    for (const bad of ['../etc', 'a b', 'a;rm', 'a/b', '$(x)', '']) {
      expect(DockerIdSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('StackNameSchema verhindert Path-Traversal', () => {
    expect(StackNameSchema.safeParse('mein-stack_1').success).toBe(true);
    for (const bad of ['../evil', 'a/b', 'A', '.hidden', 'na me', '']) {
      expect(StackNameSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('PasswordSchema erzwingt die Stärke-Policy', () => {
    expect(PasswordSchema.safeParse('Sup3rSecret!Pass').success).toBe(true);
    for (const bad of ['short', 'alllowercase1!', 'ALLUPPER1!', 'NoDigits!!!!', 'NoSpecial123']) {
      expect(PasswordSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('CreateEndpointSchema erzwingt TLS für TCP', () => {
    const noTls = CreateEndpointSchema.safeParse({ name: 'x', type: 'tcp', host: '10.0.0.1' });
    expect(noTls.success).toBe(false);
    const withTls = CreateEndpointSchema.safeParse({
      name: 'x',
      type: 'tcp',
      host: '10.0.0.1',
      tls: { ca: 'a', cert: 'b', key: 'c' },
    });
    expect(withTls.success).toBe(true);
  });
});
