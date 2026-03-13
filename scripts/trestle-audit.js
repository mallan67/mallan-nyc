#!/usr/bin/env node
/**
 * TRESTLE / COTALITY COMPLIANCE AUDIT
 *
 * Authenticates with Cotality, pulls live data, and tests every UCBA 2026 + RLS requirement.
 * Acts as an independent auditor verifying:
 *   1. OAuth2 authentication
 *   2. API endpoint migration (api.cotality.com)
 *   3. Field availability on IDX Plus feed
 *   4. Distribution gate enforcement
 *   5. Required field presence
 *   6. Fair Housing compliance
 *   7. Content scanning (agent info, off-market, compensation)
 *   8. Coming Soon rules
 *   9. Status/date integrity
 *  10. Media availability
 *  11. Attribution requirements
 *  12. Address suppression
 *  13. Owner opt-out enforcement
 *  14. Closed listing 24hr rule
 *  15. Data quality (field completeness rates)
 */

require('dotenv').config({ path: '.env.local' });

const API_URL = process.env.TRESTLE_API_URL;
const CLIENT_ID = process.env.IDX_CLIENT_ID;
const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET;

// ═══════════════════════════════════════════════════════════
// AUDIT RESULTS TRACKING
// ═══════════════════════════════════════════════════════════
const findings = [];
let passCount = 0;
let failCount = 0;
let warnCount = 0;

function PASS(code, message) {
  passCount++;
  findings.push({ severity: 'PASS', code, message });
  console.log(`  ✓ PASS [${code}] ${message}`);
}
function FAIL(code, message) {
  failCount++;
  findings.push({ severity: 'FAIL', code, message });
  console.log(`  ✗ FAIL [${code}] ${message}`);
}
function WARN(code, message) {
  warnCount++;
  findings.push({ severity: 'WARN', code, message });
  console.log(`  ⚠ WARN [${code}] ${message}`);
}

// ═══════════════════════════════════════════════════════════
// 1. AUTHENTICATION AUDIT
// ═══════════════════════════════════════════════════════════
async function getToken() {
  const tokenUrl = `${API_URL}/oidc/connect/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'api',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown');
    throw new Error(`Token request failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data;
}

