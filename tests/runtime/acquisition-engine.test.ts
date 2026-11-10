/**
 * Buyer-acquisition engine: the evidence rules, not the dashboard.
 *
 * What this file proves: the pure rules in lib/acquisition refuse an opportunity that has no
 * citation or evidence date, refuse to call an expansion signal a buyer, keep anonymous
 * searchers anonymous, keep person-level contacts inside the CRM, scan free text with the
 * repo's own Fair Housing scanner, and keep verified exposure, visits, inquiries, offers and
 * contracts as separate numbers. It uses the real evaluateCampaignDistributionGate and the real
 * Fair Housing scanner; nothing here is mocked.
 *
 * What it does NOT prove: that any prospect is real (no prospect data is committed), that a
 * search provider exists, how the listing facts compare with live Cotality, or anything about
 * a send (this module sends nothing).
 */
import {
  FRESH_EVIDENCE_DAYS,
  FUNNEL_STAGES,
  REQUIRED_FACTS,
  buildFunnel,
  buildPropertyReport,
  confidenceFor,
  dedupeOpportunities,
  rankOpportunities,
  renderReportMarkdown,
  validateOpportunity,
  type AcquisitionOpportunity,
  type PropertyFact,
  type PropertyReportInput,
} from '@/lib/acquisition';

const NOW = new Date('2026-11-09T12:00:00Z');

function opp(overrides: Partial<AcquisitionOpportunity> = {}): AcquisitionOpportunity {
  return {
    id: 'o1',
    property_key: 'p-333',
    kind: 'stated_requirement',
    identity: 'cooperating_broker',
    name: 'Example Brokerage',
    source_url: 'https://example.com/requirements/1',
    evidence_date: '2026-10-20',
    why_matches: 'The source states a request for a one-bedroom co-op in Turtle Bay.',
    signals: ['one-bedroom', 'co-op or condop'],
    unknowns: ['budget not stated'],
    contact: { channel: 'public_business_contact', value: 'desk@example.com' },
    verification: 'verified',
    next_action: 'Operator reviews the source, then decides whether to send anything.',
    ...overrides,
  };
}

const codes = (o: unknown) => validateOpportunity(o, NOW).map((i) => i.code);

describe('validateOpportunity: evidence is mandatory', () => {
  it('accepts a fully evidenced opportunity', () => {
    expect(validateOpportunity(opp(), NOW)).toEqual([]);
  });

  it('refuses a missing source url, a non-https url and a non-url', () => {
    expect(codes(opp({ source_url: '' }))).toContain('missing_source_url');
    expect(codes(opp({ source_url: 'http://example.com/a' }))).toContain('invalid_source_url');
    expect(codes(opp({ source_url: 'not a url' }))).toContain('invalid_source_url');
    expect(codes(opp({ source_url: 'javascript:alert(1)' }))).toContain('invalid_source_url');
  });

  it('refuses a missing, impossible or future evidence date, and accepts today', () => {
    expect(codes(opp({ evidence_date: '' }))).toContain('missing_evidence_date');
    expect(codes(opp({ evidence_date: '2026-13-40' }))).toContain('invalid_evidence_date');
    expect(codes(opp({ evidence_date: '2026-02-30' }))).toContain('invalid_evidence_date');
    expect(codes(opp({ evidence_date: '2026-11-10' }))).toContain('future_evidence_date');
    expect(codes(opp({ evidence_date: '2026-11-09' }))).toEqual([]);
  });

  it('requires the match reason and the next action; unknowns must be listed, but may be empty', () => {
    expect(codes(opp({ why_matches: '  ' }))).toContain('missing_why_matches');
    expect(codes(opp({ next_action: '' }))).toContain('missing_next_action');
    expect(codes(opp({ unknowns: undefined as never }))).toContain('unknowns_not_listed');
    expect(codes(opp({ unknowns: [] }))).toEqual([]);
  });

  it('refuses a value outside the closed lists', () => {
    expect(codes(opp({ kind: 'bogus' as never }))).toContain('invalid_kind');
    expect(codes(opp({ identity: 'bogus' as never }))).toContain('invalid_identity');
    expect(codes(opp({ verification: 'bogus' as never }))).toContain('invalid_verification');
    expect(codes('nope')).toContain('not_an_object');
  });
});

