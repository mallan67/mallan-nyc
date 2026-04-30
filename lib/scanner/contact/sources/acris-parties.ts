/**
 * lib/scanner/contact/sources/acris-parties.ts
 *
 * Source adapter: ACRIS Parties row (joined with Master + Legals) →
 * SourceContactRow.
 *
 * ACRIS Parties is the strongest first-party contact-info source we have
 * because:
 *   - The party self-reported their name + mailing address when the
 *     document was recorded (court-of-record process).
 *   - Each row is tied to a doc_id with a recorded_datetime — chain of
 *     custody is auditable.
 *   - For estates: the executor's mailing address (often their attorney)
 *     is on record.
 *   - For LLCs: a managing member's address sometimes appears.
 *
 * What this adapter produces:
 *   - owner_entity: party_name (the affected owner)
 *   - addresses: the party's mailing address as recorded in ACRIS
 *   - source: "acris_party"
 *   - source_url: ACRIS document permalink
 *   - source_record_date: the recorded_datetime (when this address was
 *     the address-of-record)
 */
import type { SourceContactRow } from "@/lib/scanner/contact/types";

/** A row from the ACRIS ingest output — see scripts/scanner/acris-ingest.ts. */
export interface AcrisIngestOutputRow {
  doc_id: string;
  doc_type: string;
  category: string; // lis_pendens | foreclosure | tax_lien | estate
  document_date: string;
  recorded_datetime: string;
  document_amt: string;
  bbl: string;
  street_number: string;
  street_name: string;
  unit: string;
  property_type: string;
  party_name: string;
  party_address_1: string;
  party_address_2: string;
  party_city: string;
  party_state: string;
  party_zip: string;
  party_country: string;
}

/** Combine party_address_1 + 2 + city + state + zip into a single address string. */
function formatPartyAddress(row: AcrisIngestOutputRow): string {
  const parts: string[] = [];
  if (row.party_address_1) parts.push(row.party_address_1);
  if (row.party_address_2) parts.push(row.party_address_2);
  const cityStateZip = [row.party_city, row.party_state, row.party_zip].filter(Boolean).join(" ");
  if (cityStateZip) parts.push(cityStateZip);
  return parts.join(", ");
}

/** Convert an ACRIS output row into a SourceContactRow. */
export function acrisRowToContact(
  row: AcrisIngestOutputRow,
  capturedAt: string = new Date().toISOString(),
): SourceContactRow {
  const partyName = (row.party_name || "").trim();
  const addr = formatPartyAddress(row);

  return {
    bbl: row.bbl || null,
    owner_entity: partyName || null,
    names: [],
    phones: [],
    emails: [],
    addresses: addr ? [addr] : [],
    source: "acris_party",
    source_url: row.doc_id
      ? `https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentDetail?doc_id=${row.doc_id}`
      : undefined,
    source_captured_at: capturedAt,
    source_record_date: row.recorded_datetime || row.document_date || undefined,
  };
}
