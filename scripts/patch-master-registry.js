#!/usr/bin/env node
/**
 * patch-master-registry.js — Patches MASTER_REGISTRY.json with audit findings
 *
 * Applies all audit findings from the Trestle/REBNY CSV cross-reference audit.
 *
 * CHANGES MADE:
 *
 * == FIELD ENTRIES ==
 * 1.  TenantPays: isEnum→true, add complianceNotes (FARE Act)
 * 2.  OngoingFees: isEnum→true, add complianceNotes (FARE Act)
 * 3.  TenantPaysDescription: add complianceNotes (FARE Act companion)
 * 4.  ADD AdditionalFee (CustomProperty entity, FARE Act)
 * 5.  ADD AdditionalFeeYN (CustomProperty entity, FARE Act)
 * 6.  ADD AdditionalFeeDescription (CustomProperty entity, FARE Act)
 * 7.  ADD AdditionalFeeFrequency (CustomProperty entity, FARE Act)
 * 8.  BuildingAccessibilityFeatures: isEnum→true, isMultiEnum→true, dataType, trestleAccessMethod
 * 9.  BuildingCooling: isEnum→true, isMultiEnum→true, dataType, trestleAccessMethod
 * 10. BuildingExteriorFeatures: isEnum→true, isMultiEnum→true, dataType, trestleAccessMethod
 * 11. BuildingFencing: isEnum→true, isMultiEnum→true, dataType, trestleAccessMethod
 * 12. BuildingHeating: isEnum→true, isMultiEnum→true, dataType, trestleAccessMethod
 * 13. BuildingLaundryFeatures: isEnum→true, isMultiEnum→true, dataType, trestleAccessMethod
 * 14. BuildingParkingFeatures: isEnum→true, isMultiEnum→true, dataType, trestleAccessMethod
 * 15. BuildingPatioAndPorchFeatures: isEnum→true, isMultiEnum→true, dataType, trestleAccessMethod
 * 16. BuildingPetsAllowed: isEnum→true, isMultiEnum→true, dataType, trestleAccessMethod
 * 17. BuildingPoolFeatures: isEnum→true, isMultiEnum→true, dataType, trestleAccessMethod
 * 18. BuildingSecurityFeatures: isEnum→true, isMultiEnum→true, dataType, trestleAccessMethod
 * 19. AttendanceType: isEnum→true, isMultiEnum→false, dataType, trestleAccessMethod
 * 20. BuildingStaffType: isEnum→true, isMultiEnum→false, dataType, trestleAccessMethod
 * 21. BuildingRules: isEnum→true, isMultiEnum→true, dataType, trestleAccessMethod
 * 22. BuildingCondition: isEnum→true, isMultiEnum→false, dataType, trestleAccessMethod
 * 23. BathroomCondition: isEnum→true, isMultiEnum→false, dataType, trestleAccessMethod
 * 24. KitchenCondition: isEnum→true, isMultiEnum→false, dataType, trestleAccessMethod
 * 25. FlipTaxType: isEnum→true, isMultiEnum→false, dataType, trestleAccessMethod
 * 26. LeaseType: isEnum→true, isMultiEnum→false, dataType, trestleAccessMethod
 * 27. CoBrokeAgreement: isEnum→true, isMultiEnum→false, dataType, trestleAccessMethod
 * 28. Permissions: isEnum→true, isMultiEnum→true, dataType, trestleAccessMethod
 *
 * == LOOKUP ENTRIES ==
 * 29. FeeFrequency: add AdditionalFeeFrequency to usedByFields
 * 30. StreetSuffix: add Mews value (NYC street — Washington Mews)
 *
 * == META ==
 * 31. Add _trestleArchitecture section documenting 3 access mechanisms
 * 32. Update stats.totalFields to reflect 4 new AdditionalFee* fields
 */

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '..', 'data', 'MASTER_REGISTRY.json');

// Read
const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
const reg = JSON.parse(raw);

// ============================================================
// FIELD FIXES
// ============================================================

