/**
 * Mallan capability registry.
 *
 * Authority : docs/architecture/Mallan_Intelligence_Master_Plan.md
 *             §8.3 (maturity statuses), §24 (acceptance criteria),
 *             §26 correction C-5 (machine enforcement).
 * Validator : npm run capability:audit  ->  scripts/capability-audit.mjs
 * Evidence  : AI-START-HERE.md "Evidence standard";
 *             memory/EVIDENCE-STANDARD-2026-07-27.md
 *             docs/evidence/capability-evidence-2026-07-27.md
 *
 * ---------------------------------------------------------------------------
 * THIS FILE IS DATA. NOTHING ELSE.
 * ---------------------------------------------------------------------------
 * Plain exported objects and arrays only. No imports, no filesystem access, no
 * network calls, no environment reads, no side effects, no computed values that
 * depend on runtime state. It must be safe to import from anywhere, and reading
 * it must never change anything.
 *
 * ---------------------------------------------------------------------------
 * WHY .mjs AND NOT .yaml
 * ---------------------------------------------------------------------------
 * Correction C-5 originally named `config/capabilities.yaml`. Neither `js-yaml`
 * nor `yaml` is a dependency of this repository. Adding one solely for this
 * registry adds dependency and parser risk; a hand-rolled YAML subset parser
 * could silently mis-parse, which would make the validator itself untrustworthy.
 * A validator you cannot trust is worse than no validator.
 *
 * This module requires no dependency, preserves comments, is natively importable
 * by Node, fails loudly on syntax errors, and stays a static registry with no
 * schema or migration.
 *
 * ---------------------------------------------------------------------------
 * STATIC REGISTRY: no schema, no migration -> does not trigger the C-3 Neon/R2
 * gate. It becomes a runtime registry later, under §8.3, only after that gate is
 * satisfied.
 * ---------------------------------------------------------------------------
 *
 * THE RULE (C-5): maturity is assigned from EVIDENCE, never from intent or from
 * how much code was written. A capability with a route, a model, and a test but
 * no wired loop is `implemented`, NOT `production`.
 *
 * `'unverified'` is a legal value. A field left `unverified` is honest. A field
 * asserted without evidence is a process failure.
 */

/**
 * §8.3 capability maturity statuses, in promotion order.
 * These apply to CAPABILITIES ONLY. Programs use PROGRAM_ASSESSMENTS below.
 */
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
 * Program-level assessment vocabulary — DELIBERATELY SEPARATE from STATUSES.
 *
 * A program is a coarse aggregate of many capabilities; a capability is a single
 * thing that either has its evidence or does not. Sharing one word ("status")
 * for both invited agents to treat `partial` or `shell` as though they were
 * legitimate capability maturity states. They are not, and the validator now
 * rejects them in that position.
 */
export const PROGRAM_ASSESSMENTS = [
  'not_started',
  'discovered',
  'designed',
  'partial',
  'shell',
  'implemented',
  'complete',
];

/**
 * Evidence a status must point to before it may be claimed.
 *
 * `evidence` means a complete structured evidence record (see EVIDENCE_FIELDS).
 * The validator does NOT rerun tests. It enforces that a promoted status points
 * to a complete, non-placeholder evidence record naming a real command, exit
 * code, target commit, and proof boundary.
 */
export const PROMOTION_PROOF = {
  implemented: ['canonicalFiles', 'evidence'],
  shadow_mode: ['canonicalFiles', 'evidence', 'shadowComparison', 'observability'],
  limited_release: [
    'canonicalFiles',
    'evidence',
    'shadowComparison',
    'observability',
    'owner',
    'audience',
    'rollback',
    'monitoredResults',
  ],
  production: [
    'canonicalFiles',
    'evidence',
    'shadowComparison',
    'observability',
    'owner',
    'audience',
    'rollback',
    'monitoredResults',
    'deployedSha',
    'productionProbe',
    'rollbackProof',
  ],
  degraded: ['previouslyProduction', 'issue', 'measuredImpairment'],
};

/** Every field an `evidence` record must carry. None may be empty. */
export const EVIDENCE_FIELDS = [
  'command',
  'resultArtifact',
  'exitCode',
  'testedAt',
  'targetSha',
  'proves',
  'doesNotProve',
];