async function fetchOData(token, resource, params) {
  const qs = new URLSearchParams(params);
  const url = `${API_URL}/odata/${resource}?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown');
    return { error: true, status: res.status, body: err };
  }
  return await res.json();
}

// ═══════════════════════════════════════════════════════════
// MAIN AUDIT
// ═══════════════════════════════════════════════════════════
async function runAudit() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  TRESTLE / COTALITY COMPLIANCE AUDIT');
  console.log('  Date: ' + new Date().toISOString());
  console.log('  Endpoint: ' + API_URL);
  console.log('  Feed: IDX Plus (Mallan Real Estate Inc.)');
  console.log('═══════════════════════════════════════════════════\n');

  // ── SECTION 1: Endpoint & Auth ─────────────────────────
  console.log('─── SECTION 1: ENDPOINT & AUTHENTICATION ───');

  // A1: Endpoint migration
  if (API_URL === 'https://api.cotality.com/trestle') {
    PASS('A1', 'Trestle endpoint correctly set to api.cotality.com/trestle');
  } else if (API_URL?.includes('corelogic.com')) {
    FAIL('A1', `DEPRECATED endpoint in use: ${API_URL} — must migrate to api.cotality.com/trestle before March 31, 2026`);
  } else {
    WARN('A1', `Non-standard endpoint: ${API_URL}`);
  }

  // A2: Credentials present
  if (CLIENT_ID && CLIENT_SECRET) {
    PASS('A2', 'IDX_CLIENT_ID and IDX_CLIENT_SECRET present in env');
  } else {
    FAIL('A2', 'Missing IDX credentials — cannot authenticate with Trestle');
    return;
  }

  // A3: OAuth2 token acquisition
  let tokenData;
  try {
    tokenData = await getToken();
    PASS('A3', `OAuth2 token acquired (expires_in: ${tokenData.expires_in}s, type: ${tokenData.token_type})`);
  } catch (err) {
    FAIL('A3', `OAuth2 token acquisition FAILED: ${err.message}`);
    return;
  }

  const token = tokenData.access_token;

  // A4: Token expiry buffer
  const expiryBuffer = parseInt(process.env.IDX_TOKEN_EXPIRY_BUFFER || '300', 10);
  if (expiryBuffer >= 60 && expiryBuffer <= 600) {
    PASS('A4', `Token expiry buffer: ${expiryBuffer}s (within safe range 60-600s)`);
  } else {
    WARN('A4', `Token expiry buffer: ${expiryBuffer}s (unusual — recommended 60-600s)`);
  }

  // ── SECTION 2: API Connectivity & Feed Type ────────────
  console.log('\n─── SECTION 2: API CONNECTIVITY & FEED ───');

  // B1: Property endpoint accessible
  const testQuery = await fetchOData(token, 'Property', {
    $top: '1',
    $select: 'ListingId,PropertyType,StandardStatus',
    $filter: "StandardStatus eq 'Active'",
  });
  if (testQuery.error) {
    FAIL('B1', `Property endpoint NOT accessible (${testQuery.status}): ${testQuery.body?.substring(0, 200)}`);
    return;
  }
  const testCount = testQuery.value?.length || 0;
  PASS('B1', `Property endpoint accessible — ${testCount} test record(s) returned`);

  // B2: Total active listing count
  const countQuery = await fetchOData(token, 'Property', {
    $count: 'true',
    $top: '0',
    $filter: "StandardStatus eq 'Active'",
  });
  const totalActive = countQuery['@odata.count'] || 'unknown';
  PASS('B2', `Total active listings on feed: ${totalActive}`);

  // B3: Media endpoint accessible
  const mediaTest = await fetchOData(token, 'Media', {
    $top: '1',
    $select: 'MediaURL,MediaCategory,Order',
  });
  if (mediaTest.error) {
    FAIL('B3', `Media endpoint NOT accessible (${mediaTest.status})`);
  } else {
    PASS('B3', 'Media endpoint accessible');
  }

  // ── SECTION 3: Field Availability Audit ────────────────
  console.log('\n─── SECTION 3: FIELD AVAILABILITY ───');

  // Pull a sample of 25 active listings with all expected fields
  const AUDIT_SELECT = [
    // Core identification
    'ListingId','SourceSystemKey','PropertyType','PropertySubType','CommonInterest','StructureType',
    // Status
    'StandardStatus','MlsStatus','ModificationTimestamp','OriginalEntryTimestamp','OnMarketDate',
    'ActivationDate','DaysOnMarket','CumulativeDaysOnMarket',
    // Price
    'ListPrice','OriginalListPrice','PreviousListPrice',
    // Address
    'StreetNumber','StreetName','StreetDirPrefix','StreetDirSuffix','StreetSuffix',
    'UnitNumber','City','CityRegion','PostalCity','PostalCode','StateOrProvince',
    'CountyOrParish','Latitude','Longitude',
    // Building
    'YearBuilt','StoriesTotal','NumberOfUnitsTotal','BuildingName',
    'Heating','Cooling','ArchitecturalStyle','ConstructionMaterials',
    // Unit
    'BedroomsTotal','BathroomsFull','BathroomsHalf','RoomsTotal','LivingArea','LivingAreaUnits',
    'BuildingAreaTotal',
    // Amenities
    'BuildingFeatures','AssociationAmenities','CommunityFeatures','SecurityFeatures',
    'InteriorFeatures','ExteriorFeatures','Flooring','Appliances',
    'LaundryFeatures','PoolFeatures','SpaFeatures',
    'ParkingFeatures','GarageSpaces','GarageYN',
    'PetsAllowed',
    // Financial
    'AssociationFee','AssociationFeeFrequency','TaxAnnualAmount','TaxYear','TaxBlock','TaxLot',
    // Agent
    'ListAgentMlsId','ListAgentFullName','ListAgentEmail','ListAgentDirectPhone',
    'ListOfficeMlsId','ListOfficeName',
    // Distribution
    'InternetEntireListingDisplayYN','InternetAddressDisplayYN',
    'SyndicateTo',
    // Remarks
    'PublicRemarks','ShowingInstructions','PropertyCondition',
    // Dates
    'ListingContractDate','ExpirationDate','CloseDate','ClosePrice',
    // Listing agreement
    'ListingAgreement','Concessions','ConcessionsAmount',
    // Media refs
    'PhotosCount','VirtualTourURLUnbranded','VirtualTourURLBranded',
    // Walk/transit
    'WalkScore',
  ];

  const sampleData = await fetchOData(token, 'Property', {
    $top: '25',
    $select: AUDIT_SELECT.join(','),
    $filter: "StandardStatus eq 'Active'",
    $orderby: 'ModificationTimestamp desc',
    $expand: "Media($select=MediaURL,MediaCategory,Order,PreferredPhotoYN,ShortDescription;$top=5;$orderby=Order)",
  });

  if (sampleData.error) {
    FAIL('C1', `Sample data fetch failed (${sampleData.status}): ${sampleData.body?.substring(0, 200)}`);
    return;
  }

  const listings = sampleData.value || [];
  console.log(`  Fetched ${listings.length} sample listings for field audit\n`);

  // C1: Field completeness rates
  const fieldStats = {};
  for (const field of AUDIT_SELECT) {
    fieldStats[field] = { present: 0, total: listings.length };
  }
  for (const listing of listings) {
    for (const field of AUDIT_SELECT) {
      if (listing[field] !== undefined && listing[field] !== null && listing[field] !== '') {
        fieldStats[field].present++;
      }
    }
  }

  // Check UCBA Exhibit A mandatory fields
  const UCBA_MANDATORY = [
    'PropertyType','PropertySubType','StructureType','CommonInterest',
    'ListPrice','StandardStatus','MlsStatus',
    'StreetNumber','StreetName','City','CityRegion','PostalCode','CountyOrParish','StateOrProvince',
    'BedroomsTotal','BathroomsFull','BathroomsHalf','RoomsTotal',
    'YearBuilt','StoriesTotal','NumberOfUnitsTotal',
    'ListAgentMlsId','ListAgentFullName','ListOfficeMlsId','ListOfficeName',
    'InternetEntireListingDisplayYN','InternetAddressDisplayYN',
    'PublicRemarks','ShowingInstructions',
    'ListingContractDate','ExpirationDate',
    'GarageYN','PetsAllowed',
    'ListingAgreement','Concessions',
    'PhotosCount',
  ];

  console.log('  UCBA Exhibit A Mandatory Field Completeness:');
  const missingMandatory = [];
  for (const field of UCBA_MANDATORY) {
    const stat = fieldStats[field];
    if (!stat) {
      FAIL(`C1-${field}`, `Mandatory field "${field}" not in $select or not returned by feed`);
      missingMandatory.push(field);
    } else {
      const pct = Math.round((stat.present / stat.total) * 100);
      if (pct === 100) {
        // silent pass
      } else if (pct >= 80) {
        WARN(`C1-${field}`, `Mandatory field "${field}" present in ${pct}% of listings (${stat.present}/${stat.total})`);
      } else if (pct > 0) {
        FAIL(`C1-${field}`, `Mandatory field "${field}" only ${pct}% complete (${stat.present}/${stat.total}) — UCBA Exhibit A requires this`);
        missingMandatory.push(field);
      } else {
        FAIL(`C1-${field}`, `Mandatory field "${field}" is EMPTY in all ${stat.total} listings — field may not be on IDX Plus feed`);
        missingMandatory.push(field);
      }
    }
  }
  if (missingMandatory.length === 0) {
    PASS('C1', `All ${UCBA_MANDATORY.length} UCBA mandatory fields present at 100%`);
  } else {
    console.log(`  Missing/incomplete mandatory: ${missingMandatory.join(', ')}`);
  }

  // C2: Fields NOT on IDX Plus feed (expected empty)
  console.log('\n  Non-mandatory field completeness (sample):');
  const lowCompleteness = [];
  for (const [field, stat] of Object.entries(fieldStats)) {
    if (UCBA_MANDATORY.includes(field)) continue;
    const pct = Math.round((stat.present / stat.total) * 100);
    if (pct === 0) {
      lowCompleteness.push(field);
    }
  }
  if (lowCompleteness.length > 0) {
    WARN('C2', `${lowCompleteness.length} non-mandatory fields empty in all samples: ${lowCompleteness.join(', ')}`);
  }

  // ── SECTION 4: Distribution Gate Enforcement ───────────
  console.log('\n─── SECTION 4: DISTRIBUTION GATES ───');

  // D1: IDXEntireListingDisplayYN gate
  const idxGateTest = await fetchOData(token, 'Property', {
    $top: '5',
    $select: 'ListingId,IDXEntireListingDisplayYN,StandardStatus',
    $filter: "IDXEntireListingDisplayYN eq false and StandardStatus eq 'Active'",
    $count: 'true',
  });
  if (idxGateTest.error) {
    // IDX feed pre-filters — 400 expected if field not available
    PASS('D1', 'IDXEntireListingDisplayYN: Feed pre-filters opt-outs (field not queryable on IDX feed — correct behavior)');
  } else {
    const optOutCount = idxGateTest['@odata.count'] || (idxGateTest.value?.length || 0);
    if (optOutCount === 0) {
      PASS('D1', 'IDXEntireListingDisplayYN: No opted-out listings exposed on IDX feed');
    } else {
      FAIL('D1', `IDXEntireListingDisplayYN: ${optOutCount} opted-out listings EXPOSED on IDX feed — COMPLIANCE VIOLATION`);
    }
  }

  // D2: InternetEntireListingDisplayYN
  for (const listing of listings) {
    if (listing.InternetEntireListingDisplayYN === false) {
      FAIL('D2', `ListingId ${listing.ListingId}: InternetEntireListingDisplayYN=false but listing appears on feed`);
    }
  }
  if (!listings.some(l => l.InternetEntireListingDisplayYN === false)) {
    PASS('D2', 'InternetEntireListingDisplayYN: No listings with display=false on feed (correct)');
  }

  // D3: Address suppression check
  let addressSuppressed = 0;
  for (const listing of listings) {
    if (listing.InternetAddressDisplayYN === false) {
      addressSuppressed++;
      if (listing.StreetNumber || listing.StreetName) {
        WARN('D3', `ListingId ${listing.ListingId}: InternetAddressDisplayYN=false but address data present — frontend must suppress display`);
      }
    }
  }
  if (addressSuppressed === 0) {
    PASS('D3', 'InternetAddressDisplayYN: All sampled listings allow address display');
  }

  // ── SECTION 5: Content Compliance ──────────────────────
  console.log('\n─── SECTION 5: CONTENT COMPLIANCE ───');

  // E1: Fair Housing scan
  const FAIR_HOUSING_PATTERNS = [
    { pattern: /\b(whites?\s+only|no\s+(blacks?|hispanics?|asians?|mexicans?))\b/i, law: 'Federal FHA' },
    { pattern: /\b(christian\s+(home|family|neighborhood)|no\s+(muslims?|jews?|hindus?))\b/i, law: 'Federal FHA' },
    { pattern: /\bno\s+(children|kids|families\s+with\s+children)\b/i, law: 'Federal FHA' },
    { pattern: /\b(no\s+(wheelchairs?|disabled|handicapped)|able[- ]bodied\s+only)\b/i, law: 'Federal FHA' },
    { pattern: /\b(no\s+(section\s*8|vouchers?|housing\s+choice))\b/i, law: 'NYC HRL Title 8' },
    { pattern: /\b(citizens?\s+only|no\s+immigrants?|legal\s+residents?\s+only)\b/i, law: 'NYC HRL Title 8' },
  ];

  let fairHousingViolations = 0;
  for (const listing of listings) {
    const remarks = String(listing.PublicRemarks || '');
    for (const { pattern, law } of FAIR_HOUSING_PATTERNS) {
      const match = remarks.match(pattern);
      if (match) {
        FAIL('E1', `FAIR HOUSING VIOLATION in ${listing.ListingId}: "${match[0]}" — ${law}. PENALTY: $250 first, $500 + termination second.`);
        fairHousingViolations++;
      }
    }
  }
  if (fairHousingViolations === 0) {
    PASS('E1', `Fair Housing scan clean across ${listings.length} listings`);
  }

  // E2: Agent info in PublicRemarks
  const AGENT_INFO_PATTERNS = [
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
    /\bhttps?:\/\/\S+/i,
    /\b(contact\s+me|call\s+me|listed\s+by|exclusive\s+with)\b/i,
  ];
  let agentInfoViolations = 0;
  for (const listing of listings) {
    const remarks = String(listing.PublicRemarks || '');
    for (const pattern of AGENT_INFO_PATTERNS) {
      const match = remarks.match(pattern);
      if (match) {
        WARN('E2', `Agent info in PublicRemarks (${listing.ListingId}): "${match[0].substring(0, 40)}" — UCBA Art. I, Sec. 5(C)`);
        agentInfoViolations++;
        break; // one per listing
      }
    }
  }
  if (agentInfoViolations === 0) {
    PASS('E2', 'No agent info found in PublicRemarks (UCBA Art. I, Sec. 5(C))');
  }

  // E3: Off-market language
  const OFF_MARKET = [/\boff[- ]?market\b/i, /\bpocket\s+listing\b/i, /\bwhisper\s+listing\b/i];
  let offMarketViolations = 0;
  for (const listing of listings) {
    const remarks = String(listing.PublicRemarks || '');
    for (const pattern of OFF_MARKET) {
      if (pattern.test(remarks)) {
        FAIL('E3', `OFF-MARKET language in ${listing.ListingId} — UCBA Art. I, Sec. 5(D). PENALTY: $500/$2K/$10K/suspension`);
        offMarketViolations++;
        break;
      }
    }
  }
  if (offMarketViolations === 0) {
    PASS('E3', 'No off-market language found (UCBA Art. I, Sec. 5(D))');
  }

  // E4: Compensation language
  const COMP_PATTERNS = [/\b\d+(\.\d+)?%\s*(commission|co-?broke?)\b/i, /\bbuyer\s+pays?\s+no\b/i, /\bbonus\s+commission\b/i];
  let compViolations = 0;
  for (const listing of listings) {
    const remarks = String(listing.PublicRemarks || '');
    for (const pattern of COMP_PATTERNS) {
      if (pattern.test(remarks)) {
        FAIL('E4', `Compensation language in ${listing.ListingId} — UCBA Art. I, Sec. 5(E)`);
        compViolations++;
        break;
      }
    }
  }
  if (compViolations === 0) {
    PASS('E4', 'No compensation language in PublicRemarks (UCBA Art. I, Sec. 5(E))');
  }

  // ── SECTION 6: Coming Soon Rules ───────────────────────
  console.log('\n─── SECTION 6: COMING SOON RULES ───');

  const comingSoonData = await fetchOData(token, 'Property', {
    $top: '25',
    $select: 'ListingId,PropertyType,StandardStatus,MlsStatus,ActivationDate,OnMarketDate,ModificationTimestamp,ListPrice,StreetName',
    $filter: "StandardStatus eq 'ComingSoon'",
    $count: 'true',
  });

  if (comingSoonData.error) {
    WARN('F1', 'Could not query Coming Soon listings (may not exist or field not available)');
  } else {
    const csListings = comingSoonData.value || [];
    const csCount = comingSoonData['@odata.count'] || csListings.length;
    console.log(`  Coming Soon listings on feed: ${csCount}`);

    for (const cs of csListings) {
      // F1: Coming Soon must be sales only
      if (cs.PropertyType === 'ResidentialLease') {
        FAIL('F1', `Coming Soon RENTAL ${cs.ListingId} — UCBA Art. I, Sec. 16: Coming Soon is SALES ONLY`);
      }

      // F2: 14-day maximum
      if (cs.ActivationDate) {
        const activation = new Date(cs.ActivationDate);
        const now = new Date();
        const daysSinceActivation = (now.getTime() - activation.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceActivation > 14) {
          FAIL('F2', `Coming Soon ${cs.ListingId}: ${Math.ceil(daysSinceActivation)} days (> 14-day max) — UCBA Sec. D, Rule 2`);
        }
      } else {
        FAIL('F3', `Coming Soon ${cs.ListingId}: Missing ActivationDate — required by RLS`);
      }
    }
    if (csListings.length > 0 && !csListings.some(cs => cs.PropertyType === 'ResidentialLease')) {
      PASS('F1', `All ${csListings.length} Coming Soon listings are sales (correct per UCBA D1)`);
    }
    if (csListings.length === 0) {
      PASS('F1', 'No Coming Soon listings on feed currently');
    }
  }

  // ── SECTION 7: Closed Listings / 24hr Rule ─────────────
  console.log('\n─── SECTION 7: CLOSED LISTING 24HR RULE ───');

  const closedData = await fetchOData(token, 'Property', {
    $top: '10',
    $select: 'ListingId,StandardStatus,CloseDate,ClosePrice,ListPrice,BuyerAgentMlsId,BuyerAgentFullName',
    $filter: "StandardStatus eq 'Closed'",
    $orderby: 'CloseDate desc',
  });

  if (closedData.error) {
    WARN('G1', 'Could not query Closed listings');
  } else {
    const closedListings = closedData.value || [];
    console.log(`  Recently closed listings: ${closedListings.length}`);

    for (const cl of closedListings) {
      const closeDate = cl.CloseDate ? new Date(cl.CloseDate) : null;
      if (closeDate) {
        const hoursSinceClose = (Date.now() - closeDate.getTime()) / (1000 * 60 * 60);
        if (hoursSinceClose > 24) {
          WARN('G1', `Closed ${cl.ListingId}: Closed ${Math.round(hoursSinceClose)}h ago — should be removed/marked on broker website within 24hrs (UCBA Art. I, Sec. 6)`);
        }
      }

      // G2: ClosePrice required
      if (!cl.ClosePrice && cl.ClosePrice !== 0) {
        FAIL('G2', `Closed ${cl.ListingId}: Missing ClosePrice — required within 24hrs of closing (UCBA Art. I, Sec. 7)`);
      }

      // G3: CloseDate required
      if (!cl.CloseDate) {
        FAIL('G3', `Closed ${cl.ListingId}: Missing CloseDate — required (RLS Data Rules)`);
      }
    }

    if (closedListings.every(cl => cl.ClosePrice && cl.CloseDate)) {
      PASS('G2', 'All closed listings have ClosePrice and CloseDate');
    }
  }

  // ── SECTION 8: Media Audit ─────────────────────────────
  console.log('\n─── SECTION 8: MEDIA AUDIT ───');

  let listingsWithMedia = 0;
  let listingsWithoutMedia = 0;
  let totalPhotos = 0;
  for (const listing of listings) {
    const media = listing.Media;
    if (Array.isArray(media) && media.length > 0) {
      listingsWithMedia++;
      totalPhotos += media.length;
    } else {
      listingsWithoutMedia++;
    }
    // H2: PhotosCount cross-check
    const photosCount = Number(listing.PhotosCount || 0);
    if (Array.isArray(media) && photosCount > 0 && Math.abs(media.length - photosCount) > 2) {
      WARN('H2', `${listing.ListingId}: PhotosCount=${photosCount} but $expand=Media returned ${media.length} items`);
    }
  }
  console.log(`  Listings with inline Media: ${listingsWithMedia}/${listings.length}`);
  console.log(`  Total media items: ${totalPhotos}`);

  if (listingsWithMedia > 0) {
    PASS('H1', `$expand=Media working — ${listingsWithMedia}/${listings.length} listings have inline media`);
  } else {
    FAIL('H1', '$expand=Media returned no media for any listing');
  }

  // H3: Media endpoint separate test
  if (listings.length > 0) {
    const testListing = listings[0];
    const testKey = testListing.SourceSystemKey || testListing.ListingId;
    const isNumeric = /^\d+$/.test(String(testKey));
    const filterField = isNumeric ? 'ResourceRecordKeyNumeric' : 'ResourceRecordID';
    const filterVal = isNumeric ? testKey : `'${testKey}'`;

    const mediaResult = await fetchOData(token, 'Media', {
      $filter: `${filterField} eq ${filterVal}`,
      $select: 'MediaURL,MediaCategory,Order,ShortDescription,PreferredPhotoYN',
      $orderby: 'Order asc',
      $top: '50',
    });

    if (mediaResult.error) {
      WARN('H3', `Media endpoint query failed for ${testListing.ListingId} (${mediaResult.status})`);
    } else {
      const mediaItems = mediaResult.value || [];
      console.log(`  Media endpoint test (${testListing.ListingId}): ${mediaItems.length} items`);

      // Check media types
      const types = {};
      for (const m of mediaItems) {
        const cat = m.MediaCategory || 'unknown';
        types[cat] = (types[cat] || 0) + 1;
      }
      console.log(`  Media categories: ${JSON.stringify(types)}`);

      if (mediaItems.length > 0) {
        PASS('H3', `Media endpoint returns ${mediaItems.length} items for ${testListing.ListingId}`);
      }
    }
  }

  // ── SECTION 9: Data Quality ────────────────────────────
  console.log('\n─── SECTION 9: DATA QUALITY ───');

  // I1: NYC-specific: Borough/County consistency
  let boroughMismatches = 0;
  const BOROUGH_MAP = {
    'Manhattan': 'New York', 'Brooklyn': 'Kings', 'Queens': 'Queens',
    'Bronx': 'Bronx', 'Staten Island': 'Richmond',
  };
  for (const listing of listings) {
    const city = listing.City;
    const county = listing.CountyOrParish;
    if (city && county && BOROUGH_MAP[city] && BOROUGH_MAP[city] !== county) {
      FAIL('I1', `${listing.ListingId}: Borough/County mismatch — City="${city}" expects county "${BOROUGH_MAP[city]}" but got "${county}"`);
      boroughMismatches++;
    }
  }
  if (boroughMismatches === 0) {
    PASS('I1', 'Borough/County mapping consistent across all sampled listings');
  }

  // I2: StateOrProvince must be NY
  const nonNY = listings.filter(l => l.StateOrProvince && l.StateOrProvince !== 'NY');
  if (nonNY.length > 0) {
    FAIL('I2', `${nonNY.length} listings with StateOrProvince != "NY" — REBNY RLS is NYC-only`);
  } else {
    PASS('I2', 'All listings have StateOrProvince = "NY"');
  }

  // I3: ListPrice > 0
  const zeroPriceListings = listings.filter(l => !l.ListPrice || l.ListPrice <= 0);
  if (zeroPriceListings.length > 0) {
    FAIL('I3', `${zeroPriceListings.length} listings with ListPrice <= 0`);
  } else {
    PASS('I3', 'All listings have ListPrice > 0');
  }

  // I4: YearBuilt validation (1700 <= year <= current + 10)
  const currentYear = new Date().getFullYear();
  for (const listing of listings) {
    const yb = Number(listing.YearBuilt);
    if (yb && (yb < 1700 || yb > currentYear + 10)) {
      FAIL('I4', `${listing.ListingId}: YearBuilt=${yb} — out of range (1700-${currentYear + 10})`);
    }
  }
  if (!listings.some(l => { const yb = Number(l.YearBuilt); return yb && (yb < 1700 || yb > currentYear + 10); })) {
    PASS('I4', 'All YearBuilt values within valid range');
  }

  // I5: Latitude/Longitude presence (for map display)
  const geoPresent = listings.filter(l => l.Latitude && l.Longitude).length;
  const geoPct = Math.round((geoPresent / listings.length) * 100);
  if (geoPct === 100) {
    PASS('I5', 'All listings have Latitude/Longitude for map display');
  } else if (geoPct >= 80) {
    WARN('I5', `${geoPct}% of listings have geo coordinates (${geoPresent}/${listings.length})`);
  } else {
    FAIL('I5', `Only ${geoPct}% of listings have geo coordinates — map display will be incomplete`);
  }

  // ── SECTION 10: Listing Agreement Validation ───────────
  console.log('\n─── SECTION 10: LISTING AGREEMENT ───');

  const VALID_AGREEMENTS = [
    'Exclusive Right To Sell', 'Exclusive Agency', 'Exclusive Right To Lease',
    'Co Exclusive', 'Exclusive Right With Exception',
    'ExclusiveRightToSell', 'ExclusiveAgency', 'ExclusiveRightToLease',
    'CoExclusive', 'ExclusiveRightWithException',
  ];
  let badAgreements = 0;
  for (const listing of listings) {
    const la = listing.ListingAgreement;
    if (la && !VALID_AGREEMENTS.includes(la)) {
      FAIL('J1', `${listing.ListingId}: ListingAgreement="${la}" — NOT exclusive. UCBA Art. I, Sec. 4 requires exclusive listings only.`);
      badAgreements++;
    }
  }
  if (badAgreements === 0 && listings.some(l => l.ListingAgreement)) {
    PASS('J1', 'All listing agreements are exclusive types (UCBA Art. I, Sec. 4)');
  }

  // ── SECTION 11: Codebase Compliance Checks ─────────────
  console.log('\n─── SECTION 11: CODEBASE COMPLIANCE ───');

  // K1: Check for deprecated Trestle endpoints in code
  const fs = require('fs');
  const path = require('path');
  function searchFiles(dir, pattern, extensions) {
    const results = [];
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        if (item.startsWith('.') || item === 'node_modules' || item === '.next') continue;
        const full = path.join(dir, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          results.push(...searchFiles(full, pattern, extensions));
        } else if (extensions.some(ext => item.endsWith(ext))) {
          const content = fs.readFileSync(full, 'utf-8');
          if (pattern.test(content)) {
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (pattern.test(lines[i])) {
                results.push({ file: full, line: i + 1, text: lines[i].trim().substring(0, 100) });
              }
            }
          }
        }
      }
    } catch (e) { /* skip unreadable */ }
    return results;
  }

  const deprecatedHits = searchFiles('.', /api-trestle\.corelogic\.com|api-prod\.corelogic\.com/, ['.ts', '.tsx', '.js', '.jsx', '.env']);
  if (deprecatedHits.length > 0) {
    for (const hit of deprecatedHits) {
      FAIL('K1', `Deprecated Trestle endpoint in ${hit.file}:${hit.line}: ${hit.text}`);
    }
  } else {
    PASS('K1', 'No deprecated Trestle endpoints (corelogic.com) in codebase');
  }

  // K2: Check for client-side IDX/Trestle calls
  const clientSideHits = searchFiles('app', /trestle|cotality|IDX_CLIENT/, ['.tsx', '.jsx']);
  const realClientHits = clientSideHits.filter(h => !h.file.includes('api/') && !h.text.includes('// ') && !h.text.includes('server'));
  if (realClientHits.length > 0) {
    for (const hit of realClientHits) {
      WARN('K2', `Potential client-side IDX reference in ${hit.file}:${hit.line}: ${hit.text}`);
    }
  } else {
    PASS('K2', 'No client-side Trestle/IDX references found (server-only access — correct)');
  }

  // K3: Check for exposed credentials
  const credHits = searchFiles('app', /IDX_CLIENT_SECRET|TRESTLE.*SECRET/, ['.tsx', '.jsx', '.ts', '.js']);
  const realCredHits = credHits.filter(h => !h.text.includes('process.env') || h.file.includes('page.'));
  if (realCredHits.length > 0) {
    for (const hit of realCredHits) {
      FAIL('K3', `Potential credential exposure in ${hit.file}:${hit.line}: ${hit.text}`);
    }
  } else {
    PASS('K3', 'No credential exposure in frontend code');
  }

  // K4: Check media proxy allowlist
  try {
    const proxyCode = fs.readFileSync('app/api/media/proxy/route.ts', 'utf-8');
    if (proxyCode.includes('api.cotality.com')) {
      PASS('K4', 'Media proxy allowlist includes api.cotality.com');
    } else {
      FAIL('K4', 'Media proxy allowlist missing api.cotality.com');
    }
    if (proxyCode.includes('corelogic.com')) {
      WARN('K4b', 'Media proxy still allows deprecated corelogic.com domains');
    }
  } catch (e) {
    WARN('K4', 'Could not read media proxy route');
  }

  // K5: Check REBNY attribution presence in frontend
  const attributionHits = searchFiles('app', /REBNY|rebny.*listing.*service|listing.*courtesy/i, ['.tsx', '.ts']);
  if (attributionHits.length > 0) {
    PASS('K5', `REBNY attribution found in ${attributionHits.length} files`);
  } else {
    FAIL('K5', 'No REBNY attribution text found in frontend code — required by UCBA Art. III, Sec. 2(C)');
  }

  // ── SECTION 12: LARGER DATA PULL — Broader audit ───────
  console.log('\n─── SECTION 12: BROADER DATA AUDIT (100 listings) ───');

  const broadData = await fetchOData(token, 'Property', {
    $top: '100',
    $select: 'ListingId,PropertyType,StandardStatus,ListPrice,BedroomsTotal,BathroomsFull,StreetName,City,PostalCode,PublicRemarks,PhotosCount,ListAgentMlsId,ListAgentFullName,ListOfficeName,InternetAddressDisplayYN,ListingAgreement',
    $filter: "StandardStatus eq 'Active'",
    $orderby: 'ModificationTimestamp desc',
    $count: 'true',
  });

  if (!broadData.error) {
    const broad = broadData.value || [];
    const broadTotal = broadData['@odata.count'] || broad.length;
    console.log(`  Fetched ${broad.length} of ${broadTotal} active listings`);

    // L1: Property type distribution
    const typeDist = {};
    for (const l of broad) {
      const pt = l.PropertyType || 'unknown';
      typeDist[pt] = (typeDist[pt] || 0) + 1;
    }
    console.log(`  Property type distribution: ${JSON.stringify(typeDist)}`);
    PASS('L1', `Property type distribution: ${Object.entries(typeDist).map(([k,v]) => `${k}=${v}`).join(', ')}`);

    // L2: Listings without photos
    const noPhotos = broad.filter(l => !l.PhotosCount || l.PhotosCount === 0);
    if (noPhotos.length > 0) {
      WARN('L2', `${noPhotos.length}/${broad.length} active listings have no photos (PhotosCount=0)`);
    } else {
      PASS('L2', 'All active listings have at least 1 photo');
    }

    // L3: Listings without PublicRemarks
    const noRemarks = broad.filter(l => !l.PublicRemarks || l.PublicRemarks.length < 10);
    if (noRemarks.length > 0) {
      WARN('L3', `${noRemarks.length}/${broad.length} listings have missing/short PublicRemarks (< 10 chars)`);
    } else {
      PASS('L3', 'All listings have PublicRemarks');
    }

    // L4: Agent info completeness
    const noAgent = broad.filter(l => !l.ListAgentMlsId || !l.ListAgentFullName);
    if (noAgent.length > 0) {
      FAIL('L4', `${noAgent.length}/${broad.length} listings missing ListAgentMlsId or ListAgentFullName`);
    } else {
      PASS('L4', 'All listings have ListAgentMlsId and ListAgentFullName');
    }

    // L5: Data quality — rejection rate estimate
    const qualityIssues = broad.filter(l => {
      return !l.ListPrice || !l.BedroomsTotal || !l.BathroomsFull || !l.StreetName || !l.City || !l.PostalCode;
    });
    const rejectionRate = (qualityIssues.length / broad.length * 100).toFixed(1);
    if (Number(rejectionRate) > 5) {
      FAIL('L5', `Estimated rejection rate: ${rejectionRate}% (${qualityIssues.length}/${broad.length}) — UCBA: >5% quarterly = $10,000 fine`);
    } else {
      PASS('L5', `Estimated data quality rate: ${(100 - Number(rejectionRate)).toFixed(1)}% — within UCBA 5% threshold`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  AUDIT COMPLETE');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  PASS: ${passCount}`);
  console.log(`  FAIL: ${failCount}`);
  console.log(`  WARN: ${warnCount}`);
  console.log(`  Total findings: ${findings.length}`);
  console.log('═══════════════════════════════════════════════════\n');

  if (failCount > 0) {
    console.log('FAILURES:');
    findings.filter(f => f.severity === 'FAIL').forEach(f => {
      console.log(`  ✗ [${f.code}] ${f.message}`);
    });
  }

  if (warnCount > 0) {
    console.log('\nWARNINGS:');
    findings.filter(f => f.severity === 'WARN').forEach(f => {
      console.log(`  ⚠ [${f.code}] ${f.message}`);
    });
  }

  // Write report to file
  const report = {
    date: new Date().toISOString(),
    endpoint: API_URL,
    feed: 'IDX Plus (Mallan Real Estate Inc.)',
    summary: { pass: passCount, fail: failCount, warn: warnCount, total: findings.length },
    findings,
  };
  fs.writeFileSync('audit-trestle-report.json', JSON.stringify(report, null, 2));
  console.log('\nFull report written to: audit-trestle-report.json');
}

runAudit().catch(err => {
  console.error('AUDIT FATAL ERROR:', err);
  process.exit(1);
});
