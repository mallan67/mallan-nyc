/**
 * acris-building-sales — shared NYC ACRIS public-record closed-sale helpers.
 *
 * Extracted verbatim (behavior-preserving) from app/api/listings/building/route.ts
 * so the SAME ACRIS logic backs every public building-sales surface
 * (/api/listings/building, /api/buildings, listing-detail). ACRIS is the public
 * record; it is the ONLY closed-sale source allowed on public surfaces per the
 * visibility contract (Cotality-API/MLS closed prices stay agent/internal).
 *
 * Read-only external calls (NYC Open Data / Geoclient / geosearch); no secrets
 * beyond an optional Geoclient key. No prisma.
 */
import { sanitizeDocumentId } from '@/lib/sanitize';

// ACRIS endpoints (NYC Open Data — free, no key required)
const ACRIS_REAL_PROPERTY = 'https://data.cityofnewyork.us/resource/8h5j-fqxa.json';
const ACRIS_MASTER = 'https://data.cityofnewyork.us/resource/bnx9-e6tj.json';

/** Map a NYC ZIP to a borough name for Geoclient. */
export function boroughFromPostalCode(postalCode: string): string {
  const zip = parseInt(postalCode, 10);
  if (zip >= 10001 && zip <= 10282) return 'MANHATTAN';
  if (zip >= 10301 && zip <= 10314) return 'STATEN ISLAND';
  if (zip >= 10451 && zip <= 10475) return 'BRONX';
  if (zip >= 11004 && zip <= 11109) return 'QUEENS';
  if (zip >= 11201 && zip <= 11256) return 'BROOKLYN';
  if (zip >= 11351 && zip <= 11697) return 'QUEENS';
  return 'MANHATTAN';
}

