/**
 * CANONICAL EXTERNAL-MEDIA GUARDS — these must survive the later removal of the
 * raw_data tour/media dependency. Each maps to a binding guard.
 */
import {
  classifyExternalMediaUrl, isSafeExternalUrl, isCotalityTourSlot,
  buildDesiredCotalityExternalMedia, dedupeForPresentation, COTALITY_TOUR_SLOTS,
  diffExternalMedia, isNoOpDiff,
} from '@/lib/media/external-media';

describe('CLASS-B — known video hosts classify as video', () => {
  it.each([
    'https://www.youtube.com/watch?v=abc123',
    'https://youtu.be/abc123',
    'https://vimeo.com/123456',
    'https://player.vimeo.com/video/123456',
    'https://iframe.videodelivery.net/abc',
    'https://cdn.example.com/tour.mp4',
  ])('%s -> video', (u) => expect(classifyExternalMediaUrl(u)).toBe('video'));
});

describe('CLASS-C — known 3D/tour hosts classify as virtual_tour', () => {
  it.each([
    'https://my.matterport.com/show/?m=abc',
    'https://youriguide.com/abc',
    'https://kuula.co/share/abc',
    'https://listing3d.com/abc',
  ])('%s -> virtual_tour', (u) => expect(classifyExternalMediaUrl(u)).toBe('virtual_tour'));
});

describe('CLASS-A — unverified hosts stay unknown, never coerced', () => {
  // Every one of these appeared in the live 2026-08-12 Cotality sample and would
  // be published as a 3D tour by a not-video => virtualTour default.
  it.each([
    'https://www.zillow.com/homedetails/abc',
    'https://nexusrealtynyc.com/listing/abc',
    'https://nam02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.com',
    'https://some-unknown-cdn.example/embed/xyz',
  ])('%s -> unknown', (u) => {
    const k = classifyExternalMediaUrl(u);
    expect(k).toBe('unknown');
    expect(k).not.toBe('virtual_tour');
    expect(k).not.toBe('video');
  });
});

describe('URL SAFETY is separate from classification', () => {
  it('rejects non-http(s) and malformed values', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html;base64,AAA', '//evil.example/x', 'not a url', '', null, undefined, 42]) {
      expect(isSafeExternalUrl(bad as unknown)).toBe(false);
    }
  });
  it('a SafeLinks https URL is SAFE but still unknown', () => {
    const u = 'https://nam02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.com';
    expect(isSafeExternalUrl(u)).toBe(true);
    expect(classifyExternalMediaUrl(u)).toBe('unknown');
  });
  it('unsafe URLs are dropped from desired state entirely', () => {
    const rows = buildDesiredCotalityExternalMedia('SL-1', { VirtualTourURLUnbranded: 'javascript:alert(1)' });
    expect(rows).toHaveLength(0);
  });
});

describe('SOURCE-A — Cotality slot identity fails closed', () => {
  it('accepts exactly the six verified slots', () => {
    expect(COTALITY_TOUR_SLOTS).toHaveLength(6);
    for (const s of COTALITY_TOUR_SLOTS) expect(isCotalityTourSlot(s.key)).toBe(true);
  });
  it('rejects an unrecognized Cotality field name', () => {
    for (const bad of ['VirtualTourURLUnbranded4', 'PhotosCount', 'VideosCount', '']) {
      expect(isCotalityTourSlot(bad)).toBe(false);
    }
  });
  it('an unrecognized field on the Property record creates no row', () => {
    const rows = buildDesiredCotalityExternalMedia('SL-1', {
      VirtualTourURLUnbranded4: 'https://youtu.be/x',
      SomeOtherField: 'https://youtu.be/y',
    });
    expect(rows).toHaveLength(0);
  });
});

describe('canonical rows are source-faithful; dedupe is presentation-only', () => {
  const SAME = 'https://youtu.be/abc123';
  const prop = { VirtualTourURLUnbranded: SAME, VirtualTourURLBranded: SAME, VirtualTourURLUnbranded2: 'https://my.matterport.com/show/?m=z' };

  it('stores every populated slot even when the URL repeats', () => {
    const rows = buildDesiredCotalityExternalMedia('SL-1', prop);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.source_key).sort()).toEqual(
      ['VirtualTourURLBranded', 'VirtualTourURLUnbranded', 'VirtualTourURLUnbranded2']);
    expect(rows.every((r) => r.source === 'cotality_property')).toBe(true);
  });

  it('presentation dedupes the repeated URL and unbranded wins', () => {
    const shown = dedupeForPresentation(buildDesiredCotalityExternalMedia('SL-1', prop));
    expect(shown).toHaveLength(2);
    const yt = shown.find((r) => r.url === SAME)!;
    expect(yt.branded).toBe(false);
    expect(yt.source_key).toBe('VirtualTourURLUnbranded');
  });

  it('derives kind per row through the canonical classifier', () => {
    const rows = buildDesiredCotalityExternalMedia('SL-1', prop);
    expect(rows.find((r) => r.source_key === 'VirtualTourURLUnbranded2')!.kind).toBe('virtual_tour');
    expect(rows.find((r) => r.source_key === 'VirtualTourURLUnbranded')!.kind).toBe('video');
  });
});

