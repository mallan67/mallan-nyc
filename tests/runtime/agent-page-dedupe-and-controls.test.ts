/// <reference types="jest" />
/**
 * Agent-page duplicate suppression (Task A) — a CRM/Mallan exclusive must
 * suppress its Trestle/IDX duplicate of the SAME physical unit, even when the
 * two rows spell the address differently ("East" vs "E", "Street" vs "St").
 *
 * Live bug reproduced: /agents/maya-allan showed TWO cards for the same unit —
 *   SL-0004        addr "333 East 46th Street #2G"  (CRM exclusive, 17 photos)
 *   RLS20093870    addr "333 E 46th Street #2G"     (IDX dup, 0 photos, placeholder)
 * because buildAddressKey did not canonicalize direction/suffix/ordinal, so the
 * keys differed and the prefer-CRM rule never fired.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildAddressKey,
  preferCrmExclusiveOverIdxDuplicate,
  type DedupeCandidate,
} from '../../lib/listings/dedupe-crm-vs-idx';

const SL = {
  id: 'SL-0004',
  address: { streetNumber: '333', streetDirPrefix: 'East', streetName: '46th Street', unitNumber: '2G', postalCode: '10017' },
};
const IDX = {
  id: 'RLS20093870',
  address: { streetNumber: '333', streetDirPrefix: 'E', streetName: '46th Street', unitNumber: '2G', postalCode: '10017' },
};

describe('Task A — address key canonicalizes so CRM + IDX duplicate collapse', () => {
  it('"333 East 46th Street #2G" and "333 E 46th Street #2G" produce the SAME key', () => {
    expect(buildAddressKey(SL.address)).toBe(buildAddressKey(IDX.address));
  });

  it('canonicalizes suffix + ordinal too (Street↔St, 46↔46th)', () => {
    const a = buildAddressKey({ streetNumber: '333', streetDirPrefix: 'East', streetName: '46 St', unitNumber: '2G', postalCode: '10017' });
    const b = buildAddressKey({ streetNumber: '333', streetDirPrefix: 'E', streetName: '46th Street', unitNumber: '2G', postalCode: '10017' });
    expect(a).toBe(b);
  });

  it('still requires a UnitNumber on both sides (cannot prove same physical unit otherwise)', () => {
    expect(buildAddressKey({ streetNumber: '333', streetName: '46th Street', postalCode: '10017' })).toBeNull();
  });
});

describe('Task A — preferCrmExclusiveOverIdxDuplicate suppresses the IDX duplicate', () => {
  it('keeps ONLY the CRM exclusive (SL-) when an IDX dup of the same unit is present', () => {
    const out = preferCrmExclusiveOverIdxDuplicate<DedupeCandidate>([SL, IDX]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('SL-0004');
  });

  it('order-independent: IDX first, CRM second → still keeps only the CRM row', () => {
    const out = preferCrmExclusiveOverIdxDuplicate<DedupeCandidate>([IDX, SL]);
    expect(out.map((r) => r.id)).toEqual(['SL-0004']);
  });

  it('does NOT collapse two genuinely different units in the same building', () => {
    const other = { id: 'RLS999', address: { ...IDX.address, unitNumber: '9C' } };
    const out = preferCrmExclusiveOverIdxDuplicate<DedupeCandidate>([SL, other]);
    expect(out).toHaveLength(2);
  });

  it('third-party-only group (no SL-/RL-) is never collapsed — both IDX rows kept', () => {
    const idxA = { id: 'RLS111', address: { streetNumber: '1', streetDirPrefix: 'E', streetName: '5th Ave', unitNumber: '1A', postalCode: '10003' } };
    const idxB = { id: 'RLS222', address: { streetNumber: '1', streetDirPrefix: 'East', streetName: '5th Avenue', unitNumber: '1A', postalCode: '10003' } };
    const out = preferCrmExclusiveOverIdxDuplicate<DedupeCandidate>([idxA, idxB]);
    expect(out).toHaveLength(2); // both kept — no Mallan exclusive to prefer
  });

  it('is generic — works for an RL- exclusive too, not just SL-', () => {
    const rl = { id: 'RL-0042', address: { ...SL.address } };
    const out = preferCrmExclusiveOverIdxDuplicate<DedupeCandidate>([rl, IDX]);
    expect(out.map((r) => r.id)).toEqual(['RL-0042']);
  });
});

describe('Task B — set-listing-primary-photo ops script only mutates CRM media (Codex review)', () => {
  const script = readFileSync(resolve(__dirname, '../../scripts/ops/set-listing-primary-photo.mjs'), 'utf8');
  it('rejects mixed-media listings before any write (no mutating read-only Trestle/RLS rows)', () => {
    expect(script).toMatch(/non-CRM \(Trestle\/RLS\) active photo/);
    expect(script).toMatch(/refusing to renumber\/clear them/);
    // the guard runs before the $transaction write
    const guardIdx = script.indexOf('refusing to renumber');
    const txIdx = script.indexOf('$transaction');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(txIdx).toBeGreaterThan(guardIdx);
  });
});

describe('Task B — agent route uses RESOLVED media (hero-first), consistent with Featured/detail', () => {
  const route = readFileSync(resolve(__dirname, '../../app/api/agents/[slug]/listings/route.ts'), 'utf8');
  it('selects the relational listing_media table (active, ordered) so the hero matches other surfaces', () => {
    expect(route).toMatch(/listing_media:\s*\{[\s\S]*?where:\s*\{\s*status:\s*'active'\s*\}/);
    expect(route).toMatch(/orderBy:\s*\[\{\s*order:\s*'asc'\s*\}/);
    expect(route).toMatch(/preferred_photo_yn:\s*true/);
  });
});
