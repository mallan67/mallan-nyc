/**
 * SELLER-002 — client-side listing-event helpers (first-party analytics only).
 *
 * Privacy model (Maya spec, 2026-07-03):
 *  - visitor_id: random UUID persisted in localStorage under `mallan_vid`;
 *  - session_id: random UUID persisted in sessionStorage under `mallan_sid`;
 *  - NO fingerprinting, NO cookies, NO third-party scripts;
 *  - listing_view fires at most ONCE per session per listing;
 *  - transport: navigator.sendBeacon with fetch(keepalive) fallback; every
 *    path is wrapped so tracking can NEVER break the page.
 *
 * The capture endpoint is fail-closed behind LISTING_EVENTS_ENABLED and always
 * answers 204 — the client fires unconditionally and the server decides.
 *
 * Helpers are pure / storage-injectable so they are unit-testable without a DOM.
 */

export const VISITOR_ID_KEY = 'mallan_vid';
export const SESSION_ID_KEY = 'mallan_sid';
export const TRACK_ENDPOINT = '/api/track/listing-event';

const UUID_SHAPE = /^[A-Za-z0-9_-]{8,64}$/;

function randomUuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  // RFC-4122-ish fallback (non-crypto) — an opaque correlation id, not a secret.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Read-or-mint an opaque id in the given Web Storage. Returns null when
 * storage is unavailable (private mode / blocked) — tracking then degrades
 * silently (the server drops id-less beacons).
 */
export function getOrCreateId(storage: Storage, key: string): string | null {
  try {
    const existing = storage.getItem(key);
    if (existing && UUID_SHAPE.test(existing)) return existing;
    const fresh = randomUuid();
    storage.setItem(key, fresh);
    return fresh;
  } catch {
    return null;
  }
}

// ── once-per-session listing_view ─────────────────────────────────────────

export function viewOnceKey(listingId: string): string {
  return `mallan_lv_${listingId}`;
}

export function shouldFireViewOnce(sessionStore: Storage, listingId: string): boolean {
  try {
    return sessionStore.getItem(viewOnceKey(listingId)) === null;
  } catch {
    return false; // storage broken → do not spam repeat views
  }
}

export function markViewFired(sessionStore: Storage, listingId: string): void {
  try {
    sessionStore.setItem(viewOnceKey(listingId), '1');
  } catch {
    /* ignore */
  }
}

// ── UTM extraction (source/medium/campaign only, per spec) ────────────────

export interface UtmParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export function parseUtmParams(search: string): UtmParams {
  const out: UtmParams = {};
  try {
    const params = new URLSearchParams(search || '');
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign'] as const) {
      const value = params.get(key);
      if (value && value.trim()) out[key] = value.trim().slice(0, 128);
    }
  } catch {
    /* ignore */
  }
  return out;
}

// ── Wire payload ──────────────────────────────────────────────────────────

export interface ListingEventWirePayload {
  listing_id: string;
  event_type: string;
  visitor_id?: string;
  session_id?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export function buildEventPayload(input: {
  listingId: string;
  eventType: string;
  visitorId: string | null;
  sessionId: string | null;
  referrer: string;
  search: string;
}): ListingEventWirePayload {
  const payload: ListingEventWirePayload = {
    listing_id: input.listingId,
    event_type: input.eventType,
    ...parseUtmParams(input.search),
  };
  if (input.visitorId) payload.visitor_id = input.visitorId;
  if (input.sessionId) payload.session_id = input.sessionId;
  if (input.referrer) payload.referrer = input.referrer;
  return payload;
}

// ── Browser transport (DOM glue — intentionally thin) ─────────────────────

/**
 * Fire a listing event from the browser. Never throws; never blocks the page.
 * sendBeacon first (survives unload), fetch(keepalive) fallback.
 */
export function fireListingEvent(listingId: string, eventType: string): void {
  try {
    if (typeof window === 'undefined') return;
    const payload = buildEventPayload({
      listingId,
      eventType,
      visitorId: getOrCreateId(window.localStorage, VISITOR_ID_KEY),
      sessionId: getOrCreateId(window.sessionStorage, SESSION_ID_KEY),
      referrer: typeof document !== 'undefined' ? document.referrer || '' : '',
      search: window.location.search || '',
    });
    const body = JSON.stringify(payload);
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const ok = navigator.sendBeacon(
        TRACK_ENDPOINT,
        new Blob([body], { type: 'application/json' })
      );
      if (ok) return;
    }
    void fetch(TRACK_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* tracking must never break the page */
  }
}

/** Fire listing_view at most once per session for this listing. */
export function fireListingViewOnce(listingId: string): void {
  try {
    if (typeof window === 'undefined') return;
    if (!shouldFireViewOnce(window.sessionStorage, listingId)) return;
    markViewFired(window.sessionStorage, listingId);
    fireListingEvent(listingId, 'listing_view');
  } catch {
    /* ignore */
  }
}
