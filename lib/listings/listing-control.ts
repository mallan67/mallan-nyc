/**
 * WHICH ONE DO I CONTROL? The label the CRM shows on every listing it lists.
 *
 * A Mallan listing can exist twice in the CRM: the Mallan-authored record (`SL-` / `RL-`, editable, the one the agent controls) and the copy that came back
 * through Cotality (`RLS…`, read-only: Cotality owns it). Side by side they look the same, and editing the Cotality copy is refused by the server. This says,
 * for each row, which kind it is, whether it can be edited, and what visitors of mallan.nyc see — from the same identity proof the public site uses
 * (lib/listings/mallan-twin-context.ts), so the label can never disagree with what is actually public.
 */
import {
  isMallanLocalListing,
  isMallanRlsReturnCopy,
  MALLAN_LIST_OFFICE_MLS_IDS,
  type MallanSourceIdentityRow,
} from '@/lib/listings/mallan-source-identity';
import type { MallanTwinContext } from '@/lib/listings/mallan-twin-context';

export type ListingControlKind =
  | 'mallan-authored' // the Mallan listing: editable, the one you control
  | 'cotality-duplicate' // Cotality's copy of a Mallan listing: read-only, hidden from the public (the Mallan listing is shown instead)
  | 'cotality-mallan' // Mallan's own listing that exists only in Cotality: read-only, shown on mallan.nyc from Cotality
  | 'cotality'; // any other Cotality row: read-only

export interface ListingControl {
  kind: ListingControlKind;
  /** Can the agent change this record in the CRM? Only the Mallan-authored one. */
  editable: boolean;
  /** What a visitor of mallan.nyc sees for THIS record. */
  onSite: 'live' | 'hidden-duplicate' | 'not-live';
  /** For a Cotality duplicate: the Mallan listing that is live instead (e.g. SL-0004). */
  canonicalListingId: string | null;
  /** The badge text (short). */
  label: string;
  /** One sentence for the hover / banner. */
  detail: string;
}

export type ListingControlRow = MallanSourceIdentityRow & {
  status?: string | null;
  idx_display_yn?: boolean | null;
  internet_entire_listing_display_yn?: boolean | null;
  owner_opt_out?: boolean | null;
  participant_only?: boolean | null;
};

const PUBLIC_STATUSES = new Set(['active', 'activeundercontract', 'comingsoon']);
const normalizeStatus = (s: unknown) => String(s ?? '').toLowerCase().replace(/[\s_-]/g, '');
const isPublicStatus = (s: unknown) => PUBLIC_STATUSES.has(normalizeStatus(s));

export function describeListingControl(row: ListingControlRow, context: MallanTwinContext): ListingControl {
  const id = String(row.listing_id ?? '');
  const statusText = String(row.status ?? '').trim() || 'no status';

  if (isMallanLocalListing(row)) {
    const live = isPublicStatus(row.status);
    return {
      kind: 'mallan-authored',
      editable: true,
      onSite: live ? 'live' : 'not-live',
      canonicalListingId: null,
      label: live ? `YOU CONTROL THIS ONE · ${id} · live` : `YOU CONTROL THIS ONE · ${id} · not on mallan.nyc (${statusText})`,
      detail: live
        ? `${id} is your Mallan listing. Edit it here. This is the listing visitors see on mallan.nyc.`
        : `${id} is your Mallan listing. Edit it here. It is not on mallan.nyc right now (status: ${statusText}).`,
    };
  }

  if (isMallanRlsReturnCopy(row, context)) {
    const canonical = context.canonicalByReturnCopy?.[id] ?? null;
    const other = canonical ?? 'your Mallan listing';
    return {
      kind: 'cotality-duplicate',
      editable: false,
      onSite: 'hidden-duplicate',
      canonicalListingId: canonical,
      label: `COTALITY COPY · ${id} · read-only, hidden`,
      detail: `${id} is Cotality's copy of ${other}. You cannot edit it and it is not shown on mallan.nyc: ${other} is the live one.`,
    };
  }

  const office = typeof row.list_office_mls_id === 'string' ? row.list_office_mls_id.trim() : '';
  const isMallanOffice = (MALLAN_LIST_OFFICE_MLS_IDS as readonly string[]).includes(office);
  const passesGates =
    row.idx_display_yn !== false &&
    row.internet_entire_listing_display_yn !== false &&
    row.owner_opt_out !== true &&
    row.participant_only !== true;
  const live = isPublicStatus(row.status) && passesGates;

  if (isMallanOffice) {
    return {
      kind: 'cotality-mallan',
      editable: false,
      onSite: live ? 'live' : 'not-live',
      canonicalListingId: null,
      label: live ? `COTALITY LISTING · ${id} · read-only, live` : `COTALITY LISTING · ${id} · read-only, not live`,
      detail: live
        ? `${id} is your listing as Cotality holds it. You cannot edit it here. mallan.nyc shows it straight from Cotality because there is no Mallan listing for this unit.`
        : `${id} is your listing as Cotality holds it. You cannot edit it here, and mallan.nyc is not showing it right now (status: ${statusText}).`,
    };
  }

  return {
    kind: 'cotality',
    editable: false,
    onSite: live ? 'live' : 'not-live',
    canonicalListingId: null,
    label: `COTALITY · ${id} · read-only`,
    detail: `${id} comes from Cotality. You cannot edit it here.`,
  };
}
