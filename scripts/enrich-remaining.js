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
  return (await tr.json()).access_token;
}

async function search(token, filter) {
  const p = new URLSearchParams();
  p.set('$filter', filter);
  p.set('$select', 'ListingId,StreetNumber,StreetName,UnitNumber,ClosePrice,ListPrice,CloseDate');
  p.set('$top', '10');
  const r = await fetch(`${BASE}/odata/Property?${p}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return [];
  return (await r.json()).value || [];
}

async function run() {
  const token = await getToken();

  // 100 UN Plaza 14B
  let results = await search(token, "StreetNumber eq '100' and contains(StreetName,'UNITED') and UnitNumber eq '14B' and StandardStatus eq 'Closed'");
  console.log('100 UN 14B:', results.map(r => `${r.ListingId} $${r.ClosePrice||r.ListPrice} ${r.CloseDate}`));

  // 1212 5th Ave Unit 1
  results = await search(token, "StreetNumber eq '1212' and contains(StreetName,'5TH') and UnitNumber eq '1' and StandardStatus eq 'Closed'");
  console.log('1212 5th #1:', results.map(r => `${r.ListingId} $${r.ClosePrice||r.ListPrice} ${r.CloseDate}`));

  // 217 Mulberry
  results = await search(token, "StreetNumber eq '217' and contains(StreetName,'MULBERRY')");
  console.log('217 Mulberry (all):', results.map(r => `${r.ListingId} ${r.UnitNumber} $${r.ClosePrice||r.ListPrice} ${r.CloseDate}`));

  // Apply fixes to data
  for (const list of [data.pastSales, data.pastRentals]) {
    for (const deal of list) {
      // Fix typo
      if (deal.street === '1212 Fifth Aveue') {
        deal.street = '1212 Fifth Avenue';
      }
      if (deal.street === '100 United Nations Plz') {
        deal.street = '100 United Nations Plaza';
      }
      if (deal.street === '255 Husdon Street') {
        deal.street = '255 Hudson Street';
      }
    }
  }

  fs.writeFileSync('data/maya-past-deals.json', JSON.stringify(data, null, 2));
  console.log('\nFixed typos and saved.');
}

run().catch(e => console.error(e.message));