describe('validateOpportunity: never claim more than the source shows', () => {
  it('refuses "is buying" for an expansion signal or an acquisition record, accepts it for a stated requirement', () => {
    const claim = 'The practice is buying a new office.';
    expect(codes(opp({ kind: 'expansion_signal', why_matches: claim }))).toContain('purchase_overclaim');
    expect(codes(opp({ kind: 'acquisition_activity', why_matches: claim }))).toContain('purchase_overclaim');
    expect(codes(opp({ kind: 'stated_requirement', why_matches: claim }))).not.toContain('purchase_overclaim');
  });

  it('catches "plans to purchase" in the listed signals too', () => {
    expect(codes(opp({ kind: 'expansion_signal', signals: ['plans to purchase space'] }))).toContain('purchase_overclaim');
  });

  it('accepts an expansion signal that says only what the source says', () => {
    expect(
      codes(opp({ kind: 'expansion_signal', why_matches: 'The source announces a second office location.', verification: 'unverified' })),
    ).toEqual([]);
  });
});

describe('validateOpportunity: people, anonymity and contacts', () => {
  it('keeps an anonymous searcher anonymous: no name, no contact value', () => {
    const anon = { identity: 'anonymous_aggregate' as const, name: null, contact: { channel: 'none' as const } };
    expect(codes(opp(anon))).toEqual([]);
    expect(codes(opp({ ...anon, name: 'Someone' }))).toContain('anonymous_has_identity');
    expect(codes(opp({ ...anon, contact: { channel: 'approved_crm', value: 'lead-1' } }))).toContain('anonymous_has_identity');
  });

  it('requires a name for every identified prospect', () => {
    expect(codes(opp({ name: null }))).toContain('named_prospect_needs_name');
  });

  it('keeps an individual inside the approved CRM channel; a scraped public contact is refused', () => {
    const person = { identity: 'individual_via_crm' as const, name: 'CRM Client' };
    expect(codes(opp({ ...person, contact: { channel: 'public_business_contact', value: 'x@example.com' } }))).toContain(
      'person_contact_not_authorized',
    );
    expect(codes(opp({ ...person, contact: { channel: 'approved_crm', value: 'lead-9' } }))).toEqual([]);
  });

  it('refuses a contact value on channel "none"', () => {
    expect(codes(opp({ contact: { channel: 'none', value: 'a@example.com' } }))).toContain('contact_value_without_channel');
  });
});

describe('validateOpportunity: residential matching and Fair Housing', () => {
  it('accepts only allow-listed audience criteria; a protected characteristic is not a criterion', () => {
    expect(codes(opp({ criteria: { bedrooms: 1, neighborhood: 'Turtle Bay', purchase_purpose: 'pied_a_terre' } }))).toEqual([]);
    expect(codes(opp({ criteria: { race: 'x' } }))).toContain('criterion_not_allowed');
    expect(codes(opp({ criteria: { familial_status: 'x' } }))).toContain('criterion_not_allowed');
    expect(codes(opp({ criteria: { zip_code_demographics: 'x' } }))).toContain('criterion_not_allowed');
  });

  it('runs the repo Fair Housing scanner over the free text and the criteria values', () => {
    expect(codes(opp({ why_matches: 'Good fit, no children.' }))).toContain('fair_housing_text');
    expect(codes(opp({ next_action: 'Contact citizens only.' }))).toContain('fair_housing_text');
    expect(codes(opp({ unknowns: ['no children allowed?'] }))).toContain('fair_housing_text');
    expect(codes(opp({ criteria: { neighborhood: 'singles only' } }))).toContain('fair_housing_text');
  });
});

describe('validateOpportunity: a channel is not a buyer, and a possible placement is not a live one', () => {
  const channel = (o: Partial<AcquisitionOpportunity> = {}) =>
    opp({ kind: 'distribution_channel', identity: 'organization', name: 'Example Portal', placement_status: 'possible', ...o });

  it('requires a placement status on a channel and forbids one elsewhere', () => {
    expect(codes(channel())).toEqual([]);
    expect(codes(channel({ placement_status: undefined }))).toContain('placement_status_required');
    expect(codes(opp({ placement_status: 'possible' }))).toContain('placement_on_non_channel');
    expect(codes(channel({ placement_status: 'bogus' as never }))).toContain('invalid_placement_status');
  });

  it('a placement marked verified_live still needs the citation and date every opportunity needs', () => {
    expect(codes(channel({ placement_status: 'verified_live', source_url: '' }))).toContain('missing_source_url');
    expect(codes(channel({ placement_status: 'verified_live' }))).toEqual([]);
  });
});

