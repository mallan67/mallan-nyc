/**
 * Shared helper for creating Inquiry rows from public lead-capture endpoints.
 *
 * Each of the 8 lead-capture endpoints in `app/api/` calls this exactly once
 * per submission so that:
 *  - The CRM has a single source of truth for inquiry counts (per-listing
 *    and per-source).
 *  - UCBA Art. III §4 (data accuracy + reporting) has the proper schema
 *    backing instead of the prior AuditEvent-derived workaround.
 *  - TCPA/CAN-SPAM consent is recorded at the moment of inquiry, decoupled
 *    from any future Lead-row mutation.
 *
 * SAFETY MODEL:
 *   This helper NEVER throws. If the Inquiry table doesn't exist yet (e.g.
 *   during the migration window when the model has been added to the schema
 *   but `prisma migrate deploy` hasn't run against the target environment),
 *   the call is a no-op and the lead-capture endpoint continues normally.
 *   This is critical because the call sites are public lead-capture POSTs:
 *   silently degrading is far better than 500ing a real user.
 *
 * Logged-but-not-thrown failures surface in Vercel logs as
 * `[inquiry] create failed:` so an operator can spot a misconfiguration
 * without users noticing.
 *
 * Added in Workstream C1 of master refactor (memory/REFACTOR-2026-04-25.md).
 */
import prisma from "@/lib/prisma";
import crypto from "node:crypto";

/**
 * Source values aligned with `compliance/rules/ucba-audit-checklist.json`
 * inquiry-source enumeration. Keep this list in sync if a new lead-capture
 * surface is added.
 */
export type InquirySource =
  | "contact_form"
  | "inquiry"
  | "cma_request"
  | "open_house_rsvp"
  | "guide_download"
  | "favorite"
  | "search_alert"
  | "sign_up";

export interface CreateInquiryInput {
  source: InquirySource;
  /** Listing this inquiry references, when applicable. */
  listingId?: string | null;
  /** Lead row that the inquiry is associated with (if upsert just created/found one). */
  leadId?: bigint | null;
  /** Free-text message body, if the form captured one. */
  message?: string | null;
  /** Direct contact fields — captured even when leadId is set, for audit redundancy. */
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Moment of consent capture. Defaults to now. */
  consentCapturedAt?: Date;
  /** Optional client context. */
  userAgent?: string | null;
  /** Raw client IP — will be SHA-256 hashed before storage per NY SHIELD Act. */
  rawClientIp?: string | null;
  /** Route-specific structured payload (kept small). */
  metadata?: Record<string, unknown>;
}

/**
 * Hash a raw IP for storage. Uses a fixed salt so the same IP produces the
 * same hash within this app, but the raw value is never persisted.
 *
 * The salt source order:
 *   1. process.env.INQUIRY_IP_SALT  (preferred — operator-controlled)
 *   2. process.env.SESSION_SECRET    (fallback — already exists in env)
 *   3. constant fallback             (better than no hashing)
 */
function hashIp(rawIp: string | null | undefined): string | null {
  if (!rawIp) return null;
  const salt =
    process.env.INQUIRY_IP_SALT ||
    process.env.SESSION_SECRET ||
    "mallan-nyc-inquiry-ip-salt-fallback";
  return crypto.createHash("sha256").update(salt + ":" + rawIp).digest("hex");
}

/**
 * Best-effort Inquiry insert. Never throws.
 *
 * Returns the new Inquiry id if the insert succeeded, or null on any
 * failure. Callers should not depend on the return value — it's only
 * useful for tracing.
 */
export async function createInquiry(input: CreateInquiryInput): Promise<bigint | null> {
  try {
    const consentAt = input.consentCapturedAt ?? new Date();
    const row = await prisma.inquiry.create({
      data: {
        source: input.source,
        listing_id: input.listingId ?? null,
        lead_id: input.leadId ?? null,
        message: input.message ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        first_name: input.firstName ?? null,
        last_name: input.lastName ?? null,
        consent_captured_at: consentAt,
        user_agent: input.userAgent ?? null,
        ip_hash: hashIp(input.rawClientIp),
        // Prisma treats `undefined` as "don't set this field", which leaves
        // the column NULL in the DB. We avoid the JS `null` literal here
        // because Prisma's Json column types require `Prisma.JsonNull`/
        // `Prisma.DbNull` for explicit nulls.
        ...(input.metadata
          ? { metadata: input.metadata as object as never }
          : {}),
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    // Common failure modes we tolerate silently (logged for operators):
    //   - P2021: Inquiry table doesn't exist yet (migration pending)
    //   - P2003: FK violation (listing_id or lead_id removed mid-write)
    //   - Connection errors during a Neon cold start
    //
    // Lead capture must still succeed for the user even when this fails.
    console.warn("[inquiry] create failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
