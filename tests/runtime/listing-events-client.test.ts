/// <reference types="jest" />
/**
 * SELLER-002 — client-side tracking helpers (pure, storage-injectable).
 *
 * First-party only: visitor_id is a random UUID in localStorage (mallan_vid),
 * session_id a random UUID in sessionStorage (mallan_sid). NO fingerprinting,
 * NO third-party scripts, NO cookies. listing_view fires at most once per
 * session per listing.
 */

import {
  VISITOR_ID_KEY,
  SESSION_ID_KEY,
  getOrCreateId,
  viewOnceKey,
  shouldFireViewOnce,
  markViewFired,
  parseUtmParams,
  buildEventPayload,
  shareBarTrackEvent,
} from '@/lib/tracking/listing-events-client';

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  };
}

describe('SELLER-002 client tracking helpers', () => {
  it('uses the spec storage keys', () => {
    expect(VISITOR_ID_KEY).toBe('mallan_vid');
    expect(SESSION_ID_KEY).toBe('mallan_sid');
  });

  describe('getOrCreateId', () => {
    it('creates a UUID-shaped id and persists it', () => {
      const store = fakeStorage();
      const id = getOrCreateId(store, VISITOR_ID_KEY);
      expect(id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(store.getItem(VISITOR_ID_KEY)).toBe(id);
    });

    it('returns the existing id when present (stable across calls)', () => {
      const store = fakeStorage({ mallan_vid: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' });
      expect(getOrCreateId(store, VISITOR_ID_KEY)).toBe('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');
    });

    it('replaces a corrupted stored value instead of sending garbage', () => {
      const store = fakeStorage({ mallan_vid: '<script>alert(1)</script>' });
      const id = getOrCreateId(store, VISITOR_ID_KEY);
      expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('returns null when storage throws (private mode) — tracking degrades silently', () => {
      const broken = {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
      } as unknown as Storage;
      expect(getOrCreateId(broken, VISITOR_ID_KEY)).toBeNull();
    });
  });

  describe('once-per-session listing_view', () => {
    it('fires the first time, never again for the same listing in the same session', () => {
      const session = fakeStorage();
      expect(shouldFireViewOnce(session, 'SL-0007')).toBe(true);
      markViewFired(session, 'SL-0007');
      expect(shouldFireViewOnce(session, 'SL-0007')).toBe(false);
    });

    it('tracks per listing (a second listing still fires)', () => {
      const session = fakeStorage();
      markViewFired(session, 'SL-0007');
      expect(shouldFireViewOnce(session, 'SL-0004')).toBe(true);
      expect(viewOnceKey('SL-0004')).not.toBe(viewOnceKey('SL-0007'));
    });
  });

  describe('parseUtmParams', () => {
    it('extracts source/medium/campaign', () => {
      expect(
        parseUtmParams('?utm_source=instagram&utm_medium=organic&utm_campaign=seller-SL-0007-202607')
      ).toEqual({
        utm_source: 'instagram',
        utm_medium: 'organic',
        utm_campaign: 'seller-SL-0007-202607',
      });
    });
    it('omits absent params and tolerates junk', () => {
      expect(parseUtmParams('?q=studio')).toEqual({});
      expect(parseUtmParams('')).toEqual({});
    });
  });

  describe('buildEventPayload', () => {
    it('assembles the wire payload the capture route validates', () => {
      const payload = buildEventPayload({
        listingId: 'SL-0007',
        eventType: 'save_click',
        visitorId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        sessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        referrer: 'https://www.google.com/search?q=x',
        search: '?utm_source=ig&utm_medium=social&utm_campaign=c1',
      });
      expect(payload).toEqual({
        listing_id: 'SL-0007',
        event_type: 'save_click',
        visitor_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        session_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        referrer: 'https://www.google.com/search?q=x',
        utm_source: 'ig',
        utm_medium: 'social',
        utm_campaign: 'c1',
      });
    });

    it('omits null ids rather than sending empty strings', () => {
      const payload = buildEventPayload({
        listingId: 'SL-0007',
        eventType: 'listing_view',
        visitorId: null,
        sessionId: null,
        referrer: '',
        search: '',
      });
      expect(payload.visitor_id).toBeUndefined();
      expect(payload.session_id).toBeUndefined();
      expect(payload.referrer).toBeUndefined();
    });
  });
});

describe('shareBarTrackEvent — SocialShareBar classification (Codex #473 r3)', () => {
  it('Email → email_click; true shares → share_click', () => {
    expect(shareBarTrackEvent('Email')).toBe('email_click');
    for (const n of ['Facebook', 'X', 'LinkedIn', 'WhatsApp']) expect(shareBarTrackEvent(n)).toBe('share_click');
  });
  it('YouTube channel link is NOT a listing share → external_link_click (metrics must not inflate share_click)', () => {
    expect(shareBarTrackEvent('YouTube')).toBe('external_link_click');
  });
});
