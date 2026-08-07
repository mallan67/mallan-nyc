/**
 * CAMPAIGN DISTRIBUTION GATE — prefix must never override an RLS display gate.
 *
 * THE DEFECT (app/api/crm/listing-campaigns/route.ts:195-207)
 * -----------------------------------------------------------
 *   const isCrmExclusive =
 *     listing_id.startsWith("SL-") || listing_id.startsWith("RL-");
 *   ...
 *   if (!isCrmExclusive) {
 *     if (!affirmPermission(row.idx_display_yn))                     block
 *     if (!affirmPermission(row.internet_entire_listing_display_yn)) block
 *   }
 *
 * An `SL-`/`RL-` prefix identifies PROVENANCE/OWNERSHIP CLASS. It is not
 * permission to ignore an RLS display restriction. An RLS-ELIGIBLE `SL-`/`RL-`
 * listing therefore skipped both IDX display gates entirely before distribution
 * — the identical "prefix as permission" fault already fixed for address
 * suppression in `lib/idx/db-to-public-dto.ts`.
 *
 * The route already selects `rls_eligible` (LISTING_SELECT:83), so the correct
 * decision boundary was available all along.
 *
 * CORRECT SEMANTICS
 * -----------------
 * WEBSITE-ONLY  (rls_eligible === false)
 *   not RLS redistribution inventory -> first-party campaign policy;
 *   still blocked by owner_opt_out / participant_only / terminal status.
 *
 * RLS-BACKED    (rls_eligible !== false) — INCLUDING RLS-eligible SL-/RL-
 *   must enforce idx_display_yn AND internet_entire_listing_display_yn,
 *   plus owner_opt_out / participant_only / terminal status.
 *
 * These are PURE gate tests: no email, no SendGrid, no lead mutation, no
 * AuditEvent, no live-send flag, no secrets.
 */

import fs from 'fs';
import path from 'path';
import {
  evaluateCampaignDistributionGate,
  type CampaignGateInput,
} from '../campaign-distribution-gate';

/** Baseline: everything permissive, so each test isolates ONE variable. */
const OK: CampaignGateInput = {
  listing_id: 'RLS20059088',
  rls_eligible: true,
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
  status: 'Active',
};

const gate = (over: Partial<CampaignGateInput>) =>
  evaluateCampaignDistributionGate({ ...OK, ...over });

describe('website-only inventory (rls_eligible === false)', () => {
  it('SL- website-only passes the RLS-redistribution portion even with IDX flags false', () => {
    const r = gate({
      listing_id: 'SL-0004',
      rls_eligible: false,
      idx_display_yn: false,
      internet_entire_listing_display_yn: false,
    });
    expect(r.blocks).not.toContain('idx_display_yn');
    expect(r.blocks).not.toContain('internet_entire_listing_display_yn');
    expect(r.allowed).toBe(true);
  });

  it('RL- website-only behaves identically', () => {
    const r = gate({
      listing_id: 'RL-0007',
      rls_eligible: false,
      idx_display_yn: false,
      internet_entire_listing_display_yn: false,
    });
    expect(r.allowed).toBe(true);
  });
});

describe('RLS-BACKED listings — the prefix must NOT bypass IDX gates', () => {
  it('RLS-eligible SL- with idx_display_yn=false is BLOCKED', () => {
    const r = gate({ listing_id: 'SL-0007', rls_eligible: true, idx_display_yn: false });
    expect(r.blocks).toContain('idx_display_yn');
    expect(r.allowed).toBe(false);
  });

  it('RLS-eligible SL- with internet_entire_listing_display_yn=false is BLOCKED', () => {
    const r = gate({
      listing_id: 'SL-0007',
      rls_eligible: true,
      internet_entire_listing_display_yn: false,
    });
    expect(r.blocks).toContain('internet_entire_listing_display_yn');
    expect(r.allowed).toBe(false);
  });

  it('RLS-eligible RL- with idx_display_yn=false is BLOCKED', () => {
    const r = gate({ listing_id: 'RL-0007', rls_eligible: true, idx_display_yn: false });
    expect(r.blocks).toContain('idx_display_yn');
    expect(r.allowed).toBe(false);
  });

  it('RLS-eligible RL- with internet_entire_listing_display_yn=false is BLOCKED', () => {
    const r = gate({
      listing_id: 'RL-0007',
      rls_eligible: true,
      internet_entire_listing_display_yn: false,
    });
    expect(r.blocks).toContain('internet_entire_listing_display_yn');
    expect(r.allowed).toBe(false);
  });

  it('normal third-party RLS with idx_display_yn=false is BLOCKED', () => {
    const r = gate({ idx_display_yn: false });
    expect(r.blocks).toContain('idx_display_yn');
    expect(r.allowed).toBe(false);
  });

  it('normal third-party RLS with internet_entire_listing_display_yn=false is BLOCKED', () => {
    const r = gate({ internet_entire_listing_display_yn: false });
    expect(r.blocks).toContain('internet_entire_listing_display_yn');
    expect(r.allowed).toBe(false);
  });
});

