/**
 * Server-side geocoding for NYC addresses.
 *
 * Trestle IDX Plus feed returns null for Latitude/Longitude.
 * This module geocodes addresses using:
 *   1. In-memory cache (instant)
 *   2. NYC Geoclient API (precise, we have a subscription key)
 *   3. ZIP code centroid fallback (approximate)
 *
 * COMPLIANCE: Geocoding runs server-side only. No external API calls from browser.
 */

// ── In-memory geocode cache (persists across requests in serverless) ──
const geocodeCache = new Map<string, { lat: number; lng: number } | null>();
const CACHE_MAX = 5000;

function cacheKey(streetNumber: string, streetName: string, zip: string): string {
  return `${streetNumber}|${streetName}|${zip}`.toLowerCase();
}

/** Deterministic hash-based jitter so same address always gets same offset */
function hashJitter(str: string): [number, number] {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  const latOff = ((h & 0xFFFF) / 0xFFFF - 0.5) * 0.004; // ~200m spread
  const lngOff = (((h >> 16) & 0xFFFF) / 0xFFFF - 0.5) * 0.004;
  return [latOff, lngOff];
}

/**
 * Geocode a batch of listings, injecting latitude/longitude into the address objects.
 * Mutates the input array for performance (avoids copying 50+ large objects).
 */
export async function geocodeListings(
  listings: Array<{
    address: {
      streetNumber?: string;
      streetName?: string;
      postalCode?: string;
      city?: string;
      latitude?: number | null;
      longitude?: number | null;
    };
  }>
): Promise<void> {
  const needsGeo: Array<{
    listing: typeof listings[0];
    key: string;
    query: string;
  }> = [];

  // Phase 1: Check cache, identify what needs geocoding
  for (const listing of listings) {
    const addr = listing.address;
    if (addr.latitude != null && addr.longitude != null && addr.latitude !== 0 && addr.longitude !== 0) continue;

    const street = addr.streetName || '';
    const num = addr.streetNumber || '';
    const zip = (addr.postalCode || '').split('-')[0].trim(); // Normalize ZIP+4 to 5-digit

    if (!street || street === 'Address Undisclosed') {
      // Can't geocode — use ZIP centroid
      const centroid = ZIP_CENTROIDS[zip];
      if (centroid) {
        const jitter = hashJitter(`${num}|${street}|${zip}`);
        addr.latitude = centroid[0] + jitter[0];
        addr.longitude = centroid[1] + jitter[1];
      }
      continue;
    }

    const key = cacheKey(num, street, zip);
    const cached = geocodeCache.get(key);
    if (cached !== undefined) {
      if (cached) {
        addr.latitude = cached.lat;
        addr.longitude = cached.lng;
      } else {
        // Cached as non-geocodable — use ZIP centroid
        const centroid = ZIP_CENTROIDS[zip];
        if (centroid) {
          addr.latitude = centroid[0] + (Math.random() - 0.5) * 0.002;
          addr.longitude = centroid[1] + (Math.random() - 0.5) * 0.002;
        }
      }
      continue;
    }

    // Need to geocode
    const fullAddr = `${num} ${street}`.trim();
    needsGeo.push({ listing, key, query: `${fullAddr}, New York, NY ${zip}` });
  }

  if (needsGeo.length === 0) return;

  // Phase 2: Batch geocode via NYC Geoclient or Nominatim
  const apiKey = process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY;

  // Process in parallel batches of 10 (avoid overwhelming the API)
  const BATCH_SIZE = 10;
  for (let i = 0; i < needsGeo.length; i += BATCH_SIZE) {
    const batch = needsGeo.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async ({ listing, key, query }) => {
        const addr = listing.address;
        const num = addr.streetNumber || '';
        const street = addr.streetName || '';
        const zip = (addr.postalCode || '').split('-')[0].trim();
        let result: { lat: number; lng: number } | null = null;

        // Try NYC Geoclient first (most precise for NYC)
        if (apiKey && num && street) {
          try {
            result = await geoclientLookup(num, street, zip, apiKey);
          } catch {
            // Fall through to Nominatim
          }
        }

        // Fallback: Nominatim (free, no key needed)
        if (!result) {
          try {
            result = await nominatimLookup(query);
          } catch {
            // Fall through to ZIP centroid
          }
        }

        // Cache the result (even null to avoid re-querying)
        if (geocodeCache.size >= CACHE_MAX) {
          const firstKey = geocodeCache.keys().next().value;
          if (firstKey !== undefined) geocodeCache.delete(firstKey);
        }
        geocodeCache.set(key, result);

        if (result) {
          addr.latitude = result.lat;
          addr.longitude = result.lng;
        } else {
          // ZIP centroid fallback
          const centroid = ZIP_CENTROIDS[zip];
          if (centroid) {
            addr.latitude = centroid[0] + (Math.random() - 0.5) * 0.002;
            addr.longitude = centroid[1] + (Math.random() - 0.5) * 0.002;
          }
        }
      })
    );
  }
}

// ── NYC Geoclient API ──
async function geoclientLookup(
  houseNumber: string,
  street: string,
  zip: string,
  apiKey: string
): Promise<{ lat: number; lng: number } | null> {
  const borough = zipToBorough(zip);
  if (!borough) return null;

  const params = new URLSearchParams({
    houseNumber,
    street,
    borough,
  });

  const res = await fetch(
    `https://api.nyc.gov/geo/geoclient/v1/address.json?${params.toString()}`,
    {
      headers: { 'Ocp-Apim-Subscription-Key': apiKey },
      signal: AbortSignal.timeout(3000),
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  const result = data?.address;
  if (!result) return null;

  const lat = result.latitude || result.latitudeInternalLabel;
  const lng = result.longitude || result.longitudeInternalLabel;

  if (lat && lng && typeof lat === 'number' && typeof lng === 'number') {
    return { lat, lng };
  }
  return null;
}

// ── Nominatim (OpenStreetMap) fallback ──
async function nominatimLookup(query: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    countrycodes: 'us',
  });

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        'User-Agent': 'MallanRealEstate/1.0 (mallan.nyc)',
      },
      signal: AbortSignal.timeout(3000),
    }
  );

  if (!res.ok) return null;
  const results = await res.json();
  if (!results || results.length === 0) return null;

  const lat = parseFloat(results[0].lat);
  const lng = parseFloat(results[0].lon);
  if (isNaN(lat) || isNaN(lng)) return null;

  // Sanity check: must be in NYC area
  if (lat < 40.4 || lat > 41.0 || lng < -74.3 || lng > -73.6) return null;

  return { lat, lng };
}

// ── ZIP to Borough mapping ──
function zipToBorough(zip: string): string | null {
  const z = parseInt(zip, 10);
  if (z >= 10001 && z <= 10282) return 'Manhattan';
  if (z >= 10301 && z <= 10314) return 'Staten Island';
  if (z >= 10451 && z <= 10475) return 'Bronx';
  if (z >= 11201 && z <= 11256) return 'Brooklyn';
  if (z >= 11001 && z <= 11109) return 'Queens';
  if (z >= 11351 && z <= 11697) return 'Queens';
  if (z >= 11361 && z <= 11386) return 'Queens';
  return null;
}

// ── NYC ZIP Code Centroids ──
// Approximate center coordinates for NYC zip codes.
// Provides neighborhood-level accuracy when precise geocoding fails.
const ZIP_CENTROIDS: Record<string, [number, number]> = {
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
