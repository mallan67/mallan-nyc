#!/usr/bin/env node
/**
 * Generate search-registry.json from:
 * 1. artifacts/metadata.xml (Trestle OData $metadata — all entity field names + types)
 * 2. data/rebny-rls-property-fields.csv (902 IDX Plus fields with Resource + Type)
 * 3. Current advanced form HTML (section labels, checkbox values, dropdown options)
 * 4. Verified field population data from live Trestle testing (2026-03-23)
 *
 * Output: public/crm/data/search-registry.json
 *
 * Usage: node scripts/generate-search-registry.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ═══ 1. Parse Trestle Metadata ═══
function parseMetadata() {
  const xml = fs.readFileSync(path.join(ROOT, 'artifacts/metadata.xml'), 'utf8');
  const entities = {};
  const entityRe = /<EntityType Name="([^"]+)">/g;
  let m;
  while (m = entityRe.exec(xml)) {
    const name = m[1];
    const start = m.index;
    const end = xml.indexOf('</EntityType>', start);
    const chunk = xml.substring(start, end);
    const fieldRe = /Property Name="([^"]+)"/g;
    const fields = [];
    let fm;
    while (fm = fieldRe.exec(chunk)) fields.push(fm[1]);
    entities[name] = new Set(fields);
  }
  return entities;
}

// ═══ 2. Parse IDX Plus CSV ═══
function parseIdxPlusCsv() {
  const csv = fs.readFileSync(path.join(ROOT, 'data/rebny-rls-property-fields.csv'), 'utf8');
  const lines = csv.split('\n').filter(l => l.trim());
  const fields = {};
  lines.slice(1).forEach(l => {
    const parts = l.split(',');
    if (parts.length >= 7) {
      const name = (parts[1] || '').trim();
      const resource = (parts[5] || '').trim();
      const type = (parts[6] || '').trim();
      if (name) fields[name] = { resource, type };
    }
  });
  return fields;
}

// ═══ 3. Section Definitions ═══
const SECTIONS = [
  { key: 'quick-search', label: 'Quick Search', collapsed: false, icon: 'fa-search' },
  { key: 'price-financials', label: 'Price & Financials', collapsed: false, icon: 'fa-dollar-sign' },
  { key: 'property-size', label: 'Property Size', collapsed: false, icon: 'fa-ruler-combined' },
  { key: 'status-activity', label: 'Status & Activity', collapsed: true, icon: 'fa-clock' },
  { key: 'location', label: 'Location', collapsed: true, icon: 'fa-map-marker-alt' },
  { key: 'property-type', label: 'Property Type & Ownership', collapsed: true, icon: 'fa-building' },
  { key: 'building-info', label: 'Building Information', collapsed: true, icon: 'fa-city' },
  { key: 'unit-features', label: 'Unit Features & Interior', collapsed: true, icon: 'fa-home' },
  { key: 'building-amenities', label: 'Building Amenities', collapsed: true, icon: 'fa-concierge-bell' },
  { key: 'open-house', label: 'Open Houses', collapsed: true, icon: 'fa-door-open' },
  { key: 'media', label: 'Media & Virtual Tours', collapsed: true, icon: 'fa-camera' },
  { key: 'rental', label: 'Rental Details', collapsed: true, icon: 'fa-key', tabs: ['rent'] },
  { key: 'commercial', label: 'Commercial', collapsed: true, icon: 'fa-store', website_only: true },
  { key: 'agent-office', label: 'Agent & Office', collapsed: true, icon: 'fa-user-tie' },
  { key: 'calculators', label: 'Calculators & Tools', collapsed: true, icon: 'fa-calculator', is_tool: true },
];

// ═══ 4. Field Definitions ═══
// Each field verified against metadata.xml
function buildFields(trestleEntities) {
  const prop = trestleEntities.Property || new Set();
  const oh = trestleEntities.OpenHouse || new Set();
  const media = trestleEntities.Media || new Set();
  const custom = trestleEntities.CustomProperty || new Set();

  function v(field, entity) {
    const ent = trestleEntities[entity || 'Property'] || new Set();
    return ent.has(field);
  }

  const fields = [];

  // Helper to add field with verification
  function add(f) {
    if (f.providers && f.providers.trestle) {
      const ent = f.providers.trestle.resource || 'Property';
      const fld = f.providers.trestle.field;
      f.trestle_verified = v(fld, ent);
      if (!f.trestle_verified && !f.crm_internal) {
        console.log('WARNING: ' + fld + ' NOT on ' + ent);
      }
    }
    fields.push(f);
  }

  // ─── QUICK SEARCH ───
  add({ key: 'rls-id', label: 'RLS ID / Listing #', section: 'quick-search', widget: 'text', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], placeholder: 'RLS ID, Web ID, Listing # (comma-separated)', providers: { trestle: { resource: 'Property', field: 'ListingId', operator: 'eq', datatype: 'string' } }, pill_format: 'ID: {value}', change_detection: false, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'zip', label: 'Zip Code', section: 'quick-search', widget: 'text', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], placeholder: '10001', providers: { trestle: { resource: 'Property', field: 'PostalCode', operator: 'eq', datatype: 'string' } }, pill_format: 'Zip: {value}', change_detection: false, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'address', label: 'Address or Building Name', section: 'quick-search', widget: 'text', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], placeholder: 'Address or Building Name', providers: { trestle: { resource: 'Property', field: 'StreetName', operator: 'contains', datatype: 'string' } }, pill_format: 'Address: {value}', change_detection: false, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'unit', label: 'Unit #', section: 'quick-search', widget: 'text', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], placeholder: 'Unit # (optional)', providers: { trestle: { resource: 'Property', field: 'UnitNumber', operator: 'eq', datatype: 'string' } }, pill_format: 'Unit: {value}', change_detection: false, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'keyword', label: 'Keyword Search', section: 'quick-search', widget: 'text', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], placeholder: 'Enter keywords...', providers: { trestle: { resource: 'Property', field: 'PublicRemarks', operator: 'contains', datatype: 'string' } }, pill_format: 'Keyword: "{value}"', change_detection: false, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'neighborhood', label: 'Neighborhood', section: 'quick-search', widget: 'neighborhood', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], providers: { trestle: { resource: 'Property', field: 'SubdivisionName', operator: 'eq', datatype: 'string' } }, pill_format: '{value}', change_detection: false, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'listing-source', label: 'Listing Source', section: 'quick-search', widget: 'checkbox-group', tabs: ['sale', 'rent'], modes: ['full'], options: [{ label: 'REBNY RLS (IDX)', value: 'idx' }, { label: 'My Exclusives', value: 'exclusive' }, { label: 'Website Only', value: 'website' }], providers: { prisma: { model: 'Listing', field: 'rls_eligible', operator: 'equals', datatype: 'boolean' } }, crm_internal: true, pill_format: 'Source: {value}', change_detection: false, display_tiers: ['crm'] });

  // ─── PRICE & FINANCIALS ───
  const priceOptions = [{ label: 'Any', value: '' }, { label: 'Custom', value: 'custom' }, { label: '$100K', value: '100000' }, { label: '$200K', value: '200000' }, { label: '$300K', value: '300000' }, { label: '$400K', value: '400000' }, { label: '$500K', value: '500000' }, { label: '$600K', value: '600000' }, { label: '$700K', value: '700000' }, { label: '$800K', value: '800000' }, { label: '$900K', value: '900000' }, { label: '$1M', value: '1000000' }, { label: '$1.25M', value: '1250000' }, { label: '$1.5M', value: '1500000' }, { label: '$1.75M', value: '1750000' }, { label: '$2M', value: '2000000' }, { label: '$2.5M', value: '2500000' }, { label: '$3M', value: '3000000' }, { label: '$3.5M', value: '3500000' }, { label: '$4M', value: '4000000' }, { label: '$5M', value: '5000000' }, { label: '$6M', value: '6000000' }, { label: '$7M', value: '7000000' }, { label: '$8M', value: '8000000' }, { label: '$10M', value: '10000000' }, { label: '$15M', value: '15000000' }, { label: '$20M', value: '20000000' }, { label: '$25M', value: '25000000' }, { label: '$30M', value: '30000000' }, { label: '$40M', value: '40000000' }, { label: '$50M', value: '50000000' }];
  const rentOptions = [{ label: 'Any', value: '' }, { label: 'Custom', value: 'custom' }, { label: '$1,000', value: '1000' }, { label: '$1,500', value: '1500' }, { label: '$2,000', value: '2000' }, { label: '$2,500', value: '2500' }, { label: '$3,000', value: '3000' }, { label: '$3,500', value: '3500' }, { label: '$4,000', value: '4000' }, { label: '$4,500', value: '4500' }, { label: '$5,000', value: '5000' }, { label: '$6,000', value: '6000' }, { label: '$7,000', value: '7000' }, { label: '$8,000', value: '8000' }, { label: '$10,000', value: '10000' }, { label: '$12,000', value: '12000' }, { label: '$15,000', value: '15000' }, { label: '$20,000', value: '20000' }, { label: '$25,000', value: '25000' }, { label: '$30,000', value: '30000' }, { label: '$40,000', value: '40000' }, { label: '$50,000', value: '50000' }];
  add({ key: 'price', label: 'Price', section: 'price-financials', widget: 'range-select', tabs: ['sale'], modes: ['basic', 'full'], options: priceOptions, providers: { trestle: { resource: 'Property', field: 'ListPrice', operator: 'ge/le', datatype: 'integer' }, prisma: { model: 'Listing', field: 'price', operator: 'gte/lte', datatype: 'integer' } }, pill_format: 'Price: ${min}-${max}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'rent', label: 'Rent', section: 'price-financials', widget: 'range-select', tabs: ['rent'], modes: ['basic', 'full'], options: rentOptions, providers: { trestle: { resource: 'Property', field: 'ListPrice', operator: 'ge/le', datatype: 'integer' } }, pill_format: 'Rent: ${min}-${max}/mo', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'maintenance', label: 'Maintenance / CC', section: 'price-financials', widget: 'range-select', tabs: ['sale'], modes: ['full'], providers: { trestle: { resource: 'Property', field: 'AssociationFee', operator: 'ge/le', datatype: 'number' } }, pill_format: 'Maint: ${min}-${max}/mo', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'tax', label: 'Monthly Tax', section: 'price-financials', widget: 'range-select', tabs: ['sale'], modes: ['full'], providers: { trestle: { resource: 'Property', field: 'TaxAnnualAmount', operator: 'ge/le', datatype: 'number', transform: 'annual_to_monthly' } }, pill_format: 'Tax: ${min}-${max}/mo', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'land-lease-yn', label: 'Land Lease', section: 'price-financials', widget: 'boolean', tabs: ['sale', 'rent'], modes: ['basic', 'full'], providers: { trestle: { resource: 'Property', field: 'LandLeaseYN', operator: 'eq', datatype: 'boolean' } }, pill_format: 'Land Lease: {value}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });

  // ─── PROPERTY SIZE ───
  const bedOptions = [{ label: 'Any', value: '' }, { label: 'Studio', value: '0' }, { label: '1 BR', value: '1' }, { label: '2 BR', value: '2' }, { label: '3 BR', value: '3' }, { label: '4 BR', value: '4' }, { label: '5 BR', value: '5' }, { label: '6 BR', value: '6' }, { label: '7 BR', value: '7' }, { label: '8+ BR', value: '8' }];
  const bathOptions = [{ label: 'Any', value: '' }, { label: '1 BA', value: '1' }, { label: '1.5 BA', value: '1.5' }, { label: '2 BA', value: '2' }, { label: '2.5 BA', value: '2.5' }, { label: '3 BA', value: '3' }, { label: '3.5 BA', value: '3.5' }, { label: '4 BA', value: '4' }, { label: '4.5 BA', value: '4.5' }, { label: '5 BA', value: '5' }, { label: '6+ BA', value: '6' }];
  const roomOptions = [{ label: 'Any', value: '' }, { label: '1', value: '1' }, { label: '2', value: '2' }, { label: '3', value: '3' }, { label: '4', value: '4' }, { label: '5', value: '5' }, { label: '6', value: '6' }, { label: '7', value: '7' }, { label: '8', value: '8' }, { label: '9', value: '9' }, { label: '10+', value: '10' }];
  const sqftOptions = [{ label: 'Any', value: '' }, { label: 'Custom', value: 'custom' }, { label: '300 SF', value: '300' }, { label: '400 SF', value: '400' }, { label: '500 SF', value: '500' }, { label: '600 SF', value: '600' }, { label: '700 SF', value: '700' }, { label: '800 SF', value: '800' }, { label: '900 SF', value: '900' }, { label: '1,000 SF', value: '1000' }, { label: '1,200 SF', value: '1200' }, { label: '1,500 SF', value: '1500' }, { label: '1,800 SF', value: '1800' }, { label: '2,000 SF', value: '2000' }, { label: '2,500 SF', value: '2500' }, { label: '3,000 SF', value: '3000' }, { label: '4,000 SF', value: '4000' }, { label: '5,000 SF', value: '5000' }, { label: '7,500 SF', value: '7500' }, { label: '10,000 SF', value: '10000' }];

  add({ key: 'beds', label: 'Bedrooms', section: 'property-size', widget: 'range-select', tabs: ['sale', 'rent'], modes: ['basic', 'full'], options: bedOptions, providers: { trestle: { resource: 'Property', field: 'BedroomsTotal', operator: 'ge/le', datatype: 'integer' }, prisma: { model: 'Listing', field: 'beds', operator: 'gte/lte', datatype: 'integer' } }, pill_format: 'Beds: {min}+', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'baths', label: 'Bathrooms', section: 'property-size', widget: 'range-select', tabs: ['sale', 'rent'], modes: ['basic', 'full'], options: bathOptions, providers: { trestle: { resource: 'Property', field: 'BathroomsTotalInteger', operator: 'ge/le', datatype: 'float' }, prisma: { model: 'Listing', field: 'baths', operator: 'gte/lte', datatype: 'float' } }, pill_format: 'Baths: {min}+', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'rooms', label: 'Total Rooms', section: 'property-size', widget: 'range-select', tabs: ['sale', 'rent'], modes: ['basic', 'full'], options: roomOptions, providers: { trestle: { resource: 'Property', field: 'RoomsTotal', operator: 'ge/le', datatype: 'integer' } }, pill_format: 'Rooms: {min}+', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'sqft', label: 'Square Feet', section: 'property-size', widget: 'range-select', tabs: ['sale', 'rent'], modes: ['basic', 'full'], options: sqftOptions, providers: { trestle: { resource: 'Property', field: 'LivingArea', operator: 'ge/le', datatype: 'integer' } }, pill_format: 'SqFt: {min}-{max}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });

  // ─── STATUS ───
  add({ key: 'status', label: 'Status', section: 'status-activity', widget: 'checkbox-group', tabs: ['sale', 'rent'], modes: ['basic', 'full'], options: [
    { label: 'Active', value: 'Active', checked_default: true },
    { label: 'Back On Market', value: 'Active', sub_status: 'BackOnMarket' },
    { label: 'Coming Soon', value: 'ComingSoon' },
    { label: 'Future', value: 'Incomplete', sub_status: 'Future' },
    { label: 'Offer', value: 'Pending', sub_status: 'Offer', group: 'Offer' },
    { label: 'Offer Out', value: 'Pending', sub_status: 'OfferOut', group: 'Offer' },
    { label: 'Offer Thru Us', value: 'Pending', sub_status: 'OfferThruUs', group: 'Offer' },
    { label: 'Offer Accepted', value: 'Pending', sub_status: 'OfferAccepted', group: 'Offer' },
    { label: 'Offer Accepted Thru Us', value: 'Pending', sub_status: 'OfferAcceptedThruUs', group: 'Offer' },
    { label: 'Contract', value: 'Pending', sub_status: 'Contract', group: 'Contract' },
    { label: 'Contract Out', value: 'Pending', sub_status: 'ContractOut', group: 'Contract' },
    { label: 'Contract Out Thru Us', value: 'Pending', sub_status: 'ContractOutThruUs', group: 'Contract' },
    { label: 'All Contract Signed', value: 'Pending', sub_status: 'AllContractSigned', group: 'Contract' },
    { label: 'Contract Signed', value: 'Pending', sub_status: 'ContractSigned', group: 'Contract' },
    { label: 'Contract Signed Thru Us', value: 'Pending', sub_status: 'ContractSignedThruUs', group: 'Contract' },
    { label: 'Board Approved', value: 'Pending', sub_status: 'BoardApproved' },
    { label: 'Sold', value: 'Closed', group: 'Sold' },
    { label: 'ACRISVerified', value: 'Closed', sub_status: 'ACRISVerified', group: 'Sold' },
    { label: 'Financed', value: 'Closed', sub_status: 'Financed', group: 'Sold' },
    { label: 'No Financing', value: 'Closed', sub_status: 'NoFinancing', group: 'Sold' },
    { label: 'Nominal Sales', value: 'Closed', sub_status: 'NominalSales', group: 'Sold' },
    { label: 'Withdrawn', value: 'Withdrawn', group: 'Not Active' },
    { label: 'Cancelled', value: 'Canceled', group: 'Not Active' },
    { label: 'Expired', value: 'Expired', group: 'Not Active' },
    { label: 'Hold', value: 'Hold', group: 'Not Active' },
    { label: 'Listed for Rent', value: 'CrossListing_ListedForRent', group: 'Cross' },
  ], providers: { trestle: { resource: 'Property', field: 'StandardStatus', operator: 'eq', datatype: 'string' } }, pill_format: 'Status: {value}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });

  // ─── DATES ───
  add({ key: 'listed-date', label: 'Listed Date', section: 'status-activity', widget: 'date-range', tabs: ['sale', 'rent'], modes: ['basic', 'full'], providers: { trestle: { resource: 'Property', field: 'ListingContractDate', operator: 'ge/le', datatype: 'date' } }, pill_format: 'Listed: {min} to {max}', change_detection: false, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'contract-date', label: 'Contract Signed', section: 'status-activity', widget: 'date-range', tabs: ['sale'], modes: ['basic', 'full'], providers: { trestle: { resource: 'Property', field: 'ListingContractDate', operator: 'ge/le', datatype: 'date' } }, pill_format: 'Contract: {min} to {max}', change_detection: false, display_tiers: ['crm'] });
  add({ key: 'sold-date', label: 'Sold / Closed', section: 'status-activity', widget: 'date-range', tabs: ['sale'], modes: ['basic', 'full'], providers: { trestle: { resource: 'Property', field: 'CloseDate', operator: 'ge/le', datatype: 'date' } }, pill_format: 'Sold: {min} to {max}', change_detection: false, display_tiers: ['crm'] });
  add({ key: 'dom', label: 'Days on Market', section: 'status-activity', widget: 'number-range', tabs: ['sale', 'rent'], modes: ['full'], providers: { trestle: { resource: 'Property', field: 'DaysOnMarket', operator: 'ge/le', datatype: 'integer' } }, pill_format: 'DOM: {min}-{max}', change_detection: true, display_tiers: ['vow', 'crm'] });
  add({ key: 'cdom', label: 'Cumulative DOM', section: 'status-activity', widget: 'number-range', tabs: ['sale', 'rent'], modes: ['full'], providers: { trestle: { resource: 'Property', field: 'CumulativeDaysOnMarket', operator: 'ge/le', datatype: 'integer' } }, pill_format: 'CDOM: {min}-{max}', change_detection: true, display_tiers: ['vow', 'crm'] });

  // ─── PROPERTY TYPE ───
  add({ key: 'ownership', label: 'Ownership', section: 'property-type', widget: 'checkbox-group', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], options: [{ label: 'Co-op', value: 'StockCooperative' }, { label: 'Condo', value: 'Condominium' }, { label: 'Condop', value: 'Condop' }, { label: 'Rental Building', value: 'RentalBuilding' }, { label: 'Townhouse', value: 'Townhouse' }], providers: { trestle: { resource: 'Property', field: 'CommonInterest', operator: 'eq', datatype: 'string' } }, pill_format: '{value}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'property-subtype', label: 'Property Sub-Type', section: 'property-type', widget: 'checkbox-group', tabs: ['sale', 'rent'], modes: ['basic', 'full'], options: [{ label: 'Townhouse', value: 'Townhouse' }, { label: 'Loft', value: 'Loft' }, { label: 'Mixed Use', value: 'MixedUse' }, { label: 'Multi-Family', value: 'MultiFamily' }, { label: 'Single Family', value: 'SingleFamily' }], providers: { trestle: { resource: 'Property', field: 'PropertySubType', operator: 'contains', datatype: 'string' } }, pill_format: 'Type: {value}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'listing-agreement', label: 'Listing Type', section: 'property-type', widget: 'checkbox-group', tabs: ['sale', 'rent'], modes: ['basic', 'full'], options: [{ label: 'Exclusive Right to Sell', value: 'ExclusiveRightToSell' }, { label: 'Exclusive Agency', value: 'ExclusiveAgency' }, { label: 'Exclusive w/ Exception', value: 'ExclusiveWithException' }, { label: 'Co-Exclusive', value: 'CoExclusive' }, { label: 'Open', value: 'Open' }, { label: 'Net', value: 'Net' }], providers: { trestle: { resource: 'Property', field: 'ListingAgreement', operator: 'eq', datatype: 'string' } }, pill_format: 'Listing: {value}', change_detection: false, display_tiers: ['crm'] });
  add({ key: 'new-construction', label: 'New Construction', section: 'property-type', widget: 'boolean', tabs: ['sale', 'rent'], modes: ['basic', 'full'], providers: { trestle: { resource: 'Property', field: 'NewConstructionYN', operator: 'eq', datatype: 'boolean' } }, pill_format: 'New Construction', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });

  // ─── BUILDING INFO ───
  add({ key: 'year-built', label: 'Year Built', section: 'building-info', widget: 'number-range', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], providers: { trestle: { resource: 'Property', field: 'YearBuilt', operator: 'ge/le', datatype: 'integer' } }, pill_format: 'Built: {min}-{max}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'stories', label: 'Stories / Floors', section: 'building-info', widget: 'number-range', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], providers: { trestle: { resource: 'Property', field: 'StoriesTotal', operator: 'ge/le', datatype: 'integer' } }, pill_format: 'Floors: {min}-{max}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'units-total', label: 'Total Units', section: 'building-info', widget: 'number-range', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], providers: { trestle: { resource: 'Property', field: 'NumberOfUnitsTotal', operator: 'ge/le', datatype: 'integer' } }, pill_format: 'Units: {min}-{max}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'building-name', label: 'Building Name', section: 'building-info', widget: 'text', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], placeholder: 'Search by building name...', providers: { trestle: { resource: 'Property', field: 'BuildingName', operator: 'contains', datatype: 'string' } }, pill_format: 'Building: {value}', change_detection: false, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'architectural-style', label: 'Architectural Style', section: 'building-info', widget: 'checkbox-group', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], options: [{ label: 'Pre-War', value: 'Prewar' }, { label: 'Walk-Up', value: 'WalkUp' }, { label: 'Brownstone', value: 'Brownstone' }, { label: 'Loft', value: 'Loft' }], providers: { trestle: { resource: 'Property', field: 'ArchitecturalStyle', operator: 'eq', datatype: 'string' } }, pill_format: 'Style: {value}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'structure-type', label: 'Structure Type', section: 'building-info', widget: 'checkbox-group', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], options: [{ label: 'High-Rise', value: 'HighRise' }, { label: 'Mid-Rise', value: 'MidRise' }, { label: 'Low-Rise', value: 'LowRise' }, { label: 'Walk-Up', value: 'WalkUp' }, { label: 'Brownstone', value: 'Brownstone' }, { label: 'Townhouse', value: 'Townhouse' }], providers: { trestle: { resource: 'Property', field: 'StructureType', operator: 'eq', datatype: 'string' } }, pill_format: 'Type: {value}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });

  // ─── UNIT FEATURES ───
  add({ key: 'cooling', label: 'Central A/C', section: 'unit-features', widget: 'boolean', tabs: ['sale', 'rent'], modes: ['basic', 'full'], providers: { trestle: { resource: 'Property', field: 'CoolingYN', operator: 'eq', datatype: 'boolean' } }, pill_format: 'A/C', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'view', label: 'Views', section: 'unit-features', widget: 'checkbox-group', tabs: ['sale', 'rent'], modes: ['full'], options: [{ label: 'City', value: 'City' }, { label: 'Park', value: 'Park' }, { label: 'Water', value: 'Water' }, { label: 'Bridge', value: 'Bridges' }, { label: 'Skyline', value: 'Skyline' }, { label: 'River', value: 'River' }, { label: 'Garden', value: 'Garden' }, { label: 'Neighborhood', value: 'Neighborhood' }], providers: { trestle: { resource: 'Property', field: 'View', operator: 'contains', datatype: 'string' } }, pill_format: 'View: {value}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'direction', label: 'Exposure / Direction', section: 'unit-features', widget: 'checkbox-group', tabs: ['sale', 'rent'], modes: ['full'], options: [{ label: 'North', value: 'North' }, { label: 'South', value: 'South' }, { label: 'East', value: 'East' }, { label: 'West', value: 'West' }, { label: 'Northeast', value: 'Northeast' }, { label: 'Northwest', value: 'Northwest' }, { label: 'Southeast', value: 'Southeast' }, { label: 'Southwest', value: 'Southwest' }], providers: { trestle: { resource: 'Property', field: 'DirectionFaces', operator: 'eq', datatype: 'string' } }, pill_format: 'Facing: {value}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'condition', label: 'Property Condition', section: 'unit-features', widget: 'checkbox-group', tabs: ['sale', 'rent'], modes: ['full'], options: [{ label: 'Excellent', value: 'Excellent' }, { label: 'Good', value: 'Good' }, { label: 'Fair', value: 'Fair' }, { label: 'Poor', value: 'Poor' }], providers: { trestle: { resource: 'Property', field: 'PropertyCondition', operator: 'eq', datatype: 'string' } }, pill_format: 'Condition: {value}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'fireplace', label: 'Fireplace', section: 'unit-features', widget: 'boolean', tabs: ['sale', 'rent'], modes: ['full'], providers: { trestle: { resource: 'Property', field: 'FireplaceYN', operator: 'eq', datatype: 'boolean' } }, pill_format: 'Fireplace', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'outdoor-space', label: 'Outdoor Space', section: 'unit-features', widget: 'checkbox-group', tabs: ['sale', 'rent'], modes: ['basic', 'full'], options: [{ label: 'Balcony', value: 'Balcony' }, { label: 'Terrace', value: 'Terrace' }, { label: 'Garden', value: 'Garden' }, { label: 'Patio', value: 'Patio' }, { label: 'Roof Deck', value: 'BuildingRoofDeck' }, { label: 'Private Outdoor', value: 'PrivateOutdoorSpace' }], providers: { trestle: { resource: 'Property', field: 'ExteriorFeatures', operator: 'contains', datatype: 'string' } }, pill_format: 'Outdoor: {value}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });

  // ─── BUILDING AMENITIES ───
  add({ key: 'building-features', label: 'Building Features', section: 'building-amenities', widget: 'checkbox-group', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], options: [{ label: 'Elevator', value: 'Elevators' }, { label: 'Gym / Fitness', value: 'Fitness' }, { label: 'Storage', value: 'Storage' }, { label: 'Bike Room', value: 'BikeRoom' }], providers: { trestle: { resource: 'Property', field: 'BuildingFeatures', operator: 'contains', datatype: 'string' } }, pill_format: '{value}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'laundry', label: 'Laundry', section: 'building-amenities', widget: 'checkbox-group', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], options: [{ label: 'In Unit', value: 'InUnit' }, { label: 'In Building', value: 'Common' }, { label: 'W/D Allowed', value: 'BuildingWasherDryerInstallAllowed' }], providers: { trestle: { resource: 'Property', field: 'LaundryFeatures', operator: 'contains', datatype: 'string' } }, pill_format: 'Laundry: {value}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'garage', label: 'Garage / Parking', section: 'building-amenities', widget: 'boolean', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], providers: { trestle: { resource: 'Property', field: 'GarageYN', operator: 'eq', datatype: 'boolean' } }, pill_format: 'Garage', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'pool', label: 'Pool', section: 'building-amenities', widget: 'boolean', tabs: ['sale', 'rent', 'building'], modes: ['full'], providers: { trestle: { resource: 'Property', field: 'PoolFeatures', operator: 'ne_null', datatype: 'string' } }, pill_format: 'Pool', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'accessibility', label: 'Accessibility', section: 'building-amenities', widget: 'boolean', tabs: ['sale', 'rent', 'building'], modes: ['full'], providers: { trestle: { resource: 'Property', field: 'AccessibilityFeatures', operator: 'ne_null', datatype: 'string' } }, pill_format: 'Accessible', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'pets', label: 'Pets Allowed', section: 'building-amenities', widget: 'checkbox-group', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], options: [{ label: 'No Restrictions', value: 'NoRestrictions' }, { label: 'Cats Only', value: 'CatsOnly' }, { label: 'Dogs OK', value: 'DogsOnly' }, { label: 'Size Limit', value: 'SizeLimit' }], providers: { trestle: { resource: 'Property', field: 'PetsAllowed', operator: 'contains', datatype: 'string' } }, pill_format: 'Pets: {value}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });

  // ─── OPEN HOUSE ───
  add({ key: 'open-house-date', label: 'Open House Date', section: 'open-house', widget: 'date-range', tabs: ['sale', 'rent'], modes: ['basic', 'full'], presets: [{ label: 'Today', value: 'today' }, { label: 'This Weekend', value: 'weekend' }, { label: 'Next 7 Days', value: '7days' }, { label: 'Next 30 Days', value: '30days' }], providers: { trestle: { resource: 'OpenHouse', field: 'OpenHouseDate', operator: 'ge/le', datatype: 'date', expand: true } }, pill_format: 'Open House: {min} to {max}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'open-house-type', label: 'Open House Type', section: 'open-house', widget: 'checkbox-group', tabs: ['sale', 'rent'], modes: ['full'], options: [{ label: 'Public', value: 'Public' }, { label: "Broker's Open", value: 'BrokersOpen' }, { label: 'Virtual / Livestream', value: 'Virtual' }], providers: { trestle: { resource: 'OpenHouse', field: 'OpenHouseType', operator: 'eq', datatype: 'string', expand: true } }, pill_format: 'OH Type: {value}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'open-house-appointment', label: 'Appointment Required', section: 'open-house', widget: 'boolean', tabs: ['sale', 'rent'], modes: ['full'], providers: { trestle: { resource: 'OpenHouse', field: 'AppointmentRequiredYN', operator: 'eq', datatype: 'boolean', expand: true } }, pill_format: 'Appt Required', change_detection: false, display_tiers: ['crm'] });

  // ─── MEDIA ───
  add({ key: 'has-photos', label: 'Has Photos', section: 'media', widget: 'boolean', tabs: ['sale', 'rent'], modes: ['full'], providers: { trestle: { resource: 'Property', field: 'PhotosCount', operator: 'gt', datatype: 'integer', value: 0 } }, pill_format: 'Has Photos', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'virtual-tour', label: 'Has Virtual Tour', section: 'media', widget: 'boolean', tabs: ['sale', 'rent'], modes: ['full'], providers: { trestle: { resource: 'Property', field: 'VirtualTourURLUnbranded', operator: 'ne_null', datatype: 'string' } }, pill_format: 'Virtual Tour', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });

  // ─── RENTAL ───
  add({ key: 'furnished', label: 'Furnished', section: 'rental', widget: 'checkbox-group', tabs: ['rent'], modes: ['basic', 'full'], options: [{ label: 'Furnished', value: 'Furnished' }, { label: 'Unfurnished', value: 'Unfurnished' }], providers: { trestle: { resource: 'Property', field: 'Furnished', operator: 'eq', datatype: 'string' } }, pill_format: '{value}', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });
  add({ key: 'concessions', label: 'Concessions', section: 'rental', widget: 'checkbox-group', tabs: ['rent'], modes: ['basic', 'full'], options: [{ label: 'Has Concessions', value: 'Yes' }], providers: { trestle: { resource: 'Property', field: 'Concessions', operator: 'eq', datatype: 'string' } }, pill_format: 'Concessions', change_detection: true, display_tiers: ['idx', 'vow', 'crm'] });

  // ─── COMMERCIAL ───
  add({ key: 'business-type', label: 'Business Type', section: 'commercial', widget: 'checkbox-group', tabs: ['sale', 'rent'], modes: ['full'], options: [{ label: 'Office', value: 'Office' }, { label: 'Retail', value: 'Retail' }, { label: 'Industrial', value: 'Industrial' }, { label: 'Restaurant', value: 'Restaurant' }, { label: 'Medical', value: 'Medical' }], providers: { trestle: { resource: 'Property', field: 'BusinessType', operator: 'contains', datatype: 'string' } }, compliance: { website_only: true }, pill_format: 'Business: {value}', change_detection: false, display_tiers: ['crm'] });
  add({ key: 'zoning', label: 'Zoning', section: 'commercial', widget: 'text', tabs: ['sale', 'rent'], modes: ['full'], placeholder: 'e.g. C1-5, M1-2, R7A', providers: { trestle: { resource: 'Property', field: 'Zoning', operator: 'contains', datatype: 'string' } }, compliance: { website_only: true }, pill_format: 'Zoning: {value}', change_detection: false, display_tiers: ['crm'] });

  // ─── AGENT / OFFICE ───
  add({ key: 'list-office', label: 'Listing Office', section: 'agent-office', widget: 'text', tabs: ['sale', 'rent'], modes: ['full'], placeholder: 'Office name...', providers: { trestle: { resource: 'Property', field: 'ListOfficeName', operator: 'contains', datatype: 'string' } }, pill_format: 'Office: {value}', change_detection: false, display_tiers: ['crm'] });
  add({ key: 'management', label: 'Management Company', section: 'agent-office', widget: 'text', tabs: ['sale', 'rent', 'building'], modes: ['basic', 'full'], placeholder: 'Management company...', providers: { trestle: { resource: 'Property', field: 'ListOfficeName', operator: 'contains', datatype: 'string' } }, pill_format: 'Mgmt: {value}', change_detection: false, display_tiers: ['crm'] });

  return fields;
}

// ═══ MAIN ═══
console.log('Generating search-registry.json...');
const trestleEntities = parseMetadata();
console.log('Parsed metadata: ' + Object.keys(trestleEntities).length + ' entities');

const idxPlus = parseIdxPlusCsv();
console.log('Parsed IDX Plus CSV: ' + Object.keys(idxPlus).length + ' fields');

const fields = buildFields(trestleEntities);
console.log('Generated ' + fields.length + ' field entries');

const verified = fields.filter(f => f.trestle_verified === true).length;
const unverified = fields.filter(f => f.trestle_verified === false).length;
const internal = fields.filter(f => f.crm_internal).length;
console.log('Trestle verified: ' + verified + ', unverified: ' + unverified + ', CRM internal: ' + internal);

const registry = {
  _meta: {
    version: '2.0.0',
    generated: new Date().toISOString(),
    source: 'scripts/generate-search-registry.js',
    trestle_metadata: 'artifacts/metadata.xml',
    idx_plus_csv: 'data/rebny-rls-property-fields.csv',
    total_fields: fields.length,
    trestle_verified: verified,
  },
  sections: SECTIONS,
  fields: fields,
};

const outPath = path.join(ROOT, 'public/crm/data/search-registry.json');
fs.writeFileSync(outPath, JSON.stringify(registry, null, 2));
console.log('Written to ' + outPath);
console.log('Done.');