describe('fail-closed on missing RLS flags', () => {
  for (const missing of [null, undefined]) {
    it(`RLS-backed with idx_display_yn=${String(missing)} is BLOCKED`, () => {
      const r = gate({ listing_id: 'SL-0007', idx_display_yn: missing as null });
      expect(r.blocks).toContain('idx_display_yn');
      expect(r.allowed).toBe(false);
    });

    it(`RLS-backed with internet_entire_listing_display_yn=${String(missing)} is BLOCKED`, () => {
      const r = gate({
        listing_id: 'SL-0007',
        internet_entire_listing_display_yn: missing as null,
      });
      expect(r.blocks).toContain('internet_entire_listing_display_yn');
      expect(r.allowed).toBe(false);
    });
  }

  it('rls_eligible undefined is treated as RLS-BACKED (only an explicit false exempts)', () => {
    const r = gate({
      listing_id: 'SL-0007',
      rls_eligible: undefined,
      idx_display_yn: false,
    });
    expect(r.blocks).toContain('idx_display_yn');
  });
});

describe('gates that apply to EVERY class, website-only included', () => {
  const classes: Array<[string, Partial<CampaignGateInput>]> = [
    ['third-party RLS', {}],
    ['RLS-backed SL-', { listing_id: 'SL-0007', rls_eligible: true }],
    ['website-only SL-', { listing_id: 'SL-0004', rls_eligible: false }],
    ['website-only RL-', { listing_id: 'RL-0004', rls_eligible: false }],
  ];

  for (const [label, base] of classes) {
    it(`${label}: owner_opt_out=true is BLOCKED`, () => {
      const r = gate({ ...base, owner_opt_out: true });
      expect(r.blocks).toContain('owner_opt_out');
      expect(r.allowed).toBe(false);
    });

    it(`${label}: participant_only=true is BLOCKED`, () => {
      const r = gate({ ...base, participant_only: true });
      expect(r.blocks).toContain('participant_only');
      expect(r.allowed).toBe(false);
    });

    it(`${label}: a terminal status is BLOCKED`, () => {
      const r = gate({ ...base, status: 'Closed' });
      expect(r.blocks.some((b) => b.startsWith('terminal_status:'))).toBe(true);
      expect(r.allowed).toBe(false);
    });
  }
});

describe('the route no longer carries a prefix-based exception (source lock)', () => {
  // Line-ending agnostic: see tests/helpers/read-source.ts for why.
  const route = fs
    .readFileSync(
      path.join(process.cwd(), 'app', 'api', 'crm', 'listing-campaigns', 'route.ts'),
      'utf8',
    )
    .replace(/\r\n?/g, '\n');

  it('the isCrmExclusive prefix branch is GONE', () => {
    expect(route).not.toContain('if (!isCrmExclusive)');
    expect(route).not.toMatch(/const isCrmExclusive\s*=/);
  });

  it('no SL-/RL- prefix check remains in the route at all', () => {
    expect(route).not.toContain('startsWith("SL-")');
    expect(route).not.toContain("startsWith('SL-')");
    expect(route).not.toContain('startsWith("RL-")');
    expect(route).not.toContain("startsWith('RL-')");
  });

  it('the route consumes the canonical pure gate', () => {
    expect(route).toContain('evaluateCampaignDistributionGate');
    expect(route).toContain(
      "from \"@/lib/compliance/campaign-distribution-gate\"",
    );
  });

  it('the gate still receives rls_eligible — the real decision boundary', () => {
    expect(route).toMatch(/rls_eligible:\s*row\.rls_eligible/);
  });
});

describe('the core invariant', () => {
  it('a prefix ALONE never turns a negative RLS-backed gate into allowed', () => {
    for (const id of ['SL-0007', 'RL-0007', 'RLS20059088']) {
      expect(gate({ listing_id: id, rls_eligible: true, idx_display_yn: false }).allowed).toBe(false);
      expect(
        gate({ listing_id: id, rls_eligible: true, internet_entire_listing_display_yn: false })
          .allowed,
      ).toBe(false);
    }
  });

  it('a fully permissive RLS-backed listing is allowed with no blocks', () => {
    const r = gate({});
    expect(r.allowed).toBe(true);
    expect(r.blocks).toEqual([]);
  });

  it('multiple violations are all reported, not just the first', () => {
    const r = gate({ owner_opt_out: true, participant_only: true, idx_display_yn: false });
    expect(r.blocks).toEqual(
      expect.arrayContaining(['owner_opt_out', 'participant_only', 'idx_display_yn']),
    );
  });
});
