/**
 * lib/scanner/contact/sources/dos-corporation.ts
 *
 * Source adapter: NY DOS Corporation row → SourceContactRow.
 *
 * Used to enrich an ACRIS-grantor-LLC with its filed process address +
 * registered agent. The join key from ACRIS is the grantor's name; we
 * look it up in the DOS Corp output by normalized_name (or the stripped
 * form for fuzzier matching).
 *
 * What it provides:
 *   - owner_entity: the LLC's current legal name
 *   - names: registered agent / process name (the human or service)
 *   - addresses: the process address (where lawsuits are served — often
 *     the manager's actual address)
 *   - source_url: NY DOS public-inquiry permalink keyed by DOS_ID
 *   - source_record_date: initial filing date
 *
 * NOT provided:
 *   - Beneficial owners. The LLC Transparency Act (LLCTA) database is
 *     confidential per 2024 amendment; only law enforcement can query.
 *     Same for the federal CTA / FinCEN BOI database.
 *   - Phone or email (DOS Corp filings don't carry these).
 */
import type { DosCorpProjected } from "@/lib/scanner/dos-corp-filter";
import type { SourceContactRow } from "@/lib/scanner/contact/types";

function formatProcessAddress(row: DosCorpProjected): string {
  const parts: string[] = [];
  if (row.process_address_1) parts.push(row.process_address_1);
  if (row.process_address_2) parts.push(row.process_address_2);
  const cityStateZip = [row.process_city, row.process_state, row.process_zip].filter(Boolean).join(" ");
  if (cityStateZip) parts.push(cityStateZip);
  return parts.join(", ");
}

/** Convert a DOS Corp output row into a SourceContactRow. */
export function dosCorpRowToContact(
  row: DosCorpProjected,
  capturedAt: string = new Date().toISOString(),
): SourceContactRow {
  const entityName = (row.current_entity_name || "").trim();
  const processName = (row.process_name || "").trim();
  const addr = formatProcessAddress(row);

  return {
    bbl: null, // DOS Corp doesn't carry a BBL — join is by entity name
    owner_entity: entityName || null,
    names: processName ? [processName] : [],
    phones: [],
    emails: [],
    addresses: addr ? [addr] : [],
    source: "dos_corporation",
    source_url: row.dos_id
      ? `https://apps.dos.ny.gov/publicInquiry/EntityDisplay?id=${encodeURIComponent(row.dos_id)}`
      : undefined,
    source_captured_at: capturedAt,
    source_record_date: row.initial_filing_date || undefined,
  };
}
