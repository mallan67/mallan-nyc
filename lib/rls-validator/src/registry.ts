/**
 * REBNY RLS Field Registry — Built from primary CSV sources
 *
 * Source: data/rebny-rls-property-fields.csv (448 fields)
 * Source: data/rebny-rls-property-lookup.csv (2,066+ values)
 *
 * This module parses the actual CSV files at runtime — no hardcoded copies.
 * RLS TRUMPS ALL. RESO/IDX fills gaps only.
 */

import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import type { RlsField, RlsLookup, FieldRequirement, ResoRename } from './types';

// ─── CSV Parsing ──────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ─── Field Registry ───────────────────────────────────────────────────

let _fieldRegistry: Map<string, RlsField> | null = null;

function parseRequirement(rules: string): { requirement: FieldRequirement; conditionalRule?: string } {
  const r = rules.trim().toLowerCase();
  if (!r || r === 'no') return { requirement: 'optional' };
  if (r === 'yes') return { requirement: 'mandatory' };
  if (r.startsWith('yes,') || r.startsWith('yes ')) return { requirement: 'mandatory' };
  if (r.startsWith('conditional')) {
    return { requirement: 'conditional', conditionalRule: rules.trim() };
  }
  // Some fields have multi-line conditions starting with "Required if..."
  if (r.startsWith('required if') || r.startsWith('required when')) {
    return { requirement: 'conditional', conditionalRule: rules.trim() };
  }
  return { requirement: 'optional' };
}

export function loadFieldRegistry(dataDir?: string): Map<string, RlsField> {
  if (_fieldRegistry) return _fieldRegistry;

  const dir = dataDir || resolve(join(__dirname, '..', '..', '..', 'data'));
  const csv = readFileSync(join(dir, 'rebny-rls-property-fields.csv'), 'utf-8');
  const lines = csv.split('\n').filter(l => l.trim());

  _fieldRegistry = new Map();

  // Skip header row (line 0)
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    // CSV columns: [empty], Attribute Name, [empty], MatrixFieldName, RLS Description, LMP Add/Edit, LMP Search, Requirements/Rules
    // Some fields span multiple lines due to description wrapping — handle by joining continuation lines

    const attrName = cols[1]?.trim() || '';
    const matrixName = cols[3]?.trim() || '';
    const name = matrixName || attrName;

    if (!name) continue;

    const description = cols[4]?.trim() || '';
    const lmpAddEdit = (cols[5]?.trim() || '').toLowerCase() === 'yes';
    const lmpSearch = (cols[6]?.trim() || '').toLowerCase() === 'yes';
    const rulesRaw = cols[7]?.trim() || '';

    // Handle multi-line rules — some continue on next lines
    let fullRules = rulesRaw;
    // Check if next lines are continuations (no field name in cols[1] and cols[3])
    while (i + 1 < lines.length) {
      const nextCols = parseCSVLine(lines[i + 1]);
      if (nextCols[1]?.trim() || nextCols[3]?.trim()) break;
      // Continuation line — append rules text
      const contRules = nextCols[7]?.trim() || nextCols[0]?.trim() || '';
      if (contRules) fullRules += ' ' + contRules;
      i++;
    }

    const { requirement, conditionalRule } = parseRequirement(fullRules);

    _fieldRegistry.set(name, {
      name,
      description,
      lmpAddEdit,
      lmpSearch,
      requirement,
      conditionalRule,
    });
  }

  return _fieldRegistry;
}

// ─── Lookup Registry ──────────────────────────────────────────────────

let _lookupRegistry: Map<string, RlsLookup> | null = null;

export function loadLookupRegistry(dataDir?: string): Map<string, RlsLookup> {
  if (_lookupRegistry) return _lookupRegistry;

  const dir = dataDir || resolve(join(__dirname, '..', '..', '..', 'data'));
  const csv = readFileSync(join(dir, 'rebny-rls-property-lookup.csv'), 'utf-8');
  const lines = csv.split('\n').filter(l => l.trim());

  _lookupRegistry = new Map();

  // Skip header rows (line 0 = title, line 1 = column headers)
  for (let i = 2; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    // CSV columns: [empty], TableName, LookupName (Current), Value (Current), [empty], MatrixSelectName, MatrixWebapi_Value, ...
    const lookupName = cols[5]?.trim() || cols[2]?.trim() || '';
    const value = cols[6]?.trim() || cols[3]?.trim() || '';

    if (!lookupName || !value) continue;

    if (!_lookupRegistry.has(lookupName)) {
      _lookupRegistry.set(lookupName, { fieldName: lookupName, values: [] });
    }
    _lookupRegistry.get(lookupName)!.values.push(value);
  }

  return _lookupRegistry;
}

// ─── Derived Lists ────────────────────────────────────────────────────

export function getMandatoryFields(registry?: Map<string, RlsField>): string[] {
  const reg = registry || loadFieldRegistry();
  return Array.from(reg.values())
    .filter(f => f.requirement === 'mandatory')
    .map(f => f.name);
}

export function getConditionalFields(registry?: Map<string, RlsField>): RlsField[] {
  const reg = registry || loadFieldRegistry();
  return Array.from(reg.values())
    .filter(f => f.requirement === 'conditional');
}

export function getPicklistFields(lookups?: Map<string, RlsLookup>): string[] {
  const reg = lookups || loadLookupRegistry();
  return Array.from(reg.keys());
}

