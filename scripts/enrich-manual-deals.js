require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const CID = process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY;
const SEC = process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET;
const BASE = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

const data = require('../data/maya-past-deals.json');

async function getToken() {
  const tr = await fetch(`${BASE}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${CID}&client_secret=${SEC}&scope=api`,
  });
  const { access_token } = await tr.json();
  return access_token;
}

async function searchByAddress(token, streetNum, streetName, unit) {
  const p = new URLSearchParams();
  let filter = `StreetNumber eq '${streetNum}' and contains(StreetName,'${streetName}') and StandardStatus eq 'Closed'`;
  if (unit) {
    filter += ` and UnitNumber eq '${unit}'`;
  }
  p.set('$filter', filter);
  p.set('$select', 'ListingId,StreetNumber,StreetDirPrefix,StreetName,StreetSuffix,UnitNumber,ClosePrice,ListPrice,CloseDate,PropertyType');
  p.set('$orderby', 'CloseDate desc');
  p.set('$top', '5');

  const r = await fetch(`${BASE}/odata/Property?${p}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return [];
  const d = await r.json();
  return d.value || [];
}

const WORD_TO_NUM = {
  FIRST: '1ST', SECOND: '2ND', THIRD: '3RD', FOURTH: '4TH', FIFTH: '5TH',
  SIXTH: '6TH', SEVENTH: '7TH', EIGHTH: '8TH', NINTH: '9TH', TENTH: '10TH',
};

const SUFFIXES = /\b(Avenue|Street|Place|Drive|Road|Boulevard|Lane|Way|Plaza|Terrace|Court|Square|Park|Ave|St|Blvd|Pl|Dr|Rd|Ln|Ct|Pkwy)\b/gi;
const DIRS = /\b(East|West|North|South|E|W|N|S)\b/gi;

function parseStreet(street) {
  // Handle Queens-style addresses like "48-15 11th Street"
  const qm = street.match(/^(\d+-\d+)\s+(.+)$/);
  if (qm) {
    let name = qm[2].replace(SUFFIXES, '').replace(DIRS, '').trim().toUpperCase();
    if (WORD_TO_NUM[name]) name = WORD_TO_NUM[name];
    return { num: qm[1], name };
  }

  const m = street.match(/^(\d+)\s+(.+)$/);
  if (!m) return null;
  const num = m[1];
  let rest = m[2].toUpperCase();

  // Strip suffixes and directions
  rest = rest.replace(/\b(AVENUE|STREET|PLACE|DRIVE|ROAD|BOULEVARD|LANE|WAY|PLAZA|TERRACE|COURT|SQUARE|PARK|AVE|ST|BLVD|PL|DR|RD|LN|CT|PKWY)\b/g, '');
  rest = rest.replace(/\b(EAST|WEST|NORTH|SOUTH)\b/g, '');
  rest = rest.trim().replace(/\s+/g, ' ');

  // Convert word ordinals
  if (WORD_TO_NUM[rest]) rest = WORD_TO_NUM[rest];

  // Handle "E" or "W" prefix remaining - strip it for the search name
  rest = rest.replace(/^[EW]\s+/, '').trim();

  // Fix typos
  if (rest === 'HUSDON') rest = 'HUDSON';
  if (rest === 'AVEUE') rest = '';

  return { num, name: rest };
}

async function run() {
  const token = await getToken();
  let matched = 0, notFound = 0, enriched = 0, alreadyHad = 0;

  for (const listName of ['pastSales', 'pastRentals']) {
    for (const deal of data[listName]) {
      // Skip if already has a price
      if (deal.price && deal.price > 1) {
        alreadyHad++;
        continue;
      }

      const parsed = parseStreet(deal.street);
      if (!parsed || !parsed.name) {
        console.log('SKIP:', deal.street);
        notFound++;
        continue;
      }

      // Try with unit first, then without
      let results = await searchByAddress(token, parsed.num, parsed.name, deal.unit);
      if (results.length === 0 && deal.unit) {
        // Try without unit (some units formatted differently)
        results = await searchByAddress(token, parsed.num, parsed.name, null);
      }

      if (results.length > 0) {
        let best = results[0];
        // If multiple results and we have a unit, prefer unit match
        if (deal.unit && results.length > 1) {
          const unitMatch = results.find(r => r.UnitNumber === deal.unit);
          if (unitMatch) best = unitMatch;
        }
        // If we have a date, prefer date match
        if (deal.date && results.length > 1) {
          const dateMatch = results.find(r => r.CloseDate && r.CloseDate.startsWith(deal.date.substring(0, 4)));
          if (dateMatch) best = dateMatch;
        }

        const price = best.ClosePrice || best.ListPrice;
        if (price && price > 1) {
          deal.price = price;
          enriched++;
          console.log(`MATCH: ${deal.street} ${deal.unit || ''} -> $${price.toLocaleString()} (${best.CloseDate || 'N/A'}) [${best.ListingId}]`);
        } else {
          console.log(`MATCH (no price): ${deal.street} ${deal.unit || ''} -> ${best.ListingId}`);
        }
        matched++;
      } else {
        console.log(`NOT FOUND: ${deal.street} ${deal.unit || ''} (num=${parsed.num} name=${parsed.name})`);
        notFound++;
      }

      await new Promise(r => setTimeout(r, 100));
    }
  }

  console.log(`\nTotal: ${data.pastSales.length + data.pastRentals.length} deals`);
  console.log(`Already had price: ${alreadyHad}, New matches: ${matched}, Not found: ${notFound}, Enriched: ${enriched}`);

  fs.writeFileSync('data/maya-past-deals.json', JSON.stringify(data, null, 2));
  console.log('Saved.');
}

run().catch(e => console.error(e.message));
