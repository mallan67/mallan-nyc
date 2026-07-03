// POST /api/track/listing-event — SELLER-002 anonymous first-party listing
// event capture (registry SELLER-002; Maya directive 2026-07-03).
//
// PUBLIC beacon endpoint. Contract:
//  - ALWAYS 204 with an empty body — success, disabled, invalid, rate-limited,
//    DB error, unknown listing. No caller can probe listing existence, flag
//    state, or validation rules (beacon semantics; log-only errors).
//  - Fail-closed rollout: LISTING_EVENTS_ENABLED !== "true" (Maya-held env) →
//    pure no-op: zero DB calls. Safe to deploy BEFORE the listing_events
//    migration exists (see docs/architecture/SELLER-002-MIGRATION-PLAN-2026-07-03.md).
//  - Anonymous only: visitor_id/session_id are opaque client UUIDs. Client-
//    supplied identity claims (lead_id/user_id/agent_id) are IGNORED — never
//    trusted from a public beacon. Self-identified linkage is a future
//    server-side concern.
//  - PII hygiene (NY SHIELD): metadata sanitized (PII keys/values stripped);
//    referrer persisted HOST-ONLY; raw IP used transiently for rate limiting
//    only and NEVER persisted (no ip/ip_hash column on listing_events).
//  - Rate limit: 120/min/IP (galleries fire bursts) via shared
//    checkRouteRateLimit; over-limit answers a SILENT 204, not 429.
//
// IDX-VALIDATE-OK: intentionally PUBLIC mutation — an anonymous-visitor
// analytics beacon cannot require auth (same class as the public
// lead-capture routes in scripts/idx-validate.js isPublic). Guards instead:
// fail-closed LISTING_EVENTS_ENABLED flag, 11-event allowlist, strict hand
// validation, 4KB body cap, 120/min/IP rate limit, PII-stripped metadata,
// no IP persistence, unconditional 204.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRouteRateLimit, extractClientIp } from '@/lib/middleware/rate-limiter';
import {
  listingEventsEnabled,
  validateListingEventPayload,
  classifyDeviceType,
  classifyReferrerSource,
  referrerHostOnly,
} from '@/lib/tracking/listing-events';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 4096;

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/** Coarse Vercel geo headers (city-level, not PII). Absent locally → null. */
function geoHeader(req: NextRequest, name: string): string | null {
  const raw = req.headers.get(name);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).slice(0, 64);
  } catch {
    return raw.slice(0, 64);
  }
}

/**
 * Codex #473 r2 — declared-length gate. Beacon senders (sendBeacon / fetch
 * with a string body) ALWAYS carry Content-Length; absent means chunked or
 * abnormal transfer, which this endpoint refuses BEFORE any read so the 4KB
 * cap cannot be bypassed by omitting the header. Exported for tests.
 */
export function hasSaneDeclaredLength(headers: Headers): boolean {
  const raw = headers.get('content-length');
  if (raw === null) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= MAX_BODY_BYTES;
}

/**
 * Codex #473 r2 — incremental capped body reader. Immune to a LYING
 * Content-Length: bytes are counted as chunks arrive and the stream is
 * cancelled the moment the cap is exceeded, so the handler never buffers an
 * oversized payload regardless of what the header claimed. Exported for tests.
 */
export async function readBodyCapped(
  body: ReadableStream<Uint8Array> | null,
  max: number
): Promise<string | null> {
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        if (received > max) {
          try { await reader.cancel(); } catch { /* already errored */ }
          return null;
        }
        chunks.push(value);
      }
    }
  } catch {
    return null;
  }
  const joined = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) { joined.set(c, offset); offset += c.byteLength; }
  return new TextDecoder().decode(joined);
}

export async function POST(req: NextRequest) {
  // 1. Fail-closed flag — OFF → no parse-dependent work, ZERO DB calls.
  if (!listingEventsEnabled()) return noContent();

  // 2. Codex #473 r2: require a SANE declared length before anything else —
  //    absent (chunked) / invalid / zero / over-cap all refuse pre-read.
  if (!hasSaneDeclaredLength(req.headers)) return noContent();

  // 3. Codex #473: rate limit BEFORE reading the body (matches the public
  //    contact/inquiry handlers) so abusive clients cannot force body
  //    buffering. Silent 204 when limited — beacon semantics, not 429.
  //    IP is read transiently for limiting only; it is never persisted.
  try {
    const ip = extractClientIp(req.headers);
    const allowed = await checkRouteRateLimit(ip, 'listing_event', 120, 60);
    if (!allowed) return noContent();
  } catch {
    return noContent();
  }

  // 4. Incremental capped read — immune to a lying Content-Length (Codex
  //    #473 r2): the stream is cancelled the moment the cap is exceeded.
  const text = await readBodyCapped(req.body, MAX_BODY_BYTES);
  if (!text) return noContent();

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return noContent();
  }

  // 5. Strict hand validation (event allowlist, id shapes, caps, PII strip).
  const event = validateListingEventPayload(body);
  if (!event) return noContent();

  // 6. Server-derived enrichment + write. Any failure (including FK rejection
  //    for unknown listing_ids or a not-yet-migrated table) is log-only.
  try {
    const referrerRaw = event.referrer ?? req.headers.get('referer');
    await prisma.listingEvent.create({
      data: {
        listing_id: event.listingId,
        event_type: event.eventType,
        visitor_id: event.visitorId,
        session_id: event.sessionId,
        source: classifyReferrerSource({
          referrer: referrerRaw,
          utmSource: event.utmSource,
          utmMedium: event.utmMedium,
          siteHost: 'mallan.nyc',
        }),
        utm_source: event.utmSource,
        utm_medium: event.utmMedium,
        utm_campaign: event.utmCampaign,
        referrer: referrerHostOnly(referrerRaw),
        device_type: classifyDeviceType(req.headers.get('user-agent')),
        city: geoHeader(req, 'x-vercel-ip-city'),
        region: geoHeader(req, 'x-vercel-ip-country-region'),
        metadata: event.metadata ?? undefined,
      },
    });
  } catch (err) {
    // Log-only: never surface errors to the beacon. No payload echo (hygiene).
    console.error(
      '[listing-event] write failed',
      event.eventType,
      event.listingId,
      err instanceof Error ? err.message : 'unknown'
    );
  }

  return noContent();
}
