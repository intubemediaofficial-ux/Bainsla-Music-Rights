import { decrypt, encrypt, safeEqualHex, sha256 } from './crypto.js';
import { redact } from './redact.js';

describe('crypto', () => {
  it('round-trips AES-GCM and uses a random IV', () => {
    const a = encrypt('JBSWY3DPEHPK3PXP');
    const b = encrypt('JBSWY3DPEHPK3PXP');
    expect(a).not.toEqual(b);
    expect(decrypt(a)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('rejects tampered ciphertext', () => {
    const enc = encrypt('secret');
    const tampered = enc.slice(0, -2) + (enc.endsWith('A') ? 'B' : 'A') + enc.slice(-1);
    expect(() => decrypt(tampered)).toThrow();
  });

  it('sha256 + constant-time compare', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(safeEqualHex(sha256('x'), sha256('x'))).toBe(true);
    expect(safeEqualHex(sha256('x'), sha256('y'))).toBe(false);
  });
});

describe('redact', () => {
  it('removes secrets and personal identifiers recursively', () => {
    const out = redact({ name: 'A', password: 'p', nested: { mfaSecret: 's', panNumber: 'X', list: [{ token: 't', ok: 1 }] } }) as any;
    expect(out.name).toBe('A');
    expect(out.password).toBe('[REDACTED]');
    expect(out.nested.mfaSecret).toBe('[REDACTED]');
    expect(out.nested.panNumber).toBe('[REDACTED]');
    expect(out.nested.list[0].token).toBe('[REDACTED]');
    expect(out.nested.list[0].ok).toBe(1);
  });
});