describe('dedupeOpportunities', () => {
  it('merges the same source reached through tracking parameters, www, a fragment or a trailing slash, keeping one citation', () => {
    const a = opp({ id: 'a', source_url: 'https://www.example.com/req/1/?utm_source=x#top', name: null as never, identity: 'anonymous_aggregate', contact: { channel: 'none' } });
    const b = opp({ id: 'b', source_url: 'https://example.com/req/1', name: null as never, identity: 'anonymous_aggregate', contact: { channel: 'none' } });
    const merged = dedupeOpportunities([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].citations).toHaveLength(1);
  });

  it('merges the same organization and kind found at two sources, keeping both citations and the newest date', () => {
    const a = opp({ id: 'a', source_url: 'https://example.com/a', evidence_date: '2026-09-01', name: 'Example Brokerage' });
    const b = opp({ id: 'b', source_url: 'https://example.org/b', evidence_date: '2026-10-15', name: 'example brokerage' });
    const [m] = dedupeOpportunities([a, b]);
    expect(m.citations.map((c) => c.url).sort()).toEqual(['https://example.com/a', 'https://example.org/b']);
    expect(m.evidence_date).toBe('2026-10-15');
  });

  it('keeps the weakest verification when the merged findings disagree, and any conflict wins', () => {
    const a = opp({ id: 'a', source_url: 'https://example.com/a', verification: 'verified' });
    const b = opp({ id: 'b', source_url: 'https://example.org/b', verification: 'unverified' });
    expect(dedupeOpportunities([a, b])[0].verification).toBe('unverified');
    const c = opp({ id: 'c', source_url: 'https://example.net/c', verification: 'conflicting' });
    expect(dedupeOpportunities([a, c])[0].verification).toBe('conflicting');
  });

  it('never merges across properties or across kinds', () => {
    const a = opp({ id: 'a', source_url: 'https://example.com/a' });
    const otherProperty = opp({ id: 'b', source_url: 'https://example.org/b', property_key: 'p-800' });
    const otherKind = opp({ id: 'c', source_url: 'https://example.net/c', kind: 'expansion_signal' });
    expect(dedupeOpportunities([a, otherProperty, otherKind])).toHaveLength(3);
  });
});

describe('confidence describes the evidence, never the likelihood of a sale', () => {
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10);

  it('a verified, fresh, stated requirement is high; stale is medium; unverified is low', () => {
    expect(confidenceFor(opp({ evidence_date: daysAgo(10) }), NOW)).toBe('high');
    expect(confidenceFor(opp({ evidence_date: daysAgo(FRESH_EVIDENCE_DAYS + 1) }), NOW)).toBe('medium');
    expect(confidenceFor(opp({ evidence_date: daysAgo(10), verification: 'unverified' }), NOW)).toBe('low');
  });

  it('freshness is inclusive at the limit and not beyond it', () => {
    expect(confidenceFor(opp({ evidence_date: daysAgo(FRESH_EVIDENCE_DAYS) }), NOW)).toBe('high');
    expect(confidenceFor(opp({ evidence_date: daysAgo(FRESH_EVIDENCE_DAYS + 1) }), NOW)).not.toBe('high');
  });

  it('acquisition activity is never high, an expansion signal is never above low, conflicting is low', () => {
    expect(confidenceFor(opp({ kind: 'acquisition_activity', evidence_date: daysAgo(5) }), NOW)).toBe('medium');
    expect(confidenceFor(opp({ kind: 'expansion_signal', evidence_date: daysAgo(5) }), NOW)).toBe('low');
    expect(confidenceFor(opp({ verification: 'conflicting', evidence_date: daysAgo(5) }), NOW)).toBe('low');
  });

  it('a channel is high only when its placement is verified live, verified and fresh', () => {
    const ch = (o: Partial<AcquisitionOpportunity>) =>
      opp({ kind: 'distribution_channel', identity: 'organization', evidence_date: daysAgo(5), ...o });
    expect(confidenceFor(ch({ placement_status: 'verified_live' }), NOW)).toBe('high');
    expect(confidenceFor(ch({ placement_status: 'possible' }), NOW)).toBe('low');
    expect(confidenceFor(ch({ placement_status: 'application_prepared' }), NOW)).toBe('low');
  });

  it('ranks by confidence, then newest evidence, then name, deterministically', () => {
    const list = [
      opp({ id: 'low', verification: 'unverified', evidence_date: '2026-11-01', name: 'A' }),
      opp({ id: 'old-high', evidence_date: '2026-10-01', name: 'B', source_url: 'https://example.com/old' }),
      opp({ id: 'new-high', evidence_date: '2026-11-05', name: 'C', source_url: 'https://example.com/new' }),
    ];
    const ranked = rankOpportunities(list, NOW);
    expect(ranked.map((r) => r.id)).toEqual(['new-high', 'old-high', 'low']);
    expect(rankOpportunities([...list].reverse(), NOW).map((r) => r.id)).toEqual(['new-high', 'old-high', 'low']);
  });
});

