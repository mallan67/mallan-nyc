/**
 * Mallan capability registry.
 *
 * Authority : docs/architecture/Mallan_Intelligence_Master_Plan.md
 *             §8.3 (maturity statuses), §24 (acceptance criteria),
 *             §26 correction C-5 (machine enforcement).
 * Validator : npm run capability:audit  ->  scripts/capability-audit.mjs
 * Evidence  : AI-START-HERE.md "Evidence standard";
 *             memory/EVIDENCE-STANDARD-2026-07-27.md
 *
 * ---------------------------------------------------------------------------
 * WHY .mjs AND NOT .yaml
 * ---------------------------------------------------------------------------
 * Correction C-5 originally named `config/capabilities.yaml`. Neither `js-yaml`
 * nor `yaml` is a dependency of this repository (verified: `require.resolve`
 * fails for both). The options were to add a dependency, hand-roll a YAML subset
 * parser, or use a format Node already understands.
 *
 * A hand-rolled parser can silently mis-parse, which would make the validator
 * itself unreliable — precisely the failure mode the evidence standard exists to
 * prevent. A validator you cannot trust is worse than no validator.
 *
 * This module is therefore the registry. It keeps comments, needs no dependency,
 * and cannot silently mis-parse.
 *
 * ---------------------------------------------------------------------------
 * THIS IS A STATIC REGISTRY. No schema, no migration — it does not trigger the
 * C-3 Neon/R2 gate. It becomes a runtime registry later, under §8.3, only after
 * that gate is satisfied.
 * ---------------------------------------------------------------------------
 *
 * RULE (C-5): maturity is assigned from EVIDENCE, never from intent or from how
 * much code was written. A capability with a route, a model, and a test but no
 * wired loop is `implemented`, NOT `production`.
 *
 * `'unverified'` is a legal value for any acceptance field. A field left as
 * `unverified` is honest. A field asserted without evidence is a process failure.
 */

/** §8.3 maturity statuses, in promotion order. */
export const STATUSES = [
  'discovered',
  'designed',
  'contracted',
  'implemented',
  'shadow_mode',
  'limited_release',
  'production',
  'degraded',
  'deprecated',
  'retired',
];

/**
 * Proof each status requires before it may be claimed.
 * Enforced by scripts/capability-audit.mjs.
 */
export const PROMOTION_PROOF = {
  implemented: ['tests'],
  shadow_mode: ['tests', 'observability'],
  limited_release: ['tests', 'observability', 'rollback'],
  production: ['tests', 'observability', 'rollback', 'production_proof'],
  degraded: ['issue'],
};

export const meta = {
  version: 1,
  generatedBy: 'hand-seeded 2026-07-27 from MASTER-PLAN-GAP-ANALYSIS-2026-07-27.md',
  baselineCommit: '262b6693',
  baselineBranch: 'fix/neon-write-amp-phase2a-media-reconcile-2026-07-26',
  baselineNote:
    'Dated evidence per correction C-7. Statuses reflect that commit only and are ' +
    'expected to go stale. Re-measure before citing.',
};

/** §22 programs. `status` is the aggregate read from gap analysis §3. */
export const programs = [
  { id: 'P0', name: 'Adopt and reconcile the authority', status: 'designed', evidence: 'gap-analysis §3' },
  { id: 'P1', name: 'Provider and policy adaptability', status: 'partial', evidence: 'gap-analysis §2.2, §2.3' },
  { id: 'P2', name: 'Canonical graph and identity', status: 'partial', evidence: 'gap-analysis §2.4', blockedBy: 'C-3' },
  { id: 'P3', name: 'Canonical search runtime', status: 'implemented', evidence: 'gap-analysis §3' },
  { id: 'P4', name: 'Events, workflows, artifacts, approvals', status: 'discovered', evidence: 'gap-analysis §2.1', blockedBy: 'C-3' },
  { id: 'P5', name: 'Public growth system', status: 'partial', evidence: 'gap-analysis §3' },
  { id: 'P6', name: 'Agent service system', status: 'partial', evidence: 'gap-analysis §3' },
  { id: 'P7', name: 'Client portals', status: 'shell', evidence: 'gap-analysis §3' },
  { id: 'P8', name: 'Broker operating system', status: 'discovered', evidence: 'gap-analysis §3' },
  { id: 'P9', name: 'Transactions and after-close', status: 'partial', evidence: 'gap-analysis §3' },
  { id: 'P10', name: 'Advanced intelligence', status: 'partial', evidence: 'gap-analysis §3' },
  { id: 'P11', name: 'Decommissioning and consolidation', status: 'discovered', evidence: 'master plan §26 C-4' },
];

