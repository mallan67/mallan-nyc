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
 *   - a Mallan-derived coordinate            -> mallan_derived
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
 * But it does NOT follow that the representation may SUPPLY those facts.
 * AUTHORSHIP AND PERMISSION TO ACT AS A CANONICAL VALUE SOURCE ARE DIFFERENT
 * THINGS. An earlier version resolved the representation's authorable facts to
 * `mallan_crm`, which correctly refused to credit the provider — and then let the
 * SUPPRESSED row become the source of the value, defeating suppression exactly
 * where the canonical Mallan record is missing or ambiguous.
 *
 * So authorable facts on a representation are REFUSED (`NON_CANONICAL_SOURCE`).
 * The caller resolves the canonical local twin first and reads the value from the
 * LOCAL row. Genuinely provider-authored evidence on that same representation —
 * ListingKey, provider timestamps, permissions, Media relationships, pipeline
 * lineage — still resolves normally as Cotality facts.
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
  | {
      resolved: false;
      reason:
        /** No established field contract yet. Authority cannot be assigned by fallback. */
        | 'UNRESOLVED_FIELD_CONTRACT'
        /**
         * The listing kind may not SUPPLY this canonical value, whatever authored it.
         *
         * Authorship and permission to act as a canonical value source are
         * DIFFERENT things. A suppressed Mallan-office representation genuinely
         * reflects a Mallan-authored fact — and still must not become the source
         * of that fact, or it turns into a silent fallback precisely when the
         * canonical Mallan record is missing or ambiguous.
         */
        | 'NON_CANONICAL_SOURCE';
      because: string;
    };

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
  // ── SOURCE-PERMISSION GUARD, BEFORE ANY AUTHORITY QUESTION ────────────────
  //
  // A suppressed Mallan-office representation may supply PROVIDER EVIDENCE, and
  // nothing else. This runs first because the per-mode branches answer "who
  // authored it", which is a different question from "may this row supply it" —
  // and an earlier version checked the representation only inside
  // `by_listing_authority`, so `mallan_derived` resolved before the check ever
  // ran. That let a suppressed row independently produce `geo`,
  // `building_identity`, `total_monthly_cost` and `comp_set`, re-entering Map,
  // Building Search, CMA and Reports through the side door while its authorable
  // fields were correctly blocked.
  //
  // Permitted: genuinely fixed Cotality provider evidence — ListingKey,
  // ListingId, provider lineage, provider MlsStatus, Permission/display facts,
  // provider timestamps, Media provider keys. Those stay `cotality_rebny` and are
  // retained for reconciliation/audit.
  //
  // Refused: everything else, including Mallan-derived and analytical facts,
  // Mallan CRM state, ACRIS facts and unresolved contracts.
  //
  // The representation's RAW address may still be read internally by the twin
  // resolver — that is reconciliation evidence, not a canonical fact reaching a
  // consumer.
  if (listingKind === 'mallan_office_representation') {
    const isProviderEvidence =
      spec.authorityResolution === 'fixed' && spec.sourceAuthority === 'cotality_rebny';
    if (!isProviderEvidence) {
      return {
        resolved: false,
        reason: 'NON_CANONICAL_SOURCE',
        because:
          `'${spec.canonicalKey}' is not provider evidence, and a suppressed Mallan-office ` +
          'representation may not supply a canonical Mallan listing fact. Resolve the canonical local ' +
          'twin first and derive this from the LOCAL listing; if no twin is proven, the fact is ' +
          'unavailable and the missing local record is an integrity defect.',
      };
    }
  }

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
      // `mallan_office_representation` never reaches here — the source-permission
      // guard above refuses it, because the question "may this row supply the
      // value" is answered before "who authored it".
      return { resolved: true, authority: byKind.mallanLocal, because: 'Mallan authored this listing' };
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
