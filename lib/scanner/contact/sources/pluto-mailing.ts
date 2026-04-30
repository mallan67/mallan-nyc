/**
 * lib/scanner/contact/sources/pluto-mailing.ts
 *
 * Source adapter: PLUTO row → SourceContactRow.
 *
 * PLUTO carries:
 *   - OwnerName (legal owner-of-record — often LLC/Trust, sometimes individual)
 *   - OwnerType (P/X/M/C/O — private/mixed/misc/city/other-gov)
 *   - The property's billing address (the property itself, used for tax bills)
 *
 * PLUTO does NOT carry an owner mailing address separate from the property —
 * the implicit contract is "tax bills go to the property unless overridden."
 * For absentee-owner detection, we need the actual mailing address from
 * NYC DOF Property Tax Bills (a separate dataset; future ingest).
 *
 * What this adapter produces:
 *   - owner_entity: PLUTO OwnerName
 *   - addresses: the property's street address (low-confidence as a contact
 *     address — owners may live elsewhere)
 *   - source: "pluto_mailing"
 */
import type { PlutoProjected } from "@/lib/scanner/pluto-filter";
import type { SourceContactRow } from "@/lib/scanner/contact/types";

/** Convert a PLUTO row into a SourceContactRow. */
export function plutoRowToContact(
  row: PlutoProjected,
  capturedAt: string = new Date().toISOString(),
): SourceContactRow {
  const ownerName = (row.OwnerName || "").trim();
  const propertyAddr = formatPropertyAddress(row);

  return {
    bbl: row.BBL || null,
    owner_entity: ownerName || null,
    names: [],
    phones: [],
    emails: [],
    addresses: propertyAddr ? [propertyAddr] : [],
    source: "pluto_mailing",
    source_url: row.BBL
      ? `https://propertyinformationportal.nyc.gov/parcels/parcel/${row.BBL}`
      : undefined,
    source_captured_at: capturedAt,
  };
}

function formatPropertyAddress(row: PlutoProjected): string {
  const street = (row.Address || "").trim();
  const zip = (row.ZipCode || "").trim();
  if (!street) return "";
  return zip ? `${street}, NEW YORK NY ${zip}` : `${street}, NEW YORK NY`;
}