export const meta = {
  version: 2,
  generatedBy: 'hand-seeded 2026-07-27; evidence captured at PR #579 head',
  baselineCommit: '6d2518b829c45f018337120c41811e4bdf11f7fa',
  baselineBranch: 'docs/unified-ai-master-plan-2026-07-27',
  measurementBaseline: {
    commit: '262b6693',
    branch: 'fix/neon-write-amp-phase2a-media-reconcile-2026-07-26',
    note:
      'Repository counts in the gap analysis (77 models, 288 routes, ...) were ' +
      'measured here. Capability evidence below was captured at baselineCommit.',
  },
  baselineNote:
    'Dated evidence per correction C-7. Expected to go stale. Re-measure before citing.',
};

/**
 * §22 programs.
 * NOTE the property is `assessment`, not `status` — see PROGRAM_ASSESSMENTS.
 */
export const programs = [
  { id: 'P0', name: 'Adopt and reconcile the authority', assessment: 'designed', evidence: 'gap-analysis §3' },
  { id: 'P1', name: 'Provider and policy adaptability', assessment: 'partial', evidence: 'gap-analysis §2.2, §2.3' },
  { id: 'P2', name: 'Canonical graph and identity', assessment: 'partial', evidence: 'gap-analysis §2.4', blockedBy: 'C-3' },
  { id: 'P3', name: 'Canonical search runtime', assessment: 'implemented', evidence: 'gap-analysis §3; docs/evidence/capability-evidence-2026-07-27.md E-1' },
  { id: 'P4', name: 'Events, workflows, artifacts, approvals', assessment: 'not_started', evidence: 'gap-analysis §2.1', blockedBy: 'C-3' },
  { id: 'P5', name: 'Public growth system', assessment: 'partial', evidence: 'gap-analysis §3' },
  { id: 'P6', name: 'Agent service system', assessment: 'partial', evidence: 'gap-analysis §3' },
  { id: 'P7', name: 'Client portals', assessment: 'shell', evidence: 'gap-analysis §3' },
  { id: 'P8', name: 'Broker operating system', assessment: 'discovered', evidence: 'gap-analysis §3' },
  { id: 'P9', name: 'Transactions and after-close', assessment: 'partial', evidence: 'gap-analysis §3' },
  { id: 'P10', name: 'Advanced intelligence', assessment: 'partial', evidence: 'gap-analysis §3' },
  { id: 'P11', name: 'Decommissioning and consolidation', assessment: 'discovered', evidence: 'master plan §26 C-4' },
];

