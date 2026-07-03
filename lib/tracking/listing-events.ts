/**
 * SELLER-002 — public listing event tracking: pure server helpers.
 * (Registry: docs/PLATFORM-ISSUE-REGISTRY.md SELLER-002; Maya directive 2026-07-03.)
 *
 * Fail-closed rollout flag: `LISTING_EVENTS_ENABLED` — read pattern-matched to
 * lib/retention/archive-controls.ts (PR #470): ONLY the exact string "true"
 * enables; absent / empty / anything else = OFF. Env changes are Maya-held.
 *
 * Privacy invariants (SHIELD / TCPA hygiene, Maya spec):
 *  - anonymous first-party visitor_id/session_id only — NO fingerprinting;
 *  - NO PII accepted in metadata (PII-named keys and PII-shaped values stripped);
 *  - referrer persisted host-only (never path/query);
 *  - raw IP is NEVER persisted (rate limiting may read it transiently).
 *
 * Pure module: no I/O, no Prisma; env is injectable for testability.
 */

export type ListingEventEnv = Record<string, string | undefined>;

export const LISTING_EVENTS_ENABLED_FLAG = 'LISTING_EVENTS_ENABLED';

/** Fail-closed flag read: ONLY the exact string "true" enables. */
export function listingEventsEnabled(env: ListingEventEnv = process.env): boolean {
  return env[LISTING_EVENTS_ENABLED_FLAG] === 'true';
}

/** The 11 public event types (Maya spec, verbatim). Fail-closed allowlist. */
export const LISTING_EVENT_TYPES = [
  'listing_view',
  'photo_gallery_open',
  'floorplan_click',
  'virtual_tour_click',
  'video_click',
  'contact_click',
  'showing_request_click',
  'share_click',
  'save_click',
  'email_click',
  'external_link_click',
] as const;

export type ListingEventType = (typeof LISTING_EVENT_TYPES)[number];

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(LISTING_EVENT_TYPES);

export function isListingEventType(value: unknown): value is ListingEventType {
  return typeof value === 'string' && EVENT_TYPE_SET.has(value);
}

// ── Device classification (coarse, UA-based — same tiers as /api/tracking/listing-view) ──

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export function classifyDeviceType(userAgent: string | null | undefined): DeviceType {
  const ua = userAgent || '';
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  if (/mobile|android|iphone/i.test(ua)) return 'mobile';
  return 'desktop';
}

// ── Referrer hygiene + source classification ─────────────────────────────

/** Host-only view of a referrer URL — never persist paths/queries (PII hygiene). */
export function referrerHostOnly(referrer: string | null | undefined): string | null {
  if (!referrer || typeof referrer !== 'string') return null;
  try {
    const host = new URL(referrer).hostname;
    return host || null;
  } catch {
    return null;
  }
}

export type DerivedSource = 'agent-link' | 'email' | 'google' | 'social' | 'direct' | 'other';

const SEARCH_HOSTS = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com|ecosia\.org|search\.brave\.com)$/i;
const SOCIAL_HOSTS = /(^|\.)(facebook\.com|instagram\.com|twitter\.com|x\.com|t\.co|linkedin\.com|lnkd\.in|tiktok\.com|pinterest\.com|reddit\.com|threads\.net|youtube\.com|youtu\.be|nextdoor\.com|whatsapp\.com|wa\.me)$/i;
const WEBMAIL_HOSTS = /(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|mail\.yahoo\.com|mail\.aol\.com|mail\.proton\.me|icloud\.com)$/i;

/**
 * Server-derived traffic source. Precedence:
 *   agent-link (Mallan-issued agent UTM) → email → search → social →
 *   direct (no/self referrer) → other.
 */