// 1. TenantPays — fix isEnum, add complianceNotes
if (reg.fields.TenantPays) {
  reg.fields.TenantPays.isEnum = true;
  reg.fields.TenantPays.complianceNotes = "FARE Act (NYC LL 119/2024) fee disclosure field. REBNY lookup CSV provides values (lookup isRebny=true). Accessed on Trestle Property entity.";
} else {
  console.error('MISSING: fields.TenantPays');
  process.exit(1);
}

// 2. OngoingFees — fix isEnum, add complianceNotes
if (reg.fields.OngoingFees) {
  reg.fields.OngoingFees.isEnum = true;
  reg.fields.OngoingFees.complianceNotes = "FARE Act (NYC LL 119/2024) fee disclosure field. REBNY lookup CSV provides values (lookup isRebny=true). Accessed on Trestle Property entity.";
} else {
  console.error('MISSING: fields.OngoingFees');
  process.exit(1);
}

// 3. TenantPaysDescription — add complianceNotes
if (reg.fields.TenantPaysDescription) {
  reg.fields.TenantPaysDescription.complianceNotes = "FARE Act (NYC LL 119/2024) companion field. Free-text description accompanying TenantPays picklist. Accessed on Trestle Property entity.";
} else {
  console.error('MISSING: fields.TenantPaysDescription');
  process.exit(1);
}

// 4-7. ADD AdditionalFee* fields (on Trestle CustomProperty entity)
const additionalFeeFields = {
  AdditionalFee: {
    isRebny: false,
    trestleMatch: true,
    dataType: "Decimal",
    maxLength: null,
    precision: 14,
    scale: 2,
    nullable: true,
    isEnum: false,
    isMultiEnum: false,
    rebnyDescription: null,
    lmpAddEdit: false,
    lmpSearch: false,
    required: "No",
    conditionalRule: null,
    displayTier: "idx",
    canonicalKey: null,
    label: null,
    allowedSurfaces: null,
    searchDomIds: null,
    trestleAccessMethod: "CustomProperty entity — requires $expand=CustomProperty in Trestle API call",
    complianceNotes: "FARE Act (NYC LL 119/2024). On Trestle CustomProperty entity (NOT Property). Requires $expand=CustomProperty. Dollar amount of additional fee."
  },
  AdditionalFeeYN: {
    isRebny: false,
    trestleMatch: true,
    dataType: "Boolean",
    maxLength: null,
    precision: null,
    scale: null,
    nullable: true,
    isEnum: false,
    isMultiEnum: false,
    rebnyDescription: null,
    lmpAddEdit: false,
    lmpSearch: false,
    required: "No",
    conditionalRule: null,
    displayTier: "idx",
    canonicalKey: null,
    label: null,
    allowedSurfaces: null,
    searchDomIds: null,
    trestleAccessMethod: "CustomProperty entity — requires $expand=CustomProperty in Trestle API call",
    complianceNotes: "FARE Act (NYC LL 119/2024). On Trestle CustomProperty entity (NOT Property). Requires $expand=CustomProperty. Boolean: does an additional fee apply?"
  },
  AdditionalFeeDescription: {
    isRebny: false,
    trestleMatch: true,
    dataType: "String",
    maxLength: "1024",
    precision: null,
    scale: null,
    nullable: true,
    isEnum: false,
    isMultiEnum: false,
    rebnyDescription: null,
    lmpAddEdit: false,
    lmpSearch: false,
    required: "No",
    conditionalRule: null,
    displayTier: "idx",
    canonicalKey: null,
    label: null,
    allowedSurfaces: null,
    searchDomIds: null,
    trestleAccessMethod: "CustomProperty entity — requires $expand=CustomProperty in Trestle API call",
    complianceNotes: "FARE Act (NYC LL 119/2024). On Trestle CustomProperty entity (NOT Property). Requires $expand=CustomProperty. Free-text description of additional fee."
  },
  AdditionalFeeFrequency: {
    isRebny: false,
    trestleMatch: true,
    dataType: "FeeFrequency",
    maxLength: null,
    precision: null,
    scale: null,
    nullable: true,
    isEnum: true,
    isMultiEnum: false,
    rebnyDescription: null,
    lmpAddEdit: false,
    lmpSearch: false,
    required: "No",
    conditionalRule: null,
    displayTier: "idx",
    canonicalKey: null,
    label: null,
    allowedSurfaces: null,
    searchDomIds: null,
    trestleAccessMethod: "CustomProperty entity — requires $expand=CustomProperty in Trestle API call. Uses FeeFrequency enum (same as AssociationFeeFrequency). NOTE: Trestle field name is AdditionalFeeFrequency, NOT FeeFrequency.",
    complianceNotes: "FARE Act (NYC LL 119/2024). On Trestle CustomProperty entity. Field name is AdditionalFeeFrequency (NOT FeeFrequency as incorrectly used in some codebase files). Uses FeeFrequency enum values."
  }
};

