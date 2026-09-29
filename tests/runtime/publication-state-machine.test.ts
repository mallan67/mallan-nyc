/// <reference types="jest" />
/**
 * THE MALLAN PUBLICATION STATE MACHINE, AGAINST THE SPECIFICATION.
 *
 * The states, the canonical workflow, the visibility modes and the role
 * baselines asserted here are transcribed from the frontend↔backend conformance
 * specification, not reconstructed. Its two blocker clauses drive most of these
 * cases:
 *
 *   "If frontend shows statuses that backend cannot produce, or backend allows
 *    skipping steps (e.g., export before approval), FAIL (BLOCKER)."
 *
 *   "If permissions are not enforced server-side: FAIL (BLOCKER)."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A CORRECTION TO EARLIER WORK, RECORDED HERE ON PURPOSE
 *
 * The 2026-08-26 closure package listed "an AGENT, not only a BROKER, may
 * transition a Mallan-local listing Draft → Active" under *open, not decided*,
 * and called it "a product decision, not a defect".
 *
 * That was wrong against this source. Step 6 of the canonical workflow reads
 * "Broker chooses publishing scope", and the Agent baseline says an agent may
 * "not export to IDX/RLS/VOW or external channels without Broker approval".
 * Agent-publishes-directly is a SKIPPED STEP, which the spec marks a blocker.
 * The matrix below is the spec's, and it is enforced server-side.
 */
import {
  PUBLICATION_STATES,
  VISIBILITY_MODES,
  PUBLICATION_TRANSITIONS,
  applyPublicationTransition,
  initialPublication,
  readPublication,
  withPublication,
  isPubliclyPublished,
  lastPublishedAt,
  firstPublishedAt,
  PUBLICATION_NAMESPACE,
  type MallanPublication,
  type PublicationState,
  type PublicationActorRole,
} from '@/lib/crm/publication-state';

const NOW = '2026-08-27T12:00:00.000Z';

function at(state: PublicationState, extra: Partial<MallanPublication> = {}): MallanPublication {
  return { ...initialPublication(), state, ...extra } as MallanPublication;
}

function move(
  from: PublicationState,
  to: PublicationState,
  role: PublicationActorRole,
  extra: Record<string, unknown> = {},
) {
  return applyPublicationTransition(at(from), {
    to,
    role,
    actorId: 'actor-1',
    now: NOW,
    hasOwner: true,
    compliancePassed: true,
    ...extra,
  });
}

describe('the vocabulary is exactly the specification\'s', () => {
  it('eleven states, named and ordered as written', () => {
    expect([...PUBLICATION_STATES]).toEqual([
      'DRAFT',
      'SUBMITTED',
      'REVIEW_IN_PROGRESS',
      'REVISION_REQUESTED',
      'COMPLIANCE_CHECK',
      'APPROVED',
      'PUBLISHED_INTERNAL',
      'PUBLISHED_PUBLIC',
      'EXPORTED',
      'REJECTED',
      'ARCHIVED',
    ]);
  });

  it('four visibility modes, named as written', () => {
    expect([...VISIBILITY_MODES]).toEqual([
      'INTERNAL_ONLY',
      'PRIVATE_CLIENT',
      'PUBLIC_WEB',
      'DISTRIBUTION_ELIGIBLE',
    ]);
  });

  it('no Cotality market status leaked into the publication vocabulary', () => {
    // The two domains answer different questions. A provider value appearing
    // here would mean they had been merged again.
    for (const cotality of [
      'Active',
      'ActiveUnderContract',
      'Canceled',
      'Closed',
      'ComingSoon',
      'Delete',
      'Expired',
      'Hold',
      'Incomplete',
      'Pending',
      'Withdrawn',
    ]) {
      expect(PUBLICATION_STATES as readonly string[]).not.toContain(cotality);
    }
  });

  it('every state has a transition table entry', () => {
    for (const s of PUBLICATION_STATES) {
      expect(PUBLICATION_TRANSITIONS[s]).toBeDefined();
    }
  });
});

