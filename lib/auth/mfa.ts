/**
 * lib/auth/mfa.ts
 * Core MFA (TOTP) logic for broker authentication.
 *
 * - TOTP: RFC 6238, 30-second window, 6-digit codes
 * - Encryption: AES-256-GCM for secret storage at rest
 * - Backup codes: 10 one-time codes, bcrypt-hashed
 */
import { TOTP, Secret } from 'otpauth';
import QRCode from 'qrcode';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'crypto';
import { verifyPassword } from './password';

const ISSUER = 'Mallan Real Estate';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// ─── TOTP ────────────────────────────────────────────────────────────────

/**
 * Generate a new random TOTP secret (base32-encoded).
 */
export function generateTotpSecret(): string {
  const secret = new Secret({ size: 20 });
  return secret.base32;
}

/**
 * Verify a 6-digit TOTP code against a base32 secret.
 * Allows ±1 time step (30s window on each side) for clock drift.
 */
export function verifyTotpCode(base32Secret: string, code: string): boolean {
  if (!code || code.length !== 6) return false;
  const totp = new TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(base32Secret),
  });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

/**
 * Generate an otpauth:// URI for QR code scanning.
 */
function buildOtpauthUri(base32Secret: string, userEmail: string): string {
  const totp = new TOTP({
    issuer: ISSUER,
    label: userEmail,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(base32Secret),
  });
  return totp.toString();
}

/**
 * Generate a QR code data URL (PNG) for the TOTP secret.
 */
export async function generateQrDataUrl(
  base32Secret: string,
  userEmail: string
): Promise<string> {
  const uri = buildOtpauthUri(base32Secret, userEmail);
  return QRCode.toDataURL(uri, { width: 256, margin: 2 });
}

// ─── Encryption (AES-256-GCM) ───────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const keyHex = process.env.MFA_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('MFA_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a TOTP secret for database storage.
 * Format: base64(iv + authTag + ciphertext)
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt a TOTP secret from database storage.
 */
export function decryptSecret(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const packed = Buffer.from(encryptedBase64, 'base64');
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

// ─── Backup Codes ────────────────────────────────────────────────────────

/**
 * Generate 10 one-time backup codes (8-char lowercase alphanumeric).
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    codes.push(randomUUID().replace(/-/g, '').slice(0, 8).toLowerCase());
  }
  return codes;
}

/**
 * Verify a backup code against an array of bcrypt hashes.
 * Returns true if any hash matches.
 */
export async function verifyBackupCode(
  code: string,
  hashes: string[]
): Promise<boolean> {
  for (const hash of hashes) {
    if (await verifyPassword(code, hash)) {
      return true;
    }
  }
  return false;
}

/**
 * Find the index of the matching backup code hash (for removal after use).
 * Returns -1 if no match.
 */
export async function findBackupCodeIndex(
  code: string,
  hashes: string[]
): Promise<number> {
  for (let i = 0; i < hashes.length; i++) {
    if (await verifyPassword(code, hashes[i])) {
      return i;
    }
  }
  return -1;
}

// ─── MFA Session ─────────────────────────────────────────────────────────

export const MFA_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const MFA_MAX_ATTEMPTS = 5;
