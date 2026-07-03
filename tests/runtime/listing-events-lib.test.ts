/// <reference types="jest" />
/**
 * SELLER-002 — public listing event tracking: pure server-lib contract.
 *
 * Locks the Maya-directed spec (registry SELLER-002, 2026-07-03):
 *  - exactly 11 public event types, allowlisted (fail-closed);
 *  - LISTING_EVENTS_ENABLED read fail-closed (absent / anything-but-"true" = OFF),
 *    pattern-matched to lib/retention/archive-controls.ts (PR #470);
 *  - anonymous visitor_id / session_id validated by shape, NEVER fingerprinted;
 *  - metadata accepts NO PII (name/email/phone keys stripped; email-shaped or
 *    long-digit-run values stripped) — SHIELD/TCPA hygiene;
 *  - referrer stored host-only (no paths/queries — PII hygiene);
 *  - derived source classification: agent-link | email | google | social | direct | other;
 *  - coarse device classification from UA: mobile | tablet | desktop.
 */

import {
  LISTING_EVENT_TYPES,
  LISTING_EVENTS_ENABLED_FLAG,
  listingEventsEnabled,
  isListingEventType,
  classifyDeviceType,
  classifyReferrerSource,
  referrerHostOnly,
  sanitizeEventMetadata,
  validateListingEventPayload,
} from '@/lib/tracking/listing-events';