/** Look up BBL from address — calls NYC Geoclient v2 or Planning Labs directly (no self-referencing API call). */
export async function lookupBBL(streetNumber: string, streetName: string, borough: string): Promise<string | null> {
  try {
    let bbl: string | null = null;

    // 1) Try NYC Geoclient v2 (if subscription key available)
    const v2Key = process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY || process.env.GEOCLIENT_PRIMARY_KEY || '';
    if (v2Key) {
      const v2Url = `https://api.nyc.gov/geo/geoclient/v2/address.json?houseNumber=${encodeURIComponent(streetNumber)}&street=${encodeURIComponent(streetName)}&borough=${encodeURIComponent(borough || 'MANHATTAN')}`;
      const res = await fetch(v2Url, {
        headers: { 'Ocp-Apim-Subscription-Key': v2Key, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        bbl = data?.address?.bbl || null;
      }
    }

    // 2) Fallback: Planning Labs geosearch (free, no key)
    if (!bbl) {
      const oneLine = `${streetNumber} ${streetName} ${borough}`.trim();
      const planUrl = `https://geosearch.planninglabs.nyc/v2/search?text=${encodeURIComponent(oneLine)}&size=1`;
      const planRes = await fetch(planUrl, { signal: AbortSignal.timeout(5000) });
      if (planRes.ok) {
        const planData = await planRes.json();
        const props = planData?.features?.[0]?.properties;
        if (props?.addendum?.pad?.bbl) {
          bbl = String(props.addendum.pad.bbl);
        }
      }
    }

    if (!bbl) return null;

    // Format as borough-block-lot (e.g., "1-01234-0056")
    const raw = String(bbl).replace(/[^0-9]/g, '');
    if (raw.length === 10) {
      return `${raw[0]}-${raw.substring(1, 6)}-${raw.substring(6, 10)}`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * A NYC ACRIS recorded-transfer document (Maya 2026-07-23 semantics).
 *
 * These are RECORDED TRANSFERS from the public record — NOT verified
 * unit-level closed sales. ACRIS deeds may not identify a unit, may cover a
 * whole building or multiple properties, and carry no beds/baths/sqft.
 * Nothing here is inferred; missing stays missing.
 */
export interface AcrisTransferRecord {
  id: string;               // "acris-<documentId>"
  documentId: string;       // ACRIS document ID (provenance)
  bbl: string;              // the BBL the query was made for (provenance)
  /** Recorded document amount. Legacy field name kept for shape compatibility;
   *  this is NOT a verified unit closing price. */
  closePrice: number;
  amount: number;           // canonical name — same value as closePrice
  closeDate: string | null; // recorded/document date (legacy field name)
  recordedDate: string | null;
  unit: string;             // '' — ACRIS deeds don't reliably carry units
  source: 'acris';
  retrievedAt: string;      // ISO timestamp of this retrieval (provenance)
}

/** Fetch deed/transfer records from ACRIS for a BBL (public recorded transfers). */
export async function fetchAcrisSales(bbl: string): Promise<AcrisTransferRecord[]> {
  try {
    const parts = bbl.split('-');
    if (parts.length !== 3) return [];
    const [borough, block, lot] = parts;

    // Step 1: Get document IDs for this property from ACRIS Real Property
    const rpUrl = `${ACRIS_REAL_PROPERTY}?borough=${encodeURIComponent(borough)}&block=${encodeURIComponent(block)}&lot=${encodeURIComponent(lot)}&$order=document_id DESC&$limit=30`;
    const rpRes = await fetch(rpUrl, { signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } });
    if (!rpRes.ok) return [];
    const rpData = (await rpRes.json()) as Array<Record<string, string>>;
    if (rpData.length === 0) return [];

    const docIds = rpData
      .map((r) => sanitizeDocumentId(r.document_id || ''))
      .filter((id): id is string => id !== null);
    if (docIds.length === 0) return [];

    // Step 2: Get master records — filter to deed/transfer types with amounts
    const docIdList = docIds.map((id) => `'${id}'`).join(',');
    const masterUrl = `${ACRIS_MASTER}?$where=document_id in (${docIdList}) AND doc_type in ('DEED','DEEDO','RPTT%26RET') AND document_amt > 0&$order=recorded_datetime DESC&$limit=20`;
    const masterRes = await fetch(masterUrl, { signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } });
    if (!masterRes.ok) return [];
    const masterData = (await masterRes.json()) as Array<Record<string, string>>;

    const retrievedAt = new Date().toISOString();
    return masterData
      .filter((doc) => parseFloat(doc.document_amt || '0') > 0)
      .map((doc) => {
        const amt = parseFloat(doc.document_amt || '0');
        const dateStr = doc.recorded_datetime || doc.document_date || null;
        const date = dateStr ? new Date(dateStr).toISOString().split('T')[0] : null;
        // ACRIS Real Property `easement` is a Y/N flag, NOT a unit number.
        // ACRIS deed records don't reliably carry unit numbers.
        return {
          id: `acris-${doc.document_id}`,
          documentId: String(doc.document_id || ''),
          bbl,
          closePrice: amt,
          amount: amt,
          closeDate: date,
          recordedDate: date,
          unit: '',
          source: 'acris' as const,
          retrievedAt,
        };
      });
  } catch (err) {
    console.warn('[acris-building-sales] ACRIS fetch error:', err);
    return [];
  }
}

/** Check if an ACRIS record likely duplicates a Cotality-API/MLS record (same month + similar price). */
export function isDuplicate(
  acris: { closePrice: number; closeDate: string | null },
  mlsRecords: Array<{ closePrice: number; closeDate: string | null }>,
): boolean {
  for (const tr of mlsRecords) {
    if (!acris.closeDate || !tr.closeDate) continue;
    const acrisDate = new Date(acris.closeDate);
    const mlsDate = new Date(tr.closeDate);
    const monthDiff = Math.abs(
      (acrisDate.getFullYear() - mlsDate.getFullYear()) * 12 +
        (acrisDate.getMonth() - mlsDate.getMonth()),
    );
    // Within 2 months and price within 5%
    if (monthDiff <= 2) {
      const priceDiff = Math.abs(acris.closePrice - tr.closePrice) / Math.max(acris.closePrice, tr.closePrice, 1);
      if (priceDiff < 0.05) return true;
    }
  }
  return false;
}