for (const [name, def] of Object.entries(additionalFeeFields)) {
  if (reg.fields[name]) {
    console.warn(`ALREADY EXISTS: fields.${name} — updating`);
    Object.assign(reg.fields[name], def);
  } else {
    reg.fields[name] = def;
  }
}

// ============================================================
// 8-18. Building-level split fields
// These are REBNY fields that don't exist as separate Trestle Property fields.
// On Trestle, building-level values are Building*-prefixed enum members
// within the parent enum (e.g., Heating enum has BuildingCitySteam).
// ============================================================

const buildingSplitFields = {
  BuildingAccessibilityFeatures: { dataType: "BuildingAccessibilityFeatures", parentField: "AccessibilityFeatures" },
  BuildingCooling:               { dataType: "BuildingCooling",               parentField: "Cooling" },
  BuildingExteriorFeatures:      { dataType: "BuildingExteriorFeatures",      parentField: "ExteriorFeatures" },
  BuildingFencing:               { dataType: "BuildingFencing",               parentField: "Fencing" },
  BuildingHeating:               { dataType: "BuildingHeating",               parentField: "Heating" },
  BuildingLaundryFeatures:       { dataType: "BuildingLaundryFeatures",       parentField: "LaundryFeatures" },
  BuildingParkingFeatures:       { dataType: "BuildingParkingFeatures",       parentField: "ParkingFeatures" },
  BuildingPatioAndPorchFeatures: { dataType: "BuildingPatioAndPorchFeatures", parentField: "PatioAndPorchFeatures" },
  BuildingPetsAllowed:           { dataType: "BuildingPetsAllowed",           parentField: "PetsAllowed" },
  BuildingPoolFeatures:          { dataType: "BuildingPoolFeatures",          parentField: "PoolFeatures" },
  BuildingSecurityFeatures:      { dataType: "BuildingSecurityFeatures",      parentField: "SecurityFeatures" },
};

for (const [name, info] of Object.entries(buildingSplitFields)) {
  if (!reg.fields[name]) {
    console.error(`MISSING: fields.${name}`);
    process.exit(1);
  }
  reg.fields[name].isEnum = true;
  reg.fields[name].isMultiEnum = true;
  reg.fields[name].dataType = info.dataType;
  reg.fields[name].trestleAccessMethod = `Building-level split: REBNY treats this as a separate field. On Trestle, building-level values exist as Building*-prefixed enum members within the parent ${info.parentField} field on the Property entity. Consumer must split Building*-prefixed values from unit-level values. Also may appear in CustomFields JSON on CustomProperty entity.`;
}

// ============================================================
// 19-28. True REBNY-custom fields
// These have NO equivalent on Trestle's typed schema.
// Accessed via CustomFields JSON blob on CustomProperty entity.
// ============================================================

