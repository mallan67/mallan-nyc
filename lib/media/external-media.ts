/**
 * CANONICAL EXTERNAL-MEDIA DOMAIN — the single authority for hosted video /
 * virtual-tour / 3D references.
 *
 * Cotality supplies these on the PROPERTY resource through six VirtualTourURL*
 * slots. They are LINKS to third-party hosts, not transferable assets: they
 * belong in `listing_external_media`, never in R2, and never as permanent
 * raw_data JSON. Real binary assets stay in `listing_media`.
 *
 * This module owns slot constants, ordering, URL SAFETY and CLASSIFICATION.
 * Those last two are deliberately separate concerns (see `isSafeExternalUrl`).
 * Every writer must derive `kind` here — the DB CHECK restricts vocabulary
 * only, it cannot tell whether a URL is genuinely a tour.
 */

export type ExternalMediaKind = 'video' | 'virtual_tour' | 'unknown';
export type ExternalMediaSource = 'cotality_property' | 'crm';

/** The six verified live Cotality Property slots, in public presentation order:
 *  unbranded before branded (UCBA unbranded-first), then provider slot 1 -> 2 -> 3. */
export const COTALITY_TOUR_SLOTS = [
  { key: 'VirtualTourURLUnbranded',  branded: false, slot: 1 },
  { key: 'VirtualTourURLUnbranded2', branded: false, slot: 2 },
  { key: 'VirtualTourURLUnbranded3', branded: false, slot: 3 },
  { key: 'VirtualTourURLBranded',    branded: true,  slot: 1 },
  { key: 'VirtualTourURLBranded2',   branded: true,  slot: 2 },
  { key: 'VirtualTourURLBranded3',   branded: true,  slot: 3 },
] as const;

export type CotalityTourSlot = (typeof COTALITY_TOUR_SLOTS)[number]['key'];

const COTALITY_SLOT_KEYS: ReadonlySet<string> = new Set(COTALITY_TOUR_SLOTS.map((s) => s.key));

/** Fail closed: an unrecognized Cotality field name must never become canonical
 *  authority. Mirrors the DB CHECK on (source='cotality_property', source_key). */
export function isCotalityTourSlot(key: string): key is CotalityTourSlot {
  return COTALITY_SLOT_KEYS.has(key);
}

/**
 * URL SAFETY — distinct from classification.
 *
 * `unknown` means "usable external URL whose media class is unproven". It must
 * NOT mean unsafe. `javascript:`, `data:`, protocol-relative and malformed
 * values are rejected here and never reach an iframe, anchor or player.
 * A SafeLinks https URL IS safe; that still does not make it a tour.
 */
export function isSafeExternalUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  if (!s) return false;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return false;
  }
  return u.protocol === 'http:' || u.protocol === 'https:';
}

const VIDEO_HOSTS = [
  'youtube.com', 'youtu.be', 'youtube-nocookie.com',
  'vimeo.com', 'player.vimeo.com',
  'wistia.com', 'wistia.net', 'brightcove.net', 'dailymotion.com',
  'videodelivery.net', 'iframe.videodelivery.net',
];
const VIDEO_FILE_EXT = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;

const TOUR_HOSTS = [
  'matterport.com', 'my.matterport.com',
  'iguide.io', 'youriguide.com',
  'kuula.co', 'asteroom.com', 'eyespy360.com', 'cupix.com',
  'insidemaps.com', 'truplace.com', 'nodalview.com', 'listing3d.com',
];

function hostMatches(host: string, list: readonly string[]): boolean {
  return list.some((h) => host === h || host.endsWith('.' + h));
}

/**
 * Classification requires AFFIRMATIVE evidence. Anything unverified stays
 * `unknown` — a Zillow link, a brokerage domain, a SafeLinks wrapper or an
 * unfamiliar CDN is NEVER coerced to `virtual_tour` merely because it is not a
 * known video host. Measured on 500 live Cotality URLs (2026-08-12):
 * 404 video / 67 virtual_tour / 29 unknown.
 */
export function classifyExternalMediaUrl(raw: unknown): ExternalMediaKind {
  if (!isSafeExternalUrl(raw)) return 'unknown';
  let host: string;
  try {
    host = new URL(raw).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return 'unknown';
  }
  if (hostMatches(host, VIDEO_HOSTS) || VIDEO_FILE_EXT.test(raw)) return 'video';
  if (hostMatches(host, TOUR_HOSTS)) return 'virtual_tour';
  return 'unknown';
}

