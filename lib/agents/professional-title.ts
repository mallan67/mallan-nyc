/**
 * Pure helpers for an agent's PROFESSIONAL TITLE — the designation the public
 * and outside correspondents are told. No React / next / prisma dependencies
 * so they are trivially testable (same convention as ./avatar.ts).
 *
 * @module lib/agents/professional-title
 *
 * ── Three facts, not one ──────────────────────────────────────────────────
 *
 *   LICENCE CLASS   `Agent.license_type` — what the State licensed them as.
 *                   "salesperson" | "associate_broker" | "broker".
 *   BROKERAGE ROLE  what the person IS in the firm.
 *   AUTHORISATION   what the software permits them to do.
 *
 * This module owns the mapping from LICENCE CLASS to advertised designation and
 * nothing else. It NEVER reads `Agent.role`.
 *
 * ── The correction this file carries ──────────────────────────────────────
 * An earlier design stored only "broker" | "salesperson" and INFERRED
 * Associate Broker from `broker` + role `AGENT`. That used a Mallan software
 * AUTHORISATION grant to manufacture a NY licence class. `broker + AGENT` no
 * longer means Associate Broker. The licence class carries the fact itself.
 *
 * ── KNOWN OPEN BOUNDARY (reported, not silently worked around) ────────────
 * `Agent.role` is still "BROKER" | "AGENT" and is still the application's ONLY
 * authorisation fact — it is copied verbatim into `Session.role` and read by
 * every access gate in the CRM. Separating BROKERAGE ROLE from AUTHORISATION
 * therefore requires schema growth, which is out of scope and is reported
 * rather than attempted. What IS done here: the professional-identity path no
 * longer reads `role` at all, so the conflation is gone in this direction.
 *
 * ── WHOSE FACT THIS IS, TODAY ─────────────────────────────────────────────
 * Three evidence layers, kept strictly separate. A population finding is NOT a
 * contract finding, and a filterability refusal is neither.
 *
 *   RAW CONTRACT
 *     Cotality's `Member.MemberType` SUPPORTS `AssociateBroker` and the other
 *     broker/salesperson classes. `MemberStateLicenseType` exists as a nullable
 *     String(100). `MemberDesignation` is MULTI-valued, which is the tell that
 *     it carries CREDENTIALS (GRI, CIPS) rather than a licence class.
 *     THE PROVIDER SUPPORTS ASSOCIATE BROKER. Nothing here says otherwise.
 *
 *   OBSERVED POPULATION
 *     `MemberType` is not populated in the 11,184 entitled Member rows —
 *     `MemberType ne null` was SUPPORTED and returned count 0, which is the
 *     decisive query. `MemberStateLicenseType` population remains UNVERIFIED:
 *     the attempted non-null filter was PROVIDER_REJECTED.
 *
 *   VERIFIED MALLAN MAPPING
 *     Cotality cannot CURRENTLY be used as the authoritative source for
 *     Mallan's professional licence class. Mallan retains the verified
 *     professional identity until a provider field is demonstrated populated
 *     AND semantically reliable.
 *
 * This is a statement about EVIDENCE SUFFICIENCY, not a permanent architectural
 * fact — do not write "Cotality is not the authority". If the provider begins
 * populating `MemberType` or `MemberStateLicenseType`, it is evaluated through
 * the normal verified-mapping boundary. Enum values are never typed from
 * memory: pull them from the live contract/metadata, then probe with those
 * exact values.
 */

/**
 * The ONLY values `Agent.license_type` may be WRITTEN with.
 *
 * Three classes, because NY issues three, and collapsing two of them into one
 * column value is what forced the role-based inference in the first place.
 */
export const LICENSE_CLASSES = ['salesperson', 'associate_broker', 'broker'] as const;
export type LicenseClass = (typeof LICENSE_CLASSES)[number];

