/**
 * Evidence rules: what a finding must carry before it can be ranked, and what it may not claim.
 *
 * Every rule below is a refusal, not a score. A finding that fails is reported with its reasons by
 * report.ts; it is never ranked and never dropped silently.
 *
 *  - A citation (https URL) and the date the source shows are mandatory.
 *  - An expansion signal or an acquisition record may not be described as buying.
 *  - An anonymous searcher stays anonymous: no name, no contact.
 *  - A person is reachable only through the approved CRM channel; a scraped public contact is for an
 *    organization or a cooperating broker only. Nothing here imports a third-party contact.
 *  - Residential audience criteria come from a short allow-list. A protected characteristic, or a
 *    stand-in for one, is not on it. Every free-text field is also scanned with the repo's own Fair
 *    Housing scanner (lib/compliance/rls-enforcement), so this module keeps no list of its own.
 */
import { scanRecordForFairHousing } from '@/lib/compliance/rls-enforcement';
import {
  CONTACT_CHANNELS,
  IDENTITIES,
  OPPORTUNITY_KINDS,
  PLACEMENT_STATUSES,
  VERIFICATION_STATUSES,
  type ValidationIssue,
} from './types';

/** Audience criteria a residential finding may carry. Anything else is refused, not ignored. */
export const ALLOWED_CRITERIA_KEYS = [
  'price_min',
  'price_max',
  'bedrooms',
  'property_type',
  'neighborhood',
  'building_type',
  'financing_type',
  'purchase_purpose',
] as const;

// "X is buying", "plans to purchase", "will acquire": a statement of intent. Only a stated requirement in
// the cited source supports one, so any other kind of finding may not say it. Deliberately narrow.
const PURCHASE_OVERCLAIM =
  /\b(?:is|are|was|were|will\s+be|plans?\s+to|intends?\s+to|looking\s+to|about\s+to)\s+(?:buy|buying|purchase|purchasing|acquire|acquiring)\b|\bwill\s+(?:buy|purchase|acquire)\b/i;

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const includes = (list: readonly string[], v: unknown) => typeof v === 'string' && list.includes(v);

/** A real calendar date in YYYY-MM-DD form. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Validate one raw finding. Returns every problem found, empty when the finding may be ranked.
 * `now` is the reference for "not in the future".
 */
