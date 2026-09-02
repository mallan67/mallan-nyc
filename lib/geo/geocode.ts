/**
 * Server-side geocoding for NYC addresses — Neon-QUIET request path.
 *
 * Trestle IDX Plus feed returns null for Latitude/Longitude.
 * This module assigns coordinates using:
 *   1. In-memory cache (warm serverless) — instant
 *   2. GEOCODE MANIFEST — the whole geocode_cache table via the shared data
 *      cache (≤1 bounded Neon read per revalidation window across ALL
 *      traffic; an ordinary anonymous request opens NO Neon connection)
 *   3. ZIP code centroids + deterministic jitter — instant fallback
 *
 * Neon-quiet (2026-07-23): the request-time US Census call and the
 * fire-and-forget `geocodeCache.upsert` writes were REMOVED from this
 * public read path (production evidence: 13,499 lifetime inserts came from
 * public traffic), and the per-request `findMany` was replaced by the
 * manifest. A public request must never write Neon — and no ordinary
 * anonymous request opens Neon for geocoding at all.
 *
 * ── DURABLE-POPULATION OPERATIONAL CONTRACT (scripts/batch-geocode.js) ──
 *   OWNER:    Maya (or an operator she designates). Never runs from public
 *             traffic; never scheduled without her explicit cron approval.
 *   TRIGGER:  run deliberately after a significant new-listing influx, or
 *             when listing maps visibly cluster on ZIP centroids. New
 *             addresses enter its queue automatically: it fetches active
 *             IDX listings live from Trestle and skips already-cached rows.
 *   RETRY:    the job is resumable and idempotent — a rerun IS the retry
 *             (failed/missing addresses are simply attempted again; cached
 *             rows are skipped).
 *   FRESHNESS SLA: best-effort. Until a run covers a new address, its pin
 *             sits on the deterministic ZIP-centroid approximation — the
 *             same fallback such addresses already received whenever the
 *             old 4-second Census budget expired.
 *   VERIFIED vs FALLBACK: verified coordinates exist ONLY in geocode_cache
 *             (source='census'). Centroid fallbacks are computed per
 *             request and never written anywhere. LIMITATION (documented,
 *             unchanged from before): the public payload itself does not
 *             label which coordinates are verified vs approximate.
 *   After a run, the manifest picks up new rows within one revalidation
 *   window (10 min), or immediately if the GEOCODE_MANIFEST_TAG is
 *   revalidated by an approved pathway.
 *
 * COMPLIANCE: Geocoding runs server-side only.
 */

// Shared singleton Prisma client — this module previously constructed a
// SECOND PrismaClient (its own pool + its own Neon connections). One
// client per runtime is the invariant.
import prisma from '@/lib/prisma';
import { cachedPublicRead, SYNC_CADENCE_SECONDS } from '@/lib/cache/public-cache';

// ── In-memory cache layer (warm serverless invocations) ──
const memCache = new Map<string, [number, number]>();

/**
 * GEOCODE MANIFEST (Neon-quiet 2026-07-23, distinct-address correction).
 *
 * A per-request `geocodeCache.findMany` — even read-only — still opened Neon
 * on every anonymous request whose addresses missed the in-memory map (every
 * cold serverless instance repeats it). The manifest loads the WHOLE
 * geocode_cache table (13.5k slim rows ≈ 0.7 MB) through the shared data
 * cache instead: at most ONE bounded Neon read per revalidation window
 * across ALL anonymous traffic, then zero. geocode_cache rows are permanent
 * (an address's coordinates don't change), so the 10-min fallback loses
 * nothing; the tag allows explicit invalidation after a batch-geocode run.
 */
export const GEOCODE_MANIFEST_TAG = 'geocode-manifest';

/** Deterministic keyset page size (address_key is the unique cursor). */
export const GEOCODE_PAGE_SIZE = 10000;
/** Explicit overflow ceiling: 20 pages = 200,000 rows (15× today's 13.5k).
 *  Past it the manifest build THROWS — an explicit failure, never a silently
 *  incomplete manifest substituting approximate coordinates. */
export const GEOCODE_MAX_PAGES = 20;

/**
 * COMPLETE manifest via deterministic keyset pagination — no fixed ceiling
 * can silently omit cached rows (the old take-50000 + console.error is
 * retired). Runs inside the cached wrapper, so the whole loop executes at
 * most once per revalidation window across all traffic.
 */
