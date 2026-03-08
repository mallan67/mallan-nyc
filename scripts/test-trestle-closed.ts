/**
 * Test: Query Trestle for Maya Allan's closed sales
 * Usage: npx tsx scripts/test-trestle-closed.ts
 */
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve('.env.local'), override: true });

import { getAccessToken } from '../lib/idx/auth';

async function main() {
  const token = await getAccessToken();
  const TRESTLE_API = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

  // Try different agent name variations
  const names = ['Maya Allan', 'MAYA ALLAN', 'Allan Maya'];

  for (const name of names) {
    const safeName = name.replace(/'/g, "''");
    const filter = `ListAgentFullName eq '${safeName}' and StandardStatus eq 'Closed'`;
    const params = new URLSearchParams();
    params.set('$filter', filter);
    params.set('$select', 'ListingId,ListAgentFullName,ListOfficeName,StandardStatus,CloseDate,ClosePrice,ListPrice,StreetNumber,StreetName,UnitNumber,City,PostalCode,BedroomsTotal,BathroomsFull,BathroomsHalf,LivingArea,PropertyType,PropertySubType,CommonInterest');
    params.set('$top', '100');
    params.set('$orderby', 'CloseDate desc');
    params.set('$count', 'true');

    console.log(`\n--- Trying: "${name}" ---`);
    const resp = await fetch(`${TRESTLE_API}/odata/Property?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (!resp.ok) {
      console.log(`  Status: ${resp.status} ${resp.statusText}`);
      const text = await resp.text();
      console.log(`  Body: ${text.substring(0, 200)}`);
      continue;
    }

    const data = await resp.json();
    const count = data['@odata.count'] ?? data.value?.length ?? 0;
    console.log(`  Total: ${count}`);

    if (data.value && data.value.length > 0) {
      console.log(`  First 5:`);
      for (const r of data.value.slice(0, 5)) {
        console.log(`    ${r.StreetNumber} ${r.StreetName} ${r.UnitNumber || ''} | $${r.ClosePrice || r.ListPrice} | ${r.CloseDate || 'no date'} | ${r.BedroomsTotal}BR/${r.BathroomsFull}BA | ${r.CommonInterest || r.PropertySubType || r.PropertyType}`);
      }
    }
  }

  // Also try by office name
  console.log('\n--- By Office: Mallan Real Estate ---');
  const officeFilter = `ListOfficeName eq 'Mallan Real Estate Inc' and StandardStatus eq 'Closed'`;
  const officeParams = new URLSearchParams();
  officeParams.set('$filter', officeFilter);
  officeParams.set('$select', 'ListingId,ListAgentFullName,ListOfficeName,StandardStatus,CloseDate,ClosePrice,ListPrice,StreetNumber,StreetName,UnitNumber,City,BedroomsTotal,BathroomsFull,PropertyType,PropertySubType,CommonInterest');
  officeParams.set('$top', '100');
  officeParams.set('$orderby', 'CloseDate desc');
  officeParams.set('$count', 'true');

  const officeResp = await fetch(`${TRESTLE_API}/odata/Property?${officeParams.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });

  if (officeResp.ok) {
    const officeData = await officeResp.json();
    const count = officeData['@odata.count'] ?? officeData.value?.length ?? 0;
    console.log(`  Total: ${count}`);
    if (officeData.value) {
      for (const r of officeData.value.slice(0, 10)) {
        console.log(`    ${r.ListAgentFullName} | ${r.StreetNumber} ${r.StreetName} ${r.UnitNumber || ''} | $${r.ClosePrice || r.ListPrice} | ${r.CloseDate || 'no date'} | ${r.CommonInterest || r.PropertySubType || r.PropertyType}`);
      }
    }
  } else {
    console.log(`  Status: ${officeResp.status}`);
  }

  // Try variations of office name
  for (const office of ['Mallan Real Estate', 'MAllan Real Estate', 'Mallan']) {
    const f = `contains(ListOfficeName,'${office}') and StandardStatus eq 'Closed'`;
    const p = new URLSearchParams();
    p.set('$filter', f);
    p.set('$select', 'ListingId,ListAgentFullName,ListOfficeName,CloseDate,ClosePrice,StreetNumber,StreetName,UnitNumber');
    p.set('$top', '5');
    p.set('$count', 'true');

    console.log(`\n--- contains(ListOfficeName,'${office}') ---`);
    const r = await fetch(`${TRESTLE_API}/odata/Property?${p.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (r.ok) {
      const d = await r.json();
      console.log(`  Total: ${d['@odata.count'] ?? d.value?.length ?? 0}`);
      if (d.value?.length > 0) {
        for (const x of d.value.slice(0, 3)) {
          console.log(`    ${x.ListAgentFullName} @ ${x.ListOfficeName} | ${x.StreetNumber} ${x.StreetName} ${x.UnitNumber || ''} | $${x.ClosePrice}`);
        }
      }
    } else {
      console.log(`  Status: ${r.status}`);
    }
  }
}

main().catch(console.error);
