/**
 * Property report: what is known, what is not, and which findings have evidence.
 *
 * The report is the answer to "which organizations, requirements or channels offer the strongest
 * opportunities, and what is the evidence?". It says plainly when the honest answer is "none yet":
 * an empty list, the listing-record gap and the unresolved facts are part of the output.
 *
 *  - The listing id is whatever the caller supplied from an authoritative record, or null. It is never
 *    invented, and the engine cannot tell whether a supplied id is authoritative.
 *  - The distribution gate is the repo's evaluateCampaignDistributionGate, unchanged. With no gate input
 *    it fails closed.
 *  - A fact is verified only with a source and an as-of date; without them it is shown as unverified.
 *  - Outward materials (anything a recipient would see) are allowed only when the gate allows AND every
 *    required fact is verified. This module still sends nothing.
 *  - Sample rows are excluded unless the caller asks for them, and are then labelled on every row.
 */
import { evaluateCampaignDistributionGate } from '@/lib/compliance/campaign-distribution-gate';
import { dedupeOpportunities } from './dedupe';
import { validateOpportunity } from './evidence';
import { rankOpportunities } from './score';
import type {
  AcquisitionOpportunity,
  PropertyClass,
  PropertyFact,
  PropertyReport,
  PropertyReportInput,
  RankedOpportunity,
  ReportFact,
  ValidationIssue,
} from './types';

/**
 * The facts to resolve before anything outward-facing is prepared, taken from Maya's project brief
 * (2026-11-09). This is her checklist, not a REBNY or Cotality field list; whether a value is right is
 * decided against the live provider or the primary document named in each fact's `source`.
 */
export const REQUIRED_FACTS: Record<PropertyClass, readonly string[]> = {
  commercial_office_condo: ['price', 'square_footage', 'build_out', 'permitted_uses', 'building_requirements', 'listing_status', 'commission_terms'],
  residential_condop: [
    'price',
    'maintenance',
    'tenant_lease_status',
    'financing_availability',
    'building_condition',
    'building_safety_information',
    'governing_documents',
    'buyer_approval_requirements',
  ],
};

export const SAMPLE_BANNER = 'SAMPLE DATA — NOT REAL PROSPECTS';

const CONFIDENCE_NOTE =
  'Confidence describes the strength of the cited evidence (kind of finding, verification and age of the source). It is not the likelihood of a sale and not a prediction that anyone will buy.';

const NO_RECORD_GAP =
  'No authoritative listing record was supplied. The listing id is left empty and nothing was invented; resolve the record before any outward material is prepared.';

const KIND_LABELS: Record<AcquisitionOpportunity['kind'], string> = {
  stated_requirement: 'Stated purchase requirement (as the cited source states it)',
  acquisition_activity: 'Documented acquisition activity — not a stated requirement',
  expansion_signal: 'Expansion signal — not a stated purchase requirement',
  distribution_channel: 'Distribution channel — where the listing could appear, not a buyer',
};

const PLACEMENT_LABELS = {
  possible: 'Possible placement — not live',
  application_prepared: 'Application prepared — not submitted, not live',
  verified_live: 'Verified live placement',
} as const;

function buildFacts(cls: PropertyClass, given: Record<string, PropertyFact>, gaps: string[]): ReportFact[] {
  const keys = [...REQUIRED_FACTS[cls], ...Object.keys(given).filter((k) => !REQUIRED_FACTS[cls].includes(k))];
  return keys.map((key): ReportFact => {
    const f = given[key];
    if (!f) return { key, value: null, status: 'unverified', source: null, as_of: null };
    const claimsVerified = f.status === 'verified' || f.status === 'partially_verified';
    if (claimsVerified && (!f.source || !f.as_of)) {
      gaps.push(`${key} was marked ${f.status} without a source and an as-of date; shown as unverified.`);
      return { key, value: f.value, status: 'unverified', source: f.source ?? null, as_of: f.as_of ?? null };
    }
    return { key, value: f.value, status: f.status, source: f.source ?? null, as_of: f.as_of ?? null };
  });
}