/**
 * Capabilities.
 * Seeded from what the 2026-07-27 gap analysis measured, with promotion evidence
 * captured at meta.baselineCommit. INTENTIONALLY INCOMPLETE — see `coverage`.
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
    evidence: {
      command: 'npx jest --config lib/search/jest.config.js --ci',
      resultArtifact: 'docs/evidence/capability-evidence-2026-07-27.md#e-1--libsearch-suite',
      exitCode: 0,
      testedAt: '2026-07-27',
      targetSha: '6d2518b829c45f018337120c41811e4bdf11f7fa',
      proves:
        '23 suites / 625 tests pass: canonical + visibility contracts, access decision, ' +
        'criteria-to-Prisma translation, public DTO (DB and Trestle paths), projection ' +
        'write suppression, natural-language parsing.',
      doesNotProve:
        'That search returns correct results against live Cotality; that production totals ' +
        'or pagination are truthful under load; that any deployed surface uses these modules; ' +
        'or that the assertions encode correct REBNY semantics.',
    },
    observability: 'unverified',
    rollback: 'unverified',
    notes:
      'Strongest measured area. NOT promoted beyond `implemented`: no shadow comparison, no ' +
      'production probe, no rollback proof. A passing unit suite is not a production claim.',
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
    evidence: {
      command: 'npx jest --config lib/idx/jest.config.js --ci',
      resultArtifact: 'docs/evidence/capability-evidence-2026-07-27.md#e-2--libidx-suite',
      exitCode: 0,
      testedAt: '2026-07-27',
      targetSha: '6d2518b829c45f018337120c41811e4bdf11f7fa',
      proves:
        '39 suites / 784 tests pass: auth, fetch, field mapping, normalization, media sync and ' +
        'cursor telemetry, write suppression, DTO construction.',
      doesNotProve:
        'That any field is live or populated on Cotality today; that mapping matches current ' +
        'Trestle $metadata; that a live fetch succeeds; or that production sync is healthy. ' +
        'NO LIVE COTALITY CALL WAS MADE. Those are Class-B claims per CLAUDE.md §J.4.',
    },
    observability: 'lib/idx/cotality-telemetry.ts',
    rollback: 'unverified',
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
    tests: ['lib/compliance/__tests__/'],
    evidence: {
      command: 'npx jest --config lib/compliance/jest.config.js --ci',
      resultArtifact: 'docs/evidence/capability-evidence-2026-07-27.md#e-3--libcompliance-suite',
      exitCode: 0,
      testedAt: '2026-07-27',
      targetSha: '6d2518b829c45f018337120c41811e4bdf11f7fa',
      proves:
        '14 suites / 381 tests pass: IDX display gate, RLS eligibility and enforcement, status ' +
        'normalization including terminal statuses, auction banner and DTO handling, agent-info mapping.',
      doesNotProve:
        'That any disclosure actually RENDERS on a production page. That is the exact 2026-05-20 ' +
        'FARE Act failure: source and unit evidence passed while the production conditional did ' +
        'not render. Rendering claims require a live URL probe. Also does not prove the four ' +
        'validator suites (ucba:audit, rls:validate, idx:validate, compliance-check) pass — ' +
        'none were run.',
    },
    observability: 'unverified',
    rollback: 'unverified',
    gaps: [
      'code-shaped, not data-shaped: no §6.1 versioned policy registry',
      'no contract_version / policy_version stamping anywhere in schema',
      'effective-date behavior (§6.4) unimplementable without version stamping',
    ],
  },

  // --- media split (review item 3) ------------------------------------------
  // Previously one capability claiming `implemented` while its own notes said the
  // AI-provenance half was unverified. A capability may not be promoted on half
  // its stated scope.

  {
    id: 'CAP-MEDIA-SYNC',
    name: 'Media synchronization and reconciliation',
    program: 'P1',
    planRef: '§15.1',
    owner: 'unassigned',
    status: 'implemented',
    canonicalFiles: ['lib/idx/media-sync.ts', 'lib/idx/media-sync-member.ts', 'lib/idx/watermark.ts'],
    tests: ['lib/idx/__tests__/'],
    evidence: {
      command: 'npx jest --config lib/idx/jest.config.js --ci',
      resultArtifact: 'docs/evidence/capability-evidence-2026-07-27.md#e-2--libidx-suite',
      exitCode: 0,
      testedAt: '2026-07-27',
      targetSha: '6d2518b829c45f018337120c41811e4bdf11f7fa',
      proves:
        'Media sync, ordering, cursor telemetry, and write-cause accumulation behave as asserted ' +
        'within the 39-suite lib/idx run.',
      doesNotProve:
        'That production media is correct or complete; that hero-image selection is valid on any ' +
        'live listing; or anything about AI-modification provenance (see CAP-MEDIA-AI-PROVENANCE).',
    },
    observability: 'unverified',
    rollback: 'unverified',
    notes:
      'Declared paths are only those existing at targetSha. media-reconcile-guard.ts and ' +
      'media-set-hash.ts are NOT declared here: they are unpushed on ' +
      'fix/neon-write-amp-phase2a-media-reconcile-2026-07-26. Add them when that branch lands, ' +
      'with fresh evidence — not before.',
  },

  {
    id: 'CAP-MEDIA-AI-PROVENANCE',
    name: 'AI-modified media provenance envelope',
    program: 'P1',
    planRef: '§15.1, §17.5, §26 C-6',
    owner: 'unassigned',
    status: 'discovered',
    canonicalFiles: [],
    tests: [],
    observability: 'unverified',
    rollback: 'unverified',
    requiredScope: [
      'original asset retained',
      'derived analysis',
      'edited version',
      'edit type',
      'provider / model attribution',
      'edit date',
      'disclosure',
      'approval',
      'publication history',
      'withdrawal status',
    ],
    negativeEvidence: {
      command:
        'grep -rilE "editType|edit_type|virtualStaging|virtual_staging|aiModified|ai_modified|disclosureRequired" lib/idx/ lib/media/',
      resultArtifact:
        'docs/evidence/capability-evidence-2026-07-27.md#e-4--media-ai-provenance-fields-are-absent-negative-evidence',
      exitCode: 0,
      testedAt: '2026-07-27',
      targetSha: '6d2518b829c45f018337120c41811e4bdf11f7fa',
      proves:
        'No AI-modification edit type, virtual-staging marker, provider/model attribution, or ' +
        'disclosure field exists under lib/idx/ or lib/media/ at this commit.',
      doesNotProve:
        'That no equivalent exists elsewhere in the repo under a different name. Two directories, ' +
        'one pattern set.',
    },
    policyWatch: [
      {
        id: 'NYC-DCWP-AI-MEDIA-DISCLOSURE',
        review_status: 'monitoring',
        enforcement_mode: 'none',
        effective_date: null,
        note:
          'PROPOSED DCWP rulemaking, NOT enacted. No Local Law number, no Intro number, no rule ' +
          'citation. Official NYC.gov source returned HTTP 403 and was NOT read. Do not implement ' +
          'a disclosure gate against this. Promotion requires a dated official source per ' +
          'CLAUDE.md §E and §J.4.',
      },
    ],
    notes:
      'C-6 ratified: build this envelope on EXISTING REBNY/RLS media obligations, independent of ' +
      'the DCWP proposal. Status is `discovered` on negative evidence — zero of the ten required ' +
      'scope items is implemented.',
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
    blockedBy: 'C-3',
    notes:
      'Measured at zero: grep -ril "outbox" over lib app prisma scripts -> 0 files. C-1 ratified: ' +
      'audit_events is a SEPARATE system and must not be widened into an event bus.',
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
    blockedBy: 'C-3',
    notes:
      'The 23 cron routes under app/api/cron/ are a SCHEDULER, not a workflow engine. They cannot ' +
      'pause, resume, await approval, compensate, or partially regenerate. Do not record them as ' +
      'satisfying this capability.',
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
    notes:
      'CanonicalProperty / CanonicalBuilding / CanonicalUnit / ListingIdentity / IdentityMatchAudit / ' +
      'IdentityReviewQueue are DECLARED in schema. `contracted`, not `implemented`: no dedicated ' +
      'test path was identified and no evidence record exists. Declaration is not implementation.',
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
    blockedBy: 'C-3',
    notes:
      'grep "model Person|model Household|model Organization" -> NONE. §7.3 Organization is the most ' +
      'consequential omission: NYC transactions run through LLCs, trusts, estates, boards, managing ' +
      'agents, and law firms. OPEN QUESTION (untested): does model Lead currently key on email? ' +
      '§7.1 warns against email-only identity.',
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
    notes:
      'Measured: 2 .tsx files per role against 40 backing API routes. Backend ahead of frontend. ' +
      '`designed`, not `implemented`: no wired loop demonstrated and no evidence record.',
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
    'Hand-seeded from the capabilities the 2026-07-27 gap analysis actually measured. This is NOT ' +
    'a complete inventory of the platform. Producing the complete inventory is a Program 0 ' +
    'deliverable and is not yet done.',
  knownUnregisteredAreas: [
    'CRM (156 API routes under app/api/crm/)',
    'lead scoring, buyer intent, demand index, conviction, seller readiness',
    'notifications and unsubscribe',
    'documents and deals',
    'public growth journeys (§10)',
    'broker operating system (§14)',
  ],
  notRunDuringSeeding: [
    'npm run type-check',
    'npm run ucba:audit / rls:validate / idx:validate / compliance-check',
    'npm run test:rls',
    'npm run crm:test',
    'any live Cotality call',
    'any production or preview URL probe',
    'any Neon/production database query',
  ],
};

export default {
  STATUSES,
  PROGRAM_ASSESSMENTS,
  PROMOTION_PROOF,
  EVIDENCE_FIELDS,
  meta,
  programs,
  capabilities,
  coverage,
};