async function buildGeocodeManifest(): Promise<Array<[string, number, number]>> {
  const out: Array<[string, number, number]> = [];
  let cursor: string | null = null;
  for (let page = 0; page < GEOCODE_MAX_PAGES; page++) {
    const rows: Array<{ address_key: string; latitude: number; longitude: number }> =
      await prisma.geocodeCache.findMany({
        select: { address_key: true, latitude: true, longitude: true },
        orderBy: { address_key: 'asc' },
        take: GEOCODE_PAGE_SIZE,
        ...(cursor ? { cursor: { address_key: cursor }, skip: 1 } : {}),
      });
    for (const r of rows) out.push([r.address_key, r.latitude, r.longitude]);
    if (rows.length < GEOCODE_PAGE_SIZE) return out; // complete — last page
    cursor = rows[rows.length - 1].address_key;
  }
  throw new Error(
    `[geocode-manifest] OVERFLOW: more than ${GEOCODE_PAGE_SIZE * GEOCODE_MAX_PAGES} geocode_cache rows — refusing to serve an incomplete manifest (raise GEOCODE_MAX_PAGES deliberately).`,
  );
}

const getGeocodeManifest = cachedPublicRead(buildGeocodeManifest, ['geocode-manifest'], {
  tags: [GEOCODE_MANIFEST_TAG],
  revalidate: SYNC_CADENCE_SECONDS,
});

/** Normalize address into cache key */
function addressKey(streetNumber: string, streetName: string, zip: string): string {
  return `${streetNumber.trim()}|${streetName.trim().toUpperCase()}|${zip}`;
}

/** Deterministic hash-based jitter so same address always gets same offset */
function hashJitter(str: string): [number, number] {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  const latOff = ((h & 0xFFFF) / 0xFFFF - 0.5) * 0.002;
  const lngOff = (((h >> 16) & 0xFFFF) / 0xFFFF - 0.5) * 0.002;
  return [latOff, lngOff];
}

/**
 * Assign coordinates to listings that lack them.
 *
 * Strategy (READ-ONLY — see module header):
 *   1. Check in-memory cache (instant)
 *   2. Batch lookup from Neon DB cache (single READ query, 1s budget)
 *   3. ZIP centroid + deterministic jitter for anything still missing
 *
 * Mutates the input array for performance.
 */
export async function geocodeListings(
  listings: Array<{
    address: {
      streetNumber?: string;
      streetName?: string;
      postalCode?: string;
      city?: string;
      stateOrProvince?: string;
      latitude?: number | null;
      longitude?: number | null;
    };
  }>
): Promise<void> {
  // Collect listings needing geocoding
  const needsGeocode: typeof listings = [];
  for (const listing of listings) {
    const addr = listing.address;
    if (addr.latitude != null && addr.longitude != null && addr.latitude !== 0 && addr.longitude !== 0) continue;
    needsGeocode.push(listing);
  }
  if (needsGeocode.length === 0) return;

  // Step 1: Check in-memory cache
  const stillNeedDb: typeof listings = [];
  for (const listing of needsGeocode) {
    const addr = listing.address;
    const key = addressKey(addr.streetNumber || '', addr.streetName || '', (addr.postalCode || '').split('-')[0].trim());
    const cached = memCache.get(key);
    if (cached) {
      addr.latitude = cached[0];
      addr.longitude = cached[1];
    } else {
      stillNeedDb.push(listing);
    }
  }
  if (stillNeedDb.length === 0) return;

  // Step 2: Batch lookup from DB cache (READ ONLY)
  const keys = stillNeedDb.map(l => {
    const a = l.address;
    return addressKey(a.streetNumber || '', a.streetName || '', (a.postalCode || '').split('-')[0].trim());
  });

  const needsFallback: { listing: typeof listings[0]; key: string }[] = [];
  try {
    // 1.5s budget on the manifest — a cache HIT resolves in microseconds; only
    // a refill (≤1 per revalidation window across ALL traffic) touches Neon,
    // and a cold-Neon refill degrades to the ZIP fallback, not a stall.
    const manifest = await Promise.race([
      getGeocodeManifest(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('geocode manifest timeout')), 1500)),
    ]);
    const dbMap = new Map(manifest.map(([k, lat, lng]) => [k, [lat, lng] as [number, number]]));

    for (let i = 0; i < stillNeedDb.length; i++) {
      const listing = stillNeedDb[i];
      const key = keys[i];
      const coords = dbMap.get(key);
      if (coords) {
        listing.address.latitude = coords[0];
        listing.address.longitude = coords[1];
        memCache.set(key, coords);
      } else {
        needsFallback.push({ listing, key });
      }
    }
  } catch {
    // DB read failed or timed out — all go to ZIP fallback
    for (let i = 0; i < stillNeedDb.length; i++) {
      needsFallback.push({ listing: stillNeedDb[i], key: keys[i] });
    }
  }

  // Step 3: ZIP centroid fallback for anything still missing. Cache-miss
  // addresses stay on the centroid until scripts/batch-geocode.js is run —
  // the deliberate, bounded population path.
  for (const { listing, key } of needsFallback) {
    const addr = listing.address;
    if (addr.latitude != null && addr.longitude != null && addr.latitude !== 0 && addr.longitude !== 0) continue;

    const zip = (addr.postalCode || '').split('-')[0].trim();
    const centroid = ZIP_CENTROIDS[zip];
    if (centroid) {
      const jitter = hashJitter(key);
      addr.latitude = centroid[0] + jitter[0];
      addr.longitude = centroid[1] + jitter[1];
    }
  }
}

