/**
 * Licence designation — the ONE canonical mapping, server-side and enforced.
 *
 * @module lib/agents/license-designation
 *
 * Three independent axes, never derived from one another:
 *
 *   license_type   the NY licence class the database stores. EXACTLY
 *                  "broker" | "salesperson". Not free text.
 *   role           the CRM AUTHORISATION grant, "BROKER" | "AGENT". The
 *                  principal broker alone holds BROKER; an Associate Broker
 *                  holds a broker licence and role AGENT.
 *   title          the professional designation advertised publicly, owned by
 *                  ./professional-title.ts.
 *
 * A designation is what a human picks in the UI. It resolves INTO the axes
 * above; it is never itself stored. The Add Agent form used to post the
 * designation display string straight into `license_type`, which is how an
 * Associate Broker came to be stored as license_type "Licensed Associate
 * Broker".
 *
 * ── Why the reverse resolver does not read the title ──────────────────────
 * An earlier fix distinguished a principal Broker from an Associate Broker by
 * looking for "associate" in the title. That is unstable: the title field is
 * broker-editable, so an Associate Broker titled "Senior Broker" would reopen
 * as a principal Broker. `role` is the stable discriminator and is already the
 * architecture's answer — BROKER identifies the principal broker.
 */
import {
  PRINCIPAL_BROKER_TITLE,
  ASSOCIATE_BROKER_TITLE,
  SALESPERSON_TITLE,
  isPrincipalBrokerRole,
} from './professional-title';

/** The only values `Agent.license_type` may ever hold. */
export const LICENSE_TYPES = ['broker', 'salesperson'] as const;
export type LicenseType = (typeof LICENSE_TYPES)[number];

/** What a human picks in the UI. Never stored. */
export const DESIGNATIONS = {
  SALESPERSON: 'Licensed Real Estate Salesperson',
  ASSOCIATE_BROKER: 'Licensed Associate Broker',
  PRINCIPAL_BROKER: 'Licensed Broker',
} as const;
export type Designation = (typeof DESIGNATIONS)[keyof typeof DESIGNATIONS];

export interface ResolvedDesignation {
  license_type: LicenseType;
  title: string;
  /** True only for the principal broker designation. */
  requiresBrokerRole: boolean;
}

/** designation → the axes actually stored. */
export const DESIGNATION_MAP: Record<Designation, ResolvedDesignation> = {
  [DESIGNATIONS.SALESPERSON]: {
    license_type: 'salesperson',
    title: SALESPERSON_TITLE,
    requiresBrokerRole: false,
  },
  [DESIGNATIONS.ASSOCIATE_BROKER]: {
    license_type: 'broker',
    title: ASSOCIATE_BROKER_TITLE,
    requiresBrokerRole: false,
  },
  [DESIGNATIONS.PRINCIPAL_BROKER]: {
    license_type: 'broker',
    title: PRINCIPAL_BROKER_TITLE,
    requiresBrokerRole: true,
  },
};

export function resolveDesignation(d: string | null | undefined): ResolvedDesignation | null {
  if (!d) return null;
  return DESIGNATION_MAP[d.trim() as Designation] ?? null;
}

/**
 * STORED axes → the designation to preselect when reopening a record.
 *
 * Reads `license_type` and `role` only. The title is deliberately NOT consulted
 * — it is broker-editable and cannot carry a licence class.
 */
export function designationFromStored(
  licenseType: string | null | undefined,
  role: string | null | undefined,
): Designation | '' {
  const lt = (licenseType ?? '').trim().toLowerCase();
  if (lt === 'broker') {
    return isPrincipalBrokerRole(role) ? DESIGNATIONS.PRINCIPAL_BROKER : DESIGNATIONS.ASSOCIATE_BROKER;
  }
  if (lt === 'salesperson') return DESIGNATIONS.SALESPERSON;
  return ''; // unknown or never set — force an explicit choice, never guess
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
