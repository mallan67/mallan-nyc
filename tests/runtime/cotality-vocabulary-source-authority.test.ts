/// <reference types="jest" />
/**
 * WHERE A PROVIDER VALUE VOCABULARY COMES FROM (corrected 2026-09-06, live-verified).
 *
 * Two different questions, two different sources, and they must never be swapped:
 *
 *   VALUES → the Cotality Lookup endpoint, keyed by (ResourceName, FieldName).
 *   TYPE   → $metadata, which is what a schema is for, and the ONLY place that says whether a
 *            field's value space is a closed enum at all.
 *
 * Before this correction the vocabulary was parsed out of $metadata EnumTypes and indexed by field
 * name. That was wrong three ways, each proven against the live API:
 *   1. An EnumType is SHARED across resources and is frequently named differently from the field that
 *      uses it. Property.Permission is declared `ListingPermission`, so a field-name index returned
 *      the unrelated EnumType named `Permission` — 20 members instead of the 18 the field publishes.
 *   2. 121 Property fields that DO publish a vocabulary had none at all under the old index, so the
 *      enum boundary silently validated nothing for them.
 *   3. EnumTypes over-declare: 17 of them list members the Lookup endpoint does not publish.
 *
 * And the converse trap: Cotality publishes a Lookup vocabulary for NON-enum fields too — every `*YN`
 * Edm.Boolean gets ["false","true"]. That documents the boolean; it does not make it a picklist.
 * Member-checking a boolean against it would refuse the form's real values, so `liveEnumMembers`
 * returns null unless the declared type is an enum.
 */
import {
  liveEnumMembers,
  livePublishedValues,
  isLiveEnumField,
  isLiveMultiField,
  LIVE_VOCABULARY_RESOURCES,
  COTALITY_CONTRACT_PULLED_AT,
} from '@/lib/cotality/live-contract';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../..');
const pull = JSON.parse(readFileSync(join(ROOT, 'data/cotality-enums.live.json'), 'utf8')) as {
  source: string; typeSource: string; pulled_at: string;
  enums: Record<string, string[]>;
  resources: Record<string, Record<string, string[]>>;
  types: Record<string, Record<string, { isEnum: boolean; isMulti: boolean; enumType: string | null }>>;
};

describe('the vocabulary pull is sourced from Lookup, and types from $metadata', () => {
  it('records the Lookup endpoint as the value source and $metadata only as the type source', () => {
    expect(pull.source).toBe('https://api.cotality.com/trestle/odata/Lookup');
    expect(pull.typeSource).toBe('https://api.cotality.com/trestle/odata/$metadata');
    expect(COTALITY_CONTRACT_PULLED_AT).toBe(pull.pulled_at);
  });

  it('the generator reads Lookup for values and $metadata for types only', () => {
    const src = readFileSync(join(ROOT, 'scripts/cotality/pull-enums.mjs'), 'utf8');
    expect(src).toMatch(/pageAll\('Lookup'/);
    expect(src).toMatch(/ResourceName eq/);
    // $metadata may be read, but ONLY to record declared types — never to build a member list.
    expect(src).toMatch(/declaredTypes/);
    expect(src).not.toMatch(/<Member Name=/);
  });

  it('the drift verifier diffs against Lookup, not against EnumTypes', () => {
    const src = readFileSync(join(ROOT, 'scripts/cotality-verify.mjs'), 'utf8');
    expect(src).toMatch(/odata\/Lookup/);
    expect(src).not.toMatch(/<EnumType Name=/);
    expect(src).not.toMatch(/<Member Name=/);
  });

  it('carries a per-resource table, not one flat cross-resource map', () => {
    expect(LIVE_VOCABULARY_RESOURCES).toEqual(expect.arrayContaining(['Property', 'Media', 'OpenHouse']));
    expect(pull.enums).toEqual(pull.resources.Property);
  });
});

describe('a vocabulary is keyed by FIELD on a RESOURCE — never by EnumType name', () => {
  it('Permission resolves per resource, and the EnumType name is not a key', () => {
    expect(liveEnumMembers('Permission')).toHaveLength(18);
    expect(liveEnumMembers('Permission')).toContain('IDX');
    expect(liveEnumMembers('Permission')).not.toContain('Idx');
    expect(liveEnumMembers('Permission')).not.toContain('OwnerOptOut');

    // The Media resource publishes a DIFFERENT vocabulary for the same field name, with different casing.
    expect(liveEnumMembers('Permission', 'Media')).toHaveLength(7);
    expect(liveEnumMembers('Permission', 'Media')).toContain('Idx');
    expect(liveEnumMembers('Permission', 'Media')).not.toContain('IDX');

    // 'ListingPermission' is the declared TYPE of Property.Permission, not a field.
    expect(pull.types.Property.Permission.enumType).toBe('ListingPermission');
    expect(liveEnumMembers('ListingPermission')).toBeNull();
  });

  it('fields whose EnumType is named differently now resolve (they returned null before)', () => {
    for (const field of ['AssociationFeeFrequency', 'InteriorFeatures', 'CurrentUse', 'SubAgencyCompensationType', 'AvailableLeaseType']) {
      expect(pull.types.Property[field].enumType).not.toBe(field);
      expect(liveEnumMembers(field)).not.toBeNull();
      expect((liveEnumMembers(field) as readonly string[]).length).toBeGreaterThan(0);
    }
  });

  it('an unknown field has no vocabulary', () => {
    expect(liveEnumMembers('NotARealCotalityField')).toBeNull();
    expect(livePublishedValues('NotARealCotalityField')).toBeNull();
  });
});

describe('a published vocabulary is not the same thing as a closed enum', () => {
  it('boolean YN fields publish ["false","true"] but are NOT member-checked', () => {
    for (const field of ['BasementYN', 'GarageYN', 'ViewYN', 'InternetAutomatedValuationDisplayYN']) {
      expect(livePublishedValues(field)).toEqual(['false', 'true']);
      expect(isLiveEnumField(field)).toBe(false);
      expect(liveEnumMembers(field)).toBeNull();
    }
  });

  it('every field the boundary WILL member-check is a declared enum', () => {
    const checked = Object.keys(pull.enums).filter((f) => liveEnumMembers(f) !== null);
    expect(checked.length).toBeGreaterThan(150);
    for (const f of checked) expect(pull.types.Property[f].isEnum).toBe(true);
  });

  it('multi-valued declaration is read from the type, not guessed', () => {
    expect(isLiveMultiField('SpecialListingConditions')).toBe(true);
    expect(isLiveMultiField('Permission')).toBe(true);
    expect(isLiveMultiField('StandardStatus')).toBe(false);
  });
});

describe('the corrected vocabulary carries values the old $metadata index got wrong', () => {
  it('PropertySubType publishes Efficiency, which the EnumType index omitted', () => {
    expect(liveEnumMembers('PropertySubType')).toContain('Efficiency');
  });
  it('StandardStatus spells the cancelled member Canceled, exactly as live publishes it', () => {
    const s = liveEnumMembers('StandardStatus') as readonly string[];
    expect(s).toContain('Canceled');
    expect(s).not.toContain('Cancelled');
  });
});
