/**
 * MFA Core Logic Tests
 * Tests TOTP secret generation, verification, encryption, and backup codes.
 */
import {
  generateTotpSecret,
  verifyTotpCode,
  encryptSecret,
  decryptSecret,
  generateBackupCodes,
  verifyBackupCode,
  generateQrDataUrl,
} from '../mfa';

// Set test encryption key (32 bytes hex = 64 chars)
beforeAll(() => {
  process.env.MFA_ENCRYPTION_KEY = 'a'.repeat(64);
});

describe('generateTotpSecret', () => {
  it('returns a base32-encoded secret string', () => {
    const secret = generateTotpSecret();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThanOrEqual(16);
  });
});

describe('verifyTotpCode', () => {
  it('accepts a valid current code', () => {
    const secret = generateTotpSecret();
    const { TOTP } = require('otpauth');
    const totp = new TOTP({ secret });
    const code = totp.generate();
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it('rejects an invalid code', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, '000000')).toBe(false);
  });

  it('rejects empty string', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, '')).toBe(false);
  });
});

describe('encrypt/decrypt secret', () => {
  it('round-trips a secret through encrypt then decrypt', () => {
    const secret = generateTotpSecret();
    const encrypted = encryptSecret(secret);
    expect(encrypted).not.toBe(secret);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('produces different ciphertext each time (random IV)', () => {
    const secret = generateTotpSecret();
    const enc1 = encryptSecret(secret);
    const enc2 = encryptSecret(secret);
    expect(enc1).not.toBe(enc2);
  });
});

describe('backup codes', () => {
  it('generates 10 codes, each 8 chars alphanumeric', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    codes.forEach(code => {
      expect(code).toMatch(/^[a-z0-9]{8}$/);
    });
  });

  it('verifyBackupCode matches a code against its bcrypt hash', async () => {
    const codes = generateBackupCodes();
    const { hashPassword } = require('../password');
    const hash = await hashPassword(codes[0]);
    expect(await verifyBackupCode(codes[0], [hash])).toBe(true);
  });

  it('verifyBackupCode rejects wrong code', async () => {
    const { hashPassword } = require('../password');
    const hash = await hashPassword('abcd1234');
    expect(await verifyBackupCode('wrongcode', [hash])).toBe(false);
  });
});

describe('generateQrDataUrl', () => {
  it('returns a data:image/png;base64 URL', async () => {
    const secret = generateTotpSecret();
    const url = await generateQrDataUrl(secret, 'maya@mallan.nyc');
    expect(url).toMatch(/^data:image\/png;base64,/);
  });
});
