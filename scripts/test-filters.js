// Quick test of all search filters against live API
const BASE = 'https://mallan.nyc/api/listings';

async function test(label, params) {
  const url = `${BASE}?${new URLSearchParams(params).toString()}`;
  try {
    const res = await fetch(url);
    const j = await res.json();
    if (!j.success) {
      console.log(`FAIL ${label}: ${j.error}`);
      return;
    }
    const sample = (j.listings || []).slice(0, 2);
    console.log(`${j.count > 0 ? 'OK' : 'EMPTY'} ${label}: ${j.count} results (total: ${j.total})`);
    sample.forEach(l => {
      const parts = [];
      if (l.bedroomsTotal != null) parts.push(`${l.bedroomsTotal}bd`);
      if (l.bathroomsFull != null) parts.push(`${l.bathroomsFull}ba`);
      if (l.address?.neighborhood) parts.push(l.address.neighborhood);
      if (l.address?.streetName) parts.push(l.address.streetName);
      parts.push('$' + (l.listPrice || 0).toLocaleString());
      console.log(`  ${parts.join(' | ')}`);
    });
  } catch (e) {
    console.log(`ERROR ${label}: ${e.message}`);
  }
}

async function run() {
  console.log('=== FILTER TESTS ===\n');

  // Sort tests
  await test('Sort: High to Low', { type: 'sale', sort: 'price-desc', limit: '3' });
  await test('Sort: Low to High', { type: 'sale', sort: 'price-asc', limit: '3' });
  await test('Sort: Newest', { type: 'sale', sort: 'newest', limit: '3' });

  console.log('');

  // Beds/Baths
  await test('Beds: Studio (0)', { type: 'sale', beds: '0', limit: '3' });
  await test('Beds: 2+', { type: 'sale', beds: '2', limit: '3' });
  await test('Beds: 4+', { type: 'sale', beds: '4', limit: '3' });
  await test('Baths: 2+', { type: 'sale', minBaths: '2', limit: '3' });
  await test('Beds 2 + Baths 2', { type: 'sale', beds: '2', minBaths: '2', limit: '3' });

  console.log('');

  // Neighborhood
  await test('Neighborhood: Upper East Side', { type: 'sale', neighborhood: 'Upper East Side', limit: '3' });
  await test('Neighborhood: Tribeca', { type: 'sale', neighborhood: 'Tribeca', limit: '3' });
  await test('Neighborhood: Greenwich Village', { type: 'sale', neighborhood: 'Greenwich Village', limit: '3' });
  await test('Multi-Neighborhood: UES,Tribeca', { type: 'sale', neighborhood: 'Upper East Side,Tribeca', limit: '3' });

  console.log('');

  // Borough
  await test('Borough: Manhattan', { type: 'sale', borough: 'Manhattan', limit: '3' });
  await test('Borough: Brooklyn', { type: 'sale', borough: 'Brooklyn', limit: '3' });

  console.log('');

  // Address search
  await test('Address: 400 E 90th', { type: 'sale', address: '400 E 90th', limit: '3' });
  await test('Address: Park Avenue', { type: 'sale', address: 'Park Avenue', limit: '3' });
  await test('Address: 57th', { type: 'sale', address: '57th', limit: '3' });

  console.log('');

  // Price range
  await test('Price: $1M-$2M', { type: 'sale', minPrice: '1000000', maxPrice: '2000000', limit: '3' });
  await test('Price: $10M+', { type: 'sale', minPrice: '10000000', limit: '3' });

  console.log('');

  // Sqft
  await test('SqFt: 1000+', { type: 'sale', minSqft: '1000', limit: '3' });

  // Property sub-types
  await test('SubType: Condo', { type: 'sale', propertySubTypes: 'Condo', limit: '3' });
  await test('SubType: Co-op', { type: 'sale', propertySubTypes: 'Co-op', limit: '3' });

  console.log('');

  // Rental
  await test('Rentals: default', { type: 'rent', limit: '3' });
  await test('Rentals: 1bed Brooklyn', { type: 'rent', beds: '1', borough: 'Brooklyn', limit: '3' });

  console.log('');

  // Combined
  await test('Combined: UES 2bd+ $1M-$3M sorted low-high', {
    type: 'sale', neighborhood: 'Upper East Side', beds: '2',
    minPrice: '1000000', maxPrice: '3000000', sort: 'price-asc', limit: '3'
  });

  console.log('\n=== DONE ===');
}

run();