/**
 * Capabilities.
 * Seeded with the ones the 2026-07-27 gap analysis actually measured.
 * INTENTIONALLY INCOMPLETE — see `coverage` below.
 */
export const capabilities = [
  {
    id: 'CAP-SEARCH-CANONICAL',
    name: 'Canonical search contract and execution',
    program: 'P3',
    planRef: '§9.1, §9.7',
    owner: 'unassigned',
    status: 'implemented',
    canonicalFiles: [
      'lib/search/canonical/',
      'lib/search/visibility-contract.ts',
      'lib/search/listing-access-decision.ts',
      'lib/search/criteria-to-prisma.ts',
    ],
    tests: ['lib/search/__tests__/'],
    observability: 'unverified',
    rollback: 'unverified',
    production_proof: 'unverified',
    notes:
      'Strongest measured area. NOT promoted to `production` because no production ' +
      'probe was run during the gap analysis. Promotion requires a live probe ' +
      'capture, not a test pass.',
  },

  {
    id: 'CAP-IDX-COTALITY-ADAPTER',
    name: 'Cotality/Trestle listing adapter',
    program: 'P1',
    planRef: '§5.2, §5.3, §26 C-2',
    owner: 'unassigned',
    status: 'implemented',
    canonicalFiles: ['lib/idx/'],
    tests: ['lib/idx/__tests__/'],
    observability: 'lib/idx/cotality-telemetry.ts',
    rollback: 'unverified',
    production_proof: 'unverified',
    gaps: [
      'generated-contract module absent (§5.3)',
      'capability-registry module absent (§5.3)',
      'ListingProvider domain interface absent (§5.2)',
      'trestle:diff exists but is NOT a blocking gate (§5.9)',
    ],
    notes: 'C-2 ratified: lib/idx/ is the canonical surface. lib/integrations/cotality/ must NOT be created.',
  },

  {
    id: 'CAP-COMPLIANCE-GATES',
    name: 'REBNY/RLS display and compliance gates',
    program: 'P1',
    planRef: '§6.2, §6.5',
    owner: 'unassigned',
    status: 'implemented',
    canonicalFiles: ['lib/compliance/', 'docs/compliance/COMPLIANCE-CANONICAL-INDEX.md'],
    tests: [
      'lib/compliance/__tests__/',
      'npm run ucba:audit',
      'npm run rls:validate',
      'npm run idx:validate',
      'npm run compliance-check',
    ],
    observability: 'unverified',
    rollback: 'unverified',
    production_proof: 'unverified',
    gaps: [
      'code-shaped, not data-shaped: no §6.1 versioned policy registry',
      'no contract_version / policy_version stamping anywhere in schema',
      'effective-date behavior (§6.4) unimplementable without version stamping',
    ],
  },

  {
    id: 'CAP-EVENT-OUTBOX',
    name: 'Transactional event outbox',
    program: 'P4',
    planRef: '§8.1, §26 C-1',
    owner: 'unassigned',
    status: 'discovered',
    canonicalFiles: [],
    tests: [],
    observability: 'unverified',
    rollback: 'unverified',
    production_proof: 'unverified',
    blockedBy: 'C-3',
    notes:
      'Measured at zero: grep -ril "outbox" over lib app prisma scripts -> 0 files. ' +
      'C-1 ratified: audit_events is a SEPARATE system and must not be widened into an event bus.',
  },

  {
    id: 'CAP-WORKFLOW-ENGINE',
    name: 'Runtime workflow engine',
    program: 'P4',
    planRef: '§8.2',
    owner: 'unassigned',
    status: 'discovered',
    canonicalFiles: [],
    tests: [],
    observability: 'unverified',
    rollback: 'unverified',
    production_proof: 'unverified',
    blockedBy: 'C-3',
    notes:
      'The 23 cron routes under app/api/cron/ are a SCHEDULER, not a workflow engine. ' +
      'They cannot pause, resume, await approval, compensate, or partially regenerate. ' +
      'Do not record them as satisfying this capability.',
  },

  {
    id: 'CAP-POLICY-REGISTRY',
    name: 'Versioned policy and compliance registry',
    program: 'P1',
    planRef: '§6.1, §6.4',
    owner: 'unassigned',
    status: 'discovered',
    canonicalFiles: [],
    tests: [],
    observability: 'unverified',
    rollback: 'unverified',
    production_proof: 'unverified',
    blockedBy: 'C-3',
  },

  {
    id: 'CAP-CANONICAL-PROPERTY',
    name: 'Canonical property, building, and unit graph',
    program: 'P2',
    planRef: '§7.4',
    owner: 'unassigned',
    status: 'contracted',
    canonicalFiles: ['prisma/schema.prisma'],
    tests: [],
    observability: 'unverified',
    rollback: 'unverified',
    production_proof: 'unverified',
    notes:
      'CanonicalProperty / CanonicalBuilding / CanonicalUnit / ListingIdentity / ' +
      'IdentityMatchAudit / IdentityReviewQueue are declared. Recorded as `contracted` ' +
      'rather than `implemented` because no dedicated test path was identified — ' +
      'declaration is not implementation evidence.',
  },

  {
    id: 'CAP-CANONICAL-PERSON',
    name: 'Person, household, and organization identity',
    program: 'P2',
    planRef: '§7.1, §7.2, §7.3',
    owner: 'unassigned',
    status: 'discovered',
    canonicalFiles: [],
    tests: [],
    observability: 'unverified',
    rollback: 'unverified',
    production_proof: 'unverified',
    blockedBy: 'C-3',
    notes:
      'grep "model Person|model Household|model Organization" -> NONE. §7.3 Organization ' +
      'is the most consequential omission: NYC transactions run through LLCs, trusts, ' +
      'estates, boards, managing agents, and law firms. OPEN QUESTION (untested): does ' +
      'model Lead currently key on email? §7.1 warns against email-only identity.',
  },

  {
    id: 'CAP-MEDIA-PROVENANCE',
    name: 'Media contract and AI-modification provenance',
    program: 'P1',
    planRef: '§15.1, §17.5, §26 C-6',
    owner: 'unassigned',
    status: 'implemented',
    canonicalFiles: [
      'lib/idx/media-sync.ts',
      'lib/idx/media-reconcile-guard.ts',
      'lib/idx/media-set-hash.ts',
      'lib/idx/watermark.ts',
    ],
    tests: ['lib/idx/__tests__/'],
    observability: 'unverified',
    rollback: 'unverified',
    production_proof: 'unverified',
    policyWatch: [
      {
        id: 'NYC-DCWP-AI-MEDIA-DISCLOSURE',
        review_status: 'monitoring',
        enforcement_mode: 'none',
        effective_date: null,
        note:
          'PROPOSED DCWP rulemaking, NOT enacted. No Local Law number, no Intro number, ' +
          'no rule citation. Official NYC.gov source returned HTTP 403 and was NOT read. ' +
          'Do not implement a disclosure gate against this. Promotion requires a dated ' +
          'official source per CLAUDE.md §E and §J.4.',
      },
    ],
    notes:
      'C-6 ratified: build the provenance envelope on EXISTING REBNY/RLS media ' +
      'obligations, independent of the DCWP proposal. Note the §17.5 field list ' +
      '(edit type, provider/model, disclosure, approval, withdrawal) is NOT yet ' +
      'verified as implemented — only media sync/reconcile is. ' +
      'EXPECTED WARNING: media-reconcile-guard.ts and media-set-hash.ts are declared ' +
      'here but do not exist on this branch — they are unpushed on ' +
      'fix/neon-write-amp-phase2a-media-reconcile-2026-07-26. The validator correctly ' +
      'warns. Do not silence the warning by deleting the paths; it resolves when that ' +
      'branch lands. This is the registry doing its job across branch boundaries.',
  },

  {
    id: 'CAP-CLIENT-PORTALS',
    name: 'Buyer, tenant, seller, landlord portals',
    program: 'P7',
    planRef: '§13',
    owner: 'unassigned',
    status: 'designed',
    canonicalFiles: ['app/portal/', 'app/api/portal/'],
    tests: [],
    observability: 'unverified',
    rollback: 'unverified',
    production_proof: 'unverified',
    notes:
      'Measured: 2 .tsx files per role (buyer/seller/tenant/landlord) against 40 backing ' +
      'API routes. Backend is ahead of frontend. Recorded as `designed` rather than ' +
      '`implemented` because no wired loop was demonstrated.',
  },
];

/**
 * Honest coverage statement. Required by C-5: a registry that silently omits
 * capabilities reads as "everything is registered" when it is not.
 */
export const coverage = {
  capabilitiesRegistered: capabilities.length,
  capabilitiesTotalEstimated: 'unknown',
  method:
    'Hand-seeded from the capabilities the 2026-07-27 gap analysis actually measured. ' +
    'This is NOT a complete inventory of the platform. Producing the complete inventory ' +
    'is a Program 0 deliverable and is not yet done.',
  knownUnregisteredAreas: [
    'CRM (156 API routes under app/api/crm/)',
    'lead scoring, buyer intent, demand index, conviction, seller readiness',
    'notifications and unsubscribe',
    'documents and deals',
    'public growth journeys (§10)',
    'broker operating system (§14)',
  ],
};

export default { STATUSES, PROMOTION_PROOF, meta, programs, capabilities, coverage };
