/**
 * Licence designation — the ONE canonical mapping, server-side and enforced.
 *
 * @module lib/agents/license-designation
 *
 * ── Three facts, and the one this module owns ─────────────────────────────
 *
 *   license_type   the NY LICENCE CLASS the database stores. EXACTLY
 *                  "salesperson" | "associate_broker" | "broker". Not free text.
 *   title          the advertised professional designation, DERIVED from
 *                  license_type alone, owned by ./professional-title.ts.
 *   role           the BROKERAGE PROFESSIONAL ROLE — what the person IS in the
 *                  firm. "BROKER" | "ASSOCIATE_BROKER" | "SALESPERSON", owned
 *                  by ./brokerage-role.ts. Never read to decide a title.
 *
 * A designation is what a human picks in the UI. It resolves INTO a licence
 * class; it is never itself stored. The Add Agent form used to post the
 * designation display string straight into `license_type`, which is how an
 * Associate Broker came to be stored as license_type "Licensed Associate
 * Broker".
 *
 * ── THE CORRECTION ────────────────────────────────────────────────────────
 * This module used to hold LICENSE_TYPES = ['broker','salesperson'] and let the
 * reverse resolver separate a principal broker from an associate by reading
 * `role`. That was the defect: `role` is a Mallan AUTHORISATION fact and may
 * never manufacture or infer an actual licence class. `broker + AGENT` no
 * longer means Associate Broker anywhere. `associate_broker` is its own stored
 * class and carries the fact itself.
 *
 * Nothing in this file reads `role` to decide a licence class or a title.
 */
import {
  LICENSE_CLASSES,
  PROFESSIONAL_DESIGNATIONS,
  normaliseLicenseType,
  titleForLicenseClass,
  isPrincipalBrokerRole,
  professionalTitle,
  type LicenseClass,
} from './professional-title';

/**
 * The only values `Agent.license_type` may ever hold.
 *
 * Re-exported from professional-title.ts so there is exactly one definition.
 */
export const LICENSE_TYPES = LICENSE_CLASSES;
export type LicenseType = LicenseClass;

/**
 * What a human picks in the UI. Never stored.
 *
 * These ARE the regulated designations — the select shows the same string the
 * public is shown, so a §175.25 wording correction is a one-line edit in
 * PROFESSIONAL_DESIGNATIONS and nothing here needs touching.
 */
export const DESIGNATIONS = {
  SALESPERSON: PROFESSIONAL_DESIGNATIONS.salesperson,
  ASSOCIATE_BROKER: PROFESSIONAL_DESIGNATIONS.associate_broker,
  PRINCIPAL_BROKER: PROFESSIONAL_DESIGNATIONS.broker,
} as const;
export type Designation = (typeof DESIGNATIONS)[keyof typeof DESIGNATIONS];

export interface ResolvedDesignation {
  license_type: LicenseType;
  title: string;
  /**
   * A ROSTER-FORM RULE, not a licence fact and not a permission.
   *
   * True only for the principal-broker designation. It records that the Add
   * Agent path must not offer that option: the principal broker of the
   * brokerage is not created through the roster form, and the server refuses
   * `role: "BROKER"` there as well.
   *
   * It is NEVER read to derive a title or a licence class.
   */
  requiresBrokerRole: boolean;
}

/** designation → the axes actually stored. */
export const DESIGNATION_MAP: Record<Designation, ResolvedDesignation> = {
  [DESIGNATIONS.SALESPERSON]: {
    license_type: 'salesperson',
    title: DESIGNATIONS.SALESPERSON,
    requiresBrokerRole: false,
  },
  [DESIGNATIONS.ASSOCIATE_BROKER]: {
    license_type: 'associate_broker',
    title: DESIGNATIONS.ASSOCIATE_BROKER,
    requiresBrokerRole: false,
  },
  [DESIGNATIONS.PRINCIPAL_BROKER]: {
    license_type: 'broker',
    title: DESIGNATIONS.PRINCIPAL_BROKER,
    requiresBrokerRole: true,
  },
};

/**
 * Resolve a human designation string to the axes stored.
 *
 * Tolerant of the retired word order and the older display strings, because
 * this is also what produces the "you sent a designation, send this instead"
 * error message at the write boundary.
 */
export function resolveDesignation(d: string | null | undefined): ResolvedDesignation | null {
  if (!d) return null;
  const cls = normaliseLicenseType(d);
  if (!cls) return null;
  return DESIGNATION_MAP[titleForLicenseClass(cls) as Designation] ?? null;
}

/**
 * STORED axes → the designation to preselect when reopening a record.
 *
 * Reads the LICENCE CLASS. It does NOT read `role` — what someone IS in the
 * firm cannot tell you which licence the State issued them, and the earlier
 * version that used it is precisely what this correction removes.
 *
 * The second argument is the row's STORED TITLE, used only for the legacy
 * ambiguity guard described in professional-title.ts: a bare legacy "broker"
 * row whose title already states the associate designation preselects Associate
 * Broker, so re-saving the record cannot ESCALATE her to principal broker.
 */