describe('SELLER-002 listing-events pure lib', () => {
  // ── Event allowlist ──────────────────────────────────────────────
  describe('event type allowlist', () => {
    it('contains exactly the 11 Maya-spec events', () => {
      expect([...LISTING_EVENT_TYPES].sort()).toEqual(
        [
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
        ].sort()
      );
      expect(LISTING_EVENT_TYPES).toHaveLength(11);
    });

    it('isListingEventType accepts only allowlisted values (fail-closed)', () => {
      expect(isListingEventType('listing_view')).toBe(true);
      expect(isListingEventType('share_click')).toBe(true);
      expect(isListingEventType('owner_report_view')).toBe(false); // Phase-3 internal, NOT public
      expect(isListingEventType('LISTING_VIEW')).toBe(false); // no case coercion
      expect(isListingEventType('')).toBe(false);
      expect(isListingEventType('drop table')).toBe(false);
      expect(isListingEventType(undefined)).toBe(false);
      expect(isListingEventType(42)).toBe(false);
    });
  });

  // ── Fail-closed rollout flag ─────────────────────────────────────
  describe('LISTING_EVENTS_ENABLED fail-closed flag', () => {
    it('names the exact env var', () => {
      expect(LISTING_EVENTS_ENABLED_FLAG).toBe('LISTING_EVENTS_ENABLED');
    });

    it('is OFF when absent', () => {
      expect(listingEventsEnabled({})).toBe(false);
    });

    it.each(['false', 'TRUE', 'True', '1', 'yes', 'on', ' true', 'true '])(
      'is OFF for %j (only the exact string "true" enables)',
      (v) => {
        expect(listingEventsEnabled({ LISTING_EVENTS_ENABLED: v })).toBe(false);
      }
    );

    it('is ON only for the exact string "true"', () => {
      expect(listingEventsEnabled({ LISTING_EVENTS_ENABLED: 'true' })).toBe(true);
    });
  });

  // ── Device classification ────────────────────────────────────────
  describe('classifyDeviceType', () => {
    it('classifies iPhone as mobile', () => {
      expect(
        classifyDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
      ).toBe('mobile');
    });
    it('classifies Android phone as mobile', () => {
      expect(classifyDeviceType('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile')).toBe('mobile');
    });
    it('classifies iPad as tablet', () => {
      expect(classifyDeviceType('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet');
    });
    it('classifies desktop UA as desktop', () => {
      expect(
        classifyDeviceType('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0')
      ).toBe('desktop');
    });
    it('empty / missing UA falls back to desktop', () => {
      expect(classifyDeviceType('')).toBe('desktop');
      expect(classifyDeviceType(null)).toBe('desktop');
    });
  });

  // ── Referrer host hygiene ────────────────────────────────────────
  describe('referrerHostOnly', () => {
    it('keeps host only, drops path + query (PII hygiene)', () => {
      expect(
        referrerHostOnly('https://www.google.com/search?q=400+east+90th+street+4d+maya')
      ).toBe('www.google.com');
    });
    it('returns null for garbage / empty', () => {
      expect(referrerHostOnly('not a url')).toBeNull();
      expect(referrerHostOnly('')).toBeNull();
      expect(referrerHostOnly(null)).toBeNull();
    });
  });

  // ── Source classification ────────────────────────────────────────
  describe('classifyReferrerSource', () => {
    it('agent-link wins when utm_source=agent', () => {
      expect(
        classifyReferrerSource({ referrer: 'https://mail.google.com/x', utmSource: 'agent' })
      ).toBe('agent-link');
    });
    it('email when utm_medium=email', () => {
      expect(
        classifyReferrerSource({ referrer: null, utmMedium: 'email' })
      ).toBe('email');
    });
    it('email for webmail referrer hosts', () => {
      expect(classifyReferrerSource({ referrer: 'https://mail.google.com/mail/u/0' })).toBe('email');
    });
    it('google for search-engine referrers', () => {
      expect(classifyReferrerSource({ referrer: 'https://www.google.com/search?q=x' })).toBe('google');
      expect(classifyReferrerSource({ referrer: 'https://www.bing.com/search?q=x' })).toBe('google');
    });
    it('social for social-network referrers', () => {
      expect(classifyReferrerSource({ referrer: 'https://www.instagram.com/p/abc' })).toBe('social');
      expect(classifyReferrerSource({ referrer: 'https://l.facebook.com/l.php?u=x' })).toBe('social');
      expect(classifyReferrerSource({ referrer: 'https://t.co/xyz' })).toBe('social');
    });
    it('direct when no referrer and no utm', () => {
      expect(classifyReferrerSource({ referrer: null })).toBe('direct');
      expect(classifyReferrerSource({ referrer: '' })).toBe('direct');
    });
    it('direct for same-site referrer (internal navigation)', () => {
      expect(
        classifyReferrerSource({ referrer: 'https://mallan.nyc/for-sale', siteHost: 'mallan.nyc' })
      ).toBe('direct');
    });
    it('other for unrecognized external referrers', () => {
      expect(classifyReferrerSource({ referrer: 'https://someblog.example.com/post' })).toBe('other');
    });
  });

  // ── Metadata PII rejection ───────────────────────────────────────
  describe('sanitizeEventMetadata (no PII accepted)', () => {
    it('returns null for non-objects', () => {
      expect(sanitizeEventMetadata(undefined)).toBeNull();
      expect(sanitizeEventMetadata(null)).toBeNull();
      expect(sanitizeEventMetadata('str')).toBeNull();
      expect(sanitizeEventMetadata([1, 2])).toBeNull();
    });

    it('strips PII-named keys (name/email/phone/address variants)', () => {
      const out = sanitizeEventMetadata({
        name: 'Jane Roe',
        first_name: 'Jane',
        email: 'jane@example.com',
        phone: '646-258-4460',
        address: '400 E 90th',
        photoIndex: 3,
      });
      expect(out).toEqual({ photoIndex: 3 });
    });

    it('strips values that look like emails or long digit runs', () => {
      const out = sanitizeEventMetadata({
        note: 'reach me at jane@example.com',
        cb: 'call 6462584460 now',
        tab: 'floorplan',
      });
      expect(out).toEqual({ tab: 'floorplan' });
    });

    it('keeps only shallow scalar values and caps count/length', () => {
      const out = sanitizeEventMetadata({
        nested: { a: 1 },
        fn: () => 1,
        ok: true,
        n: 12,
        s: 'x'.repeat(500),
      });
      expect(out).not.toBeNull();
      expect(Object.keys(out as object)).toEqual(['ok', 'n', 's']);
      expect(((out as Record<string, unknown>).s as string).length).toBeLessThanOrEqual(200);
    });

    it('returns null when nothing survives', () => {
      expect(sanitizeEventMetadata({ email: 'a@b.c' })).toBeNull();
    });
  });

  // ── Payload validation (strict hand validation, zod-free) ────────
  describe('validateListingEventPayload', () => {
    const valid = {
      listing_id: 'SL-0007',
      event_type: 'listing_view',
      visitor_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      session_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    };

    it('accepts a minimal valid payload', () => {
      const out = validateListingEventPayload(valid);
      expect(out).not.toBeNull();
      expect(out?.listingId).toBe('SL-0007');
      expect(out?.eventType).toBe('listing_view');
    });

    it('rejects non-allowlisted event_type', () => {
      expect(validateListingEventPayload({ ...valid, event_type: 'pwn' })).toBeNull();
    });

    it('rejects missing / malformed visitor_id and session_id', () => {
      expect(validateListingEventPayload({ ...valid, visitor_id: undefined })).toBeNull();
      expect(validateListingEventPayload({ ...valid, visitor_id: 'short' })).toBeNull();
      expect(validateListingEventPayload({ ...valid, session_id: 'has spaces in it……' })).toBeNull();
      expect(
        validateListingEventPayload({ ...valid, visitor_id: 'x'.repeat(80) })
      ).toBeNull();
    });

    it('rejects missing or oversized listing_id', () => {
      expect(validateListingEventPayload({ ...valid, listing_id: '' })).toBeNull();
      expect(validateListingEventPayload({ ...valid, listing_id: 'X'.repeat(80) })).toBeNull();
      expect(validateListingEventPayload({ ...valid, listing_id: 123 })).toBeNull();
    });

    it('trims + caps utm fields, drops non-strings', () => {
      const out = validateListingEventPayload({
        ...valid,
        utm_source: '  instagram  ',
        utm_medium: 'organic',
        utm_campaign: 'c'.repeat(300),
        referrer: 'https://www.instagram.com/p/abc?igshid=secret',
      });
      expect(out?.utmSource).toBe('instagram');
      expect(out?.utmMedium).toBe('organic');
      expect((out?.utmCampaign ?? '').length).toBeLessThanOrEqual(128);
    });

    it('sanitizes metadata inside the payload (PII stripped)', () => {
      const out = validateListingEventPayload({
        ...valid,
        metadata: { email: 'a@b.c', tab: 'video' },
      });
      expect(out?.metadata).toEqual({ tab: 'video' });
    });
  });
});
