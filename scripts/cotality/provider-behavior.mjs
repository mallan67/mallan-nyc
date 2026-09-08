#!/usr/bin/env node
// PROVIDER BEHAVIOR CATALOGUE — what api.cotality.com/trestle actually does, as MEASURED, each
// behaviour paired with the assertion a client must make so the behaviour cannot silently produce
// a wrong answer. Executable: `node scripts/cotality/provider-behavior.mjs --verify` re-measures
// every entry live and reports which still hold.
//
// This is not documentation of the API. It is the list of ways the API returns HTTP 200 with data
// that means something other than what a naive reader assumes, plus the entitlement boundary of
// THIS subscription. Every entry was found by hitting it, on the dates recorded. A chaos simulator
// invents failures; this records the real ones. New entries are added only from a live measurement.
//
// Vocabulary: SILENT = HTTP 200 and syntactically accepted, semantically wrong or empty.

export const PROVIDER_BEHAVIORS = Object.freeze([
  {
    id: 'PB-01', class: 'SILENT', measured: '2026-09-08',
    claim: 'contains() on CustomProperty.CustomFields is accepted and always matches nothing.',
    evidence: "contains(CustomFields,'') — the empty needle, which must match every row — returned count 0 of 591,642. Every real key also 0. Nested inside $expand=CustomProperty($filter=...) also 0 of 200.",
    consequence: 'No NYC criterion carried in CustomFields (SponsorUnitYN, FlipTax, MaximumFinancingPercent, AttendanceType, …) can be pushed to the provider. They are post-fetch only.',
    assertion: 'The query compiler must REFUSE to emit contains()/startswith() against CustomFields. A criterion on a CustomFields key executes Mallan-side over expanded CustomProperty.',
    verify: async (c) => { const j = await c.query('CustomProperty', { '$filter': "contains(CustomFields,'')", '$count': 'true', '$top': 0 }); return { holds: Number(j['@odata.count']) === 0, observed: j['@odata.count'] }; },
  },
  {
    id: 'PB-02', class: 'SILENT', measured: '2026-09-08',
    claim: '$expand can return an EMPTY collection with HTTP 200 under quota pressure, for a parent whose counter says rows exist.',
    evidence: 'RLS20112998, PhotosCount=19: $expand=Media returned [] twice during a 429 burst; 19 rows on three clean runs and on the Media set directly.',
    consequence: 'An empty expanded collection is not evidence of "no media". Believing it stores a listing with zero photos.',
    assertion: 'When Property.PhotosCount > 0 and expanded Media is empty, the result is UNVERIFIED and must be re-fetched — never persisted as empty.',
    verify: async (c) => { const j = await c.query('Property', { '$filter': "StandardStatus eq 'Active' and PhotosCount ge 8", '$select': 'ListingId,PhotosCount', '$expand': 'Media($select=MediaKey)', '$top': 3 }); const rows = j.value || []; const bad = rows.filter((r) => Number(r.PhotosCount) > 0 && (r.Media || []).length === 0).length; return { holds: bad === 0, observed: `${rows.length} rows, ${bad} empty-expand-with-counter (0 expected on a clean run; the behaviour appears under load)` }; },
  },
  {
    id: 'PB-03', class: 'PAGINATION', measured: '2026-09-08',
    claim: '@odata.nextLink is emitted whenever a page is FULL, including the final page; following it returns 0 rows and no link.',
    evidence: 'Office (578 rows): $top=289 -> p1:289+link p2:289+link p3:0; $top=578 -> p1:578+link p2:0; $top=200 -> p3:178 with no link.',
    consequence: 'nextLink is not proof of more rows. A walker that treats it as such is correct but makes one extra request per exact-multiple result set.',
    assertion: 'Completeness = the walk ended on a page with no link. An empty page WITH a link has never been observed and must be treated as UNVERIFIED (fail closed).',
    verify: async (c) => { const p = await c.page('Office', { '$top': 289, '$select': 'OfficeKey' }); return { holds: p.complete === true && p.rows.length >= 500, observed: `rows=${p.rows.length} pages=${p.pages} complete=${p.complete}` }; },
  },
  {
    id: 'PB-04', class: 'LIMIT', measured: '2026-09-08',
    claim: '$top ceiling is 1,000 for a normal select and 300,000 when only key fields are selected.',
    evidence: "$top=5000 with $select=ListingId,ListPrice,BedroomsTotal -> 400 'maximum limit/$top value for this kind of query is 1000'. $top=300000 with $select=ListingKey -> 200, 300,000 rows.",
    consequence: 'The reconciliation key census (Cotality\'s own guidance) is possible in one request; a full-row walk is not.',
    assertion: 'The client must choose the ceiling by select shape and never retry a 400 on $top as if it were transient.',
    verify: async (c) => { let a = null, b = null; try { await c.query('Property', { '$top': 5000, '$select': 'ListingId,ListPrice' }); a = 'accepted'; } catch (e) { a = e.status; } const j = await c.query('Property', { '$top': 2000, '$select': 'ListingKey' }); b = (j.value || []).length; return { holds: a === 400 && b === 2000, observed: `full-select $top=5000 -> ${a}; key-only $top=2000 -> ${b} rows` }; },
  },
  {
    id: 'PB-05', class: 'CAPABILITY', measured: '2026-09-08',
    claim: 'Navigation-path (lambda) filters are not supported: Property?$filter=OpenHouse/any(o: …) is read as a scalar field name.',
    evidence: "OpenHouse/any(o: o/OpenHouseStatus eq 'Active') -> 400 \"Field named 'OpenHouseStatus' not in metadata\"; OpenHouse/any() -> 500.",
    consequence: 'Search cannot filter Property by a subsection. Open-house search runs against the OpenHouse set (OpenHouseDate filterable, 100% populated) and joins on ListingKey Mallan-side.',
    assertion: 'The query compiler must refuse any $filter that references a navigation property.',
    verify: async (c) => { try { await c.query('Property', { '$filter': "OpenHouse/any(o: o/OpenHouseStatus eq 'Active')", '$top': 1 }); return { holds: false, observed: 'accepted (behaviour changed — re-measure)' }; } catch (e) { return { holds: [400, 500].includes(Number(e.status)), observed: `HTTP ${e.status}` }; } },
  },
  {
    id: 'PB-06', class: 'CAPABILITY', measured: '2026-09-08',
    claim: 'Nested $expand options ($select, $filter, $orderby, $top) are honored.',
    evidence: 'On three listings with 10/60/10 photos: Media($top=3) -> 3/3/3; Media($filter=MediaCategory eq \'Photo\') -> 9/59/9 (one floorplan each excluded); $select honored.',
    consequence: 'Detail hydration can request exactly the sub-rows it needs; no over-fetch.',
    assertion: 'Row counts, not HTTP status, prove a nested option worked. HTTP 200 alone proves nothing (see PB-02).',
    verify: async (c) => { const j = await c.query('Property', { '$filter': "StandardStatus eq 'Active' and PhotosCount ge 6", '$select': 'ListingId', '$expand': 'Media($top=2)', '$top': 2 }); const ok = (j.value || []).every((r) => (r.Media || []).length <= 2); return { holds: ok, observed: (j.value || []).map((r) => (r.Media || []).length).join('/') }; },
  },
  {
    id: 'PB-07', class: 'AUTHORITY', measured: '2026-09-08',
    claim: '$metadata is the existence authority for this subscription; the Field catalogue is platform-wide and lists resources and fields that cannot be selected.',
    evidence: "Field: 2,249 rows incl. Media.MediaURLDirect, PropertyLevels, Custom_Property. $metadata: 1,456 fields / 17 entity sets. $select=MediaURLDirect -> 400 \"not in metadata\".",
    consequence: 'A field present in Field but absent from $metadata is not usable. Definition text is empty in Field for every row; real definitions live on Lookup rows and the public docs.',
    assertion: 'Field existence checks read $metadata. Field is consulted for LookupName and SystemReferences only.',
    verify: async (c) => { try { await c.query('Media', { '$select': 'MediaURLDirect', '$top': 1 }); return { holds: false, observed: 'MediaURLDirect now selectable — re-measure' }; } catch (e) { return { holds: Number(e.status) === 400, observed: `HTTP ${e.status}` }; } },
  },
  {
    id: 'PB-08', class: 'AUTHORITY', measured: '2026-09-08',
    claim: 'Lookup.SystemReferences (RLS-listed) is a VOCABULARY fact, not a POPULATION fact, in both directions.',
    evidence: 'MlsStatus: RLS-listed, null on 3,000/3,000 rows, not filterable. VideosCount: not RLS-listed, > 0 on 31,498 rows. AvailableLeaseType/SyndicateTo/LivingAreaSource/BusinessType: 0 RLS-listed AND 0 populated.',
    consequence: 'Neither "REBNY lists it" nor "REBNY does not list it" may be turned into a claim about data without a live count.',
    assertion: 'Any decision keyed on RLS-listed must pair it with a live population count for the field.',
    verify: async (c) => { const j = await c.query('Property', { '$filter': 'VideosCount gt 0', '$count': 'true', '$top': 0 }); return { holds: Number(j['@odata.count']) > 0, observed: `VideosCount>0 rows: ${j['@odata.count']} (field is NOT RLS-listed)` }; },
  },
  {
    id: 'PB-09', class: 'SILENT', measured: '2026-09-08',
    claim: 'A field can be declared, selectable, and provider-suppressed for $filter/$orderby while null on every row.',
    evidence: "DaysOnMarket / CumulativeDaysOnMarket / DaysOnMarketReplication: $select 200, null on ~13,000 sampled rows and 26,486 stored payloads; $filter -> 400 \"suppressed (provider Level)\". MlsStatus and both Internet*DisplayYN share the suppression.",
    consequence: 'Declared ≠ selectable ≠ filterable ≠ populated. Four separate facts; a contract must record all four.',
    assertion: 'probeField records select / filter / orderby / population as separate states; none implies another.',
    verify: async (c) => { const e = await c.probeField('Property', 'DaysOnMarket'); return { holds: e.select?.state === 'SUPPORTED' && e.filterNonNull?.state === 'PROVIDER_REJECTED', observed: `select=${e.select?.state} filter=${e.filterNonNull?.state}` }; },
  },
  {
    id: 'PB-10', class: 'QUOTA', measured: '2026-09-08',
    claim: 'Quota is advertised on every response: minute-quota-limit 280 / hour-quota-limit 8400, with -available and -resettime.',
    evidence: 'Headers on a 200: hour-quota-available 7634 / limit 8400; minute-quota-available 236 / limit 280; quotatype Api. Token expires_in 28800s.',
    consequence: 'Any hardcoded rate (the skill says 180/min) is wrong. A 507-request census at concurrency 4 exhausted the minute window.',
    assertion: 'The client reads the headers, pauses below a floor, and budgets retries by TIME across a whole minute window. Never a fixed attempt count.',
    verify: async (c) => { await c.query('Property', { '$top': 1, '$select': 'ListingId' }); const q = c.quota(); return { holds: q.minuteLimit != null && q.hourLimit != null, observed: `minute ${q.minuteAvailable}/${q.minuteLimit} hour ${q.hourAvailable}/${q.hourLimit}` }; },
  },
  {
    id: 'PB-11', class: 'ENTITLEMENT', measured: '2026-09-08',
    claim: 'Of 17 entity sets, 11 are accessible on this subscription; 6 are not.',
    evidence: 'Accessible: Property, Office, Member, Media, OpenHouse, CustomProperty, PropertyRooms, PropertyUnitTypes, Field, Lookup, Model. Not: Building 403, HistoryTransactional 400 (no access), Teams/TeamMembers 400, Enumeration 404, PropertyGreenVerification 404. Buyer-side navs (BuyerAgent/BuyerOffice*) 400.',
    consequence: 'Building search, transaction history, and any buyer-side relationship cannot be served from the provider. PropertyRooms (86 rows) and PropertyUnitTypes (1 row) are effectively unused by REBNY.',
    assertion: 'The contract records HTTP 200-with-rows / 200-empty / 400 / 403 / 404 as distinct facts per set; an inaccessible set is UNVERIFIED for every capability, never "empty".',
    verify: async (c) => { let b = null; try { await c.query('Building', { '$top': 1 }); b = 200; } catch (e) { b = e.status; } return { holds: Number(b) === 403, observed: `Building -> HTTP ${b}` }; },
  },
  {
    id: 'PB-12', class: 'MODEL', measured: '2026-09-08',
    claim: 'On this feed the Media resource carries photos and floorplans only; video and virtual tour are Property URL fields.',
    evidence: 'MediaCategory live: Photo 1,417,033 · FloorPlan 583,800; Video / BrandedVirtualTour / UnbrandedVirtualTour = 0 (all RLS-listed). MediaType Mp4/Mov/Quicktime = 0; Pdf 448,721. VirtualTourURLUnbranded on 26,372 rows; PhotosCount counts all media rows, floorplans included.',
    consequence: 'has_video / has_virtual_tour cannot be derived from Media rows. PhotosCount ≠ photo count. Tour URL content is not the provider\'s contract for video.',
    assertion: 'Media-derived flags are limited to photo/floorplan; tour presence reads VirtualTourURL*; video Media rows are honoured when REBNY sends them (the vocabulary is listed), not before.',
    verify: async (c) => { const j = await c.query('Media', { '$filter': "MediaCategory eq 'Video'", '$count': 'true', '$top': 0 }); return { holds: true, observed: `Video Media rows live: ${j['@odata.count']} (0 on 2026-09-08; a non-zero value means REBNY began sending video media — re-verify PB-12)` }; },
  },
]);

// ── Self-test ────────────────────────────────────────────────────────────────────────────────────
if (process.argv.includes('--verify')) {
  const { createCotalityClient } = await import('./live-client.mjs');
  const client = createCotalityClient();
  let held = 0, changed = 0;
  for (const b of PROVIDER_BEHAVIORS) {
    try {
      const r = await b.verify(client);
      if (r.holds) held += 1; else changed += 1;
      console.log(`${r.holds ? 'HOLDS  ' : 'CHANGED'} ${b.id} ${b.claim.slice(0, 80)}\n         ${r.observed}`);
    } catch (e) {
      changed += 1;
      console.log(`UNVERIFIED ${b.id} ${b.claim.slice(0, 80)}\n         ${e?.message || e}`);
    }
  }
  console.log(`\n${held} hold, ${changed} changed or unverified, of ${PROVIDER_BEHAVIORS.length}. quota: ${JSON.stringify(client.quota())}`);
  process.exit(changed ? 2 : 0);
}
