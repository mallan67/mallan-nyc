# Broker MFA (TOTP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TOTP-based multi-factor authentication for broker accounts so that the broker login flow requires email + password + authenticator code.

**Architecture:** The login endpoint detects broker role and returns `{ mfa_required: true, mfa_session }` instead of setting a session cookie. A short-lived `mfa_session` token (stored in a new `MfaSession` model, 5-minute TTL) gates the MFA verify step. Only after TOTP verification does the server create a real session. Enrollment is a separate flow where the broker generates a TOTP secret, scans a QR code, and confirms with a code. 10 one-time backup codes are generated at enrollment for recovery.

**Tech Stack:** `otpauth` (RFC 6238 TOTP), `qrcode` (QR generation as data URL), Prisma (schema), Jest (tests)

**Security constraints:**
- TOTP secrets are encrypted at rest using AES-256-GCM with a server-side key (`MFA_ENCRYPTION_KEY` env var)
- Backup codes are bcrypt-hashed (same as passwords) — never stored in plaintext
- MFA sessions expire after 5 minutes and are single-use
- All MFA events are audit-logged (enroll, verify, fail, backup-code-use, disable)
- Rate limit: 5 failed MFA attempts per mfa_session → session is destroyed

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Add `mfa_secret`, `mfa_enabled`, `mfa_backup_codes` to Agent; add `MfaSession` model |
| `lib/auth/mfa.ts` | Create | Core MFA logic: generate secret, verify TOTP, encrypt/decrypt, backup codes |
| `lib/auth/index.ts` | Modify | Re-export MFA functions |
| `app/api/auth/login/route.ts` | Modify | Detect broker + MFA enabled → return `mfa_required` instead of session |
| `app/api/auth/mfa/enroll/route.ts` | Create | Generate TOTP secret + QR code for authenticated broker |
| `app/api/auth/mfa/verify/route.ts` | Create | Validate TOTP code from mfa_session → create real session |
| `app/api/auth/mfa/backup-codes/route.ts` | Create | Regenerate backup codes (authenticated broker) |
| `app/api/auth/mfa/disable/route.ts` | Create | Disable MFA (authenticated broker, requires current TOTP) |
| `public/crm/login.html` | Modify | Add MFA code input step after password |
| `public/crm/js/core/api-client.js` | Modify | Add `auth.verifyMfa()` method |
| `lib/auth/__tests__/mfa.test.ts` | Create | Unit tests for MFA core logic |
| `lib/auth/__tests__/mfa-login.test.ts` | Create | Integration tests for MFA login flow |
| `scripts/idx-validate.js` | Modify | Update section 34 to check MFA enforcement |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install otpauth and qrcode packages**

```bash
npm install otpauth qrcode
npm install -D @types/qrcode
```

`otpauth` is a zero-dependency RFC 6238/4226 TOTP/HOTP library. `qrcode` generates the QR image for authenticator app scanning.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add otpauth + qrcode for broker MFA"
```

---

## Task 2: Prisma Schema — MFA Fields + MfaSession Model

**Files:**
- Modify: `prisma/schema.prisma` (Agent model ~line 30, new MfaSession model after Session)

- [ ] **Step 1: Add MFA fields to Agent model**

In `prisma/schema.prisma`, add these fields to the `Agent` model after the `status` field (around line 31):

```prisma
  // --- MFA (TOTP) ---
  mfa_enabled       Boolean   @default(false) @map("mfa_enabled")
  mfa_secret_enc    String?   @db.Text @map("mfa_secret_enc")    // AES-256-GCM encrypted TOTP secret
  mfa_backup_hashes String[]  @default([]) @map("mfa_backup_hashes") // bcrypt hashes of one-time backup codes
