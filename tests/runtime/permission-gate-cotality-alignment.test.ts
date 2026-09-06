/// <reference types="jest" />
/**
 * A2 (Cotality-clean 2026-05-30) — `Permission` (singular) is the live Cotality
 * field (Multi.ListingPermission). `Permissions` (plural) is a legacy alias.
 *
 * GATE-LEVEL proof: the owner_opt_out / participant_only display-suppression gates
 * must derive correctly from BOTH the canonical `Permission` and the legacy
 * `Permissions` — i.e. the rename must NOT fail-open (a listing meant to be
 * suppressed must still suppress).
 */
import { derivePermissionBooleans, normalizePayload, buildPersistenceRecord } from '@/lib/compliance/normalizer';
import { MALLAN_FORM_CONTRACT } from '@/lib/listings/mallan-form-contract';

describe('A2 — Permission gate derivation (no fail-open)', () => {
  it('derivePermissionBooleans suppresses for OwnerOptOut / Private; public/absent = no suppression', () => {
    expect(derivePermissionBooleans('OwnerOptOut')).toEqual({ owner_opt_out: true, participant_only: false });
    expect(derivePermissionBooleans('Private')).toEqual({ owner_opt_out: false, participant_only: true });
    expect(derivePermissionBooleans('Public')).toEqual({ owner_opt_out: false, participant_only: false });
    expect(derivePermissionBooleans(undefined)).toEqual({ owner_opt_out: false, participant_only: false });
  });

  it('normalizePayload folds legacy Permissions / permission inputs into the MALLAN decision key (never the provider Permission field)', () => {
    const a = normalizePayload({ Permissions: 'OwnerOptOut' }).normalized;
    expect(a._mallanPermission).toBe('OwnerOptOut');
    expect(a).not.toHaveProperty('Permission');
    expect(normalizePayload({ permission: 'RLS-Owner-OptOut' }).normalized._mallanPermission).toBe('OwnerOptOut');
    expect(normalizePayload({ Permission: 'Private' }).normalized._mallanPermission).toBe('Private');
  });

  it('buildPersistenceRecord derives the gate columns from the Mallan decision key', () => {
    expect(buildPersistenceRecord({ _mallanPermission: 'OwnerOptOut' }).topLevel.owner_opt_out).toBe(true);
    expect(buildPersistenceRecord({ _mallanPermission: 'Private' }).topLevel.participant_only).toBe(true);
  });

  it('legacy Permissions still suppresses end-to-end (normalize → persist) — NO fail-open', () => {
    const { normalized } = normalizePayload({ Permissions: 'Private' });
    expect(buildPersistenceRecord(normalized).topLevel.participant_only).toBe(true);
    const { normalized: n2 } = normalizePayload({ Permissions: 'OwnerOptOut' });
    expect(buildPersistenceRecord(n2).topLevel.owner_opt_out).toBe(true);
  });

  it('persistenceMap derives the gate columns from _mallanPermission', () => {
    const pm = MALLAN_FORM_CONTRACT.persistenceMap as Record<string, { deriveBooleans?: Record<string, { db: string }> }>;
    expect(pm['_mallanPermission']?.deriveBooleans?.OwnerOptOut?.db).toBe('owner_opt_out');
    expect(pm['_mallanPermission']?.deriveBooleans?.Private?.db).toBe('participant_only');
  });
});