export function buildPropertyReport(input: PropertyReportInput, now: Date = new Date()): PropertyReport {
  const { property } = input;
  const data_gaps: string[] = [];

  // Listing record and gate.
  const listing_record = property.listing_id
    ? { listing_id_supplied: true, gap: null }
    : { listing_id_supplied: false, gap: NO_RECORD_GAP };
  if (listing_record.gap) data_gaps.push(listing_record.gap);

  const distribution_gate =
    property.listing_id && property.gate_input
      ? (() => {
          const g = evaluateCampaignDistributionGate(property.gate_input);
          return { evaluated: true, allowed: g.allowed, blocks: g.blocks };
        })()
      : { evaluated: false, allowed: false, blocks: ['gate_not_evaluated'] };

  // Facts.
  const facts = buildFacts(property.class, property.facts, data_gaps);
  const unresolved_facts = REQUIRED_FACTS[property.class].filter((k) => facts.find((f) => f.key === k)?.status !== 'verified');

  const outward_blockers: string[] = [];
  if (!listing_record.listing_id_supplied) outward_blockers.push('No authoritative listing record.');
  if (!distribution_gate.allowed) outward_blockers.push(`Distribution gate: ${distribution_gate.blocks.join(', ')}.`);
  if (unresolved_facts.length > 0) outward_blockers.push(`Required facts not verified: ${unresolved_facts.join(', ')}.`);

  // Findings: exclude samples unless asked, validate, dedupe, rank.
  let samples_excluded = 0;
  const valid: AcquisitionOpportunity[] = [];
  const rejected: PropertyReport['rejected'] = [];
  for (const raw of input.opportunities) {
    const isSample = typeof raw === 'object' && raw !== null && (raw as { is_sample?: unknown }).is_sample === true;
    if (isSample && !input.include_samples) {
      samples_excluded++;
      continue;
    }
    const issues: ValidationIssue[] = validateOpportunity(raw, now);
    const o = raw as Partial<AcquisitionOpportunity>;
    if (typeof o?.property_key === 'string' && o.property_key !== property.key) {
      issues.push({ code: 'wrong_property', message: `Filed against "${o.property_key}", not "${property.key}".` });
    }
    if (issues.length > 0) {
      rejected.push({ id: typeof o?.id === 'string' ? o.id : null, issues });
    } else {
      valid.push(raw as AcquisitionOpportunity);
    }
  }

  const ranked: RankedOpportunity[] = rankOpportunities(dedupeOpportunities(valid), now);
  const buyer_opportunities = ranked.filter((o) => o.kind !== 'distribution_channel');
  const channels = ranked.filter((o) => o.kind === 'distribution_channel');
  const sample_data_present = ranked.some((o) => o.is_sample === true);

  if (buyer_opportunities.length === 0) data_gaps.push('No evidenced buyer opportunity was supplied for this property.');
  if (unresolved_facts.length > 0) data_gaps.push(`Unresolved required facts: ${unresolved_facts.join(', ')}.`);

  return {
    property: { key: property.key, class: property.class, label: property.label, listing_id: property.listing_id },
    generated_at: now.toISOString(),
    listing_record,
    distribution_gate,
    facts,
    unresolved_facts,
    outward_materials_allowed: outward_blockers.length === 0,
    outward_blockers,
    buyer_opportunities,
    channels,
    rejected,
    samples_excluded,
    sample_data_present,
    banner: sample_data_present ? SAMPLE_BANNER : null,
    data_gaps,
    confidence_note: CONFIDENCE_NOTE,
  };
}