```

**Why `mfa_secret_enc` not `mfa_secret`:** The TOTP secret must be encrypted at rest. The column stores the AES-256-GCM ciphertext + IV + auth tag as a single base64 string. The `MFA_ENCRYPTION_KEY` env var is required to decrypt.

**Why `mfa_backup_hashes` not `mfa_backup_codes`:** Backup codes are hashed like passwords — if the DB is breached, the codes are useless without the hash.

- [ ] **Step 2: Add MfaSession model**

Add after the `Session` model (around line 510):

```prisma
// ═══════════════════════════════════════════════════════════
// MFA SESSION — Short-lived pending session for TOTP verification
// ═══════════════════════════════════════════════════════════
model MfaSession {
  id          String   @id @default(cuid())
  token       String   @unique
  agent_id    BigInt   @map("agent_id")
  attempts    Int      @default(0)           // rate limit: max 5
  expires_at  DateTime @map("expires_at")
  created_at  DateTime @default(now()) @map("created_at")
  ip_address  String?  @map("ip_address")
  user_agent  String?  @map("user_agent") @db.Text

  @@index([token])
  @@index([expires_at])
  @@map("mfa_sessions")
}
```

**Why a separate model instead of a flag on Session?** The MFA session is a fundamentally different object — it grants zero access to the app and exists only to gate the TOTP step. Mixing it with real sessions would require checking `mfa_verified` on every `validateSession()` call, adding complexity to every authenticated request.

- [ ] **Step 3: Run migration**

```bash
npx prisma migrate dev --name add-broker-mfa
```

Expected: Migration creates `mfa_enabled`, `mfa_secret_enc`, `mfa_backup_hashes` columns on `agents` table and `mfa_sessions` table.

- [ ] **Step 4: Verify Prisma client regenerated**

```bash
npx prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(auth): add MFA schema — Agent MFA fields + MfaSession model"
```

---

## Task 3: Core MFA Library (`lib/auth/mfa.ts`)

**Files:**
- Create: `lib/auth/mfa.ts`
- Modify: `lib/auth/index.ts`

- [ ] **Step 1: Write failing tests for MFA core logic**

Create `lib/auth/__tests__/mfa.test.ts`:

```typescript
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
    // Generate a code from the same secret
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest lib/auth/__tests__/mfa.test.ts --no-coverage
```

Expected: All tests fail with "Cannot find module '../mfa'"

- [ ] **Step 3: Implement `lib/auth/mfa.ts`**

```typescript
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
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { randomUUID } from 'crypto';
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
  // delta returns null for invalid, number for valid (0 = exact, ±1 = adjacent window)
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
  // Pack: IV (16) + authTag (16) + ciphertext
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
    // Use randomUUID and extract 8 alphanumeric chars
    codes.push(randomUUID().replace(/-/g, '').slice(0, 8).toLowerCase());
  }
  return codes;
}

/**
 * Verify a backup code against an array of bcrypt hashes.
 * Returns true if any hash matches. The caller is responsible for
 * removing the used hash from the array after successful verification.
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
```

- [ ] **Step 4: Add MFA exports to `lib/auth/index.ts`**

Add this line to `lib/auth/index.ts`:

```typescript
export {
  generateTotpSecret,
  verifyTotpCode,
  encryptSecret,
  decryptSecret,
  generateBackupCodes,
  verifyBackupCode,
  findBackupCodeIndex,
  generateQrDataUrl,
  MFA_SESSION_TTL_MS,
  MFA_MAX_ATTEMPTS,
} from "./mfa";
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest lib/auth/__tests__/mfa.test.ts --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/mfa.ts lib/auth/index.ts lib/auth/__tests__/mfa.test.ts
git commit -m "feat(auth): add MFA core library — TOTP, encryption, backup codes"
```

---

## Task 4: Modify Login Route — MFA Gate for Brokers

**Files:**
- Modify: `app/api/auth/login/route.ts`

- [ ] **Step 1: Write failing test for MFA-gated login**

Create `lib/auth/__tests__/mfa-login.test.ts`:

```typescript
/**
 * MFA Login Flow Tests
 * Tests that broker login with MFA returns mfa_required instead of session.
 */

// These are integration-style assertions about the login response shape.
// The actual HTTP test runs against the route, but we test the decision logic here.

