require('dotenv').config({ path: '.env.local' });

const BASE = 'https://data.cityofnewyork.us';
const token = process.env.NYC_SODA_APP_TOKEN || process.env.NYC_SOCRATA_APP_TOKEN || process.env.SOCRATA_APP_TOKEN || process.env.SODA_APP_TOKEN || process.env.NYC_SODA_TOKEN;
const REALPROP = process.env.SODA_DATASET_ACRIS_REALPROPERTY;
const MASTER = process.env.SODA_DATASET_ACRIS_MASTER;

async function test() {
  const headers = { accept: 'application/json' };
  if (token) headers['X-App-Token'] = token;

  // Step 1: Get document IDs
  const url1 = new URL(`/resource/${REALPROP}.json`, BASE);
  url1.searchParams.set('$where', "borough='1' AND block='00770' AND lot='0059'");
  url1.searchParams.set('$select', 'document_id');
  url1.searchParams.set('$limit', '50');
  const r1 = await fetch(url1.toString(), { headers });
  const d1 = await r1.json();
  console.log('Found', d1.length, 'property docs');

  // Step 2: Get ALL master records for these docs (no doc_type filter)
  const docIds = d1.map(r => r.document_id);
  const inClause = docIds.slice(0, 20).map(id => `'${id}'`).join(',');
  const url2 = new URL(`/resource/${MASTER}.json`, BASE);
  url2.searchParams.set('$where', `document_id in (${inClause})`);
  url2.searchParams.set('$select', 'document_id,doc_type,document_amt,recorded_datetime,good_through_date');
  url2.searchParams.set('$order', 'recorded_datetime DESC');
  url2.searchParams.set('$limit', '20');

  const r2 = await fetch(url2.toString(), { headers });
  const d2 = await r2.json();
  console.log('\nAll master records (first 20 doc IDs):');
  if (Array.isArray(d2)) {
    console.log(`Found ${d2.length} records`);
    for (const doc of d2) {
      console.log(`  ${doc.doc_type} | $${doc.document_amt || '0'} | ${doc.recorded_datetime || 'no date'}`);
    }
    // Show unique doc types
    const types = [...new Set(d2.map(d => d.doc_type))];
    console.log('\nUnique doc types:', types);
  } else {
    console.log('Error:', d2);
  }

  // Step 3: Try broader search - any doc with amount > 0
  const url3 = new URL(`/resource/${MASTER}.json`, BASE);
  url3.searchParams.set('$where', `document_id in (${inClause}) AND document_amt > '0'`);
  url3.searchParams.set('$select', 'document_id,doc_type,document_amt,recorded_datetime');
  url3.searchParams.set('$order', 'recorded_datetime DESC');
  url3.searchParams.set('$limit', '10');

  const r3 = await fetch(url3.toString(), { headers });
  const d3 = await r3.json();
  console.log('\nRecords with amount > 0:');
  if (Array.isArray(d3)) {
    console.log(`Found ${d3.length} records`);
    for (const doc of d3) {
      console.log(`  ${doc.doc_type} | $${doc.document_amt} | ${doc.recorded_datetime || 'no date'}`);
    }
  }
}

test().catch(e => console.error(e.message));