export function validateOpportunity(input: unknown, now: Date = new Date()): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return [{ code: 'not_an_object', message: 'A finding must be an object.' }];
  }
  const o = input as Record<string, unknown>;

  if (!isNonEmptyString(o.id)) add('missing_id', 'A finding needs an id.');
  if (!isNonEmptyString(o.property_key)) add('missing_property_key', 'A finding must name the property it is filed against.');
  if (!includes(OPPORTUNITY_KINDS, o.kind)) add('invalid_kind', `kind must be one of ${OPPORTUNITY_KINDS.join(', ')}.`);
  if (!includes(IDENTITIES, o.identity)) add('invalid_identity', `identity must be one of ${IDENTITIES.join(', ')}.`);
  if (!includes(VERIFICATION_STATUSES, o.verification)) {
    add('invalid_verification', `verification must be one of ${VERIFICATION_STATUSES.join(', ')}.`);
  }

  // Citation and date: no finding without them.
  if (!isNonEmptyString(o.source_url)) add('missing_source_url', 'A finding needs the source URL that supports it.');
  else if (!isHttpsUrl(o.source_url)) add('invalid_source_url', 'source_url must be a valid https URL.');

  if (!isNonEmptyString(o.evidence_date)) add('missing_evidence_date', 'A finding needs the date its source shows.');
  else if (!isCalendarDate(o.evidence_date)) add('invalid_evidence_date', 'evidence_date must be a real date in YYYY-MM-DD form.');
  else if (o.evidence_date > now.toISOString().slice(0, 10)) add('future_evidence_date', 'evidence_date is in the future.');

  if (!isNonEmptyString(o.why_matches)) add('missing_why_matches', 'A finding must say why it matches the property.');
  if (!isNonEmptyString(o.next_action)) add('missing_next_action', 'A finding needs a recommended next action.');
  if (!Array.isArray(o.unknowns)) add('unknowns_not_listed', 'unknowns must be listed (an empty list is allowed).');
  if (!Array.isArray(o.signals)) add('signals_not_listed', 'signals must be listed.');

  const signals = Array.isArray(o.signals) ? o.signals.map(String) : [];
  const unknowns = Array.isArray(o.unknowns) ? o.unknowns.map(String) : [];

  // Never claim more than the source shows.
  if (includes(OPPORTUNITY_KINDS, o.kind) && o.kind !== 'stated_requirement') {
    const text = [o.why_matches, ...signals].filter((v): v is string => typeof v === 'string').join(' | ');
    if (PURCHASE_OVERCLAIM.test(text)) {
      add('purchase_overclaim', 'Only a stated requirement in the cited source may be described as an intent to buy.');
    }
  }

  // Identity and contact.
  const contact = o.contact as { channel?: unknown; value?: unknown } | undefined;
  const channel = contact?.channel;
  const contactValue = isNonEmptyString(contact?.value) ? (contact?.value as string) : '';
  if (!includes(CONTACT_CHANNELS, channel)) add('invalid_contact_channel', `contact.channel must be one of ${CONTACT_CHANNELS.join(', ')}.`);
  if (channel === 'none' && contactValue) add('contact_value_without_channel', 'A contact value needs a contact channel.');

  if (o.identity === 'anonymous_aggregate') {
    if (isNonEmptyString(o.name) || (channel !== undefined && channel !== 'none') || contactValue) {
      add('anonymous_has_identity', 'An anonymous aggregate carries no name and no contact.');
    }
  } else if (includes(IDENTITIES, o.identity) && !isNonEmptyString(o.name)) {
    add('named_prospect_needs_name', 'An identified prospect needs a name.');
  }
  if (o.identity === 'individual_via_crm' && channel !== 'approved_crm') {
    add('person_contact_not_authorized', 'An individual is reachable only through the approved CRM channel.');
  }

  // Channels and placements.
  if (o.kind === 'distribution_channel') {
    if (o.placement_status === undefined || o.placement_status === null) {
      add('placement_status_required', 'A distribution channel needs a placement status: possible, application_prepared or verified_live.');
    } else if (!includes(PLACEMENT_STATUSES, o.placement_status)) {
      add('invalid_placement_status', `placement_status must be one of ${PLACEMENT_STATUSES.join(', ')}.`);
    }
  } else if (o.placement_status !== undefined && o.placement_status !== null) {
    add('placement_on_non_channel', 'Only a distribution channel has a placement status.');
  }

  // Residential audience criteria and Fair Housing.
  const textFields: Record<string, string> = {
    why_matches: typeof o.why_matches === 'string' ? o.why_matches : '',
    signals: signals.join(' | '),
    unknowns: unknowns.join(' | '),
    next_action: typeof o.next_action === 'string' ? o.next_action : '',
  };
  if (o.criteria !== undefined && o.criteria !== null) {
    if (typeof o.criteria !== 'object' || Array.isArray(o.criteria)) {
      add('criterion_not_allowed', 'criteria must be an object of allowed keys.');
    } else {
      for (const [key, value] of Object.entries(o.criteria as Record<string, unknown>)) {
        if (!(ALLOWED_CRITERIA_KEYS as readonly string[]).includes(key)) {
          add('criterion_not_allowed', `"${key}" is not an allowed audience criterion (${ALLOWED_CRITERIA_KEYS.join(', ')}).`);
        } else {
          textFields[`criteria.${key}`] = String(value);
        }
      }
    }
  }
  const fh = scanRecordForFairHousing(textFields);
  if (fh.length > 0) {
    const fields = [...new Set(fh.map((v) => v.field))].join(', ');
    add('fair_housing_text', `The Fair Housing scanner flagged ${fields}. Revise the wording; matching never uses a protected characteristic.`);
  }

  if (o.is_sample !== undefined && typeof o.is_sample !== 'boolean') add('invalid_sample_flag', 'is_sample must be true or false.');

  return issues;
}