// ── NYC ZIP Code Centroids (instant fallback) ──
// Exported for use as last-resort fallback in listing pages when geocoding fails entirely.
export const ZIP_CENTROIDS: Record<string, [number, number]> = {
  // Manhattan
  '10001': [40.7506, -73.9971], '10002': [40.7157, -73.9863], '10003': [40.7317, -73.9893],
  '10004': [40.6988, -74.0384], '10005': [40.7069, -74.0089], '10006': [40.7094, -74.0131],
  '10007': [40.7135, -74.0078], '10009': [40.7265, -73.9793], '10010': [40.7390, -73.9826],
  '10011': [40.7418, -74.0002], '10012': [40.7258, -73.9981], '10013': [40.7199, -74.0029],
  '10014': [40.7340, -74.0054], '10016': [40.7459, -73.9781], '10017': [40.7524, -73.9729],
  '10018': [40.7551, -73.9930], '10019': [40.7651, -73.9863], '10020': [40.7587, -73.9787],
  '10021': [40.7693, -73.9588], '10022': [40.7586, -73.9676], '10023': [40.7764, -73.9825],
  '10024': [40.7885, -73.9762], '10025': [40.7988, -73.9680], '10026': [40.8019, -73.9533],
  '10027': [40.8117, -73.9532], '10028': [40.7764, -73.9539], '10029': [40.7919, -73.9441],
  '10030': [40.8185, -73.9430], '10031': [40.8252, -73.9496], '10032': [40.8381, -73.9424],
  '10033': [40.8498, -73.9345], '10034': [40.8667, -73.9253], '10035': [40.8008, -73.9351],
  '10036': [40.7593, -73.9903], '10037': [40.8138, -73.9378], '10038': [40.7091, -74.0023],
  '10039': [40.8256, -73.9369], '10040': [40.8583, -73.9299], '10044': [40.7616, -73.9504],
  '10065': [40.7645, -73.9632], '10069': [40.7759, -73.9900], '10075': [40.7710, -73.9565],
  '10103': [40.7614, -73.9776], '10110': [40.7533, -73.9803], '10111': [40.7590, -73.9775],
  '10112': [40.7589, -73.9810], '10115': [40.8107, -73.9643], '10119': [40.7507, -73.9930],
  '10128': [40.7816, -73.9500], '10280': [40.7110, -74.0164], '10282': [40.7167, -74.0145],
  // Brooklyn
  '11201': [40.6936, -73.9905], '11203': [40.6496, -73.9349], '11204': [40.6192, -73.9849],
  '11205': [40.6946, -73.9666], '11206': [40.7010, -73.9423], '11207': [40.6617, -73.8949],
  '11208': [40.6693, -73.8716], '11209': [40.6222, -74.0284], '11210': [40.6279, -73.9468],
  '11211': [40.7128, -73.9536], '11212': [40.6629, -73.9134], '11213': [40.6712, -73.9356],
  '11214': [40.5990, -73.9963], '11215': [40.6623, -73.9864], '11216': [40.6808, -73.9492],
  '11217': [40.6825, -73.9794], '11218': [40.6434, -73.9766], '11219': [40.6324, -73.9968],
  '11220': [40.6391, -74.0175], '11221': [40.6909, -73.9286], '11222': [40.7271, -73.9488],
  '11223': [40.5969, -73.9713], '11224': [40.5759, -73.9885], '11225': [40.6631, -73.9544],
  '11226': [40.6459, -73.9567], '11228': [40.6162, -74.0133], '11229': [40.6018, -73.9437],
  '11230': [40.6217, -73.9654], '11231': [40.6780, -74.0015], '11232': [40.6571, -74.0045],
  '11233': [40.6784, -73.9176], '11234': [40.6074, -73.9114], '11235': [40.5841, -73.9490],
  '11236': [40.6399, -73.9009], '11237': [40.7031, -73.9213], '11238': [40.6793, -73.9643],
  '11239': [40.6471, -73.8797], '11249': [40.7006, -73.9611],
  // Queens
  '11101': [40.7429, -73.9234], '11102': [40.7722, -73.9216], '11103': [40.7627, -73.9138],
  '11104': [40.7447, -73.9204], '11105': [40.7782, -73.9059], '11106': [40.7614, -73.9307],
  '11109': [40.7451, -73.9561], '11354': [40.7673, -73.8273], '11355': [40.7512, -73.8199],
  '11356': [40.7849, -73.8413], '11357': [40.7862, -73.8105], '11358': [40.7603, -73.7962],
  '11360': [40.7810, -73.7814], '11361': [40.7637, -73.7726], '11362': [40.7561, -73.7352],
  '11363': [40.7727, -73.7464], '11364': [40.7427, -73.7599], '11365': [40.7387, -73.7935],
  '11366': [40.7274, -73.7861], '11367': [40.7275, -73.8197], '11368': [40.7495, -73.8522],
  '11369': [40.7631, -73.8747], '11370': [40.7651, -73.8917], '11371': [40.7740, -73.8728],
  '11372': [40.7517, -73.8831], '11373': [40.7369, -73.8781], '11374': [40.7247, -73.8600],
  '11375': [40.7210, -73.8460], '11377': [40.7446, -73.9029], '11378': [40.7236, -73.9048],
  '11379': [40.7175, -73.8787], '11385': [40.7005, -73.8890], '11411': [40.6942, -73.7364],
  '11412': [40.6974, -73.7577], '11413': [40.6741, -73.7518], '11414': [40.6581, -73.8463],
  '11415': [40.7078, -73.8274], '11416': [40.6844, -73.8504], '11417': [40.6764, -73.8453],
  '11418': [40.7000, -73.8355], '11419': [40.6878, -73.8244], '11420': [40.6735, -73.8167],
  '11421': [40.6941, -73.8579], '11422': [40.6598, -73.7345], '11423': [40.7155, -73.7683],
  '11426': [40.7354, -73.7221], '11427': [40.7280, -73.7461], '11428': [40.7207, -73.7422],
  '11429': [40.7097, -73.7386], '11432': [40.7151, -73.7940], '11433': [40.6989, -73.7869],
  '11434': [40.6762, -73.7762], '11435': [40.7012, -73.8099], '11436': [40.6752, -73.7964],
  '11691': [40.5951, -73.7621], '11692': [40.5933, -73.7932], '11693': [40.5901, -73.8124],
  '11694': [40.5770, -73.8424], '11697': [40.5583, -73.8761],
  // Bronx
  '10451': [40.8204, -73.9234], '10452': [40.8370, -73.9234], '10453': [40.8527, -73.9120],
  '10454': [40.8066, -73.9177], '10455': [40.8150, -73.9085], '10456': [40.8304, -73.9085],
  '10457': [40.8465, -73.8994], '10458': [40.8610, -73.8886], '10459': [40.8221, -73.8942],
  '10460': [40.8406, -73.8793], '10461': [40.8459, -73.8465], '10462': [40.8393, -73.8593],
  '10463': [40.8803, -73.9067], '10464': [40.8674, -73.8006], '10465': [40.8226, -73.8218],
  '10466': [40.8897, -73.8467], '10467': [40.8734, -73.8713], '10468': [40.8681, -73.8999],
  '10469': [40.8691, -73.8524], '10470': [40.8955, -73.8660], '10471': [40.8985, -73.9003],
  '10472': [40.8293, -73.8687], '10473': [40.8189, -73.8589], '10474': [40.8124, -73.8861],
  '10475': [40.8755, -73.8267],
  // Staten Island
  '10301': [40.6429, -74.0768], '10302': [40.6322, -74.1369], '10303': [40.6311, -74.1600],
  '10304': [40.6072, -74.0888], '10305': [40.5986, -74.0756], '10306': [40.5698, -74.1271],
  '10307': [40.5103, -74.2435], '10308': [40.5509, -74.1512], '10309': [40.5301, -74.2190],
  '10310': [40.6316, -74.1181], '10312': [40.5440, -74.1799], '10314': [40.5886, -74.1623],
};
