// The RLS link of a Mallan sale listing: raw_data.saleRlsId = the listing's Cotality `ListingId` (RLS20123633), recorded by "Pull from Cotality" in the Sale form.
// The RLS ID is the provider's identifier for the listing (the Cotality `ListingKey` is a different one, and the Mallan listing keeps its own SL ID).
//
// One RLS ID, one Mallan listing. The pull route answers "already linked" for a second pull, but two tabs (or two agents) can pull the same RLS ID before either has saved, so the
// rule is enforced here, where the link is written: the create and edit routes call assertRlsLinkFree inside their transaction, behind an advisory lock, so the second save loses.
import type { Prisma } from '@prisma/client';

export const RLS_ID_PATTERN = /^RLS\d{6,12}$/;

// Beside the listing-id locks in app/api/crm/listings/route.ts (200001 = RL, 200002 = SL).
const RLS_LINK_LOCK = 200003;

/** The RLS ID a request body carries (trimmed, upper case), null when it carries none, or an error when what it carries is not an RLS ID. */
export function rlsLinkOf(body: Record<string, unknown>): { rls: string | null; error?: string } {
  const raw = body.saleRlsId;
  if (raw === undefined || raw === null || String(raw).trim() === '') return { rls: null };
  const rls = String(raw).trim().toUpperCase();
  if (!RLS_ID_PATTERN.test(rls)) return { rls: null, error: 'saleRlsId must be an RLS ID such as RLS20123633' };
  return { rls };
}

export class RlsLinkConflict extends Error {
  constructor(readonly rls: string, readonly existing: { id: string; listing_id: string }) {
    super(`RLS ID ${rls} is already linked to ${existing.listing_id}`);
  }
}

/** Throws RlsLinkConflict when another Mallan sale listing already carries this RLS ID. Call inside a transaction: the advisory lock holds until it ends. */
export async function assertRlsLinkFree(tx: Pick<Prisma.TransactionClient, '$executeRaw' | 'listing'>, rls: string, exceptId?: bigint): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RLS_LINK_LOCK})`;
  const other = await tx.listing.findFirst({
    where: {
      listing_id: { startsWith: 'SL-' },
      raw_data: { path: ['saleRlsId'], equals: rls },
      ...(exceptId !== undefined ? { id: { not: exceptId } } : {}),
    },
    select: { id: true, listing_id: true },
  });
  if (other) throw new RlsLinkConflict(rls, { id: String(other.id), listing_id: other.listing_id });
}

export function rlsLinkConflictBody(c: RlsLinkConflict) {
  return { error: `RLS ID ${c.rls} is already linked to ${c.existing.listing_id}. Open that listing instead of creating a second one.`, existing: c.existing };
}
