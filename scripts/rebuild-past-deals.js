// Rebuild maya-past-deals.json from Excel + Trestle address lookups
// Excel = authoritative for sale vs rental. Trestle = photos, prices, listing office.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const TRESTLE_API_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
const CLIENT_ID = process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY;
const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET;

const excelPath = path.join('C:', 'Users', 'MayaAllan', 'Desktop', 'Closed Deals Real Estate', 'Closed Deals MAllan', 'Total Deals.xlsx');
const outputPath = path.join(__dirname, '..', 'data', 'maya-past-deals.json');

// ── Trestle helpers ──

async function getToken() {
  const res = await fetch(`${TRESTLE_API_URL}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: 'api' }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function fetchByAgent(token) {
  const params = new URLSearchParams();
  params.set('$filter', "ListAgentFullName eq 'Maya Allan' and StandardStatus eq 'Closed'");
  params.set('$select', 'ListingId,ListingKey,CloseDate,ClosePrice,ListPrice,StreetNumber,StreetDirPrefix,StreetName,StreetSuffix,StreetDirSuffix,UnitNumber,City,PostalCode,PropertyType,PropertySubType,CommonInterest,BedroomsTotal,BathroomsFull,BathroomsHalf,LivingArea,ListOfficeName,ListAgentFullName,PhotosCount');
  params.set('$orderby', 'CloseDate desc');
  params.set('$top', '200');
  const res = await fetch(`${TRESTLE_API_URL}/odata/Property?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.value || [];
}

async function fetchByAddress(token, streetNumber, streetName, unit) {
  // Build filter matching street number + name + optionally unit
  let filter = `StreetNumber eq '${streetNumber}' and contains(StreetName,'${streetName}') and StandardStatus eq 'Closed'`;
  if (unit) {
    filter += ` and UnitNumber eq '${unit}'`;
  }
  const params = new URLSearchParams();
  params.set('$filter', filter);
  params.set('$select', 'ListingId,ListingKey,CloseDate,ClosePrice,ListPrice,StreetNumber,StreetDirPrefix,StreetName,StreetSuffix,StreetDirSuffix,UnitNumber,City,PostalCode,PropertyType,PropertySubType,CommonInterest,BedroomsTotal,BathroomsFull,BathroomsHalf,LivingArea,ListOfficeName,ListAgentFullName,PhotosCount');
  params.set('$orderby', 'CloseDate desc');
  params.set('$top', '10');
  const res = await fetch(`${TRESTLE_API_URL}/odata/Property?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    console.log(`  [WARN] ${res.status} for ${streetNumber} ${streetName} ${unit || ''}`);
    return [];
  }
  const data = await res.json();
  return data.value || [];
}

// Trestle guidance (2026-04-07): use ResourceRecordKey (always unique), not ResourceRecordID (can duplicate).
async function batchFetchPhotos(token, listingIds, idToKeyMap) {
  const map = new Map();
  if (listingIds.length === 0) return map;
  // Batch in groups of 20
  for (let i = 0; i < listingIds.length; i += 20) {
    const batch = listingIds.slice(i, i + 20);
    const keyToId = new Map();
    const filterParts = batch.map(id => {
      const key = idToKeyMap?.get(id);
      if (key) { keyToId.set(key, id); return `ResourceRecordKey eq '${key}'`; }
      keyToId.set(id, id); return `ResourceRecordID eq '${id}'`;
    });
    const params = new URLSearchParams();
    params.set('$filter', `(${filterParts.join(' or ')}) and Order le 1`);
    params.set('$select', 'ResourceRecordKey,ResourceRecordID,MediaURL,Order');
    params.set('$top', String(batch.length * 2));
    const res = await fetch(`${TRESTLE_API_URL}/odata/Media?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) continue;
    const data = await res.json();
    for (const m of (data.value || [])) {
      const mkey = String(m.ResourceRecordKey || m.ResourceRecordID || '');
      const lid = keyToId.get(mkey) || mkey;
      if (lid && m.MediaURL && !map.has(lid)) {
        map.set(lid, `/api/media/proxy?url=${encodeURIComponent(String(m.MediaURL))}`);
      }
    }
  }
  return map;
}