export function classifyReferrerSource(input: {
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  siteHost?: string | null;
}): DerivedSource {
  const utmSource = (input.utmSource || '').toLowerCase();
  const utmMedium = (input.utmMedium || '').toLowerCase();
  if (utmSource === 'agent' || utmMedium === 'agent-link' || utmMedium === 'agent_link') {
    return 'agent-link';
  }
  if (utmMedium === 'email' || utmSource === 'email') return 'email';

  const host = referrerHostOnly(input.referrer);
  if (!host) return 'direct';
  if (WEBMAIL_HOSTS.test(host)) return 'email';
  if (SEARCH_HOSTS.test(host)) return 'google';
  if (SOCIAL_HOSTS.test(host)) return 'social';
  const site = (input.siteHost || '').toLowerCase();
  if (site && (host.toLowerCase() === site || host.toLowerCase().endsWith(`.${site}`))) {
    return 'direct'; // internal navigation
  }
  return 'other';
}

// ── Metadata PII rejection ────────────────────────────────────────────────

const PII_KEY_PATTERN = /(name|email|e-mail|phone|tel|mobile|address|contact|ssn|dob|birth)/i;
const EMAIL_VALUE_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const LONG_DIGIT_RUN = /\d[\d\s().-]{8,}\d/;
const MAX_METADATA_KEYS = 10;
const MAX_METADATA_STRING = 200;

/**
 * Strip anything PII-shaped from client-supplied metadata. Shallow scalars
 * only; PII-named keys dropped; email-shaped / long-digit-run values dropped;
 * strings capped at 200 chars; at most 10 keys. Returns null when nothing
 * survives (store NULL, not `{}`).
 */
export function sanitizeEventMetadata(input: unknown): Record<string, string | number | boolean> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: Record<string, string | number | boolean> = {};
  let kept = 0;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (kept >= MAX_METADATA_KEYS) break;
    if (PII_KEY_PATTERN.test(key)) continue;
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      out[key] = value;
      kept++;
      continue;
    }
    if (typeof value === 'string') {
      if (EMAIL_VALUE_PATTERN.test(value) || LONG_DIGIT_RUN.test(value)) continue;
      out[key] = value.slice(0, MAX_METADATA_STRING);
      kept++;
    }
    // objects / arrays / functions / symbols: dropped (shallow scalars only)
  }
  return kept > 0 ? out : null;
}

// ── Payload validation (strict hand validation, zod-free per repo pattern) ──

/** visitor_id / session_id: opaque client UUIDs — 8–64 chars of [A-Za-z0-9_-]. */
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
/** listing_id: Trestle ListingId or SL-/RL- internal key — 1–64 safe chars. */
const LISTING_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const MAX_UTM_LENGTH = 128;
const MAX_REFERRER_LENGTH = 2048;

export interface ValidatedListingEvent {
  listingId: string;
  eventType: ListingEventType;
  visitorId: string;
  sessionId: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null; // raw client-reported referrer URL (host-only is derived at write time)
  metadata: Record<string, string | number | boolean> | null;
}

function optionalCappedString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * Validate an anonymous beacon body. Returns null on ANY defect — the route
 * answers 204 either way (no validation oracle for probers).
 */
export function validateListingEventPayload(body: unknown): ValidatedListingEvent | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;

  if (!isListingEventType(b.event_type)) return null;
  if (typeof b.listing_id !== 'string' || !LISTING_ID_PATTERN.test(b.listing_id)) return null;
  if (typeof b.visitor_id !== 'string' || !CLIENT_ID_PATTERN.test(b.visitor_id)) return null;
  if (typeof b.session_id !== 'string' || !CLIENT_ID_PATTERN.test(b.session_id)) return null;

  return {
    listingId: b.listing_id,
    eventType: b.event_type,
    visitorId: b.visitor_id,
    sessionId: b.session_id,
    utmSource: optionalCappedString(b.utm_source, MAX_UTM_LENGTH),
    utmMedium: optionalCappedString(b.utm_medium, MAX_UTM_LENGTH),
    utmCampaign: optionalCappedString(b.utm_campaign, MAX_UTM_LENGTH),
    referrer: optionalCappedString(b.referrer, MAX_REFERRER_LENGTH),
    metadata: sanitizeEventMetadata(b.metadata),
  };
}