const rebnyCustomFields = {
  AttendanceType:    { dataType: "AttendanceType",    isMultiEnum: false },
  BuildingStaffType: { dataType: "BuildingStaffType", isMultiEnum: false },
  BuildingRules:     { dataType: "BuildingRules",     isMultiEnum: true },
  BuildingCondition: { dataType: "BuildingCondition",  isMultiEnum: false },
  BathroomCondition: { dataType: "BathroomCondition",  isMultiEnum: false },
  KitchenCondition:  { dataType: "KitchenCondition",   isMultiEnum: false },
  FlipTaxType:       { dataType: "FlipTaxType",        isMultiEnum: false },
  LeaseType:         { dataType: "LeaseType",           isMultiEnum: false },
  CoBrokeAgreement:  { dataType: "CoBrokeAgreement",   isMultiEnum: false },
  Permissions:       { dataType: "Permissions",         isMultiEnum: true },
};

for (const [name, info] of Object.entries(rebnyCustomFields)) {
  if (!reg.fields[name]) {
    console.error(`MISSING: fields.${name}`);
    process.exit(1);
  }
  reg.fields[name].isEnum = true;
  reg.fields[name].isMultiEnum = info.isMultiEnum;
  reg.fields[name].dataType = info.dataType;
  reg.fields[name].trestleAccessMethod = "REBNY-custom field. NOT on Trestle Property or CustomProperty typed columns. Defined by REBNY, hosted by Trestle. Likely accessed via CustomFields JSON blob on CustomProperty entity ($expand=CustomProperty). Requires verification with live API call.";
}

// ============================================================
// LOOKUP FIXES
// ============================================================

// 29. FeeFrequency — add AdditionalFeeFrequency to usedByFields
if (reg.enums && reg.enums.FeeFrequency) {
  const uf = reg.enums.FeeFrequency.usedByFields;
  if (!uf.includes('AdditionalFeeFrequency')) {
    uf.push('AdditionalFeeFrequency');
  }
} else {
  console.error('MISSING: enums.FeeFrequency');
  process.exit(1);
}

// 30. StreetSuffix — add Mews value
if (reg.enums && reg.enums.StreetSuffix) {
  const vals = reg.enums.StreetSuffix.values;

  // Check if Mews already exists
  const hasMews = vals.some(v => v.value === 'Mews');
  if (!hasMews) {
    // Insert Mews after Meadows (alphabetical order)
    const meadowsIdx = vals.findIndex(v => v.value === 'Meadows');
    const mewsEntry = {
      value: "Mews",
      description: "The street suffix is Mews. A narrow lane or alley behind houses, common in NYC (e.g., Washington Mews in Greenwich Village). NOTE: REBNY CSV line 1945 erroneously maps abbreviation 'Mews' to value 'Meadows' — this is a CSV data error. Mews and Meadows are distinct street suffix types."
    };
    if (meadowsIdx >= 0) {
      vals.splice(meadowsIdx + 1, 0, mewsEntry);
    } else {
      vals.push(mewsEntry);
    }
  }

  // Update Meadows description to note the CSV error
  const meadows = vals.find(v => v.value === 'Meadows');
  if (meadows) {
    meadows.description = "The street suffix is Meadows. NOTE: REBNY CSV line 1945 erroneously uses abbreviation 'Mews' for this value — Mews is a distinct NYC street suffix (see Mews entry).";
  }
} else {
  console.error('MISSING: enums.StreetSuffix');
  process.exit(1);
}

// ============================================================
// META — add _trestleArchitecture
// ============================================================

