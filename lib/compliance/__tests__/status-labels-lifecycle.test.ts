/**
 * lib/compliance/status.ts is the declared label authority. Pinned to the 2026-09-08 lifecycle census and
 * Maya's decisions: In Contract is the label for the provider's Pending (and ActiveUnderContract), In Contract
 * listings are public (the IDX Plus feed delivers 5,590 Pending rows), Closed reads Sold / Rented by
 * transaction type, and a listing that left the feed keeps its last provider status: there is NO departed status in
 * this vocabulary. The Mallan Off Market state lives on the presence fact (lib/listings/canonical-lifecycle.ts,
 * Maya 2026-09-08); no provider-status label ever spells it.
 */
import {
  ACTIVE_DISPLAY_VALUES,
  Status,
  TERMINAL_VALUES,
  isActiveDisplayStatus,
  isTerminalStatus,
  normalizeStatus,
  statusDisplayLabel,
  statusDisplayLabelFor,
} from '../status';

describe('vocabulary — no manufactured departure status exists', () => {
  it('"Delisted" is not a status: it does not normalize, is not terminal, is not displayable', () => {
    expect((Status as Record<string, string>).DELISTED).toBeUndefined();
    expect(normalizeStatus('Delisted')).toBeNull();
    expect(isTerminalStatus('Delisted')).toBe(false);
    expect(TERMINAL_VALUES).not.toContain('Delisted');
    expect(isActiveDisplayStatus('Delisted')).toBe(false);
  });
  it('"Off Market" is not a status either — it is the Mallan presence state, never a provider value', () => {
    expect(normalizeStatus('Off Market')).toBeNull();
    expect(statusDisplayLabelFor('Off Market', 'sale')).toBe('');
  });
});

describe('public display — In Contract (Pending) is displayable', () => {
  it('Pending is an active-display status (the feed delivers it under Permission IDX)', () => {
    expect(isActiveDisplayStatus('Pending')).toBe(true);
    expect(ACTIVE_DISPLAY_VALUES).toContain('Pending');
    expect(isTerminalStatus('Pending')).toBe(false);
  });
  it('Active, ComingSoon and ActiveUnderContract remain displayable; Closed and Delisted are not', () => {
    for (const s of ['Active', 'ComingSoon', 'ActiveUnderContract']) expect(isActiveDisplayStatus(s)).toBe(true);
    for (const s of ['Closed', 'Withdrawn', 'Expired', 'Cancelled', 'Hold']) expect(isActiveDisplayStatus(s)).toBe(false);
  });
});

describe('labels — broker language on proven provider combinations', () => {
  it('Pending and ActiveUnderContract both read "In Contract"', () => {
    expect(statusDisplayLabel('Pending')).toBe('In Contract');
    expect(statusDisplayLabel('ActiveUnderContract')).toBe('In Contract');
    expect(statusDisplayLabelFor('Pending', 'rent')).toBe('In Contract');
  });
  it('Closed reads Sold for a sale and Rented for a rental; Leased reads Rented', () => {
    expect(statusDisplayLabelFor('Closed', 'sale')).toBe('Sold');
    expect(statusDisplayLabelFor('Closed', 'rent')).toBe('Rented');
    expect(statusDisplayLabelFor('Closed', 'rental')).toBe('Rented');
    expect(statusDisplayLabelFor('Leased', 'rent')).toBe('Rented');
    expect(statusDisplayLabelFor('Sold', 'sale')).toBe('Sold');
    expect(statusDisplayLabelFor('Rented', 'rent')).toBe('Rented');
  });
  it('Closed without a known transaction type falls back to the neutral "Closed"', () => {
    expect(statusDisplayLabelFor('Closed', null)).toBe('Closed');
    expect(statusDisplayLabel('Closed')).toBe('Closed');
  });
  it('Hold reads REBNY\'s own "Temporarily Off Market"; no provider-status label is the bare "Off Market"', () => {
    expect(statusDisplayLabelFor('Hold', 'sale')).toBe('Temporarily Off Market');
    for (const s of Object.values(Status)) for (const lt of ['sale', 'rent', null] as const) expect(statusDisplayLabelFor(s, lt)).not.toMatch(/^off[\s-]?market$/i);
  });
  it('an unrecognized status has no label (fail-closed), never a fabricated one', () => {
    expect(statusDisplayLabelFor('Off Market', 'sale')).toBe('');
    expect(statusDisplayLabelFor('', 'sale')).toBe('');
  });
});