export function designationFromStored(
  licenseType: string | null | undefined,
  storedTitle?: string | null,
): Designation | '' {
  const lt = (licenseType ?? '').trim().toLowerCase();
  if (lt === 'salesperson') return DESIGNATIONS.SALESPERSON;
  if (lt === 'associate_broker') return DESIGNATIONS.ASSOCIATE_BROKER;
  if (lt === 'broker') {
    return normaliseLicenseType(storedTitle) === 'associate_broker'
      ? DESIGNATIONS.ASSOCIATE_BROKER
      : DESIGNATIONS.PRINCIPAL_BROKER;
  }
  // Unknown, never set, or a legacy display string: force an explicit choice
  // rather than guessing. Re-picking is how a legacy row gets corrected.
  return '';
}

/** True when the value is one the column may actually hold. */
export function isCanonicalLicenseType(v: unknown): v is LicenseType {
  return typeof v === 'string' && (LICENSE_TYPES as readonly string[]).includes(v);
}

/**
 * THE SERVER BOUNDARY INVARIANT.
 *
 * Both CREATE and PATCH run every inbound `license_type` through this. A stale
 * browser, a malformed request, a future UI regression or a direct API caller
 * must not be able to put a designation display string — or any other text —
 * into the column. Returns an error message, or null when acceptable.
 *
 * READ TOLERANCE IS NOT WRITE TOLERANCE. Legacy and free-text values are
 * interpreted on read for transition; they are REFUSED here, never silently
 * normalised on the way in. Silent inbound normalisation would make the column
 * a moving target and would let a caller keep writing values the canonical
 * contract does not contain.
 */
export function rejectNonCanonicalLicenseType(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null; // optional field
  if (isCanonicalLicenseType(v)) return null;
  const asDesignation = resolveDesignation(typeof v === 'string' ? v : null);
  if (asDesignation) {
    return `license_type must be one of ${LICENSE_TYPES.join(' | ')}. `
      + `"${String(v)}" is a designation, not a licence class — send `
      + `license_type "${asDesignation.license_type}" with title "${asDesignation.title}".`;
  }
  return `license_type must be one of ${LICENSE_TYPES.join(' | ')}, received "${String(v)}".`;
}

/**
 * THE REGULATED PROFESSIONAL DESIGNATION, derived — never accepted from a client.
 *
 * `Agent.title` is what Mallan advertises a licensee as, and NY DOS 19 NYCRR
 * §175.25 makes it a statement about their licence. It is therefore a FUNCTION
 * of the LICENCE CLASS alone:
 *
 *   salesperson       -> Licensed Real Estate Salesperson
 *   associate_broker  -> Licensed Associate Real Estate Broker
 *   broker            -> Licensed Real Estate Broker
 *
 * There is deliberately NO role parameter. Passing one is now a compile error,
 * which is the point: a designation may not be manufactured from authorisation.
 *
 * Returns null when the licence class is unknown, so callers leave the stored
 * title alone rather than inventing one.
 */
export function canonicalTitleFor(licenseType: string | null | undefined): string | null {
  // ONE authority. professionalTitle() owns the rule; this only adapts the
  // signature and reports "unknown" as null so writers leave the column alone.
  return professionalTitle({ license_type: licenseType }) || null;
}

/**
 * A salesperson licence with principal-broker AUTHORISATION is incoherent: the
 * principal broker of a NY brokerage holds a broker licence. Reported rather
 * than silently normalised, because it means one of the two facts is wrong.
 *
 * NOTE — this is the ONE remaining place where a licence class and a brokerage
 * role are compared. It is a coherence CHECK, not a derivation: it never turns
 * one into the other, and it grants nothing. Principal-broker AUTHORISATION is
 * decided about a session, not read from here.
 */
export function rejectIncoherentLicenceRole(
  licenseType: string | null | undefined,
  role: string | null | undefined,
): string | null {
  const lt = (licenseType ?? '').trim().toLowerCase();
  if (lt === 'salesperson' && isPrincipalBrokerRole(role)) {
    return 'A salesperson licence cannot hold the BROKER authorisation role.';
  }
  return null;
}

/**
 * MemberMlsId is provider identity evidence, matched elsewhere against Cotality
 * ListAgentMlsId. Metadata proves the field exists; it does NOT prove a typed
 * value belongs to a given agent, and no resolver against the live Member
 * resource exists yet.
 *
 * So a non-null client write is refused and the column stays NULL. A DOS state
 * licence number is a different fact and may never be substituted.
 */
export function rejectUnverifiedMemberMlsId(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  return 'trestle_mls_id cannot be set from client input. A Cotality MemberMlsId '
    + 'must be resolved and verified against the live Member resource before it is '
    + 'stored; it is not a typed field, and a DOS licence number is a different fact.';
}