// ─── 23 RESO → RLS Field Renames (from FIELD-AUTHORITY.md — verified against CSV) ───

export const RESO_TO_RLS_RENAMES: ResoRename[] = [
  { resoName: 'StandardStatus', rlsName: 'MlsStatus', notes: 'Critical — status field' },
  { resoName: 'ListingKey', rlsName: 'SourceSystemKey', notes: 'Critical — listing ID' },
  { resoName: 'UnparsedAddress', rlsName: 'UnParsedAddress', notes: 'Case difference' },
  { resoName: 'ModificationTimestamp', rlsName: 'SourceSystemModificationTimestamp', notes: 'Renamed' },
  { resoName: 'BuyerAgentKey', rlsName: 'BuyerAgentMlsId', notes: 'Foreign key' },
  { resoName: 'BuyerOfficeKey', rlsName: 'BuyerOfficeMlsId', notes: 'Foreign key' },
  { resoName: 'BuyerTeamKey', rlsName: 'BuyerTeamMlsId', notes: 'Foreign key' },
  { resoName: 'CoBuyerAgentKey', rlsName: 'CoBuyerAgentMlsId', notes: 'Foreign key' },
  { resoName: 'CoBuyerOfficeKey', rlsName: 'CoBuyerOfficeMlsId', notes: 'Foreign key' },
  { resoName: 'CoListAgentKey', rlsName: 'CoListAgentMlsId', notes: 'Foreign key' },
  { resoName: 'CoListAgent2Key', rlsName: 'CoListAgent2MLSID', notes: 'Foreign key' },
  { resoName: 'CoListAgent3Key', rlsName: 'CoListAgent3MLSID', notes: 'Foreign key' },
  { resoName: 'ListAgentKey', rlsName: 'ListAgentMlsId', notes: 'Foreign key' },
  { resoName: 'ListOfficeKey', rlsName: 'ListOfficeMlsId', notes: 'Foreign key' },
  { resoName: 'ListTeamKey', rlsName: 'ListTeamMlsId', notes: 'Foreign key' },
  { resoName: 'CoExclusiveListingKey', rlsName: 'DuplicateListingIDs', notes: 'Renamed' },
  { resoName: 'BuildingSocialMedia', rlsName: 'BuildingSocialMediaURL', notes: 'URL suffix added' },
  { resoName: 'ListingSocialMedia', rlsName: 'ListingSocialMediaURL', notes: 'URL suffix added' },
  { resoName: 'CableTvExpense', rlsName: 'CableTVExpense', notes: 'Case difference' },
  { resoName: 'CeilingHeight', rlsName: 'CeilingHeightFeet', notes: 'Split into 2 fields' },
  { resoName: 'CeilingHeight', rlsName: 'CeilingHeightInches', notes: 'Split into 2 fields' },
  { resoName: 'LotDimensionsSource', rlsName: 'LotSizeSource', notes: 'Renamed' },
  { resoName: 'ShowingContactPhoneExt', rlsName: 'ShowingContactPhone', notes: 'Merged' },
];

// ─── 52 Mandatory Fields (verified from FIELD-AUTHORITY.md + CSV) ─────

export const MANDATORY_FIELDS: readonly string[] = [
  'AttendanceType', 'BathroomsFull', 'BathroomsHalf', 'BathroomsTotal',
  'BedroomsTotal', 'BuildingLaundryFeatures', 'BuildingPetsAllowed', 'BuildingTaxLot',
  'BuyerAgentMlsId', 'City', 'CityRegion', 'CoBrokeAgreement',
  'CommonInterest', 'Concessions', 'CountyOrParish', 'ElevatorsTotal',
  'ExpirationDate', 'GarageYN', 'IDXEntireListingDisplayYN', 'InternetAddressDisplayYN',
  'InternetAutomatedValuationDisplayYN', 'InternetConsumerCommentYN',
  'InternetEntireListingDisplayYN', 'ListAgentMlsId', 'ListingAgreement',
  'ListPrice', 'MlsStatus', 'NewConstructionYN', 'NewDevelopmentYN',
  'NumberOfUnitsTotal', 'OnMarketDate', 'OriginalEntryTimestamp', 'PetsAllowed',
  'PostalCity', 'PostalCode', 'PropertySubType', 'PropertyType',
  'PublicRemarks', 'RoomsTotal', 'ShowingInstructions', 'SourceSystemKey',
  'StandardStatus', 'StateOrProvince', 'StoriesTotal', 'StreetName',
  'StreetNumber', 'StructureType', 'SubdivisionName', 'SyndicateYN',
  'TaxBlock', 'UnParsedAddress', 'YearBuilt',
] as const;

// ─── 5 Display Control Fields (CRITICAL COMPLIANCE) ──────────────────

export const DISPLAY_CONTROL_FIELDS = [
  'InternetEntireListingDisplayYN',
  'IDXEntireListingDisplayYN',
  'InternetAddressDisplayYN',
  'InternetAutomatedValuationDisplayYN',
  'InternetConsumerCommentYN',
  'SyndicateYN',
] as const;

// ─── Registry Reset (for testing) ─────────────────────────────────────

export function resetRegistries(): void {
  _fieldRegistry = null;
  _lookupRegistry = null;
}
