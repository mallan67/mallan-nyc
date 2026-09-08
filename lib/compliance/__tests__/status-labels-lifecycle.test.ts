/**
 * lib/compliance/status.ts is the declared label authority. Pinned to the 2026-09-08 lifecycle census and
 * Maya's decisions: In Contract is the label for the provider's Pending (and ActiveUnderContract), In Contract
 * listings are public (the IDX Plus feed delivers 5,590 Pending rows), Closed reads Sold / Rented by
 * transaction type, and a listing that left the feed is Delisted — a terminal, non-public status that is
 * never spelled "Withdrawn" and never "Off-Market" (UCBA Art. I §5(D)).
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

describe('vocabulary — Delisted exists, is terminal, is not public', () => {
  it('Status.DELISTED = "Delisted" and normalizes from its input forms', () => {
    expect(Status.DELISTED).toBe('Delisted');
    expect(normalizeStatus('Delisted')).toBe('Delisted');
    expect(normalizeStatus('DELISTED')).toBe('Delisted');
  });
  it('Delisted is terminal and never an active-display status', () => {
    expect(isTerminalStatus('Delisted')).toBe(true);
    expect(TERMINAL_VALUES).toContain('Delisted');
    expect(isActiveDisplayStatus('Delisted')).toBe(false);
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
    for (const s of ['Closed', 'Delisted', 'Withdrawn', 'Expired', 'Cancelled', 'Hold']) expect(isActiveDisplayStatus(s)).toBe(false);
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
  it('Delisted reads "Delisted"; Hold reads "Temporarily Off Market"; no label is the prohibited "Off-Market"', () => {
    expect(statusDisplayLabelFor('Delisted', 'sale')).toBe('Delisted');
    expect(statusDisplayLabelFor('Hold', 'sale')).toBe('Temporarily Off Market');
    for (const s of Object.values(Status)) for (const lt of ['sale', 'rent', null] as const) expect(statusDisplayLabelFor(s, lt)).not.toMatch(/^off[\s-]?market$/i);
  });
  it('an unrecognized status has no label (fail-closed), never a fabricated one', () => {
    expect(statusDisplayLabelFor('Off Market', 'sale')).toBe('');
    expect(statusDisplayLabelFor('', 'sale')).toBe('');
  });
});