const verified = (value: PropertyFact['value']): PropertyFact => ({
  value,
  status: 'verified',
  source: 'Example source document',
  as_of: '2026-11-01',
});

const allVerified = (cls: keyof typeof REQUIRED_FACTS) =>
  Object.fromEntries(REQUIRED_FACTS[cls].map((k) => [k, verified('x')])) as Record<string, PropertyFact>;

function input(overrides: Partial<PropertyReportInput['property']> = {}, rest: Partial<PropertyReportInput> = {}): PropertyReportInput {
  return {
    property: {
      key: 'p-333',
      class: 'residential_condop',
      label: '333 East 46th Street #2G',
      listing_id: 'SL-0004',
      facts: {},
      gate_input: { listing_id: 'SL-0004', rls_eligible: false, status: 'Active' },
      ...overrides,
    },
    opportunities: [],
    ...rest,
  };
}

describe('buildPropertyReport: listing record, gate and facts', () => {
  it('reports a missing listing record as a gap and never invents an id', () => {
    const r = buildPropertyReport(input({ listing_id: null, gate_input: null, class: 'commercial_office_condo', key: 'p-800', label: '800 Second Avenue #806' }), NOW);
    expect(r.property.listing_id).toBeNull();
    expect(r.listing_record.listing_id_supplied).toBe(false);
    expect(r.listing_record.gap).toMatch(/no authoritative listing record/i);
    expect(r.outward_materials_allowed).toBe(false);
  });

  it('uses the real distribution gate: website-only passes, RLS-eligible with null flags is blocked', () => {
    expect(buildPropertyReport(input(), NOW).distribution_gate).toEqual({ evaluated: true, allowed: true, blocks: [] });
    const blocked = buildPropertyReport(
      input({ gate_input: { listing_id: 'SL-0004', rls_eligible: true, idx_display_yn: null, internet_entire_listing_display_yn: null, status: 'Active' } }),
      NOW,
    );
    expect(blocked.distribution_gate.allowed).toBe(false);
    expect(blocked.distribution_gate.blocks).toEqual(expect.arrayContaining(['idx_display_yn', 'internet_entire_listing_display_yn']));
  });

  it('blocks on owner opt-out, participant-only and terminal status; and fails closed when the gate input is missing', () => {
    const base = { listing_id: 'SL-0004', rls_eligible: false } as const;
    expect(buildPropertyReport(input({ gate_input: { ...base, owner_opt_out: true } }), NOW).distribution_gate.blocks).toContain('owner_opt_out');
    expect(buildPropertyReport(input({ gate_input: { ...base, participant_only: true } }), NOW).distribution_gate.blocks).toContain('participant_only');
    expect(buildPropertyReport(input({ gate_input: { ...base, status: 'Closed' } }), NOW).distribution_gate.allowed).toBe(false);
    const none = buildPropertyReport(input({ gate_input: null }), NOW).distribution_gate;
    expect(none).toEqual({ evaluated: false, allowed: false, blocks: ['gate_not_evaluated'] });
  });

  it('lists every required fact; a missing one is unresolved, not assumed', () => {
    const r = buildPropertyReport(input(), NOW);
    expect(r.facts.map((f) => f.key)).toEqual([...REQUIRED_FACTS.residential_condop]);
    expect(r.unresolved_facts).toEqual([...REQUIRED_FACTS.residential_condop]);
    expect(r.facts.every((f) => f.status === 'unverified' && f.value === null)).toBe(true);
  });

  it('downgrades a fact marked verified without a source or a date', () => {
    const r = buildPropertyReport(input({ facts: { price: { value: 765000, status: 'verified' } } }), NOW);
    const price = r.facts.find((f) => f.key === 'price')!;
    expect(price.status).toBe('unverified');
    expect(r.data_gaps.join(' ')).toMatch(/price.*source and an as-of date/i);
  });

  it('outward materials are allowed only when the gate allows AND every required fact is verified', () => {
    expect(buildPropertyReport(input({ facts: allVerified('residential_condop') }), NOW).outward_materials_allowed).toBe(true);
    const missingOne = { ...allVerified('residential_condop') };
    delete missingOne.maintenance;
    const r = buildPropertyReport(input({ facts: missingOne }), NOW);
    expect(r.outward_materials_allowed).toBe(false);
    expect(r.outward_blockers.join(' ')).toMatch(/maintenance/);
    const gateBlocked = buildPropertyReport(
      input({ facts: allVerified('residential_condop'), gate_input: { listing_id: 'SL-0004', rls_eligible: false, owner_opt_out: true } }),
      NOW,
    );
    expect(gateBlocked.outward_materials_allowed).toBe(false);
  });

  it('keeps the commercial and residential fact lists the brief names, and no commission figure is a default', () => {
    expect(REQUIRED_FACTS.commercial_office_condo).toEqual(
      expect.arrayContaining(['price', 'permitted_uses', 'building_requirements', 'listing_status', 'commission_terms']),
    );
    expect(REQUIRED_FACTS.residential_condop).toEqual(
      expect.arrayContaining(['maintenance', 'tenant_lease_status', 'financing_availability', 'building_safety_information', 'buyer_approval_requirements']),
    );
    const r = buildPropertyReport(input({ class: 'commercial_office_condo' }), NOW);
    expect(r.facts.find((f) => f.key === 'commission_terms')).toMatchObject({ value: null, status: 'unverified' });
  });
});

