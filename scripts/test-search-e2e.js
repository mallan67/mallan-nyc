#!/usr/bin/env node
// End-to-end search test — calls live Trestle API with every filter path
// Usage: node scripts/test-search-e2e.js
require("dotenv").config({ path: ".env.local" });

async function getToken() {
  const r = await fetch("https://api.cotality.com/trestle/oidc/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&client_id=" + process.env.IDX_CLIENT_ID + "&client_secret=" + process.env.IDX_CLIENT_SECRET + "&scope=api"
  });
  return (await r.json()).access_token;
}

function esc(s) { return s.replace(/'/g, "''"); }

async function test(token, name, filter, select) {
  try {
    var url = "https://api.cotality.com/trestle/odata/Property?$filter=" + encodeURIComponent(filter) +
      "&$select=" + select + "&$top=3&$orderby=ModificationTimestamp desc";
    var r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) {
      var err = await r.json();
      var msg = (err.error && err.error.message) ? err.error.message.substring(0, 70) : "HTTP " + r.status;
      console.log("\x1b[31m✗\x1b[0m " + name.padEnd(48) + msg);
      return false;
    }
    var d = await r.json();
    var count = d.value ? d.value.length : 0;
    var info = count > 0 ? count + " results" : "0 (empty but query valid)";
    console.log("\x1b[32m✓\x1b[0m " + name.padEnd(48) + info);
    return true;
  } catch (e) {
    console.log("\x1b[31m✗\x1b[0m " + name.padEnd(48) + "EXCEPTION: " + e.message);
    return false;
  }
}

async function run() {
  var token = await getToken();
  if (!token) { console.log("Auth failed"); process.exit(1); }
  console.log("Trestle Auth OK\n");

  var sale = "PropertyType ne 'ResidentialLease' and (StandardStatus eq 'Active')";
  var rental = "PropertyType eq 'ResidentialLease' and (StandardStatus eq 'Active')";
  var sel = "ListingId,ListPrice,BedroomsTotal,BathroomsTotalInteger,UnitNumber,StandardStatus";
  var pass = 0, fail = 0;

  async function t(name, filter, extraSel) {
    var ok = await test(token, name, filter, sel + (extraSel ? "," + extraSel : ""));
    ok ? pass++ : fail++;
  }

  console.log("═══ PRICE ═══");
  await t("Sale: min $1M",                     sale + " and ListPrice ge 1000000");
  await t("Sale: max $500K",                   sale + " and ListPrice le 500000");
  await t("Sale: range $500K-$1M",             sale + " and ListPrice ge 500000 and ListPrice le 1000000");
  await t("Rental: min $3000",                 rental + " and ListPrice ge 3000");
  await t("Rental: max $5000",                 rental + " and ListPrice le 5000");

  console.log("\n═══ BEDS / BATHS / ROOMS / SQFT ═══");
  await t("Studio (beds=0)",                   sale + " and BedroomsTotal eq 0");
  await t("2-3 BR",                            sale + " and BedroomsTotal ge 2 and BedroomsTotal le 3");
  await t("Baths 2+ (BathroomsTotalInteger)",  sale + " and BathroomsTotalInteger ge 2");
  await t("Rooms 4+",                          sale + " and RoomsTotal ge 4", "RoomsTotal");
  await t("SqFt 1000-2000",                    sale + " and LivingArea ge 1000 and LivingArea le 2000", "LivingArea");

  console.log("\n═══ LOCATION ═══");
  await t("Neighborhood: Chelsea",             sale + " and SubdivisionName eq 'Chelsea'", "SubdivisionName");
  await t("Multi: UES + Tribeca",              sale + " and (SubdivisionName eq 'Upper East Side' or SubdivisionName eq 'Tribeca')", "SubdivisionName");
  await t("Borough: Brooklyn",                 "PropertyType ne 'ResidentialLease' and CityRegion eq 'Brooklyn' and (StandardStatus eq 'Active')", "CityRegion");
  await t("Zip: 10028",                        sale + " and PostalCode eq '10028'", "PostalCode");

  console.log("\n═══ UNIT / KEYWORD / ADDRESS ═══");
  await t("Unit: PH",                          sale + " and UnitNumber eq 'PH'");
  await t("Keyword: fireplace",                sale + " and contains(PublicRemarks,'fireplace')");
  await t("Address: 90th street",              sale + " and contains(StreetName,'90')", "StreetNumber,StreetName");

  console.log("\n═══ STATUS ═══");
  await t("Closed (sold)",                     "PropertyType ne 'ResidentialLease' and (StandardStatus eq 'Closed')");
  await t("ActiveUnderContract",               "PropertyType ne 'ResidentialLease' and (StandardStatus eq 'ActiveUnderContract')");
  await t("Multiple: Active + Closed",         "PropertyType ne 'ResidentialLease' and (StandardStatus eq 'Active' or StandardStatus eq 'Closed')");

  console.log("\n═══ DATES ═══");
  await t("Listed after 2026-01-01",           sale + " and ListingContractDate ge 2026-01-01", "ListingContractDate");
  await t("Contract date range",               sale + " and ListingContractDate ge 2025-06-01 and ListingContractDate le 2025-12-31", "ListingContractDate");
  await t("Close date (sold after 2026)",       "PropertyType ne 'ResidentialLease' and (StandardStatus eq 'Closed') and CloseDate ge 2026-01-01", "CloseDate");

  console.log("\n═══ CHECKBOX FILTERS ═══");
  await t("ListingAgreement: ExclusiveAgency",  sale + " and ListingAgreement eq 'ExclusiveAgency'", "ListingAgreement");
  await t("LandLeaseYN: true",                 sale + " and LandLeaseYN eq true", "LandLeaseYN");
  await t("CoolingYN: true",                   sale + " and CoolingYN eq true", "CoolingYN");
  await t("GarageYN: true",                    sale + " and GarageYN eq true", "GarageYN");
  await t("NewConstructionYN: true",            sale + " and NewConstructionYN eq true", "NewConstructionYN");
  await t("StructureType: HighRise",            sale + " and StructureType eq 'HighRise'", "StructureType");
  await t("ArchitecturalStyle: Prewar",         sale + " and ArchitecturalStyle eq 'Prewar'", "ArchitecturalStyle");
  await t("PetsAllowedYN: true",               rental + " and PetsAllowedYN eq true", "PetsAllowedYN");
  // AvailableLeaseType: 0% populated on Trestle, invalid enum values — client-side filter only
  await t("AvailableLeaseType (field exists)",   rental + " and AvailableLeaseType ne null", "AvailableLeaseType");

  console.log("\n═══ BUILDING ═══");
  await t("Year built: 1920-1940",             sale + " and YearBuilt ge 1920 and YearBuilt le 1940", "YearBuilt");
  await t("Stories: 20+ floors",               sale + " and StoriesTotal ge 20", "StoriesTotal");
  await t("Units: 100+ unit building",         sale + " and NumberOfUnitsTotal ge 100", "NumberOfUnitsTotal");
  await t("Building name: Plaza",              sale + " and contains(BuildingName,'Plaza')", "BuildingName");

  console.log("\n═══ OWNERSHIP / TYPE ═══");
  await t("Ownership: Condominium",            sale + " and CommonInterest eq 'Condominium'", "CommonInterest");
  await t("Ownership: StockCooperative",       sale + " and CommonInterest eq 'StockCooperative'", "CommonInterest");
  await t("PropertySubType: Townhouse",        sale + " and PropertySubType eq 'Townhouse'", "PropertySubType");

  console.log("\n═══ COMPS ═══");
  await t("Comps: UES closed sales",           "PropertyType ne 'ResidentialLease' and SubdivisionName eq 'Upper East Side' and (StandardStatus eq 'Closed')", "CloseDate,SubdivisionName");
  await t("Comps: Chelsea 2BR+ $1M-$3M",      "PropertyType ne 'ResidentialLease' and SubdivisionName eq 'Chelsea' and (StandardStatus eq 'Closed') and BedroomsTotal ge 2 and ListPrice ge 1000000 and ListPrice le 3000000", "SubdivisionName");

  console.log("\n══════════════════════════════════════════════════════");
  console.log("TOTAL: " + pass + " PASS, " + fail + " FAIL out of " + (pass + fail));
  if (fail === 0) console.log("ALL TESTS PASSED");
  else console.log("FAILURES FOUND — check above");
}

run().catch(function(e) { console.error("Fatal:", e); process.exit(1); });