describe('DIFF — zero-write cost invariant and CRM isolation', () => {
  const base = { listing_id: 'SL-1', source: 'cotality_property' as const, branded: false, kind: 'video' as const };
  const row = (k: string, url: string, over = {}) => ({ ...base, source_key: k, url, ...over });

  it('identical state produces NO mutations at all', () => {
    const rows = [row('VirtualTourURLUnbranded', 'https://youtu.be/a')];
    const d = diffExternalMedia(rows, rows);
    expect(d).toEqual({ inserts: [], updates: [], deletes: [] });
    expect(isNoOpDiff(d)).toBe(true);
  });

  it('RUN-TWICE: second diff against the converged state is a no-op', () => {
    const desired = buildDesiredCotalityExternalMedia('SL-1', {
      VirtualTourURLUnbranded: 'https://youtu.be/a',
      VirtualTourURLUnbranded2: 'https://my.matterport.com/show/?m=z',
    });
    const first = diffExternalMedia([], desired);
    expect(first.inserts).toHaveLength(2);
    const converged = first.inserts.map((r) => ({ ...r, source: 'cotality_property' as const }));
    expect(isNoOpDiff(diffExternalMedia(converged, desired))).toBe(true);
  });

  it('new slot inserts only that slot', () => {
    const d = diffExternalMedia(
      [row('VirtualTourURLUnbranded', 'https://youtu.be/a')],
      [row('VirtualTourURLUnbranded', 'https://youtu.be/a'), row('VirtualTourURLUnbranded2', 'https://youtu.be/b')]);
    expect(d.inserts.map((r) => r.source_key)).toEqual(['VirtualTourURLUnbranded2']);
    expect(d.updates).toHaveLength(0);
    expect(d.deletes).toHaveLength(0);
  });

  it('changed URL updates only that slot', () => {
    const d = diffExternalMedia(
      [row('VirtualTourURLUnbranded', 'https://youtu.be/OLD'), row('VirtualTourURLUnbranded2', 'https://youtu.be/keep')],
      [row('VirtualTourURLUnbranded', 'https://youtu.be/NEW'), row('VirtualTourURLUnbranded2', 'https://youtu.be/keep')]);
    expect(d.updates.map((r) => r.source_key)).toEqual(['VirtualTourURLUnbranded']);
    expect(d.inserts).toHaveLength(0);
    expect(d.deletes).toHaveLength(0);
  });

  it('a changed CLASSIFICATION alone is a real update', () => {
    const d = diffExternalMedia(
      [row('VirtualTourURLUnbranded', 'https://x.example/a', { kind: 'unknown' })],
      [row('VirtualTourURLUnbranded', 'https://x.example/a', { kind: 'video' })]);
    expect(d.updates).toHaveLength(1);
  });

  it('vanished upstream slot deletes only that row', () => {
    const d = diffExternalMedia(
      [row('VirtualTourURLUnbranded', 'https://youtu.be/a'), row('VirtualTourURLUnbranded2', 'https://youtu.be/gone')],
      [row('VirtualTourURLUnbranded', 'https://youtu.be/a')]);
    expect(d.deletes.map((r) => r.source_key)).toEqual(['VirtualTourURLUnbranded2']);
    expect(d.inserts).toHaveLength(0);
    expect(d.updates).toHaveLength(0);
  });

  it('CRM rows are invisible to Cotality convergence', () => {
    const crm = { listing_id: 'SL-1', source: 'crm' as const, source_key: 'crm-em-7', url: 'https://vimeo.com/1', branded: false, kind: 'video' as const };
    const d = diffExternalMedia([crm, row('VirtualTourURLUnbranded', 'https://youtu.be/a')], []);
    expect(d.deletes.map((r) => r.source_key)).toEqual(['VirtualTourURLUnbranded']);
    expect(d.deletes.some((r) => r.source === 'crm')).toBe(false);
    expect(d.updates).toHaveLength(0);
  });

  it('a CRM row sharing a slot NAME is a distinct identity', () => {
    const crmSameName = { listing_id: 'SL-1', source: 'crm' as const, source_key: 'VirtualTourURLUnbranded', url: 'https://vimeo.com/9', branded: false, kind: 'video' as const };
    const d = diffExternalMedia([crmSameName], [row('VirtualTourURLUnbranded', 'https://youtu.be/a')]);
    expect(d.inserts).toHaveLength(1);
    expect(d.deletes).toHaveLength(0);
  });
});