/**
 * ★ THE ONE PLACE THE ADVERTISED DESIGNATION STRINGS LIVE ★
 *
 * Every regulated designation Mallan publishes for a licensee resolves from
 * this object. Correcting a designation is a ONE-LINE edit here — these
 * literals are written nowhere else in TypeScript.
 *
 * ── Wording authority: NY DOS, 19 NYCRR §175.25 ───────────────────────────
 * The regulation names the three licence classes "real estate broker",
 * "associate real estate broker" and "real estate salesperson" — "associate"
 * modifies "real estate broker", so the construction is
 * "Licensed ASSOCIATE REAL ESTATE Broker", not the reverse order this repo
 * previously used. §175.25 also requires an advertisement to correctly and
 * accurately state the type of licence held, and (c)(4) expressly PROHIBITS the
 * titles "sales associate", "licensed sales agent" and bare "broker" — so none
 * of these values may be shortened anywhere.
 *
 * DOS has further clarified that licensed associate real estate brokers and
 * salespersons may not use CORPORATE titles (VP, Director, Partner …), because
 * doing so is misleading advertising. `Agent.title` is a stored column, so the
 * DERIVED designation — not that editable text — stays the authority on every
 * advertising surface. See professionalTitle() below.
 *
 * ONE unavoidable mirror exists: `public/crm/js/dashboard/panels.js` cannot
 * import TypeScript, so it duplicates these strings. A runtime test asserts the
 * mirror matches this table exactly, so drift is a test failure, not a silent
 * divergence. Change both together.
 */
export const PROFESSIONAL_DESIGNATIONS: Record<LicenseClass, string> = {
  salesperson: 'Licensed Real Estate Salesperson',
  associate_broker: 'Licensed Associate Real Estate Broker',
  broker: 'Licensed Real Estate Broker',
};

/** Named aliases onto PROFESSIONAL_DESIGNATIONS. No independent literals. */
export const SALESPERSON_TITLE = PROFESSIONAL_DESIGNATIONS.salesperson;
export const ASSOCIATE_BROKER_TITLE = PROFESSIONAL_DESIGNATIONS.associate_broker;
export const PRINCIPAL_BROKER_TITLE = PROFESSIONAL_DESIGNATIONS.broker;

/** The regulated designation for a licence class. A total function. No role. */
export function titleForLicenseClass(licenceClass: LicenseClass): string {
  return PROFESSIONAL_DESIGNATIONS[licenceClass];
}

/**
 * LEGACY TOLERANCE: designation display strings found in `license_type`, in
 * BOTH statutory word orders.
 *
 * The broken Add Agent path posted the select's display string straight into
 * `license_type`. Real rows exist carrying "Licensed Associate Broker" and
 * friends, and rows written before the §175.25 wording correction carry
 * "Licensed Real Estate Associate Broker".
 *
 * Every key here STATES a licence class explicitly, so reading one is EVIDENCE
 * about the licence — not an inference. That is why the associate strings
 * resolve to `associate_broker` instead of being flattened into `broker`.
 *
 * Accepting the retired word order is TRANSITION TOLERANCE ON READ. Only the
 * canonical PROFESSIONAL_DESIGNATIONS form is ever emitted or written, and the
 * write boundary (rejectNonCanonicalLicenseType) refuses every value here.
 */
const LEGACY_LICENSE_TYPE_VALUES: Record<string, LicenseClass> = {
  'real estate salesperson': 'salesperson',
  'licensed real estate salesperson': 'salesperson',
  'associate broker': 'associate_broker',
  'associate real estate broker': 'associate_broker',
  'licensed associate broker': 'associate_broker',
  // canonical §175.25 word order
  'licensed associate real estate broker': 'associate_broker',
  // retired word order — read-only tolerance for rows already stored
  'licensed real estate associate broker': 'associate_broker',
  'real estate broker': 'broker',
  'licensed broker': 'broker',
  'licensed real estate broker': 'broker',
};

/**
 * Normalise a stored `license_type` to its canonical class, tolerating the
 * legacy designation strings above. Returns '' when it is neither.
 *
 * A BARE legacy "broker" normalises to `broker` and NOTHING ELSE. It is NOT
 * converted to `associate_broker` because the row happens to carry role
 * "AGENT": that would re-derive a licence class from an authorisation grant —
 * exactly the defect this module was corrected to remove — and would do it
 * silently across every legacy row at once. A pre-existing bare "broker" row is
 * ambiguous historical data and must be reconciled per record from
 * authoritative licence evidence, never swept by a rule.
 */
