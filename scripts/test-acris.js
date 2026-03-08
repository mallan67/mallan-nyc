require('dotenv').config({ path: '.env.local' });

const BASE = 'https://data.cityofnewyork.us';
const token = process.env.NYC_SODA_APP_TOKEN || process.env.NYC_SOCRATA_APP_TOKEN || process.env.SOCRATA_APP_TOKEN || process.env.SODA_APP_TOKEN || process.env.NYC_SODA_TOKEN;
const REALPROP = process.env.SODA_DATASET_ACRIS_REALPROPERTY;
const MASTER = process.env.SODA_DATASET_ACRIS_MASTER;

console.log('Token:', token ? token.slice(0, 4) + '...' : 'NONE');
console.log('REALPROP:', REALPROP);
console.log('MASTER:', MASTER);

async function test() {
  const headers = { accept: 'application/json' };
  if (token) headers['X-App-Token'] = token;

  // Step 1: Get document IDs for borough=1, block=00770, lot=00059
  const where1 = "borough='1' AND block='00770' AND lot='0059'";
  const url1 = new URL(`/resource/${REALPROP}.json`, BASE);
  url1.searchParams.set('$where', where1);
  url1.searchParams.set('$select', 'document_id');
  url1.searchParams.set('$order', 'document_id DESC');
  url1.searchParams.set('$limit', '50');

  console.log('\nStep 1:', url1.toString().substring(0, 150) + '...');
  const r1 = await fetch(url1.toString(), { headers });
  const d1 = await r1.json();
  console.log('Step 1 result:', Array.isArray(d1) ? d1.length + ' docs' : d1);

  if (!Array.isArray(d1) || d1.length === 0) {
    // Try with 4-digit lot padding
    const where1b = "borough='1' AND block='00770' AND lot='00059'";
    url1.searchParams.set('$where', where1b);
    console.log('\nRetrying with 5-digit lot:', url1.toString().substring(0, 150) + '...');
    const r1b = await fetch(url1.toString(), { headers });
    const d1b = await r1b.json();
    console.log('Retry result:', Array.isArray(d1b) ? d1b.length + ' docs' : d1b);
    if (!Array.isArray(d1b) || d1b.length === 0) {
      console.log('No docs found for this property');
      return;
    }
    return findDeed(d1b, headers);
  }

  return findDeed(d1, headers);
}

async function findDeed(docRows, headers) {
  const docIds = docRows.map(r => r.document_id);
  console.log('Doc IDs (first 5):', docIds.slice(0, 5));

  const inClause = docIds.map(id => `'${id}'`).join(',');
  const where2 = `document_id in (${inClause}) AND doc_type in ('DEED','DEEDO') AND document_amt>'0'`;
  const url2 = new URL(`/resource/${MASTER}.json`, BASE);
  url2.searchParams.set('$where', where2);
  url2.searchParams.set('$order', 'recorded_datetime DESC');
  url2.searchParams.set('$limit', '5');

  console.log('\nStep 2:', url2.toString().substring(0, 150) + '...');
  const r2 = await fetch(url2.toString(), { headers });
  const d2 = await r2.json();
  console.log('Step 2 result:', Array.isArray(d2) ? d2.length + ' deeds' : d2);

  if (Array.isArray(d2) && d2.length > 0) {
    console.log('\nMost recent deed:');
    console.log(JSON.stringify(d2[0], null, 2));
  }
}

test().catch(e => console.error('Error:', e.message));
