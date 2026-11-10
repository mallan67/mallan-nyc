/**
 * Buyer-acquisition engine: shared types and the closed lists.
 *
 * This module family holds the EVIDENCE RULES for a buyer-acquisition pilot. It is pure: no
 * database, no network, no email. It sends nothing, imports no contacts and changes no listing.
 * An opportunity exists only with a citation and an evidence date (evidence.ts); a report says
 * what is unverified (report.ts); exposure, visits, inquiries, offers and contracts are kept as
 * separate numbers (performance.ts).
 */
import type { CampaignGateInput } from '@/lib/compliance/campaign-distribution-gate';
import type { TruthLevel } from '@/lib/seller-report/build-report';

export type { CampaignGateInput, TruthLevel };

/**
 * What a finding is, in the order of how much it shows about wanting to buy:
 *   stated_requirement   a buyer, cooperating broker or organization stated a purchase requirement in the cited source
 *   acquisition_activity a documented property purchase or lease record; it is history, not a stated requirement
 *   expansion_signal     growth or relocation news; it says nothing about buying
 *   distribution_channel a place the listing could appear; it is not a buyer
 */
export const OPPORTUNITY_KINDS = ['stated_requirement', 'acquisition_activity', 'expansion_signal', 'distribution_channel'] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export const VERIFICATION_STATUSES = ['verified', 'partially_verified', 'unverified', 'conflicting'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const IDENTITIES = ['organization', 'cooperating_broker', 'individual_via_crm', 'anonymous_aggregate'] as const;
export type OpportunityIdentity = (typeof IDENTITIES)[number];

export const CONTACT_CHANNELS = ['public_business_contact', 'approved_crm', 'none'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const PLACEMENT_STATUSES = ['possible', 'application_prepared', 'verified_live'] as const;
export type PlacementStatus = (typeof PLACEMENT_STATUSES)[number];

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export interface OpportunityContact {
  channel: ContactChannel;
  value?: string | null;
}

export interface AcquisitionOpportunity {
  id: string;
  /** The property this finding is filed against (PropertyReportInput.property.key). */
  property_key: string;
  kind: OpportunityKind;
  identity: OpportunityIdentity;
  /** Organization or broker name. Null only for an anonymous aggregate. */
  name: string | null;
  /** The page that supports the finding. https only. */
  source_url: string;
  /** The date the source states or shows it (YYYY-MM-DD), not the date someone looked. */
  evidence_date: string;
  why_matches: string;
  /** Requirements or activity signals, as the source states them. */
  signals: string[];
  /** What the source leaves unknown or states in conflict. May be empty. */
  unknowns: string[];
  contact: OpportunityContact;
  verification: VerificationStatus;
  next_action: string;
  /** Residential audience criteria. Only the keys in ALLOWED_CRITERIA_KEYS are accepted. */
  criteria?: Record<string, string | number | boolean>;
  /** Channels only: possible, prepared, or verified live. */
  placement_status?: PlacementStatus;
  /** Demonstration rows. Excluded from a report unless the caller asks for samples, and always labelled. */
  is_sample?: boolean;
}

export interface Citation {
  url: string;
  evidence_date: string;
}

export interface MergedOpportunity extends AcquisitionOpportunity {
  citations: Citation[];
}

export interface RankedOpportunity extends MergedOpportunity {
  confidence: ConfidenceLevel;
  evidence_age_days: number;
  confidence_reasons: string[];
}

export interface ValidationIssue {
  code: string;
  message: string;
}

export type PropertyClass = 'commercial_office_condo' | 'residential_condop';

export interface PropertyFact {
  value: string | number | boolean | null;
  status: VerificationStatus;
  /** What the value was read from (a document, a record, a live query). Required for verified. */
  source?: string | null;
  /** The date the source was read (YYYY-MM-DD). Required for verified. */
  as_of?: string | null;
}

export interface PropertyReportInput {
  property: {
    /** Matches AcquisitionOpportunity.property_key. */
    key: string;
    class: PropertyClass;
    /** How the operator names the property. Not a listing identity. */
    label: string;
    /** The listing id from the authoritative record, or null when no such record was supplied. Never invented. */
    listing_id: string | null;
    facts: Record<string, PropertyFact>;
    /** The row's gate columns. Null when they were not read: the gate then fails closed. */
    gate_input: CampaignGateInput | null;
  };
  /** Raw findings; each is validated, none is trusted. */
  opportunities: unknown[];
  include_samples?: boolean;
}

export interface ReportFact {
  key: string;
  value: PropertyFact['value'];
  status: VerificationStatus;
  source: string | null;
  as_of: string | null;
}

export interface PropertyReport {
  property: { key: string; class: PropertyClass; label: string; listing_id: string | null };
  generated_at: string;
  listing_record: { listing_id_supplied: boolean; gap: string | null };
  distribution_gate: { evaluated: boolean; allowed: boolean; blocks: string[] };
  facts: ReportFact[];
  unresolved_facts: string[];
  outward_materials_allowed: boolean;
  outward_blockers: string[];
  buyer_opportunities: RankedOpportunity[];
  channels: RankedOpportunity[];
  rejected: Array<{ id: string | null; issues: ValidationIssue[] }>;
  samples_excluded: number;
  sample_data_present: boolean;
  banner: string | null;
  data_gaps: string[];
  confidence_note: string;
}
