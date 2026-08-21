/**
 * INSTANCE-LEVEL FACTUAL AUTHORITY — who authored THIS value on THIS listing.
 *
 * `FIELD_REGISTRY` declares HOW authority is resolved. This resolves it. The
 * answer belongs in `AttributionEnvelope.factualAuthority`; no second provenance
 * system is introduced.
 *
 * ── THE GUARD THIS EXISTS TO ENFORCE ────────────────────────────────────────
 *
 * `by_listing_authority` must NEVER degrade into "the row is local, therefore
 * every value is Mallan-authored". That would be as wrong as the static
 * per-field authority it replaced, just in the other direction. A local Mallan
 * listing can legitimately carry values Mallan did not author:
 *
 *   - a Google-geocoded coordinate           -> mallan_derived
 *   - an ACRIS transaction record            -> acris
 *   - a genuine Cotality ListingKey attached
 *     to the suppressed representation       -> cotality_rebny
 *
 * So the resolution consults the FIELD's declared model first, and only
 * `by_listing_authority` fields ever consult the listing kind.
 *
 * ── THE MALLAN-OFFICE REPRESENTATION TRAP ───────────────────────────────────
 *
 * There are THREE listing kinds, not two. A Mallan-office Cotality
 * representation is a provider ROW, but it is the provider's copy of a
 * MALLAN-AUTHORED listing. Treating it as ordinary third-party inventory would
 * route its authorable facts to `cotality_rebny` — transferring authorship of
 * Mallan's own price, address and beds back to the provider through the very
 * duplicate the suppression contract exists to neutralise.
 *
 * It therefore resolves to Mallan authorship for authorable facts, exactly like
 * the local listing it represents.
 */
import type { FieldSpec } from './field-registry';
import type { SourceAuthority } from './source-provenance';

/**
 * Which kind of listing the fact belongs to.
 *
 * THREE kinds. Collapsing the middle one into `provider_third_party` is the
 * defect described above.
 */
export type ListingAuthorityKind =
  /** Mallan-authored local listing (SL-/RL-). Canonical and editable. */
  | 'mallan_local'
  /**
   * A Cotality row whose verified list-side office identity is Mallan — the
   * provider's representation of a Mallan-authored listing. Suppressed as a
   * competing listing; NOT third-party inventory.
   */
  | 'mallan_office_representation'
  /** Genuine third-party inventory. Provider-owned, read-only. */
  | 'provider_third_party';

export type AuthorityResolutionOutcome =
  | { resolved: true; authority: SourceAuthority; because: string }
  | { resolved: false; reason: 'UNRESOLVED_FIELD_CONTRACT'; because: string };

/**
 * Resolve the factual authority of one canonical fact on one listing.
 *
 * Returns an explicit UNRESOLVED rather than a fallback. A field whose contract
 * has not been established cannot acquire an authority by default — that is how
 * `achieved_rent`, `assessment` and `price_per_sqft` came to be labelled before
 * anyone probed the live fields that might supply them.
 */
export function resolveFactualAuthority(
  spec: Pick<FieldSpec, 'canonicalKey' | 'authorityResolution' | 'sourceAuthority' | 'authorityByListingKind'>,
  listingKind: ListingAuthorityKind,
): AuthorityResolutionOutcome {
  switch (spec.authorityResolution) {
    case 'fixed': {
      // Permanent regardless of listing kind — provider identifiers stay
      // provider facts even when attached to a Mallan canonical listing.
      if (!spec.sourceAuthority) {
        return {
          resolved: false,
          reason: 'UNRESOLVED_FIELD_CONTRACT',
          because: `'${spec.canonicalKey}' is declared fixed but carries no sourceAuthority`,
        };
      }
      return { resolved: true, authority: spec.sourceAuthority, because: 'fixed authority, independent of listing kind' };
    }

    case 'mallan_derived':
      // Mallan computed it from verified inputs. True on a third-party listing
      // too: geocoding a provider address does not make Cotality the author of
      // the coordinate.
      return { resolved: true, authority: 'mallan_derived', because: 'Mallan computes this fact regardless of listing origin' };

    case 'by_listing_authority': {
      const byKind = spec.authorityByListingKind;
      if (!byKind) {
        return {
          resolved: false,
          reason: 'UNRESOLVED_FIELD_CONTRACT',
          because: `'${spec.canonicalKey}' is by_listing_authority but declares no per-kind authorship`,
        };
      }
      if (listingKind === 'provider_third_party') {
        return { resolved: true, authority: byKind.providerListing, because: 'third-party inventory: the provider authored it' };
      }
      // BOTH Mallan kinds resolve to Mallan authorship. The representation is
      // the provider's COPY of a Mallan-authored listing; it must not carry
      // authorship back to the provider.
      return {
        resolved: true,
        authority: byKind.mallanLocal,
        because:
          listingKind === 'mallan_local'
            ? 'Mallan authored this listing'
            : 'Mallan-office Cotality representation — the provider copy of a Mallan-authored listing, never third-party inventory',
      };
    }

    case 'unresolved':
    default:
      // NOT a synonym for mallan_derived, and never a fallback to the provider.
      return {
        resolved: false,
        reason: 'UNRESOLVED_FIELD_CONTRACT',
        because: `'${spec.canonicalKey}' has no established field contract yet; authority cannot be assigned by fallback`,
      };
  }
}
