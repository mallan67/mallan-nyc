/**
 * RESO-Aligned Field Mapping
 *
 * COMPLIANCE NOTE:
 * This file provides placeholder mappings between RESO Data Dictionary
 * field names and our internal canonical representation.
 *
 * No endpoint-specific assumptions are made here.
 * Actual mapping implementation will be added when Trestle/REBNY
 * credentials are received and endpoint schema is known.
 *
 * @see https://www.reso.org/data-dictionary/
 */

import type { IDXListing } from './types';

/**
 * RESO Data Dictionary field names (subset)
 * These are the standard field names per RESO 2.0
 */
export const RESO_FIELDS = {
  // Identifiers
  ListingId: 'ListingId',
  ListingKey: 'ListingKey',
  MlsStatus: 'MlsStatus',
  StandardStatus: 'StandardStatus',

  // Address
  StreetNumber: 'StreetNumber',
  StreetName: 'StreetName',
  UnitNumber: 'UnitNumber',
  City: 'City',
  StateOrProvince: 'StateOrProvince',
  PostalCode: 'PostalCode',
  County: 'County',

  // Price
  ListPrice: 'ListPrice',
  OriginalListPrice: 'OriginalListPrice',
  ClosePrice: 'ClosePrice',

  // Property
  PropertyType: 'PropertyType',
  PropertySubType: 'PropertySubType',
  BedroomsTotal: 'BedroomsTotal',
  BathroomsFull: 'BathroomsFull',
  BathroomsHalf: 'BathroomsHalf',
  LivingArea: 'LivingArea',
  LotSizeArea: 'LotSizeArea',
  YearBuilt: 'YearBuilt',

  // Dates
  ListingContractDate: 'ListingContractDate',
  ModificationTimestamp: 'ModificationTimestamp',

  // Agent/Office
  ListAgentMlsId: 'ListAgentMlsId',
  ListAgentFullName: 'ListAgentFullName',
  ListOfficeMlsId: 'ListOfficeMlsId',
  ListOfficeName: 'ListOfficeName',

  // Media
  Media: 'Media',
  MediaURL: 'MediaURL',
  MediaType: 'MediaType',
  Order: 'Order',
} as const;

/**
 * Field mapping configuration
 * Maps RESO field names to internal field paths
 */
export const FIELD_MAP: Record<string, string> = {
  [RESO_FIELDS.ListingId]: 'listingId',
  [RESO_FIELDS.ListingKey]: 'mlsId',
  [RESO_FIELDS.StandardStatus]: 'standardStatus',
  [RESO_FIELDS.ListPrice]: 'listPrice',
  [RESO_FIELDS.OriginalListPrice]: 'originalListPrice',
  [RESO_FIELDS.ClosePrice]: 'closePrice',
  [RESO_FIELDS.PropertyType]: 'propertyType',
  [RESO_FIELDS.PropertySubType]: 'propertySubType',
  [RESO_FIELDS.BedroomsTotal]: 'bedroomsTotal',
  [RESO_FIELDS.BathroomsFull]: 'bathroomsFull',
  [RESO_FIELDS.BathroomsHalf]: 'bathroomsHalf',
  [RESO_FIELDS.LivingArea]: 'livingArea',
  [RESO_FIELDS.LotSizeArea]: 'lotSizeArea',
  [RESO_FIELDS.YearBuilt]: 'yearBuilt',
  [RESO_FIELDS.ListingContractDate]: 'listingContractDate',
  [RESO_FIELDS.ModificationTimestamp]: 'modificationTimestamp',
  [RESO_FIELDS.ListAgentMlsId]: 'listAgentMlsId',
  [RESO_FIELDS.ListAgentFullName]: 'listAgentFullName',
  [RESO_FIELDS.ListOfficeMlsId]: 'listOfficeMlsId',
  [RESO_FIELDS.ListOfficeName]: 'listOfficeName',
};

/**
 * Placeholder: Map raw RESO response to internal IDXListing type
 *
 * NOTE: This is a stub. Actual implementation will be added when
 * Trestle/REBNY credentials are received and response schema is known.
 *
 * @param raw - Raw listing data from IDX endpoint
 * @returns Mapped IDXListing or null if mapping fails
 */
export function mapRESOToInternal(_raw: Record<string, unknown>): IDXListing | null {
  // PLACEHOLDER: Do not implement until endpoint schema is known
  // This function will throw if called before implementation

  throw new Error(
    '[IDX] mapRESOToInternal is not implemented. ' +
    'Awaiting Trestle/REBNY credentials and endpoint schema.'
  );
}

/**
 * Placeholder: Validate that a raw response contains required fields
 *
 * @param raw - Raw listing data
 * @returns Validation result
 */
export function validateRESOResponse(raw: Record<string, unknown>): {
  valid: boolean;
  missingFields: string[];
} {
  const requiredFields = [
    RESO_FIELDS.ListingId,
    RESO_FIELDS.StandardStatus,
    RESO_FIELDS.ListPrice,
    RESO_FIELDS.PropertyType,
  ];

  const missingFields = requiredFields.filter(field => !(field in raw));

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * REBNY RLS required display fields
 * These fields MUST be displayed per REBNY RLS Display Rules
 */
export const REBNY_REQUIRED_DISPLAY_FIELDS = [
  'listPrice',
  'address',
  'bedroomsTotal',
  'bathroomsFull',
  'propertyType',
  'listAgentFullName',
  'listOfficeName',
] as const;

/**
 * REBNY RLS attribution text template
 */
export const REBNY_ATTRIBUTION_TEMPLATE =
  'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service. ' +
  'Data last updated: {{timestamp}}.';

/**
 * Generate attribution text with timestamp
 */
export function generateAttributionText(timestamp: Date = new Date()): string {
  return REBNY_ATTRIBUTION_TEMPLATE.replace(
    '{{timestamp}}',
    timestamp.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  );
}