function renderOpportunity(o: RankedOpportunity): string[] {
  const lines = [
    `### ${o.is_sample ? 'SAMPLE — NOT A REAL PROSPECT: ' : ''}${o.name ?? 'Anonymous aggregate (no identity)'}`,
    `- Kind: ${KIND_LABELS[o.kind]}`,
    ...(o.placement_status ? [`- Placement: ${PLACEMENT_LABELS[o.placement_status]}`] : []),
    `- Confidence (evidence only): ${o.confidence}`,
    `- Verification: ${o.verification}`,
    `- Evidence date: ${o.evidence_date} (${o.evidence_age_days} days ago)`,
    `- Why it matches: ${o.why_matches}`,
    `- Signals as the source states them: ${o.signals.length ? o.signals.join('; ') : 'none listed'}`,
    `- Unknown or conflicting: ${o.unknowns.length ? o.unknowns.join('; ') : 'none listed'}`,
    `- Contact: ${o.contact.channel}${o.contact.value ? ` (${o.contact.value})` : ''}`,
    `- Recommended next action: ${o.next_action}`,
    '- Citations:',
    ...o.citations.map((c) => `  - ${c.url} (${c.evidence_date})`),
    '',
  ];
  return lines;
}

export function renderReportMarkdown(r: PropertyReport): string {
  const out: string[] = [];
  if (r.banner) out.push(`> **${r.banner}**`, '');
  out.push(`# ${r.property.label}`, '', `Generated ${r.generated_at}.`, '');

  out.push('## Listing record', '');
  out.push(r.listing_record.listing_id_supplied ? `Listing id supplied: ${r.property.listing_id}` : r.listing_record.gap ?? '', '');

  out.push('## Distribution gate', '');
  out.push(
    r.distribution_gate.evaluated
      ? `${r.distribution_gate.allowed ? 'Allowed' : 'Blocked'}${r.distribution_gate.blocks.length ? `: ${r.distribution_gate.blocks.join(', ')}` : ''}`
      : 'Not evaluated (gate columns were not read). Treated as blocked.',
    '',
  );

  out.push('## Facts', '', '| Fact | Value | Status | Source | As of |', '|---|---|---|---|---|');
  for (const f of r.facts) out.push(`| ${f.key} | ${f.value ?? '—'} | ${f.status} | ${f.source ?? '—'} | ${f.as_of ?? '—'} |`);
  out.push('', `Unresolved facts: ${r.unresolved_facts.length ? r.unresolved_facts.join(', ') : 'none'}`, '');

  out.push('## Outward materials', '', r.outward_materials_allowed ? 'Allowed to prepare (still needs operator approval before anything is sent).' : `Not allowed yet. ${r.outward_blockers.join(' ')}`, '');

  out.push('## Buyer opportunities (ranked by evidence)', '', r.confidence_note, '');
  if (r.buyer_opportunities.length === 0) out.push('None with evidence.', '');
  for (const o of r.buyer_opportunities) out.push(...renderOpportunity(o));

  out.push('## Distribution channels', '');
  if (r.channels.length === 0) out.push('None with evidence.', '');
  for (const o of r.channels) out.push(...renderOpportunity(o));

  if (r.rejected.length > 0) {
    out.push('## Rejected findings', '');
    for (const x of r.rejected) out.push(`- ${x.id ?? '(no id)'}: ${x.issues.map((i) => i.code).join(', ')}`);
    out.push('');
  }
  if (r.samples_excluded > 0) out.push(`${r.samples_excluded} sample row(s) were excluded from this report.`, '');

  out.push('## Data gaps', '');
  for (const g of r.data_gaps) out.push(`- ${g}`);
  out.push('', '## What this report does not claim', '');
  out.push(
    '- It does not claim anyone is buying: a stated requirement is quoted from its source, and an expansion or acquisition record is labelled as such.',
    '- It does not treat an impression, a click, a sent email or a directory record as a buyer.',
    '- It does not verify listing facts against live Cotality; a fact is verified only where its source and date are shown.',
    '- It sends nothing, imports no contacts and changes no listing.',
  );
  return out.join('\n');
}
