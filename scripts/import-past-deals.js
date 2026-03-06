// Import past deals from maya-past-deals.json into the database
// Usage: node scripts/import-past-deals.js

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });

const { PrismaClient } = require('@prisma/client');
const data = require('../data/maya-past-deals.json');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL } },
});

async function main() {
  // Find Maya's agent ID
  const agent = await prisma.agent.findFirst({
    where: { public_slug: 'maya-allan' },
    select: { id: true, full_name: true },
  });

  if (!agent) {
    // Try by name
    const byName = await prisma.agent.findFirst({
      where: { full_name: { contains: 'Maya', mode: 'insensitive' } },
      select: { id: true, full_name: true },
    });
    if (!byName) {
      console.error('ERROR: Could not find Maya agent in database');
      process.exit(1);
    }
    console.log(`Found agent: ${byName.full_name} (id: ${byName.id})`);
    var agentId = byName.id;
  } else {
    console.log(`Found agent: ${agent.full_name} (id: ${agent.id})`);
    var agentId = agent.id;
  }

  // Dedupe helper — normalize address for comparison
  function normalizeAddr(street, unit) {
    return (street || '').toLowerCase().replace(/\s+/g, ' ').trim()
      + '|' + (unit || '').toLowerCase().trim();
  }

  // Import sales
  const seenSales = new Set();
  let salesCount = 0;
  for (const deal of data.pastSales) {
    const key = normalizeAddr(deal.street, deal.unit) + '|' + (deal.date || '');
    if (seenSales.has(key)) {
      console.log(`  SKIP duplicate sale: ${deal.street} ${deal.unit || ''} (${deal.date})`);
      continue;
    }
    seenSales.add(key);

    await prisma.pastDeal.create({
      data: {
        agent_id: agentId,
        street: deal.street,
        unit: deal.unit || null,
        city: 'New York',
        postal_code: null,
        neighborhood: deal.neighborhood || null,
        deal_type: 'sale',
        property_type: deal.type || null,
        close_price: deal.price != null ? Number(deal.price) : null,
        close_date: deal.date ? new Date(deal.date) : null,
        beds: deal.beds != null ? Number(deal.beds) : null,
        baths_full: deal.baths != null ? Number(deal.baths) : null,
        baths_half: deal.bathsHalf != null ? Number(deal.bathsHalf) : null,
        sqft: deal.sqft != null && deal.sqft > 0 ? Number(deal.sqft) : null,
        photo_url: deal.photoUrl || null,
        listing_courtesy: [deal.listOfficeName, deal.listAgentFullName].filter(Boolean).join(' - ') || null,
        source: deal.source || 'manual',
        trestle_listing_id: deal.listingId || null,
        trestle_listing_key: deal.listingKey || null,
        sort_order: null,
      },
    });
    salesCount++;
  }

  // Import rentals
  const seenRentals = new Set();
  let rentalsCount = 0;
  for (const deal of data.pastRentals) {
    const key = normalizeAddr(deal.street, deal.unit) + '|' + (deal.date || '');
    if (seenRentals.has(key)) {
      console.log(`  SKIP duplicate rental: ${deal.street} ${deal.unit || ''} (${deal.date})`);
      continue;
    }
    seenRentals.add(key);

    await prisma.pastDeal.create({
      data: {
        agent_id: agentId,
        street: deal.street,
        unit: deal.unit || null,
        city: 'New York',
        postal_code: null,
        neighborhood: deal.neighborhood || null,
        deal_type: 'rent',
        property_type: deal.type || null,
        close_price: deal.price != null ? Number(deal.price) : null,
        close_date: deal.date ? new Date(deal.date) : null,
        beds: deal.beds != null ? Number(deal.beds) : null,
        baths_full: deal.baths != null ? Number(deal.baths) : null,
        baths_half: deal.bathsHalf != null ? Number(deal.bathsHalf) : null,
        sqft: deal.sqft != null && deal.sqft > 0 ? Number(deal.sqft) : null,
        photo_url: deal.photoUrl || null,
        listing_courtesy: [deal.listOfficeName, deal.listAgentFullName].filter(Boolean).join(' - ') || null,
        source: deal.source || 'manual',
        trestle_listing_id: deal.listingId || null,
        trestle_listing_key: deal.listingKey || null,
        sort_order: null,
      },
    });
    rentalsCount++;
  }

  console.log(`\nDone! Imported ${salesCount} sales + ${rentalsCount} rentals = ${salesCount + rentalsCount} total`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
