/**
 * lib/scanner/contact/types.ts
 *
 * Verifiable-contact record. Every field carries provenance:
 *   - WHERE it came from (source name + URL)
 *   - WHEN that source was captured
 *   - WHETHER it has been independently verified, and HOW
 *   - A confidence label derived from the above
 *
 * Why this matters: cold-outreach to property owners is a regulatory
 * minefield (NY DOS 175.17, TCPA, Fair Housing). When a prospect
 * surfaces, the agent must be able to look at the record and answer:
 *   - "Where did you get this phone number?"
 *   - "When was that?"
 *   - "Did you verify it's still active?"
 * Without provenance, the answer is "I don't know" — which is the wrong
 * answer in any compliance audit.
 *
 * Per-field provenance also enables cross-source confidence: a phone
 * that appears in PLUTO (mailing-of-record) AND HPD (building registration)
 * AND DOS Corp (LLC manager filing) is high-confidence even without an
 * active verification call.
 */

/** Sources we currently support, plus a reserved list for future ingests. */
export type ContactSource =
  | "pluto_mailing"          // PLUTO OwnerName + mailing address (tax-bill-of-record)
  | "acris_party"            // ACRIS Party row from a recorded document
  | "hpd_registration"       // HPD Building Registration (multi-fam ≥3 units)
  | "dos_corporation"        // NY Department of State Corporation database
  | "dob_application"        // DOB permit application contact
  | "surrogate_court"        // Surrogate's Court estate filing (executor + attorney)
  | "manual_agent_note"      // Maya / agent typed it in by hand
  | "broker_referral"        // another broker shared it under written authorization
  | "verified_via_response"  // contact responded to a Mallan outreach (highest confidence)
  | "third_party_skip_trace"; // paid skip-trace service (TLOxp / IDI / etc.)

export type ContactFieldKind = "name" | "phone" | "email" | "address" | "owner_entity";

export type VerificationMethod =
  | "none"
  | "usps_address_validation"
  | "twilio_lookup_carrier"
  | "smtp_email_validation"
  | "neverbounce"
  | "owner_response"          // they replied or picked up
  | "cross_source_agreement"; // ≥2 independent sources match

export type Confidence = "high" | "medium" | "low" | "unverified";

/** A single piece of contact info with full provenance. */
export interface ContactField {
  kind: ContactFieldKind;
  value: string;
  /** Normalized form for comparison (lower-case for email, digits-only for phone, etc.) */
  normalized: string;
  source: ContactSource;
  /** Optional URL where this can be re-verified (e.g., the ACRIS document permalink). */
  source_url?: string;
  /** When the source was captured (ISO-8601). */
  source_captured_at: string;
  /** When the underlying record was created in the source system (e.g., ACRIS recorded_datetime). */
  source_record_date?: string;
  verified: boolean;
  verification_method: VerificationMethod;
  verification_at?: string;
  confidence: Confidence;
  /** Optional notes (e.g., "address has APT 12A but PLUTO had APT 12B"). */
  notes?: string;
}

/** A scanner prospect's full contact record — typically multiple fields per kind. */
export interface ContactRecord {
  /** The BBL this contact relates to. May be null if the contact came from a non-BBL source. */
  bbl: string | null;
  /** Owner-of-record name (may be an LLC / Trust / Estate / individual). */
  owner_entity: ContactField | null;
  /** Possibly-multiple names (managing member, executor, individual behind LLC, etc.). */
  names: ContactField[];
  phones: ContactField[];
  emails: ContactField[];
  addresses: ContactField[];
  /** Top-line confidence — derived from per-field max + cross-source agreement. */
  overall_confidence: Confidence;
  /** Number of independent sources that contributed any field. */
  source_count: number;
  /** Sources contributing to this record. */
  sources: ContactSource[];
  /** Timestamp this record was last aggregated. */
  aggregated_at: string;
}

/** Inputs a source adapter produces. Can be merged into a ContactRecord. */
export interface SourceContactRow {
  bbl?: string | null;
  owner_entity?: string | null;
  names?: string[];
  phones?: string[];
  emails?: string[];
  addresses?: string[];
  source: ContactSource;
  source_url?: string;
  source_captured_at?: string;
  source_record_date?: string;
}