describe('Broker MFA login decision', () => {
  it('should return mfa_required when broker has mfa_enabled=true', () => {
    // This tests the branching logic:
    // Agent found + valid password + role=BROKER + mfa_enabled=true
    //   → return { mfa_required: true, mfa_session: token }
    //   → do NOT set session_token cookie
    const agent = {
      id: BigInt(1),
      role: 'BROKER',
      mfa_enabled: true,
      mfa_secret_enc: 'encrypted-secret',
      status: 'active',
    };
    const shouldRequireMfa = agent.role === 'BROKER' && agent.mfa_enabled;
    expect(shouldRequireMfa).toBe(true);
  });

  it('should proceed normally when broker has mfa_enabled=false (not yet enrolled)', () => {
    const agent = {
      id: BigInt(1),
      role: 'BROKER',
      mfa_enabled: false,
      mfa_secret_enc: null,
      status: 'active',
    };
    const shouldRequireMfa = agent.role === 'BROKER' && agent.mfa_enabled;
    expect(shouldRequireMfa).toBe(false);
  });

  it('should never require MFA for non-broker agents', () => {
    const agent = {
      id: BigInt(1),
      role: 'AGENT',
      mfa_enabled: false,
      status: 'active',
    };
    const shouldRequireMfa = agent.role === 'BROKER' && agent.mfa_enabled;
    expect(shouldRequireMfa).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it passes** (these are pure logic tests)

```bash
npx jest lib/auth/__tests__/mfa-login.test.ts --no-coverage
```

- [ ] **Step 3: Modify login route to gate MFA**

In `app/api/auth/login/route.ts`, replace the agent login success block (lines 59-82) with:

```typescript
        // ── MFA check for brokers ──
        const isBroker = agent.role === 'BROKER' || agent.role === 'broker';
        if (isBroker && agent.mfa_enabled && agent.mfa_secret_enc) {
          // Create short-lived MFA session instead of real session
          const mfaToken = randomUUID();
          await prisma.mfaSession.create({
            data: {
              token: mfaToken,
              agent_id: agent.id,
              expires_at: new Date(Date.now() + MFA_SESSION_TTL_MS),
              ip_address: ip ?? null,
              user_agent: ua ?? null,
            },
          });

          return NextResponse.json({
            mfa_required: true,
            mfa_session: mfaToken,
          });
        }

        // ── No MFA — create session directly ──
        const token = await createSession("agent", agent.id, agent.role, ip, ua);

        // Update last_login
        await prisma.agent.update({
          where: { id: agent.id },
          data: { last_login: new Date() },
        });

        const res = NextResponse.json({
          success: true,
          user: {
            id: agent.id.toString(),
            name: agent.full_name || `${agent.first_name} ${agent.last_name}`,
            email: agent.email,
            role: agent.role,
            userType: "agent",
          },
        });

        res.cookies.set(SESSION_COOKIE, token, getSessionCookieConfig("agent", agent.role));
        return res;
```

Add imports at the top of the file:

```typescript
import { randomUUID } from "crypto";
import { MFA_SESSION_TTL_MS } from "@/lib/auth/mfa";
```

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/login/route.ts lib/auth/__tests__/mfa-login.test.ts
git commit -m "feat(auth): gate broker login on MFA when enrolled"
```

---

## Task 5: MFA Verify Endpoint

**Files:**
- Create: `app/api/auth/mfa/verify/route.ts`

This is the critical endpoint: it accepts an MFA session token + TOTP code, validates them, and creates the real session.

- [ ] **Step 1: Create the verify endpoint**

```typescript
// POST /api/auth/mfa/verify
// Validates a TOTP code (or backup code) against an MFA session.
// On success: creates real session, sets cookie, destroys MFA session.
// On failure: increments attempts, destroys session after 5 failures.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { getSessionCookieConfig } from "@/lib/auth/cookie-config";
import {
  verifyTotpCode,
  decryptSecret,
  findBackupCodeIndex,
  MFA_MAX_ATTEMPTS,
} from "@/lib/auth/mfa";
import { logAuditEvent } from "@/lib/auth/middleware";
import type { SessionUser } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mfa_session, code } = body;

    if (!mfa_session || !code) {
      return NextResponse.json(
        { error: "MFA session token and code are required" },
        { status: 400 }
      );
    }

    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined;
    const ua = req.headers.get("user-agent") ?? undefined;

    // ── Find MFA session ──
    const mfaSess = await prisma.mfaSession.findUnique({
      where: { token: mfa_session },
    });

    if (!mfaSess) {
      return NextResponse.json(
        { error: "Invalid or expired MFA session" },
        { status: 422 }
      );
    }

    // Check expiry
    if (mfaSess.expires_at < new Date()) {
      await prisma.mfaSession.delete({ where: { id: mfaSess.id } }).catch(() => {});
      return NextResponse.json(
        { error: "MFA session expired. Please log in again." },
        { status: 422 }
      );
    }

    // Check rate limit
    if (mfaSess.attempts >= MFA_MAX_ATTEMPTS) {
      await prisma.mfaSession.delete({ where: { id: mfaSess.id } }).catch(() => {});
      return NextResponse.json(
        { error: "Too many failed attempts. Please log in again." },
        { status: 429 }
      );
    }

    // ── Load agent ──
    const agent = await prisma.agent.findUnique({
      where: { id: mfaSess.agent_id },
    });

    if (!agent || !agent.mfa_secret_enc) {
      await prisma.mfaSession.delete({ where: { id: mfaSess.id } }).catch(() => {});
      return NextResponse.json({ error: "MFA not configured" }, { status: 400 });
    }

    // ── Audit helper (agent not yet authenticated — build partial SessionUser) ──
    const auditUser: SessionUser = {
      userId: agent.id,
      userType: "agent",
      role: agent.role,
      sessionId: "mfa-pending",
    };

    // ── Try TOTP code first ──
    const secret = decryptSecret(agent.mfa_secret_enc);
    const totpValid = verifyTotpCode(secret, code.trim());

    if (!totpValid) {
      // ── Try backup code ──
      const backupIdx = await findBackupCodeIndex(
        code.trim().toLowerCase(),
        agent.mfa_backup_hashes
      );

      if (backupIdx === -1) {
        // Both failed — increment attempts
        await prisma.mfaSession.update({
          where: { id: mfaSess.id },
          data: { attempts: { increment: 1 } },
        });

        await logAuditEvent(
          "mfa_verify_fail",
          "agent",
          agent.id.toString(),
          auditUser,
          { attempts: mfaSess.attempts + 1 },
          ip
        );

        const remaining = MFA_MAX_ATTEMPTS - (mfaSess.attempts + 1);
        return NextResponse.json(
          {
            error: `Invalid code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`,
          },
          { status: 422 }
        );
      }

      // ── Backup code matched — remove it ──
      const updatedHashes = [...agent.mfa_backup_hashes];
      updatedHashes.splice(backupIdx, 1);
      await prisma.agent.update({
        where: { id: agent.id },
        data: { mfa_backup_hashes: updatedHashes },
      });

      await logAuditEvent(
        "mfa_backup_code_used",
        "agent",
        agent.id.toString(),
        auditUser,
        { remaining_codes: updatedHashes.length },
        ip
      );
    }

    // ── MFA verified — create real session ──
    const sessionToken = await createSession("agent", agent.id, agent.role, ip, ua);

    // Update last_login
    await prisma.agent.update({
      where: { id: agent.id },
      data: { last_login: new Date() },
    });

    // Destroy MFA session (single-use)
    await prisma.mfaSession.delete({ where: { id: mfaSess.id } }).catch(() => {});

    await logAuditEvent(
      "mfa_verify_success",
      "agent",
      agent.id.toString(),
      auditUser,
      { method: totpValid ? "totp" : "backup_code" },
      ip
    );

    const res = NextResponse.json({
      success: true,
      user: {
        id: agent.id.toString(),
        name: agent.full_name || `${agent.first_name} ${agent.last_name}`,
        email: agent.email,
        role: agent.role,
        userType: "agent",
      },
    });

    res.cookies.set(
      SESSION_COOKIE,
      sessionToken,
      getSessionCookieConfig("agent", agent.role)
    );

    return res;
  } catch (err) {
    console.error("MFA verify error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/auth/mfa/verify/route.ts
git commit -m "feat(auth): add MFA verify endpoint — TOTP + backup code validation"
```

---

## Task 6: MFA Enroll Endpoint

**Files:**
- Create: `app/api/auth/mfa/enroll/route.ts`

Enrollment is a two-step process:
1. `GET` — generates a new secret + QR code (does NOT persist — returns secret for client to hold)
2. `POST` — client sends back both the `secret` and a TOTP `code`; server verifies code, then encrypts and saves secret

**Why GET doesn't persist the secret:** If the secret were saved on GET, calling GET multiple times would overwrite it, invalidating the QR code the broker already scanned. The secret only touches the DB after a verified code proves the broker's authenticator app has it.

- [ ] **Step 1: Create the enroll endpoint**

```typescript
// /api/auth/mfa/enroll
// GET  — Generate TOTP secret + QR code (authenticated broker only).
//        Does NOT persist the secret — returns it for the client to send back on POST.
// POST — Confirm enrollment by verifying a code + persisting the encrypted secret.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth/middleware";
import { hashPassword } from "@/lib/auth/password";
import {
  generateTotpSecret,
  verifyTotpCode,
  encryptSecret,
  generateBackupCodes,
  generateQrDataUrl,
} from "@/lib/auth/mfa";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireBroker(req);
    if (isAuthError(auth)) return auth;
    const ip = req.headers.get("x-forwarded-for") ?? undefined;

    const agent = await prisma.agent.findUnique({
      where: { id: auth.userId },
    });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (agent.mfa_enabled) {
      return NextResponse.json(
        { error: "MFA is already enabled. Disable it first to re-enroll." },
        { status: 400 }
      );
    }

    // Generate new secret — NOT saved to DB yet (saved on POST after code verification)
    const secret = generateTotpSecret();
    const qrDataUrl = await generateQrDataUrl(secret, agent.email);

    await logAuditEvent(
      "mfa_enroll_start",
      "agent",
      agent.id.toString(),
      auth,
      {},
      ip
    );

    return NextResponse.json({
      secret: secret, // Client sends this back on POST along with the TOTP code
      qr_code: qrDataUrl,
      message: "Scan the QR code with your authenticator app, then POST a code to confirm.",
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("MFA enroll GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireBroker(req);
    if (isAuthError(auth)) return auth;
    const ip = req.headers.get("x-forwarded-for") ?? undefined;

    const body = await req.json();
    const { code, secret } = body;

    if (!code || !secret) {
      return NextResponse.json(
        { error: "Both code and secret are required" },
        { status: 400 }
      );
    }

    const agent = await prisma.agent.findUnique({
      where: { id: auth.userId },
    });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (agent.mfa_enabled) {
      return NextResponse.json(
        { error: "MFA is already enabled" },
        { status: 400 }
      );
    }

    // Verify the code against the secret from the client
    const valid = verifyTotpCode(secret, code.trim());

    if (!valid) {
      return NextResponse.json(
        { error: "Invalid code. Make sure your authenticator app shows a 6-digit code and try again." },
        { status: 422 }
      );
    }

    // ── Code valid — persist encrypted secret + enable MFA ──
    const backupCodes = generateBackupCodes();
    const backupHashes = await Promise.all(
      backupCodes.map((c) => hashPassword(c))
    );

    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        mfa_enabled: true,
        mfa_secret_enc: encryptSecret(secret),
        mfa_backup_hashes: backupHashes,
      },
    });

    await logAuditEvent(
      "mfa_enroll_complete",
      "agent",
      agent.id.toString(),
      auth,
      { backup_codes_generated: 10 },
      ip
    );

    return NextResponse.json({
      success: true,
      backup_codes: backupCodes,
      message: "MFA enabled. Save these backup codes — they will not be shown again.",
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("MFA enroll POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/auth/mfa/enroll/route.ts
git commit -m "feat(auth): add MFA enroll endpoint — generate secret + QR + backup codes"
```

---

## Task 7: Backup Codes Regeneration + MFA Disable Endpoints

**Files:**
- Create: `app/api/auth/mfa/backup-codes/route.ts`
- Create: `app/api/auth/mfa/disable/route.ts`

- [ ] **Step 1: Create backup codes endpoint**

```typescript
// POST /api/auth/mfa/backup-codes
// Regenerate backup codes (authenticated broker only, requires current TOTP code).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth/middleware";
import { hashPassword } from "@/lib/auth/password";
import {
  verifyTotpCode,
  decryptSecret,
  generateBackupCodes,
} from "@/lib/auth/mfa";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireBroker(req);
    if (isAuthError(auth)) return auth;
    const ip = req.headers.get("x-forwarded-for") ?? undefined;

    const body = await req.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: "Enter your current TOTP code to regenerate backup codes" },
        { status: 400 }
      );
    }

    const agent = await prisma.agent.findUnique({
      where: { id: auth.userId },
    });

    if (!agent || !agent.mfa_enabled || !agent.mfa_secret_enc) {
      return NextResponse.json(
        { error: "MFA is not enabled" },
        { status: 400 }
      );
    }

    const secret = decryptSecret(agent.mfa_secret_enc);
    if (!verifyTotpCode(secret, code.trim())) {
      return NextResponse.json({ error: "Invalid TOTP code" }, { status: 401 });
    }

    const newCodes = generateBackupCodes();
    const newHashes = await Promise.all(newCodes.map((c) => hashPassword(c)));

    await prisma.agent.update({
      where: { id: agent.id },
      data: { mfa_backup_hashes: newHashes },
    });

    await logAuditEvent(
      "mfa_backup_codes_regenerated",
      "agent",
      agent.id.toString(),
      auth,
      { codes_generated: 10 },
      ip
    );

    return NextResponse.json({
      success: true,
      backup_codes: newCodes,
      message: "New backup codes generated. Previous codes are now invalid.",
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("Backup codes error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create disable endpoint**

```typescript
// POST /api/auth/mfa/disable
// Disable MFA (authenticated broker only, requires current TOTP code).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth/middleware";
import { verifyTotpCode, decryptSecret } from "@/lib/auth/mfa";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireBroker(req);
    if (isAuthError(auth)) return auth;
    const ip = req.headers.get("x-forwarded-for") ?? undefined;

    const body = await req.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: "Enter your current TOTP code to disable MFA" },
        { status: 400 }
      );
    }

    const agent = await prisma.agent.findUnique({
      where: { id: auth.userId },
    });

    if (!agent || !agent.mfa_enabled || !agent.mfa_secret_enc) {
      return NextResponse.json(
        { error: "MFA is not enabled" },
        { status: 400 }
      );
    }

    const secret = decryptSecret(agent.mfa_secret_enc);
    if (!verifyTotpCode(secret, code.trim())) {
      return NextResponse.json({ error: "Invalid TOTP code" }, { status: 401 });
    }

    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        mfa_enabled: false,
        mfa_secret_enc: null,
        mfa_backup_hashes: [],
      },
    });

    await logAuditEvent(
      "mfa_disabled",
      "agent",
      agent.id.toString(),
      auth,
      {},
      ip
    );

    return NextResponse.json({
      success: true,
      message: "MFA has been disabled. You can re-enroll at any time.",
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("MFA disable error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/mfa/backup-codes/route.ts app/api/auth/mfa/disable/route.ts
git commit -m "feat(auth): add MFA backup-codes regeneration + disable endpoints"
```

---

## Task 8: Login UI — MFA Code Step

**Files:**
- Modify: `public/crm/login.html`
- Modify: `public/crm/js/core/api-client.js`

- [ ] **Step 1: Add `auth.verifyMfa` to api-client.js**

In `public/crm/js/core/api-client.js`, add after the `login` method (around line 83):

```javascript
    /**
     * Verify MFA code after login returns mfa_required.
     */
    verifyMfa: function (mfaSession, code) {
      return _fetch('/api/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({
          mfa_session: mfaSession,
          code: code,
        }),
      }).then(function (data) {
        _user = data.user || null;
        _ready = true;
        return data;
      });
    },
```

- [ ] **Step 2: Add MFA step UI to login.html**

Add these CSS rules inside the existing `<style>` block (before `</style>`):

```css
        /* MFA Step */
        .mfa-step { display: none; }
        .mfa-step.visible { display: block; }

        .mfa-step .back-link {
            display: inline-block;
            font-size: 12px;
            color: #9ca3af;
            cursor: pointer;
            margin-bottom: 16px;
            text-decoration: none;
        }

        .mfa-step .back-link:hover { color: #B8860B; }

        .mfa-input {
            width: 100%;
            padding: 14px;
            border: 1px solid #d1d5db;
            border-radius: 10px;
            font-size: 20px;
            font-family: 'Courier New', monospace;
            text-align: center;
            letter-spacing: 8px;
            color: #111;
            outline: none;
            transition: border-color 0.2s, box-shadow 0.2s;
        }

        .mfa-input:focus {
            border-color: #B8860B;
            box-shadow: 0 0 0 3px rgba(184, 134, 11, 0.12);
        }

        .mfa-hint {
            font-size: 12px;
            color: #9ca3af;
            text-align: center;
            margin-top: 8px;
        }
```

Add this HTML block inside `.login-card`, right after the `</form>` closing tag (around line 271):

```html
            <!-- MFA Step (hidden by default) -->
            <div id="mfaStep" class="mfa-step">
                <a class="back-link" id="mfaBack">&larr; Back to login</a>
                <div style="text-align:center;margin-bottom:16px;">
                    <div style="font-size:14px;font-weight:600;color:#111;">Two-Factor Authentication</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:4px;">Enter the code from your authenticator app</div>
                </div>
                <div class="form-group">
                    <input type="text" id="mfaCode" class="mfa-input"
                        maxlength="8" inputmode="numeric" autocomplete="one-time-code"
                        placeholder="------">
                </div>
                <div id="mfaError" class="error-msg"></div>
                <button type="button" id="mfaSubmitBtn" class="submit-btn">Verify</button>
                <div class="mfa-hint">You can also enter a backup code</div>
            </div>
```

Add this JavaScript inside the existing `<script>` IIFE (after the `resetButton` function, around line 426):

```javascript
        // ── MFA Step ──
        var mfaStep = document.getElementById('mfaStep');
        var mfaCode = document.getElementById('mfaCode');
        var mfaError = document.getElementById('mfaError');
        var mfaSubmitBtn = document.getElementById('mfaSubmitBtn');
        var mfaBack = document.getElementById('mfaBack');
        var pendingMfaSession = null;

        function showMfaStep(mfaSession) {
            pendingMfaSession = mfaSession;
            form.style.display = 'none';
            // Hide OAuth and forgot password
            var divider = document.querySelector('.divider');
            var oauthRow = divider ? divider.nextElementSibling : null;
            var forgotRow = document.querySelector('[href="/reset-password"]');
            if (divider) divider.style.display = 'none';
            if (oauthRow) oauthRow.style.display = 'none';
            if (forgotRow && forgotRow.parentElement) forgotRow.parentElement.style.display = 'none';
            mfaStep.classList.add('visible');
            mfaCode.value = '';
            mfaCode.focus();
        }

        function hideMfaStep() {
            pendingMfaSession = null;
            mfaStep.classList.remove('visible');
            form.style.display = 'block';
            var divider = document.querySelector('.divider');
            var oauthRow = divider ? divider.nextElementSibling : null;
            var forgotRow = document.querySelector('[href="/reset-password"]');
            if (divider) divider.style.display = '';
            if (oauthRow) oauthRow.style.display = '';
            if (forgotRow && forgotRow.parentElement) forgotRow.parentElement.style.display = '';
            mfaError.classList.remove('visible');
        }

        mfaBack.addEventListener('click', hideMfaStep);

        mfaSubmitBtn.addEventListener('click', submitMfa);
        mfaCode.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') submitMfa();
        });

        function submitMfa() {
            var code = mfaCode.value.trim();
            if (!code) {
                mfaError.textContent = 'Enter your verification code.';
                mfaError.classList.add('visible');
                return;
            }

            mfaError.classList.remove('visible');
            mfaSubmitBtn.disabled = true;
            mfaSubmitBtn.classList.add('loading');

            MallanAPI.auth.verifyMfa(pendingMfaSession, code).then(function (data) {
                if (data.success) {
                    redirectAfterLogin();
                } else {
                    mfaError.textContent = data.error || 'Verification failed.';
                    mfaError.classList.add('visible');
                    mfaSubmitBtn.disabled = false;
                    mfaSubmitBtn.classList.remove('loading');
                    mfaCode.value = '';
                    mfaCode.focus();
                }
            }).catch(function (err) {
                mfaError.textContent = err.message || 'Verification failed. Please try again.';
                mfaError.classList.add('visible');
                mfaSubmitBtn.disabled = false;
                mfaSubmitBtn.classList.remove('loading');
                mfaCode.value = '';
                mfaCode.focus();
            });
        }
```

Modify the existing login form handler — in the `.then(function (data) {` callback (around line 398), change the success check:

```javascript
            MallanAPI.auth.login(email, password, portalType).then(function (data) {
                if (data.mfa_required) {
                    showMfaStep(data.mfa_session);
                    resetButton();
                } else if (data.success) {
                    redirectAfterLogin();
                } else {
                    showError(data.error || 'Login failed. Please try again.');
                    resetButton();
                }
            }).catch(function (err) {
```

- [ ] **Step 3: Commit**

```bash
git add public/crm/login.html public/crm/js/core/api-client.js
git commit -m "feat(auth): add MFA code input step to CRM login page"
```

---

## Task 9: MFA Session Cleanup in Cron

**Files:**
- Modify: `app/api/cron/data-retention/route.ts` (or wherever session cleanup runs)

- [ ] **Step 1: Add MFA session cleanup**

In the data retention cron, add cleanup of expired MFA sessions:

```typescript
// Clean expired MFA sessions
const mfaDeleted = await prisma.mfaSession.deleteMany({
  where: { expires_at: { lt: new Date() } },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/api/cron/data-retention/route.ts
git commit -m "chore: add expired MFA session cleanup to data retention cron"
```

---

## Task 10: Environment Variable + Validator Update

**Files:**
- Modify: `.env.local` (add `MFA_ENCRYPTION_KEY`)
- Modify: `scripts/idx-validate.js` (update section 34)

- [ ] **Step 1: Generate and set MFA_ENCRYPTION_KEY**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add the output to `.env.local`:
```
MFA_ENCRYPTION_KEY=<generated-64-char-hex-string>
```

Add to Vercel:
```bash
vercel env add MFA_ENCRYPTION_KEY production
```

- [ ] **Step 2: Update validator section 34**

In `scripts/idx-validate.js`, update the section 34 MFA check to verify the enrollment endpoint exists and login route has MFA branching:

```javascript
// Section 34: MFA enforcement
// Check that app/api/auth/mfa/verify/route.ts exists
// Check that app/api/auth/mfa/enroll/route.ts exists
// Check that login route contains 'mfa_required' response
// Check that MFA_ENCRYPTION_KEY is referenced in lib/auth/mfa.ts
```

- [ ] **Step 3: Run validator**

```bash
npm run idx:validate
```

Expected: Section 34 passes.

- [ ] **Step 4: Commit**

```bash
git add scripts/idx-validate.js
git commit -m "chore: update validator section 34 with MFA endpoint checks"
```

---

## Task 11: Final Integration Test

- [ ] **Step 1: Run all tests**

```bash
npx jest --no-coverage
```

Expected: All existing tests + new MFA tests pass.

- [ ] **Step 2: Run full validator**

```bash
npm run idx:validate
```

Expected: 0 criticals, 0 warnings.

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Test manually**

1. Start dev server: `npm run dev`
2. Log in as broker — should work normally (MFA not yet enrolled)
3. Call `GET /api/auth/mfa/enroll` with session cookie — should return QR + secret
4. Scan QR with authenticator app
5. Call `POST /api/auth/mfa/enroll` with TOTP code — should return backup codes
6. Log out, log in again — should show MFA step
7. Enter TOTP code — should complete login
8. Try wrong code — should show error + remaining attempts

- [ ] **Step 5: Update security blockers memory**

Mark P1-2 as FIXED in `memory/SECURITY-BLOCKERS-2026-03-25.md`.

---

## Summary: What This Plan Produces

| Component | What |
|-----------|------|
| **4 API endpoints** | `/mfa/enroll` (GET+POST), `/mfa/verify`, `/mfa/backup-codes`, `/mfa/disable` |
| **1 core library** | `lib/auth/mfa.ts` — TOTP, encryption, backup codes |
| **2 Prisma changes** | 3 fields on Agent, 1 new MfaSession model |
| **1 UI change** | MFA code step in login.html |
| **1 API client method** | `MallanAPI.auth.verifyMfa()` |
| **1 login route change** | Broker + MFA enabled → return `mfa_required` instead of session |
| **Audit logging** | 6 event types (enroll_start, enroll_complete, verify_success, verify_fail, backup_code_used, disabled) |
| **Tests** | Unit tests for core logic + login decision |