export interface DesiredExternalMediaRow {
  listing_id: string;
  source: ExternalMediaSource;
  source_key: string;
  url: string;
  branded: boolean;
  kind: ExternalMediaKind;
}

/**
 * Desired canonical state for one listing from a raw Cotality Property record.
 * Source-faithful: every populated slot yields its own row, because identity IS
 * the slot. Cotality repeating one URL across slots is preserved here and
 * deduped only at presentation (see `dedupeForPresentation`).
 * Unsafe URLs are dropped entirely — they are not storable current state.
 */
export function buildDesiredCotalityExternalMedia(
  listingId: string,
  property: Record<string, unknown>,
): DesiredExternalMediaRow[] {
  const rows: DesiredExternalMediaRow[] = [];
  for (const slot of COTALITY_TOUR_SLOTS) {
    const value = property[slot.key];
    if (!isSafeExternalUrl(value)) continue;
    rows.push({
      listing_id: listingId,
      source: 'cotality_property',
      source_key: slot.key,
      url: value.trim(),
      branded: slot.branded,
      kind: classifyExternalMediaUrl(value),
    });
  }
  return rows;
}

/**
 * PRESENTATION dedupe — never applied to stored state. The same YouTube or
 * Matterport URL must not render twice because Cotality repeated it across
 * slots. An unbranded row wins over an equivalent branded duplicate (UCBA
 * unbranded-first); otherwise the lower provider slot wins.
 */
export function dedupeForPresentation<T extends DesiredExternalMediaRow>(rows: readonly T[]): T[] {
  const rank = (r: T) => {
    const slot = COTALITY_TOUR_SLOTS.find((s) => s.key === r.source_key);
    return (r.branded ? 10 : 0) + (slot ? slot.slot : 9);
  };
  const best = new Map<string, T>();
  for (const r of rows) {
    const id = r.url.trim().toLowerCase();
    const cur = best.get(id);
    if (!cur || rank(r) < rank(cur)) best.set(id, r);
  }
  return Array.from(best.values());
}

/** A stored row as read back from `listing_external_media`. */
export interface StoredExternalMediaRow extends DesiredExternalMediaRow {
  source: ExternalMediaSource;
}

export interface ExternalMediaDiff {
  inserts: DesiredExternalMediaRow[];
  updates: DesiredExternalMediaRow[];
  deletes: Array<Pick<StoredExternalMediaRow, 'listing_id' | 'source' | 'source_key'>>;
}

const identity = (r: { listing_id: string; source: string; source_key: string }) =>
  `${r.listing_id} ${r.source} ${r.source_key}`;

/**
 * Pure diff. Produces ONLY actual mutations — an unchanged row appears in no
 * set, which is what keeps steady Cotality state at zero writes and leaves
 * `updated_at` untouched.
 *
 * CRM-owned rows are invisible to Cotality convergence: never updated, never
 * proposed for deletion, so a `crm` row cannot be destroyed because a Property
 * record lacks an equivalent slot.
 */
export function diffExternalMedia(
  existing: readonly StoredExternalMediaRow[],
  desired: readonly DesiredExternalMediaRow[],
): ExternalMediaDiff {
  const scoped = existing.filter((r) => r.source === 'cotality_property');
  const byId = new Map(scoped.map((r) => [identity(r), r]));
  const desiredIds = new Set(desired.map(identity));

  const inserts: DesiredExternalMediaRow[] = [];
  const updates: DesiredExternalMediaRow[] = [];

  for (const d of desired) {
    const cur = byId.get(identity(d));
    if (!cur) {
      inserts.push(d);
    } else if (cur.url !== d.url || cur.branded !== d.branded || cur.kind !== d.kind) {
      updates.push(d);
    }
    // identical -> no mutation, deliberately absent from every set
  }

  const deletes = scoped
    .filter((r) => !desiredIds.has(identity(r)))
    .map((r) => ({ listing_id: r.listing_id, source: r.source, source_key: r.source_key }));

  return { inserts, updates, deletes };
}

/** True when convergence would issue no SQL at all — the cost invariant. */
export function isNoOpDiff(d: ExternalMediaDiff): boolean {
  return d.inserts.length === 0 && d.updates.length === 0 && d.deletes.length === 0;
}