describe('buildPropertyReport: opportunities', () => {
  it('ranks valid findings and reports the rejected ones with their reasons, never dropping them silently', () => {
    const good = opp();
    const bad = opp({ id: 'bad', source_url: '' });
    const r = buildPropertyReport(input({}, { opportunities: [good, bad] }), NOW);
    expect(r.buyer_opportunities.map((o) => o.id)).toEqual(['o1']);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].id).toBe('bad');
    expect(r.rejected[0].issues.map((i) => i.code)).toContain('missing_source_url');
  });

  it('rejects a finding filed against another property', () => {
    const r = buildPropertyReport(input({}, { opportunities: [opp({ property_key: 'p-800' })] }), NOW);
    expect(r.buyer_opportunities).toHaveLength(0);
    expect(r.rejected[0].issues.map((i) => i.code)).toContain('wrong_property');
  });

  it('keeps channels apart from buyer opportunities', () => {
    const ch = opp({ id: 'ch', kind: 'distribution_channel', identity: 'organization', name: 'Example Portal', placement_status: 'possible', source_url: 'https://example.com/portal' });
    const r = buildPropertyReport(input({}, { opportunities: [opp(), ch] }), NOW);
    expect(r.buyer_opportunities.map((o) => o.id)).toEqual(['o1']);
    expect(r.channels.map((o) => o.id)).toEqual(['ch']);
  });

  it('excludes sample rows by default and says how many; includes them only labelled', () => {
    const sample = opp({ id: 's1', is_sample: true, source_url: 'https://example.com/sample', name: 'Sample Org A' });
    const real = opp();
    const off = buildPropertyReport(input({}, { opportunities: [real, sample] }), NOW);
    expect(off.buyer_opportunities.map((o) => o.id)).toEqual(['o1']);
    expect(off.samples_excluded).toBe(1);
    expect(off.sample_data_present).toBe(false);
    expect(off.banner).toBeNull();

    const on = buildPropertyReport(input({}, { opportunities: [sample], include_samples: true }), NOW);
    expect(on.sample_data_present).toBe(true);
    expect(on.banner).toBe('SAMPLE DATA — NOT REAL PROSPECTS');
    expect(on.buyer_opportunities.every((o) => o.is_sample === true)).toBe(true);
    expect(renderReportMarkdown(on)).toContain('SAMPLE DATA — NOT REAL PROSPECTS');
    expect(renderReportMarkdown(on)).toMatch(/SAMPLE — NOT A REAL PROSPECT/);
  });

  it('states what confidence means', () => {
    expect(buildPropertyReport(input(), NOW).confidence_note).toMatch(/not the likelihood of a sale/i);
  });
});

