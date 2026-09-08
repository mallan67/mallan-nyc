/**
 * COMPILE-TIME proof that the generated Cotality contract refuses wrong bindings.
 *
 * This file is type-checked by `npm run type-check` (tsconfig includes lib/**). It has no runtime
 * and is never imported. Every `@ts-expect-error` below is a sentence of the contract: if a future
 * regeneration or edit makes one of those lines compile, `tsc` fails on the unused directive — so a
 * phantom field silently becoming "valid" is itself a build failure.
 *
 * The specific phantoms are the ones that have cost this repo the most (skill §2 phantom table).
 */
import { cotalityFields, type CotalityField, type CotalityRow } from '@/lib/cotality/contract';
import type { CotalityEnum_StandardStatus } from '@/lib/cotality/generated/contract';

// ── Field lists ───────────────────────────────────────────────────────────────

export const okList = cotalityFields('Property', ['ListingKey', 'StandardStatus', 'InternetEntireListingDisplayYN', 'VirtualTourURLUnbranded']);

// @ts-expect-error phantom — IDXEntireListingDisplayYN does not exist on Trestle (use InternetEntireListingDisplayYN)
export const phantomIdx = cotalityFields('Property', ['IDXEntireListingDisplayYN']);

// @ts-expect-error phantom — "Participant Only" is Permission has 'Private', not a YN field
export const phantomParticipant = cotalityFields('Property', ['ParticipantOnlyYN']);

// @ts-expect-error phantom — FirstShowingDate is not a live field (StartShowingDate / ActivationDate are)
export const phantomFirstShowing = cotalityFields('Property', ['FirstShowingDate']);

// @ts-expect-error phantom — SyndicateYN is not a live field (SyndicateTo is)
export const phantomSyndicateYn = cotalityFields('Property', ['SyndicateYN']);

// @ts-expect-error resource-scoped — MediaCategory is a Media field, not a Property field
export const wrongResource = cotalityFields('Property', ['MediaCategory']);

// ── Enum members ──────────────────────────────────────────────────────────────

export const canceled: CotalityEnum_StandardStatus = 'Canceled';

// @ts-expect-error British spelling is not a live StandardStatus member
export const cancelled: CotalityEnum_StandardStatus = 'Cancelled';

// @ts-expect-error not a live member
export const sold: CotalityEnum_StandardStatus = 'Sold';

// ── Row reads ─────────────────────────────────────────────────────────────────

export function readsTypedRow(raw: CotalityRow<'Property'>): string | null {
  const status = raw.StandardStatus; // CotalityEnum_StandardStatus | null | undefined
  if (status === 'Closed') return raw.ClosePrice == null ? null : String(raw.ClosePrice);
  // @ts-expect-error comparison against a non-member is unintentional (TS2367)
  if (status === 'Sold') return null;
  return raw.VirtualTourURLUnbranded ?? null;
}

export function readsPhantom(raw: CotalityRow<'Property'>): unknown {
  // @ts-expect-error property does not exist on the live Property resource
  return raw.OwnerOptOut;
}

export const fieldName: CotalityField<'Property'> = 'PhotosCount';

// @ts-expect-error not a declared field
export const notAField: CotalityField<'Property'> = 'PhotoCount';