export function normaliseLicenseType(v: string | null | undefined): LicenseClass | '' {
  const raw = (v ?? '').trim().toLowerCase();
  if ((LICENSE_CLASSES as readonly string[]).includes(raw)) return raw as LicenseClass;
  return LEGACY_LICENSE_TYPE_VALUES[raw] ?? '';
}

export interface ProfessionalTitleSource {
  /** Stored title — consulted only as described in professionalTitle(). */
  title?: string | null;
  /** NY licence class: "salesperson" | "associate_broker" | "broker". */
  license_type?: string | null;
  /**
   * Mallan AUTHORISATION grant: "BROKER" | "AGENT".
   *
   * ACCEPTED ONLY so callers can pass a whole Agent row without stripping
   * fields. It is NEVER read to produce a designation. Authorisation is not a
   * licence class and cannot manufacture one.
   */
  role?: string | null;
}

/**
 * True only for the principal-broker AUTHORISATION grant.
 *
 * An AUTHORISATION predicate. Deliberately NOT used by professionalTitle() or
 * by any designation derivation — see the module note.
 */
export function isPrincipalBrokerRole(role: string | null | undefined): boolean {
  return (role ?? '').trim().toUpperCase() === 'BROKER';
}

/**
 * Resolve the title to advertise for an agent.
 *
 * DERIVED FROM THE LICENCE CLASS ALONE:
 *
 *   salesperson       -> Licensed Real Estate Salesperson
 *   associate_broker  -> Licensed Associate Real Estate Broker
 *   broker            -> Licensed Real Estate Broker
 *
 * The stored `title` column does NOT win for a resolved class. That is a
 * §175.25 requirement, not a preference: `title` is editable, and DOS treats a
 * corporate-style title on a licensee ("VP", "Director") — or a shortened one
 * ("broker", "sales associate") — as misleading advertising. The derived
 * designation is the authority on every advertising surface; the stored column
 * is consulted only where noted below.
 *
 * ── LEGACY AMBIGUITY GUARD, and its exact limits ──────────────────────────
 * Under the retired two-class design an Associate Broker was stored as
 * "broker". Those rows still exist and this change is not permitted to mutate
 * Production, so a stored bare "broker" may be a principal broker OR a
 * mis-stored associate.
 *
 * The CLASS still resolves to `broker` regardless — see normaliseLicenseType.
 * But before publishing the PRINCIPAL designation for such a row, one narrow
 * check is made: if the row's own stored `title` already STATES the associate
 * designation (in either word order), that explicit statement stands and the
 * row is not ESCALATED. That reads a designation string, which is evidence
 * about the licence. It never reads `role`, which is not.
 *
 * RESIDUAL RISK, stated rather than hidden: a legacy "broker" row belonging to
 * a real Associate Broker whose stored title is blank or free-form WILL be
 * published as a principal Broker until its `license_type` is corrected to
 * `associate_broker`. That is a §175.25 exposure. The remedy is an explicit
 * per-record data correction from authoritative licence evidence — not a rule
 * that infers the class from whatever the application happens to know.
 *
 * Returns '' when nothing is resolvable — callers omit the line rather than
 * assert a designation nobody can stand behind.
 */
export function professionalTitle(agent: ProfessionalTitleSource | null | undefined): string {
  if (!agent) return '';

  const licence = normaliseLicenseType(agent.license_type);

  // 1. Unambiguous classes derive directly. Nothing overrides them.
  if (licence === 'salesperson' || licence === 'associate_broker') {
    return titleForLicenseClass(licence);
  }

  // 2. `broker` — see the LEGACY AMBIGUITY GUARD note above.
  if (licence === 'broker') {
    if (normaliseLicenseType(agent.title) === 'associate_broker') return ASSOCIATE_BROKER_TITLE;
    return PRINCIPAL_BROKER_TITLE;
  }

  // 3. Licence unknown — fall back to whatever was stored, so a legacy record
  //    is not silently blanked. A stored value that resolves to a designation
  //    is re-emitted in its CANONICAL form, so the retired word order is never
  //    republished.
  const storedClass = normaliseLicenseType(agent.title);
  if (storedClass) return titleForLicenseClass(storedClass);
  const stored = (agent.title ?? '').trim();
  if (stored) return stored;

  // 4. Nothing resolvable — assert nothing.
  return '';
}
