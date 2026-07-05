import { shouldSkipNewTerminalListing } from '@/lib/idx/sync';

// ROOT CAUSE (verified live 2026-07-05): incremental sync returns every feed-wide
// modification and upserted them all, so listings that arrived already terminal and were
// NEVER active on our site were created as fat, hidden, ever-growing bloat — 88,967 of
// 90,280 Closed rows had first_active_date=NULL. This guard skips CREATE for a brand-new
// terminal/off-market listing, while EXISTING rows always continue to UPDATE (so a real
// Active->Closed transition still records + hides via §2.05).
describe('shouldSkipNewTerminalListing — feed-wide closure bloat guard', () => {
  const NEW = null; // not in our DB

  it.each(['Closed', 'Withdrawn', 'Expired', 'Canceled', 'Cancelled', 'Hold', 'Delete', 'Incomplete'])(
    'SKIPS a brand-new listing arriving terminal/off-market: %s',
    (status) => {
      expect(shouldSkipNewTerminalListing(NEW, status)).toBe(true);
    },
  );

  it.each(['Active', 'ActiveUnderContract', 'ComingSoon', 'Pending'])(
    'CREATES a brand-new listing arriving live/displayable: %s',
    (status) => {
      expect(shouldSkipNewTerminalListing(NEW, status)).toBe(false);
    },
  );

  it.each(['Closed', 'Withdrawn', 'Expired', 'Canceled'])(
    'NEVER skips an EXISTING row transitioning to terminal (%s) — the §2.05 hide must persist',
    (status) => {
      expect(shouldSkipNewTerminalListing({ status: 'Active' }, status)).toBe(false);
    },
  );

  it('never skips an existing row on a normal re-sync', () => {
    expect(shouldSkipNewTerminalListing({ status: 'Active' }, 'Active')).toBe(false);
  });
});