// ── Excel helpers ──

function parseExcelDate(serial) {
  if (!serial) return null;
  if (typeof serial === 'string') return serial;
  const d = new Date((serial - 25569) * 86400000);
  return d.toISOString().split('T')[0];
}

function parseAddress(addr) {
  if (!addr) return { street: '', unit: null, streetNumber: '', streetName: '' };
  const trimmed = addr.trim();
  const parts = trimmed.split(',').map(s => s.trim());

  let street = parts[0];
  let unit = null;

  if (parts.length >= 2) {
    const p2 = parts[1];
    if (!/^(New York|Brooklyn|Long Island|NY|Queens|Bronx|Staten)/i.test(p2)) {
      unit = p2 || null;
    }
  }

  // Also try embedded unit patterns like "800 2nd Avenue 806"
  if (!unit) {
    const m = street.match(/^(.+?)\s+((?:Unit|Apt|#)\s*\S+)$/i);
    if (m) { street = m[1]; unit = m[2].replace(/^(Unit|Apt|#)\s*/i, ''); }
  }

  // Extract street number and name for Trestle lookup
  const numMatch = street.match(/^(\d[\d-]*)\s+(.+)$/);
  const streetNumber = numMatch ? numMatch[1] : '';
  const streetName = numMatch ? numMatch[2].replace(/\s+(Street|St|Avenue|Ave|Place|Pl|Road|Rd|Drive|Dr|Way|Blvd|Boulevard|Broadway|West|East|North|South)\s*$/i, '').trim() : street;

  return { street, unit, streetNumber, streetName };
}

function parseBeds(val) {
  if (val == null) return null;
  const s = String(val);
  if (/studio/i.test(s)) return 0;
  if (/rooms/i.test(s)) return null;
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

function parseBaths(val) {
  if (val == null || val === 'N/A') return null;
  const s = String(val);
  const m = s.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

function normalizeType(t) {
  if (!t) return 'Residential';
  const tl = t.toLowerCase().trim();
  if (tl.includes('commercial')) return 'Commercial';
  if (tl === 'condo') return 'Condo';
  if (tl === 'coop') return 'Co-op';
  if (tl === 'condop' || tl === 'condp') return 'Condop';
  if (tl === 'townhouse') return 'Townhouse';
  if (tl === 'garage') return 'Garage';
  if (tl === 'rental') return 'Rental';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function trestleStreet(r) {
  return [r.StreetNumber, r.StreetDirPrefix, r.StreetName, r.StreetSuffix, r.StreetDirSuffix].filter(Boolean).join(' ');
}

function normalizeAddr(street, unit) {
  return `${street}|${unit || ''}`.toLowerCase().replace(/\s+/g, ' ').replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave').replace(/\bwest\b/g, 'w').replace(/\beast\b/g, 'e').trim();
}

function mapCommonInterest(interest, propType) {
  switch (interest) {
    case 'Condominium': return 'Condo';
    case 'StockCooperative': return 'Co-op';
    case 'Condop': return 'Condop';
    default: return propType === 'ResidentialLease' ? 'Rental' : 'Residential';
  }
}

// ── Main ──

async function main() {
  console.log('Reading Excel...');
  const wb = XLSX.readFile(excelPath);

  // Parse Excel
  const salesRows = XLSX.utils.sheet_to_json(wb.Sheets['Total Sales']);
  const rentalRows = XLSX.utils.sheet_to_json(wb.Sheets['Total Rentals']);
  console.log(`Excel: ${salesRows.length} sales, ${rentalRows.length} rentals`);

  console.log('Getting Trestle token...');
  const token = await getToken();

  // Step 1: Get Maya's exclusives from Trestle
  console.log('Fetching exclusive deals from Trestle...');
  const exclusives = await fetchByAgent(token);
  console.log(`  Found ${exclusives.length} exclusive deals`);

  // Build lookup of Trestle exclusives by normalized address
  const trestleByAddr = new Map();
  for (const r of exclusives) {
    const addr = normalizeAddr(trestleStreet(r), r.UnitNumber);
    if (!trestleByAddr.has(addr)) trestleByAddr.set(addr, []);
    trestleByAddr.get(addr).push(r);
  }

  // Step 2: For each Excel row, check if it matches a Trestle exclusive
  // If not, query Trestle by address to find it
  const allTrestleListingIds = new Set(exclusives.map(r => r.ListingId));
  const addressLookupResults = new Map(); // normalized addr -> trestle record[]

  function processExcelRows(rows, dealType, bedKey, bathKey, sqftKey, areaKey, dateKey) {
    return rows.map(row => {
      const { street, unit, streetNumber, streetName } = parseAddress(row['Address']);
      const addr = normalizeAddr(street, unit);
      return { row, street, unit, streetNumber, streetName, addr, dealType, bedKey, bathKey, sqftKey, areaKey, dateKey };
    });
  }

  const excelSales = processExcelRows(salesRows, 'sale', 'Bed', 'Bath', 'SqFt', 'Area', 'Closing Date');
  const excelRentals = processExcelRows(rentalRows, 'rent', 'bed', 'bath', 'sq ft', 'Area', 'Date');
  const allExcel = [...excelSales, ...excelRentals];

  // Find Excel entries NOT matched to Trestle exclusives
  const unmatchedExcel = allExcel.filter(e => {
    // Check if this address is in the Trestle exclusives
    return !trestleByAddr.has(e.addr);
  });
  console.log(`Excel entries not matched to Trestle exclusives: ${unmatchedExcel.length}`);

  // Step 3: Query Trestle by address for unmatched entries
  console.log('Looking up unmatched addresses in Trestle...');
  const lookedUp = new Set();
  for (const e of unmatchedExcel) {
    if (!e.streetNumber || lookedUp.has(e.addr)) continue;
    lookedUp.add(e.addr);

    // Extract just the core street name for Trestle search
    const coreStreetName = e.streetName
      .replace(/\b(Street|St|Avenue|Ave|Place|Pl|Blvd|Broadway)\b/gi, '')
      .replace(/\b(East|West|North|South|E|W|N|S)\b/gi, '')
      .trim();

    if (!coreStreetName) continue;

    const results = await fetchByAddress(token, e.streetNumber, coreStreetName, e.unit);
    if (results.length > 0) {
      addressLookupResults.set(e.addr, results);
      for (const r of results) allTrestleListingIds.add(r.ListingId);
      console.log(`  Found ${results.length} for ${e.streetNumber} ${coreStreetName} ${e.unit || ''} → ListOffice: ${results[0].ListOfficeName}`);
    } else {
      console.log(`  No results for ${e.streetNumber} ${coreStreetName} ${e.unit || ''}`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }

  // Step 4: Fetch photos for ALL trestle listings
  // Build ListingId → ListingKey map for ResourceRecordKey queries (Trestle guidance 2026-04-07)
  const idToKeyMap = new Map();
  for (const records of [exclusives, ...addressLookupResults.values()]) {
    for (const r of records) {
      if (r.ListingId && r.ListingKey) idToKeyMap.set(r.ListingId, r.ListingKey);
    }
  }
  console.log(`Fetching photos for ${allTrestleListingIds.size} listings...`);
  const photoMap = await batchFetchPhotos(token, [...allTrestleListingIds], idToKeyMap);
  console.log(`  Got photos for ${photoMap.size} listings`);

  // Step 5: Build final output
  function buildDeal(excelEntry) {
    const { row, street, unit, addr, dealType, bedKey, bathKey, sqftKey, areaKey, dateKey } = excelEntry;

    // Find matching Trestle record (prefer exclusive, then address lookup)
    let trestleRecord = null;
    let trestleRecords = trestleByAddr.get(addr) || addressLookupResults.get(addr) || [];

    // If multiple Trestle records for same address (repeat deals), try to match by date
    const excelDate = parseExcelDate(row[dateKey]);
    if (trestleRecords.length > 1 && excelDate) {
      const dateMatch = trestleRecords.find(r => r.CloseDate && r.CloseDate.startsWith(excelDate.substring(0, 4)));
      if (dateMatch) trestleRecord = dateMatch;
    }
    if (!trestleRecord && trestleRecords.length > 0) {
      trestleRecord = trestleRecords[0];
      // Remove used record so next repeat deal gets the next one
      const idx = trestleRecords.indexOf(trestleRecord);
      if (idx >= 0) trestleRecords.splice(idx, 1);
    }

    const isFromTrestle = !!trestleRecord;
    const listingId = trestleRecord ? trestleRecord.ListingId : null;

    return {
      street,
      unit,
      beds: isFromTrestle ? (trestleRecord.BedroomsTotal ?? parseBeds(row[bedKey])) : parseBeds(row[bedKey]),
      baths: isFromTrestle ? (trestleRecord.BathroomsFull ?? parseBaths(row[bathKey])) : parseBaths(row[bathKey]),
      bathsHalf: isFromTrestle ? (trestleRecord.BathroomsHalf || 0) : 0,
      sqft: isFromTrestle ? (trestleRecord.LivingArea || row[sqftKey] || 0) : (row[sqftKey] || 0),
      type: isFromTrestle ? mapCommonInterest(trestleRecord.CommonInterest, trestleRecord.PropertyType) : normalizeType(row['Type'] || row['type']),
      neighborhood: (row[areaKey] || '').trim(),
      date: isFromTrestle ? (trestleRecord.CloseDate || excelDate) : excelDate,
      price: isFromTrestle ? (trestleRecord.ClosePrice || trestleRecord.ListPrice || null) : null,
      listingId: listingId,
      listingKey: isFromTrestle ? (trestleRecord.ListingKey || null) : null,
      photoUrl: listingId ? (photoMap.get(listingId) || null) : null,
      listOfficeName: isFromTrestle ? (trestleRecord.ListOfficeName || null) : null,
      listAgentFullName: isFromTrestle ? (trestleRecord.ListAgentFullName || null) : null,
      source: isFromTrestle ? 'trestle' : 'manual',
    };
  }

  const pastSales = excelSales.map(buildDeal);
  const pastRentals = excelRentals.map(buildDeal);

  const output = { pastSales, pastRentals };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  // Summary
  const salesFromTrestle = pastSales.filter(d => d.source === 'trestle').length;
  const rentalsFromTrestle = pastRentals.filter(d => d.source === 'trestle').length;
  const salesWithPhotos = pastSales.filter(d => d.photoUrl).length;
  const rentalsWithPhotos = pastRentals.filter(d => d.photoUrl).length;
  const buyerRepSales = pastSales.filter(d => d.listOfficeName && d.listOfficeName !== 'MAllan Real Estate Inc').length;
  const buyerRepRentals = pastRentals.filter(d => d.listOfficeName && d.listOfficeName !== 'MAllan Real Estate Inc').length;

  console.log(`\n=== OUTPUT ===`);
  console.log(`Sales: ${pastSales.length} (${salesFromTrestle} from Trestle, ${salesWithPhotos} with photos, ${buyerRepSales} buyer-rep)`);
  console.log(`Rentals: ${pastRentals.length} (${rentalsFromTrestle} from Trestle, ${rentalsWithPhotos} with photos, ${buyerRepRentals} buyer-rep)`);
  console.log(`\nWrote: ${outputPath}`);

  // Show buyer-rep deals (another firm's listing)
  const allBuyerRep = [...pastSales, ...pastRentals].filter(d => d.listOfficeName && d.listOfficeName !== 'MAllan Real Estate Inc');
  if (allBuyerRep.length > 0) {
    console.log('\nBuyer-rep deals (Listing Courtesy needed):');
    allBuyerRep.forEach(d => console.log(`  ${d.street} ${d.unit || ''} | ${d.listOfficeName} | ${d.type} | ${d.source}`));
  }
}

main().catch(console.error);