reg._meta.trestleArchitecture = {
  description: "Documents how REBNY RLS fields are accessed via the Trestle API. Three distinct mechanisms exist.",
  lastUpdated: "2026-03-13",
  mechanisms: {
    "1_PropertyEntity": {
      description: "Standard Cotality fields on the Trestle Property entity. Accessed directly via OData $select.",
      fieldCount: "~580 fields",
      examples: ["ListPrice", "BedroomsTotal", "Heating", "PetsAllowed"]
    },
    "2_CustomPropertyEntity": {
      description: "Extension fields on Trestle's CustomProperty entity. Requires $expand=CustomProperty in the API call. Contains both named typed columns (AdditionalFee*) and a CustomFields JSON blob (MaxLength 100000).",
      accessMethod: "$expand=CustomProperty",
      namedColumns: ["AdditionalFee", "AdditionalFeeYN", "AdditionalFeeDescription", "AdditionalFeeFrequency"],
      customFieldsBlob: "CustomFields (Edm.String, MaxLength=100000) — JSON blob where REBNY-specific fields may be stored"
    },
    "3_BuildingLevelSplit": {
      description: "REBNY defines separate building-level fields (e.g., BuildingHeating) that do NOT exist as typed Trestle fields. Instead, Trestle implements building-level values as Building*-prefixed enum members within parent fields (e.g., Heating enum includes BuildingCitySteam, BuildingElectric). Consumer must parse and split these from unit-level values.",
      fields: [
        "BuildingAccessibilityFeatures → AccessibilityFeatures parent",
        "BuildingCooling → Cooling parent",
        "BuildingExteriorFeatures → ExteriorFeatures parent",
        "BuildingFencing → Fencing parent",
        "BuildingHeating → Heating parent",
        "BuildingLaundryFeatures → LaundryFeatures parent",
        "BuildingParkingFeatures → ParkingFeatures parent",
        "BuildingPatioAndPorchFeatures → PatioAndPorchFeatures parent",
        "BuildingPetsAllowed → PetsAllowed parent",
        "BuildingPoolFeatures → PoolFeatures parent",
        "BuildingSecurityFeatures → SecurityFeatures parent"
      ]
    },
    "4_RebnyCustomFields": {
      description: "~10 fields defined by REBNY that have NO equivalent on Trestle's Property or CustomProperty typed schema. These were created by REBNY and hosted on the Trestle platform. Likely accessed via the CustomFields JSON blob on CustomProperty entity. Requires verification with live API calls.",
      fields: [
        "AttendanceType",
        "BuildingStaffType",
        "BuildingRules",
        "BuildingCondition",
        "BathroomCondition",
        "KitchenCondition",
        "FlipTaxType",
        "LeaseType",
        "CoBrokeAgreement",
        "Permissions"
      ],
      nycContext: "These fields exist because NYC real estate has unique concepts (doorman types, co-op board rules, flip tax, rent stabilization, UCBA co-broke terms) not found in national Cotality standard."
    }
  },
  knownCsvErrors: [
    {
      field: "StreetSuffix",
      line: 1945,
      issue: "REBNY CSV maps abbreviation 'Mews' to value 'Meadows'. Mews is a distinct NYC street suffix (Washington Mews, Sniffen Court Mews). Meadows does not exist as a NYC street suffix."
    },
    {
      field: "BuildingStaffType",
      line: 677,
      issue: "Value 'ResidenManagerFullTime' — likely typo, missing 't' (should be 'ResidentManagerFullTime'). Registry preserves CSV value exactly. Column C uses 'BuildingStaff' while Column F uses 'BuildingStaffType' — name mismatch in CSV."
    }
  ]
};

// Update stats
reg._meta.stats.totalFields += 4;  // Added 4 AdditionalFee* fields
reg._meta.stats.trestleOnlyFields += 4;  // They're Trestle-only (CustomProperty entity)

// ============================================================
// WRITE
// ============================================================

const output = JSON.stringify(reg, null, 2);
fs.writeFileSync(REGISTRY_PATH, output + '\n', 'utf8');

console.log('=== MASTER_REGISTRY.json updated successfully ===');
console.log(`Total fields: ${reg._meta.stats.totalFields}`);
console.log(`New fields added: AdditionalFee, AdditionalFeeYN, AdditionalFeeDescription, AdditionalFeeFrequency`);
console.log(`Fields updated: ${Object.keys(buildingSplitFields).length} building-split + ${Object.keys(rebnyCustomFields).length} REBNY-custom + 3 FARE Act`);
console.log(`Lookups updated: FeeFrequency (usedByFields), StreetSuffix (+Mews)`);
console.log(`Meta: _trestleArchitecture section added`);