describe('renderReportMarkdown', () => {
  it('prints every citation url with its evidence date, the verification status and the unknowns', () => {
    const md = renderReportMarkdown(buildPropertyReport(input({}, { opportunities: [opp()] }), NOW));
    expect(md).toContain('https://example.com/requirements/1');
    expect(md).toContain('2026-10-20');
    expect(md).toMatch(/verified/i);
    expect(md).toContain('budget not stated');
  });

  it('labels an expansion signal as not a stated purchase requirement', () => {
    const exp = opp({ kind: 'expansion_signal', verification: 'unverified', why_matches: 'The source announces a second office.' });
    const md = renderReportMarkdown(buildPropertyReport(input({}, { opportunities: [exp] }), NOW));
    expect(md).toMatch(/not a stated purchase requirement/i);
  });

  it('names the listing-record gap and the unresolved facts', () => {
    const md = renderReportMarkdown(buildPropertyReport(input({ listing_id: null, gate_input: null }), NOW));
    expect(md).toMatch(/no authoritative listing record/i);
    expect(md).toMatch(/Unresolved facts/);
  });
});

describe('buildFunnel: separate numbers, never one total', () => {
  const stage = { count: 3, source: 'CRM inquiries, 2026-11-09', as_of: '2026-11-09', truth_level: 'VERIFIED_MALLAN_TRAFFIC' as const };

  it('lists the stages in the fixed order and marks an untracked stage as untracked, not zero', () => {
    const f = buildFunnel({ stages: { qualified_inquiries: stage } });
    expect(f.stages.map((s) => s.stage)).toEqual([...FUNNEL_STAGES]);
    expect(f.stages.find((s) => s.stage === 'offers')).toMatchObject({ tracked: false, count: null });
    expect(f.stages.find((s) => s.stage === 'qualified_inquiries')).toMatchObject({ tracked: true, count: 3 });
  });

  it('a tracked zero is a zero', () => {
    const f = buildFunnel({ stages: { offers: { ...stage, count: 0 } } });
    expect(f.stages.find((s) => s.stage === 'offers')).toMatchObject({ tracked: true, count: 0 });
  });

  it('has no total or combined field', () => {
    const f = buildFunnel({ stages: { qualified_inquiries: stage, offers: stage } }) as unknown as Record<string, unknown>;
    expect(Object.keys(f).some((k) => /total|combined|sum|buyers/i.test(k))).toBe(false);
  });

  it('files impressions, clicks, emails sent and directory records as not buyer evidence', () => {
    const f = buildFunnel({ stages: {}, not_buyer_evidence: { impressions: 900, clicks: 40, emails_sent: 120, public_directory_records: 15 } });
    expect(f.not_buyer_evidence).toHaveLength(4);
    expect(f.not_buyer_evidence.every((e) => /not buyer evidence/i.test(e.label))).toBe(true);
    expect(f.stages.every((s) => s.tracked === false)).toBe(true);
  });

  it('refuses a stage with a count but no source, date or valid truth level, and an invalid count', () => {
    const issues = (s: unknown) => buildFunnel({ stages: { offers: s as never } }).issues.map((i) => i.code);
    expect(issues({ ...stage, source: '' })).toContain('stage_missing_evidence');
    expect(issues({ ...stage, as_of: '' })).toContain('stage_missing_evidence');
    expect(issues({ ...stage, truth_level: 'BOGUS' })).toContain('invalid_truth_level');
    expect(issues({ ...stage, count: -1 })).toContain('invalid_count');
    expect(issues({ ...stage, count: 1.5 })).toContain('invalid_count');
    expect(issues({ ...stage, count: Number.NaN })).toContain('invalid_count');
  });
});
