/**
 * Test script for REBNY RLS validation
 *
 * Run with: npx ts-node --esm lib/compliance/test-validation.ts
 * Or import and call testValidation() from another file
 *
 * @module lib/compliance/test-validation
 */

import {
  getCurrentRLSRules,
  getRulesVersion,
  getMissingRequiredFields,
  getConditionalViolations,
  buildValidationPrompt,
} from './index';

// Sample listing with some missing fields (for testing)
const sampleListingMissingTaxBlock = {
  ListingKey: 'test-001',
  ListingId: 'MAL-2026-001',
  PropertyType: 'Residential',
  MLSStatus: 'Active',

  // Address - missing BuildingTaxLot (required field)
  StreetNumber: '123',
  StreetName: 'Park Avenue',
  City: 'Manhattan',
  StateOrProvince: 'NY',
  PostalCode: '10016',
  CountyOrParish: 'New York',
  // BuildingTaxLot: '1234-56', // MISSING!

  // Price
  ListPrice: 2500000,
  OriginalListPrice: 2500000,

  // Property details
  BedroomsTotal: 2,
  BathroomsFull: 2,
  BathroomsHalf: 1,

  // Ownership
  CommonInterest: 'Condominium',

  // Agent info
  ListAgentKey: 'agent-001',
  ListAgentMlsId: 'MALLAN-001',
  ListAgentFullName: 'Jane Smith',
  ListAgentEmail: 'jane@mallan.nyc',

  // Commission
  BuyerAgentCommission: '2.5%',
  BuyerAgentCommissionType: 'Percentage',

  // Description
  PublicRemarks: 'Beautiful 2BR/2.5BA condo in prime Midtown location.',

  // Dates
  ListingContractDate: '2026-01-15',
  OnMarketDate: '2026-01-15',
  ExpirationDate: '2026-07-15',
  ModificationTimestamp: '2026-01-25T10:00:00Z',
};

// Sample listing with conditional violation (Co-op missing MaintenanceFee)
const sampleListingConditionalViolation = {
  ...sampleListingMissingTaxBlock,
  ListingKey: 'test-002',
  ListingId: 'MAL-2026-002',
  BuildingTaxLot: '1234-56', // Has TaxBlock
  CommonInterest: 'StockCooperative', // Co-op requires MaintenanceFee
  // MaintenanceFee: undefined, // MISSING for Co-op!
};

// Complete valid listing
const sampleValidListing = {
  ...sampleListingMissingTaxBlock,
  ListingKey: 'test-003',
  ListingId: 'MAL-2026-003',
  BuildingTaxLot: '1234-56',
  AssociationFee: 1500,
  AssociationFeeFrequency: 'Monthly',
  LivingArea: 1200,
};

/**
 * Run validation tests
 */
export function testValidation() {
  console.log('=== REBNY RLS Validation Test ===\n');

  // 1. Log rules version
  const version = getRulesVersion();
  console.log('Rules Version:', version.version);
  console.log('Last Updated:', version.lastUpdated);
  console.log('Note:', version.note);
  console.log('');

  // 2. Log total rules count
  const rules = getCurrentRLSRules();
  console.log('Total fields in rules:', rules.fields.length);
  console.log('Fair Housing terms:', rules.fairHousingProhibitedTerms.length);
  console.log('NYC Boroughs:', Object.keys(rules.nycBoroughs).length);
  console.log('');

  // 3. Test missing required fields
  console.log('--- Test 1: Missing BuildingTaxLot ---');
  const missing1 = getMissingRequiredFields(sampleListingMissingTaxBlock);
  console.log('Missing required fields:', missing1);
  console.log('');

  // 4. Test conditional violations
  console.log('--- Test 2: Co-op without MaintenanceFee ---');
  const violations = getConditionalViolations(sampleListingConditionalViolation);
  console.log('Conditional violations:', violations);
  console.log('');

  // 5. Test valid listing
  console.log('--- Test 3: Valid Listing ---');
  const missing3 = getMissingRequiredFields(sampleValidListing);
  const violations3 = getConditionalViolations(sampleValidListing);
  console.log('Missing required fields:', missing3);
  console.log('Conditional violations:', violations3);
  console.log('');

  // 6. Show prompt generation
  console.log('--- Test 4: Generated Validation Prompt ---');
  const prompt = buildValidationPrompt(sampleListingMissingTaxBlock);
  console.log('System prompt length:', prompt.systemPrompt.length, 'chars');
  console.log('User message length:', prompt.userMessage.length, 'chars');
  console.log('\nUser message preview (first 500 chars):');
  console.log(prompt.userMessage.substring(0, 500) + '...');

  console.log('\n=== Tests Complete ===');

  return {
    version,
    totalFields: rules.fields.length,
    test1: { listing: 'MissingTaxBlock', missingFields: missing1 },
    test2: { listing: 'ConditionalViolation', violations },
    test3: { listing: 'Valid', missingFields: missing3, violations: violations3 },
  };
}

// Export sample listings for API testing
export const sampleListings = {
  missingTaxBlock: sampleListingMissingTaxBlock,
  conditionalViolation: sampleListingConditionalViolation,
  valid: sampleValidListing,
};

// Run if executed directly
if (typeof window === 'undefined' && require.main === module) {
  testValidation();
}