describe('the canonical workflow runs end to end', () => {
  it('DRAFT → SUBMITTED → REVIEW_IN_PROGRESS → COMPLIANCE_CHECK → APPROVED → PUBLISHED_PUBLIC', () => {
    // Steps 1-6 of the canonical workflow. Step 7 (EXPORTED) is deliberately
    // NOT in this walk: it asserts a real external delivery, and no authorized
    // exporter exists, so it is covered by its own describe block below rather
    // than being waved through here.
    const steps: Array<[PublicationState, PublicationState, PublicationActorRole]> = [
      ['DRAFT', 'SUBMITTED', 'AGENT'],
      ['SUBMITTED', 'REVIEW_IN_PROGRESS', 'BROKER'],
      ['REVIEW_IN_PROGRESS', 'COMPLIANCE_CHECK', 'AGENT'],
      ['COMPLIANCE_CHECK', 'APPROVED', 'BROKER'],
      ['APPROVED', 'PUBLISHED_PUBLIC', 'BROKER'],
    ];
    for (const [from, to, role] of steps) {
      const r = move(from, to, role);
      expect(r.ok).toBe(true);
    }
  });

  it('history accumulates rather than being rewritten', () => {
    let pub = initialPublication();
    for (const [to, role] of [
      ['SUBMITTED', 'AGENT'],
      ['REVIEW_IN_PROGRESS', 'BROKER'],
      ['COMPLIANCE_CHECK', 'BROKER'],
    ] as Array<[PublicationState, PublicationActorRole]>) {
      const r = applyPublicationTransition(pub, {
        to,
        role,
        actorId: 'a',
        now: NOW,
        hasOwner: true,
        compliancePassed: true,
      });
      expect(r.ok).toBe(true);
      if (r.ok) pub = r.publication;
    }
    expect(pub.history.map((h) => h.to)).toEqual([
      'SUBMITTED',
      'REVIEW_IN_PROGRESS',
      'COMPLIANCE_CHECK',
    ]);
  });
});

describe('steps cannot be skipped — the spec calls this a BLOCKER', () => {
  it.each([
    ['DRAFT', 'APPROVED'],
    ['DRAFT', 'PUBLISHED_PUBLIC'],
    ['DRAFT', 'EXPORTED'],
    ['SUBMITTED', 'APPROVED'],
    ['SUBMITTED', 'PUBLISHED_PUBLIC'],
    ['REVIEW_IN_PROGRESS', 'APPROVED'],
    ['REVIEW_IN_PROGRESS', 'PUBLISHED_PUBLIC'],
    ['COMPLIANCE_CHECK', 'PUBLISHED_PUBLIC'],
    ['COMPLIANCE_CHECK', 'EXPORTED'],
    ['APPROVED', 'EXPORTED'],
  ] as Array<[PublicationState, PublicationState]>)(
    '%s → %s is refused even for a BROKER',
    (from, to) => {
      const r = move(from, to, 'BROKER');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('TRANSITION_NOT_ALLOWED');
    },
  );

  it('export before approval is impossible from every pre-published state', () => {
    // The spec's own worked example of a blocker.
    for (const from of PUBLICATION_STATES) {
      if (from === 'PUBLISHED_PUBLIC') continue;
      const r = move(from, 'EXPORTED', 'BROKER');
      expect(r.ok).toBe(false);
    }
  });
});

