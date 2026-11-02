/**
 * MALLAN TWIN CONTEXT: which Cotality rows are PROVEN duplicates of a Mallan-authored listing, and which Mallan agents are verified.
 *
 * Why this exists (Master 4.4): Mallan's own listing can come back through Cotality as an `RLS*` row. That returned copy is a duplicate and is
 * suppressed from the public set — but ONLY when it duplicates a Mallan-authored local listing (`SL-` / `RL-`). A Cotality row that merely carries
 * Mallan's list-office id, with no local twin, is not a duplicate of anything: it is the only public record of that listing. Suppressing it by
 * office id alone (the earlier rule) made a listing the broker entered straight into RLS disappear from search, address search and its own page.
 *
 * Proof of identity = the repo's existing physical-unit key (`buildAddressKeyFromDbRow`: street number, direction, name, suffix, zip AND unit
 * number; it returns null without a unit, so different units and partial addresses never merge). Address alone is not enough for a different
 * building or a missing unit; a Mallan-office row with the same physical unit as a Mallan-authored row is the same unit listed twice.
 *
 * A local row still in `Draft` is not a twin: it is not public, so it must not hide a live Cotality listing.
 *
 * The context is computed from the database (two small queries) and cached for 60 s, so the public identity reconciles on its own when a
 * Mallan-authored listing for the same unit is created: no deploy, no data edit.
 */
import prisma from '@/lib/prisma';
import { buildAddressKeyFromDbRow } from '@/lib/listings/dedupe-crm-vs-idx';
import { MALLAN_LIST_OFFICE_MLS_IDS } from '@/lib/listings/mallan-source-identity';

/** A Mallan agent, verified from the agent roster by REBNY MLS member id. Public profile fields only. */
export interface MallanVerifiedAgent {
  mlsId: string;
  name: string;
  slug: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  photo: string | null;
}

export interface MallanTwinContext {
  /** `RLS…` ids of Mallan-office Cotality rows that duplicate a Mallan-authored local listing (the same physical unit): suppressed from the public set. */
  readonly returnCopyIds: readonly string[];
  /** Active Mallan agents by REBNY MLS member id (`Agent.trestle_mls_id`). */
  readonly agentsByMlsId: Readonly<Record<string, MallanVerifiedAgent>>;
}

/** What a caller that cannot reach the database uses: nothing is proven a duplicate, no agent is verified. */
export const EMPTY_TWIN_CONTEXT: MallanTwinContext = Object.freeze({ returnCopyIds: [], agentsByMlsId: {} });

type RowWithAddress = { listing_id: string; address: unknown };
type LocalRow = RowWithAddress & { status?: string | null };
type OfficeRow = RowWithAddress & { list_office_mls_id?: string | null };
type AgentRow = {
  trestle_mls_id: string | null;
  full_name: string | null;
  first_name: string;
  last_name: string;
  public_slug: string | null;
  title: string | null;
  email: string;
  phone: string | null;
  photo: string | null;
  status: string;
};

const isLocalId = (id: string) => id.startsWith('SL-') || id.startsWith('RL-');

/** PURE: the context from already-fetched rows (the unit tests and the loader share it). */
export function buildMallanTwinContext(
  localRows: ReadonlyArray<LocalRow>,
  officeRows: ReadonlyArray<OfficeRow>,
  agents: ReadonlyArray<AgentRow>,
): MallanTwinContext {
  const officeIds = new Set<string>(MALLAN_LIST_OFFICE_MLS_IDS);

  // The physical units Mallan has authored and published (not Draft).
  const localKeys = new Set<string>();
  for (const row of localRows) {
    if (!isLocalId(row.listing_id)) continue;
    if (String(row.status ?? '').toLowerCase() === 'draft') continue;
    const key = buildAddressKeyFromDbRow({ address: row.address });
    if (key) localKeys.add(key);
  }

  // A Mallan-office Cotality row is a duplicate only when it is the same physical unit as one of those.
  const returnCopyIds: string[] = [];
  for (const row of officeRows) {
    if (isLocalId(row.listing_id)) continue;
    const office = typeof row.list_office_mls_id === 'string' ? row.list_office_mls_id.trim() : '';
    if (!office || !officeIds.has(office)) continue;
    const key = buildAddressKeyFromDbRow({ address: row.address });
    if (key && localKeys.has(key)) returnCopyIds.push(row.listing_id);
  }
  returnCopyIds.sort();

  const agentsByMlsId: Record<string, MallanVerifiedAgent> = {};
  for (const a of agents) {
    const mlsId = (a.trestle_mls_id ?? '').trim();
    if (!mlsId || a.status !== 'active') continue;
    agentsByMlsId[mlsId] = {
      mlsId,
      name: (a.full_name ?? '').trim() || `${a.first_name} ${a.last_name}`.trim(),
      slug: a.public_slug,
      title: a.title,
      email: a.email,
      phone: a.phone,
      photo: a.photo,
    };
  }

  return { returnCopyIds, agentsByMlsId };
}

const TTL_MS = 60_000;
let cached: { at: number; ctx: MallanTwinContext } | null = null;
let inFlight: Promise<MallanTwinContext> | null = null;

async function fetchContext(): Promise<MallanTwinContext> {
  const officeIds = [...MALLAN_LIST_OFFICE_MLS_IDS];
  const [localRows, officeRows, agents] = await Promise.all([
    prisma.listing.findMany({
      where: { OR: [{ listing_id: { startsWith: 'SL-' } }, { listing_id: { startsWith: 'RL-' } }] },
      select: { listing_id: true, address: true, status: true },
    }),
    prisma.listing.findMany({
      where: { list_office_mls_id: { in: officeIds }, NOT: [{ listing_id: { startsWith: 'SL-' } }, { listing_id: { startsWith: 'RL-' } }] },
      select: { listing_id: true, address: true, list_office_mls_id: true },
    }),
    prisma.agent.findMany({
      where: { status: 'active', trestle_mls_id: { not: null } },
      select: { trestle_mls_id: true, full_name: true, first_name: true, last_name: true, public_slug: true, title: true, email: true, phone: true, photo: true, status: true },
    }),
  ]);
  return buildMallanTwinContext(localRows, officeRows, agents);
}

/**
 * The context for this request: cached for 60 s. If the database cannot answer, the last good context is used; with none, nothing is proven a
 * duplicate and no agent is verified (suppression and branding fail CLOSED: no unproven row is hidden as a duplicate or branded as Mallan's).
 */
export async function loadMallanTwinContext(): Promise<MallanTwinContext> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.ctx;
  if (!inFlight) {
    inFlight = fetchContext()
      .then((ctx) => {
        cached = { at: Date.now(), ctx };
        return ctx;
      })
      .catch((err) => {
        console.warn('[mallan-twin-context] could not read the identity context:', err instanceof Error ? err.message : err);
        return cached?.ctx ?? EMPTY_TWIN_CONTEXT;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** The last context loaded in this process (EMPTY before the first load). For internal readers that cannot await: public readers await `loadMallanTwinContext()`. */
export function lastKnownMallanTwinContext(): MallanTwinContext {
  return cached?.ctx ?? EMPTY_TWIN_CONTEXT;
}

/** Test seam: drop the cache. */
export function resetMallanTwinContextCache(): void {
  cached = null;
  inFlight = null;
}
