/**
 * Live Cotality Property record → PublicListingDTO through THE canonical chain.
 *
 *   Cotality raw record
 *     → checkDistributionGates (lib/compliance/gates.ts, the one permission interpretation)
 *     → mapTrestleToPrisma   (lib/idx/trestle-mapper.ts, the one provider→storage mapper)
 *     → dbListingToPublicDTO (lib/idx/db-to-public-dto.ts, the one storage→public projection)
 *
 * A live record and a persisted row therefore produce the same public shape by construction —
 * there is no second provider→DTO mapper (the former lib/idx/mapping.ts `mapRESOToInternal`
 * carried its own status / price / permission semantics and is gone, Packet 2 closure).
 *
 * Nothing is persisted here. The storage-shaped record is an in-memory value; `id` carries the
 * public listing id because the projection never reads the surrogate key.
 */
import {
  mapTrestleToPrisma,
  checkDistributionGates,
  UnrepresentableProviderRecordError,
} from './trestle-mapper';
import { dbListingToPublicDTO, type DbListing } from './db-to-public-dto';
import type { PublicListingDTO } from './public-dto';

/** The canonical mapper's output re-shaped as the storage row the public projection consumes. */
export function cotalityRecordToStorageShape(raw: Record<string, unknown>): DbListing {
  const mapped = mapTrestleToPrisma(raw);
  return {
    ...mapped,
    id: mapped.listing_id,
    // A live provider record is third-party inventory: no Mallan ownership signals, RLS-eligible.
    agent_id: null,
    owner_client_id: null,
    rls_eligible: true,
    created_at: mapped.modification_timestamp,
    updated_at: mapped.modification_timestamp,
  };
}

export interface CotalityProjectionOptions {
  /** The caller already ran checkDistributionGates on the raw records (skip the second pass). */
  alreadyGated?: boolean;
}

/**
 * One live record → public DTO. Returns null when the record fails the distribution gates.
 * Throws UnrepresentableProviderRecordError when the provider record lacks a fact Mallan
 * storage cannot hold as unknown (fail loud, never a fabricated default).
 */
export function cotalityRecordToPublicDTO(
  raw: Record<string, unknown>,
  opts: CotalityProjectionOptions = {},
): PublicListingDTO | null {
  if (!opts.alreadyGated && !checkDistributionGates(raw).displayable) return null;
  const dto = dbListingToPublicDTO(cotalityRecordToStorageShape(raw));
  // Provenance label for a record served straight from the live provider (the DB projection
  // labels persisted third-party rows 'db+idx'). Compliance metadata is identical either way.
  dto._source = 'idx';
  return dto;
}

export interface CotalityProjectionResult {
  dtos: PublicListingDTO[];
  /** Provider ListingIds refused by the distribution gates. */
  gateExcluded: string[];
  /** Records the canonical mapper refused (missing StandardStatus / ListPrice / …). Counted, never hidden. */
  unrepresentable: { listingId: string; field: string }[];
  /** ListingKeyNumeric per public id — the Media resource key some media fetches need. */
  listingKeyNumericById: Map<string, number | string | undefined>;
  /**
   * Provider record key (Property.ListingKey = Media.ResourceRecordKey) per public id. The DTO's
   * `mlsId` is the PUBLIC listing id on every path (one identity); the provider key is an
   * ingestion-side identity and is exposed here only for media lookups.
   */
  listingKeyById: Map<string, string>;
}

/** Many live records → public DTOs, with every refusal accounted for. */
export function cotalityRecordsToPublicDTOs(
  raws: Record<string, unknown>[],
  opts: CotalityProjectionOptions = {},
): CotalityProjectionResult {
  const out: CotalityProjectionResult = { dtos: [], gateExcluded: [], unrepresentable: [], listingKeyNumericById: new Map(), listingKeyById: new Map() };
  for (const raw of raws) {
    const publicId = String(raw.ListingId || raw.ListingKey || '');
    try {
      const dto = cotalityRecordToPublicDTO(raw, opts);
      if (!dto) { out.gateExcluded.push(publicId); continue; }
      out.dtos.push(dto);
      out.listingKeyNumericById.set(dto.id, raw.ListingKeyNumeric as number | string | undefined);
      if (raw.ListingKey != null && String(raw.ListingKey) !== '') out.listingKeyById.set(dto.id, String(raw.ListingKey));
    } catch (err) {
      if (err instanceof UnrepresentableProviderRecordError) { out.unrepresentable.push({ listingId: err.listingId || publicId, field: err.field }); continue; }
      throw err;
    }
  }
  return out;
}