describe('the role matrix is enforced server-side', () => {
  it.each([
    ['COMPLIANCE_CHECK', 'APPROVED'],
    ['APPROVED', 'PUBLISHED_INTERNAL'],
    ['APPROVED', 'PUBLISHED_PUBLIC'],
    ['PUBLISHED_INTERNAL', 'PUBLISHED_PUBLIC'],
    ['PUBLISHED_PUBLIC', 'EXPORTED'],
  ] as Array<[PublicationState, PublicationState]>)(
    'an AGENT cannot perform %s → %s',
    (from, to) => {
      // "Broker chooses publishing scope"; an agent may not export without
      // broker approval. This is the correction to the earlier closure package.
      const r = move(from, to, 'AGENT');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('ACTOR_NOT_PERMITTED');
    },
  );

  it('but a BROKER can perform all of them', () => {
    for (const [from, to] of [
      ['COMPLIANCE_CHECK', 'APPROVED'],
      ['APPROVED', 'PUBLISHED_INTERNAL'],
      ['APPROVED', 'PUBLISHED_PUBLIC'],
      ['PUBLISHED_INTERNAL', 'PUBLISHED_PUBLIC'],
    ] as Array<[PublicationState, PublicationState]>) {
      expect(move(from, to, 'BROKER').ok).toBe(true);
    }
  });

  it('EXPORTED is refused for the AGENT on ROLE grounds, before evidence is even considered', () => {
    // Ordering matters: an agent must be told they lack authority, not that the
    // exporter is unavailable — otherwise fixing the exporter would silently
    // grant them the step.
    const r = move('PUBLISHED_PUBLIC', 'EXPORTED', 'AGENT', {
      deliveryEvidence: {
        channel: 'c',
        deliveredAt: '2026-08-27T12:00:00.000Z',
        acknowledgementRef: 'ACK',
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ACTOR_NOT_PERMITTED');
  });

  it('an AGENT can still do the work the spec gives them', () => {
    // Create/edit and move a listing through review — just not approve or publish.
    expect(move('DRAFT', 'SUBMITTED', 'AGENT').ok).toBe(true);
    expect(move('SUBMITTED', 'REVIEW_IN_PROGRESS', 'AGENT').ok).toBe(true);
    expect(move('REVIEW_IN_PROGRESS', 'COMPLIANCE_CHECK', 'AGENT').ok).toBe(true);
    expect(move('REVIEW_IN_PROGRESS', 'REVISION_REQUESTED', 'AGENT').ok).toBe(true);
  });
});

describe('an OWNER can submit, and can never publish', () => {
  it('may submit their own intake', () => {
    // "Submit listing intake form" is a Seller/Landlord baseline permission.
    expect(move('DRAFT', 'SUBMITTED', 'OWNER').ok).toBe(true);
  });

  it('may resubmit after a revision request', () => {
    // "See review status + requested changes" exists so they can act on them.
    expect(move('REVISION_REQUESTED', 'SUBMITTED', 'OWNER').ok).toBe(true);
  });

  it.each([
    ['COMPLIANCE_CHECK', 'APPROVED'],
    ['APPROVED', 'PUBLISHED_INTERNAL'],
    ['APPROVED', 'PUBLISHED_PUBLIC'],
    ['PUBLISHED_PUBLIC', 'EXPORTED'],
    ['SUBMITTED', 'REVIEW_IN_PROGRESS'],
  ] as Array<[PublicationState, PublicationState]>)(
    'is refused %s → %s',
    (from, to) => {
      // "Cannot publish or export" — stated flatly in the spec.
      const r = move(from, to, 'OWNER');
      expect(r.ok).toBe(false);
    },
  );

  it('cannot reach ANY public state from anywhere', () => {
    for (const from of PUBLICATION_STATES) {
      for (const to of ['PUBLISHED_PUBLIC', 'EXPORTED'] as PublicationState[]) {
        expect(move(from, to, 'OWNER').ok).toBe(false);
      }
    }
  });
});

describe('preconditions', () => {
  it('publication requires a passing compliance evaluation', () => {
    const r = move('APPROVED', 'PUBLISHED_PUBLIC', 'BROKER', { compliancePassed: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('COMPLIANCE_NOT_PASSED');
  });

  it('an absent compliance result is not a pass', () => {
    // Fail-closed: "we did not check" must not read as "it passed".
    const r = move('APPROVED', 'PUBLISHED_PUBLIC', 'BROKER', { compliancePassed: undefined });
    expect(r.ok).toBe(false);
  });

  it('publication requires a canonical owner', () => {
    const r = move('APPROVED', 'PUBLISHED_PUBLIC', 'BROKER', { hasOwner: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('OWNER_REQUIRED');
  });

  it('an ownerless listing cannot even be submitted', () => {
    const r = move('DRAFT', 'SUBMITTED', 'AGENT', { hasOwner: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('OWNER_REQUIRED');
  });
});

describe('visibility is constrained by state', () => {
  it('a pre-publication state is INTERNAL_ONLY', () => {
    const r = move('DRAFT', 'SUBMITTED', 'AGENT');
    expect(r.ok && r.visibility).toBe('INTERNAL_ONLY');
  });

  it('PUBLISHED_INTERNAL may be narrowed to PRIVATE_CLIENT', () => {
    const r = move('APPROVED', 'PUBLISHED_INTERNAL', 'BROKER', { visibility: 'PRIVATE_CLIENT' });
    expect(r.ok && r.visibility).toBe('PRIVATE_CLIENT');
  });

  it('PUBLISHED_INTERNAL cannot be PUBLIC_WEB', () => {
    // Otherwise "internal only" would be a label with no effect.
    const r = move('APPROVED', 'PUBLISHED_INTERNAL', 'BROKER', { visibility: 'PUBLIC_WEB' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('VISIBILITY_NOT_ALLOWED');
  });

  it('only EXPORTED is DISTRIBUTION_ELIGIBLE', () => {
    for (const from of PUBLICATION_STATES) {
      for (const rule of PUBLICATION_TRANSITIONS[from]) {
        if (rule.to === 'EXPORTED') continue;
        const r = move(from, rule.to, 'BROKER', { visibility: 'DISTRIBUTION_ELIGIBLE' });
        expect(r.ok).toBe(false);
      }
    }
  });
});

describe('reading an unreadable record fails closed', () => {
  it.each([
    ['null compliance', null],
    ['an array', []],
    ['a string', 'nope'],
    ['no namespace', { other: 1 }],
    ['an unknown state', { [PUBLICATION_NAMESPACE]: { state: 'PUBLISHED_EVERYWHERE' } }],
    ['a missing state', { [PUBLICATION_NAMESPACE]: { visibility: 'PUBLIC_WEB' } }],
  ])('%s reads as an unpublished DRAFT', (_label, compliance) => {
    const pub = readPublication(compliance);
    expect(pub.state).toBe('DRAFT');
    expect(pub.visibility).toBe('INTERNAL_ONLY');
    expect(isPubliclyPublished(pub)).toBe(false);
  });

  it('a visibility the state does not permit is corrected downward, never up', () => {
    // A row claiming DRAFT + PUBLIC_WEB must not be treated as public.
    const pub = readPublication({
      [PUBLICATION_NAMESPACE]: { state: 'DRAFT', visibility: 'PUBLIC_WEB' },
    });
    expect(pub.visibility).toBe('INTERNAL_ONLY');
    expect(isPubliclyPublished(pub)).toBe(false);
  });

  it('every existing listing reads as DRAFT without any backfill', () => {
    // No migration, no backfill: a row that predates this feature has no
    // namespace, and the fail-closed reading is the correct one for it.
    expect(readPublication({}).state).toBe('DRAFT');
    expect(readPublication({ validation_result: {}, valid: true }).state).toBe('DRAFT');
  });
});

describe('a public state must be CORROBORATED, not merely asserted', () => {
  it.each(['PUBLISHED_PUBLIC', 'EXPORTED'] as PublicationState[])(
    'a bare {state:"%s"} blob reads back as DRAFT',
    (state) => {
      // Validating the state STRING alone was not enough: anything able to write
      // this JSON column could publish a listing by naming a word. A public state
      // is always REACHED — the transition stamps a timestamp and appends
      // history — so a claim carrying neither is not a record of anything.
      const pub = readPublication({ [PUBLICATION_NAMESPACE]: { state } });
      expect(pub.state).toBe('DRAFT');
      expect(isPubliclyPublished(pub)).toBe(false);
    },
  );

  it('a timestamp alone is enough corroboration', () => {
    const pub = readPublication({
      [PUBLICATION_NAMESPACE]: {
        state: 'PUBLISHED_PUBLIC',
        visibility: 'PUBLIC_WEB',
        published_public_at: NOW,
      },
    });
    expect(pub.state).toBe('PUBLISHED_PUBLIC');
    expect(isPubliclyPublished(pub)).toBe(true);
  });

  it('history alone is enough corroboration', () => {
    const pub = readPublication({
      [PUBLICATION_NAMESPACE]: {
        state: 'PUBLISHED_PUBLIC',
        visibility: 'PUBLIC_WEB',
        history: [{ from: 'APPROVED', to: 'PUBLISHED_PUBLIC', at: NOW, by: 'b', role: 'BROKER' }],
      },
    });
    expect(pub.state).toBe('PUBLISHED_PUBLIC');
  });

  it('a NON-public state is left alone even without corroboration', () => {
    // Demoting an under-corroborated DRAFT would invent a different lie.
    expect(readPublication({ [PUBLICATION_NAMESPACE]: { state: 'APPROVED' } }).state).toBe(
      'APPROVED',
    );
  });

  it('a raw key cannot overwrite the validated state', () => {
    // The spread runs BEFORE the validated fields are assigned.
    const pub = readPublication({
      [PUBLICATION_NAMESPACE]: { state: 'DRAFT', visibility: 'PUBLIC_WEB', history: 'not-an-array' },
    });
    expect(pub.state).toBe('DRAFT');
    expect(pub.visibility).toBe('INTERNAL_ONLY');
    expect(Array.isArray(pub.history)).toBe(true);
  });
});

describe('delivery evidence is RECORDED, not just checked', () => {
  const EVIDENCE = {
    channel: 'some-authorized-channel',
    deliveredAt: '2026-08-20T09:00:00.000Z',
    acknowledgementRef: 'ACK-1',
  };

  it('the evidence is persisted on the record', () => {
    const r = move('PUBLISHED_PUBLIC', 'EXPORTED', 'BROKER', { deliveryEvidence: EVIDENCE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.publication.delivery_evidence).toEqual(EVIDENCE);
  });

  it('exported_at is the DELIVERY time, not the click time', () => {
    // A state justified by external evidence must record that evidence's clock.
    const r = move('PUBLISHED_PUBLIC', 'EXPORTED', 'BROKER', { deliveryEvidence: EVIDENCE });
    expect(r.ok && r.publication.exported_at).toBe(EVIDENCE.deliveredAt);
    expect(r.ok && r.publication.exported_at).not.toBe(NOW);
  });

  it('and it reaches the audit payload', () => {
    const r = move('PUBLISHED_PUBLIC', 'EXPORTED', 'BROKER', { deliveryEvidence: EVIDENCE });
    expect(r.ok && r.audit.delivery_evidence).toEqual(EVIDENCE);
  });
});

describe('lastPublishedAt reads HISTORY first', () => {
  it('history wins over a stale cached field', () => {
    // The cached field is a convenience that can be stale or written by an older
    // version of this code. History is the append-only record of what happened.
    const pub: MallanPublication = {
      ...initialPublication(),
      state: 'PUBLISHED_PUBLIC',
      visibility: 'PUBLIC_WEB',
      published_public_at: '2020-01-01T00:00:00.000Z',
      history: [
        { from: 'APPROVED', to: 'PUBLISHED_PUBLIC', at: '2026-07-01T00:00:00.000Z', by: 'b', role: 'BROKER' },
      ],
    };
    expect(lastPublishedAt(pub)).toBe('2026-07-01T00:00:00.000Z');
  });

  it('the cached field is still a fallback for a record with no history', () => {
    const pub: MallanPublication = {
      ...initialPublication(),
      published_public_at: '2026-03-01T00:00:00.000Z',
    };
    expect(lastPublishedAt(pub)).toBe('2026-03-01T00:00:00.000Z');
  });
});

describe('the public predicate needs BOTH halves', () => {
  it.each(PUBLICATION_STATES)('%s + INTERNAL_ONLY is not public', (state) => {
    expect(isPubliclyPublished({ ...initialPublication(), state, visibility: 'INTERNAL_ONLY' })).toBe(
      false,
    );
  });

  it('only PUBLISHED_PUBLIC and EXPORTED are public', () => {
    const publicOnes = PUBLICATION_STATES.filter((s) =>
      isPubliclyPublished({
        ...initialPublication(),
        state: s,
        visibility: s === 'EXPORTED' ? 'DISTRIBUTION_ELIGIBLE' : 'PUBLIC_WEB',
      }),
    );
    expect(publicOnes).toEqual(['PUBLISHED_PUBLIC', 'EXPORTED']);
  });
});

describe('EXPORTED cannot be fabricated', () => {
  it('a BROKER with approval and public visibility still cannot claim it', () => {
    // EXPORTED asserts that a listing left this system and an external party
    // accepted it. Mallan has no authorized outbound exporter and no delivery
    // acknowledgement channel, and external distribution is held. Approval is
    // not delivery; public visibility is not delivery.
    const r = move('PUBLISHED_PUBLIC', 'EXPORTED', 'BROKER');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('EXPORT_DELIVERY_UNAVAILABLE');
  });

  it.each([
    ['no channel', { channel: '', deliveredAt: '2026-08-27', acknowledgementRef: 'ack' }],
    ['no timestamp', { channel: 'x', deliveredAt: '', acknowledgementRef: 'ack' }],
    ['no acknowledgement', { channel: 'x', deliveredAt: '2026-08-27', acknowledgementRef: '' }],
    ['whitespace only', { channel: ' ', deliveredAt: ' ', acknowledgementRef: ' ' }],
    ['null evidence', null],
  ])('partial evidence (%s) is not evidence', (_label, deliveryEvidence) => {
    // A half-filled record would let a caller manufacture the state with a
    // placeholder, which is the same fabrication in a different shape.
    const r = move('PUBLISHED_PUBLIC', 'EXPORTED', 'BROKER', { deliveryEvidence });
    expect(r.ok).toBe(false);
  });

  it('complete delivery evidence WOULD be accepted — the gate is evidence, not a ban', () => {
    // The model keeps EXPORTED reachable so that a future authorized exporter
    // can record a real delivery. What is refused is claiming it without one.
    const r = move('PUBLISHED_PUBLIC', 'EXPORTED', 'BROKER', {
      deliveryEvidence: {
        channel: 'some-authorized-channel',
        deliveredAt: '2026-08-27T12:00:00.000Z',
        acknowledgementRef: 'ACK-1',
      },
    });
    expect(r.ok).toBe(true);
  });

  it('nothing in the current runtime can supply that evidence', () => {
    // Stated as a fact about the repo, not an assumption: there is no exporter
    // and no acknowledgement reader, so the accepting branch above is
    // unreachable in production today.
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    const hits = execFileSync(
      'git',
      ['grep', '-l', '-E', 'deliveryEvidence|acknowledgementRef', '--', 'app', 'lib', 'scripts'],
      { cwd: require('path').resolve(__dirname, '../..'), encoding: 'utf8' },
    ).split(/\r?\n/).filter(Boolean);
    // The state module DEFINES it; the publication route explicitly passes
    // null. Nothing else may mention it at all, and crucially nothing SUPPLIES
    // a value — asserted below.
    expect(hits.sort()).toEqual([
      'app/api/crm/listings/[id]/publication/route.ts',
      'lib/crm/publication-state.ts',
    ]);

    // The route hard-codes null rather than accepting evidence from the client.
    // A caller must never be able to assert delivery on the exporter's behalf.
    const routeSrc = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../app/api/crm/listings/[id]/publication/route.ts'),
      'utf8',
    ) as string;
    expect(routeSrc).toMatch(/deliveryEvidence:\s*null/);
    expect(routeSrc).not.toMatch(/deliveryEvidence:\s*body\./);
  });
});

describe('"Last Published" means the LATEST publication, not the first', () => {
  it('a republished listing reports the LATER date', () => {
    // The defect this replaces: the fallback used history.find(...), which
    // returns the FIRST match, so a listing published in March, withdrawn, and
    // republished in July would have reported March forever.
    const pub: MallanPublication = {
      ...initialPublication(),
      state: 'PUBLISHED_PUBLIC',
      visibility: 'PUBLIC_WEB',
      history: [
        { from: 'APPROVED', to: 'PUBLISHED_PUBLIC', at: '2026-03-01T00:00:00.000Z', by: 'b', role: 'BROKER' },
        { from: 'PUBLISHED_PUBLIC', to: 'REVISION_REQUESTED', at: '2026-04-01T00:00:00.000Z', by: 'b', role: 'BROKER' },
        { from: 'APPROVED', to: 'PUBLISHED_PUBLIC', at: '2026-07-01T00:00:00.000Z', by: 'b', role: 'BROKER' },
      ],
    };
    expect(lastPublishedAt(pub)).toBe('2026-07-01T00:00:00.000Z');
    expect(firstPublishedAt(pub)).toBe('2026-03-01T00:00:00.000Z');
  });

  it('the two are genuinely different functions', () => {
    // Guard the guard: if they ever returned the same thing, the case above
    // would pass by accident.
    const pub: MallanPublication = {
      ...initialPublication(),
      history: [
        { from: 'APPROVED', to: 'PUBLISHED_PUBLIC', at: '2026-01-01T00:00:00.000Z', by: 'b', role: 'BROKER' },
        { from: 'APPROVED', to: 'PUBLISHED_PUBLIC', at: '2026-02-01T00:00:00.000Z', by: 'b', role: 'BROKER' },
      ],
    };
    expect(lastPublishedAt(pub)).not.toBe(firstPublishedAt(pub));
  });
});

describe('the publication timestamp is a Mallan fact', () => {
  it('is null until the listing is actually published', () => {
    expect(lastPublishedAt(initialPublication())).toBeNull();
    expect(lastPublishedAt(at('APPROVED'))).toBeNull();
  });

  it('is the moment PUBLISHED_PUBLIC was entered', () => {
    const r = move('APPROVED', 'PUBLISHED_PUBLIC', 'BROKER');
    expect(r.ok && lastPublishedAt(r.publication)).toBe(NOW);
  });

  it('survives a later withdrawal', () => {
    // Publication history is evidence. Pulling a listing back does not unmake
    // the fact that it was published, and the current state is reported
    // separately so the UI can be truthful about both.
    const published = move('APPROVED', 'PUBLISHED_PUBLIC', 'BROKER');
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    const withdrawn = applyPublicationTransition(published.publication, {
      to: 'REVISION_REQUESTED',
      role: 'BROKER',
      actorId: 'b',
      now: '2026-09-01T00:00:00.000Z',
      hasOwner: true,
    });
    expect(withdrawn.ok).toBe(true);
    if (!withdrawn.ok) return;
    expect(withdrawn.publication.state).toBe('REVISION_REQUESTED');
    expect(isPubliclyPublished(withdrawn.publication)).toBe(false);
    expect(lastPublishedAt(withdrawn.publication)).toBe(NOW);
  });

  it('records the approving and publishing actors', () => {
    const approved = applyPublicationTransition(at('COMPLIANCE_CHECK'), {
      to: 'APPROVED',
      role: 'BROKER',
      actorId: 'broker-9',
      now: NOW,
      hasOwner: true,
      compliancePassed: true,
    });
    expect(approved.ok && approved.publication.approved_by).toBe('broker-9');
    expect(approved.ok && approved.publication.approved_at).toBe(NOW);
  });
});

describe('storage preserves its siblings', () => {
  it('writing the namespace keeps other compliance keys', () => {
    const merged = withPublication(
      { validation_result: { a: 1 }, mallan_control_verification: { by: 'x' } },
      at('SUBMITTED'),
    );
    expect(merged.validation_result).toEqual({ a: 1 });
    expect(merged.mallan_control_verification).toEqual({ by: 'x' });
    expect((merged[PUBLICATION_NAMESPACE] as MallanPublication).state).toBe('SUBMITTED');
  });

  it('writing onto a non-object compliance value does not throw', () => {
    expect(() => withPublication(null, initialPublication())).not.toThrow();
    expect(() => withPublication('junk', initialPublication())).not.toThrow();
  });
});
