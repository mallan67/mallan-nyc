/**
 * REBNY RLS Validation Test API
 *
 * GET /api/compliance/test
 * Runs validation tests on sample listings and returns results.
 * Useful for verifying rules are working without Claude API.
 *
 * @module app/api/compliance/test/route
 */

import { NextResponse } from 'next/server';
import {
  getCurrentRLSRules,
  getRulesVersion,
  getMissingRequiredFields,
  getConditionalViolations,
  getRequiredRLSFields,
  getConditionalFields,
  buildValidationPrompt,
} from '@/lib/compliance';

export const dynamic = 'force-dynamic';

// Sample listings for testing
const sampleListingMissingTaxBlock = {
  ListingKey: 'test-001',
  ListingId: 'MAL-2026-001',
  PropertyType: 'Residential',
  MLSStatus: 'Active',
  StreetNumber: '123',
  StreetName: 'Park Avenue',
  City: 'Manhattan',
  StateOrProvince: 'NY',
  PostalCode: '10016',
  CountyOrParish: 'New York',
  // BuildingTaxLot: '1234-56', // MISSING!
  ListPrice: 2500000,
  OriginalListPrice: 2500000,
  BedroomsTotal: 2,
  BathroomsFull: 2,
  BathroomsHalf: 1,
  CommonInterest: 'Condominium',
  ListAgentKey: 'agent-001',
  ListAgentMlsId: 'MALLAN-001',
  ListAgentFullName: 'Jane Smith',
  ListAgentEmail: 'jane@mallan.nyc',
  BuyerAgentCommission: '2.5%',
  BuyerAgentCommissionType: 'Percentage',
  PublicRemarks: 'Beautiful 2BR/2.5BA condo in prime Midtown location.',
  ListingContractDate: '2026-01-15',
  OnMarketDate: '2026-01-15',
  ExpirationDate: '2026-07-15',
  ModificationTimestamp: '2026-01-25T10:00:00Z',
};

const sampleListingConditionalViolation = {
  ...sampleListingMissingTaxBlock,
  ListingKey: 'test-002',
  ListingId: 'MAL-2026-002',
  BuildingTaxLot: '1234-56',
  CommonInterest: 'StockCooperative', // Co-op requires MaintenanceFee
  // MaintenanceFee: undefined, // MISSING for Co-op!
};

const sampleValidListing = {
  ...sampleListingMissingTaxBlock,
  ListingKey: 'test-003',
  ListingId: 'MAL-2026-003',
  BuildingTaxLot: '1234-56',
  AssociationFee: 1500,
  AssociationFeeFrequency: 'Monthly',
  LivingArea: 1200,
};

export async function GET() {
  const version = getRulesVersion();
  const rules = getCurrentRLSRules();
  const requiredFields = getRequiredRLSFields();
  const conditionalFields = getConditionalFields();

  // Test 1: Missing BuildingTaxLot
  const missing1 = getMissingRequiredFields(sampleListingMissingTaxBlock);

  // Test 2: Co-op without MaintenanceFee (conditional violation)
  const missing2 = getMissingRequiredFields(sampleListingConditionalViolation);
  const violations2 = getConditionalViolations(sampleListingConditionalViolation);

  // Test 3: Valid listing
  const missing3 = getMissingRequiredFields(sampleValidListing);
  const violations3 = getConditionalViolations(sampleValidListing);

  // Test 4: Prompt generation
  const prompt = buildValidationPrompt(sampleListingMissingTaxBlock);

  return NextResponse.json({
    rulesVersion: version,
    rulesSummary: {
      totalFields: rules.fields.length,
      requiredFields: requiredFields.length,
      conditionalFields: conditionalFields.length,
      fairHousingTerms: rules.fairHousingProhibitedTerms.length,
      nycBoroughs: Object.keys(rules.nycBoroughs).length,
    },
    tests: {
      test1_missingTaxBlock: {
        description: 'Listing missing required BuildingTaxLot field',
        listingId: 'test-001',
        missingRequiredFields: missing1,
        passed: missing1.includes('BuildingTaxLot'),
      },
      test2_conditionalViolation: {
        description: 'Co-op listing missing MaintenanceFee (conditional)',
        listingId: 'test-002',
        missingRequiredFields: missing2,
        conditionalViolations: violations2,
        passed: violations2.length > 0,
      },
      test3_validListing: {
        description: 'Complete valid listing',
        listingId: 'test-003',
        missingRequiredFields: missing3,
        conditionalViolations: violations3,
        passed: missing3.length === 0 && violations3.length === 0,
      },
      test4_promptGeneration: {
        description: 'Validation prompt generation',
        systemPromptLength: prompt.systemPrompt.length,
        userMessageLength: prompt.userMessage.length,
        passed: prompt.systemPrompt.length > 500 && prompt.userMessage.length > 100,
      },
    },
    sampleListings: {
      missingTaxBlock: sampleListingMissingTaxBlock,
      conditionalViolation: sampleListingConditionalViolation,
      valid: sampleValidListing,
    },
    _meta: {
      endpoint: '/api/compliance/test',
      description: 'Run validation tests on sample listings',
      testedAt: new Date().toISOString(),
    },
  });
}
