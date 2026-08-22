/// <reference types="jest" />
/**
 * STEP 2 — READ-SIDE STATUS: the exact Cotality value, end to end.
 *
 * `listing.status` is not screen text. Reports, maps, pagination, CRM workflow
 * and COMPLIANCE GATES branch on it. Until now it carried a Mallan-invented
 * vocabulary while the exact provider value was returned separately under the
 * misleading name `mlsStatus`.
 *
 * THE SPLIT WAS ALREADY CAUSING A COMPLIANCE MISS. The database stores the
 * exact member (`prisma/schema.prisma:447` — `status String @default("Active")
 * // RESO StandardStatus`), and then three transformations disagreed:
 *
 *     DB 'ComingSoon'
 *       -> lib/idx/db-to-public-dto.ts STATUS_DISPLAY  -> 'Coming Soon'
 *       -> public/crm/js/core/data-loader.js .toUpperCase() -> 'COMING SOON'
 *       -> public/crm/js/render/shared-badges.js compares  -> 'COMING_SOON'
 *
 * Four vocabularies, and the UCBA Art. I §16 Coming Soon badge — the one that
 * carries "No Showings or Open House until [date]" — never matched for a
 * DB-path listing.
 *
 * THE RULE: the Cotality fact is exact; a Mallan business grouping is derived
 * and separately named; a human label is presentation only. Never mixed.
 */
import {
  STANDARD_STATUS_MEMBERS,
  standardStatusOData,
  statusDisplayLabel,
} from '@/lib/search/canonical/status-token-contract';
import { migrateLegacySavedSearchStatus } from '@/lib/search/legacy-saved-search-status-migration';
import { mapTrestleToCrmListing } from '@/lib/search/crm-idx-mapper';

const mapped = (raw: Record<string, unknown>) =>
  mapTrestleToCrmListing({ ListingId: 'RLS1', ...raw }, 0) as Record<string, unknown>;

describe('the DTO carries the exact Cotality value', () => {
  it.each(STANDARD_STATUS_MEMBERS)('%s survives into the DTO unchanged', (member) => {
    expect(mapped({ StandardStatus: member }).status).toBe(member);
  });

  it('Pending and ActiveUnderContract remain distinct in the DTO', () => {
    expect(mapped({ StandardStatus: 'Pending' }).status).toBe('Pending');
    expect(mapped({ StandardStatus: 'ActiveUnderContract' }).status).toBe('ActiveUnderContract');
  });

  it('no provider value becomes uppercase-underscore vocabulary', () => {
    for (const member of STANDARD_STATUS_MEMBERS) {
      const out = String(mapped({ StandardStatus: member }).status);
      expect(out).not.toMatch(/^[A-Z]+(_[A-Z]+)*$/);
    }
  });

  it('an unknown status is UNKNOWN and never Active', () => {
    expect(mapped({}).status).toBe('UNKNOWN');
    expect(mapped({ StandardStatus: 'Leased' }).status).toBe('UNKNOWN');
  });
});

describe('the canonical Cotality contract rejects Mallan-invented spellings', () => {
  it.each(['UNDER_CONTRACT', 'CONTRACT', 'COMING_SOON', 'CANCELLED', 'PENDING', 'ACTIVE', 'FUTURE', 'OFFEROUT'])(
    '%s is not a valid canonical input',
    (legacy) => {
      // Compatibility must not live INSIDE the Cotality contract.
      expect(() => standardStatusOData([legacy])).toThrow(/Unsupported status criterion/);
    },
  );

  it.each(STANDARD_STATUS_MEMBERS)('%s is accepted', (member) => {
    expect(standardStatusOData([member]).filter).toBe(`StandardStatus eq '${member}'`);
  });
});

describe('legacy compatibility is an isolated migration boundary', () => {
  it.each([
    ['UNDER_CONTRACT', 'ActiveUnderContract'],
    ['CONTRACT', 'ActiveUnderContract'],
    ['COMING_SOON', 'ComingSoon'],
    ['Coming Soon', 'ComingSoon'],
    ['CANCELLED', 'Canceled'],
    ['PENDING', 'Pending'],
  ])('a saved search holding %s migrates to %s', (legacy, member) => {
    expect(migrateLegacySavedSearchStatus(legacy)).toBe(member);
  });

  it.each(STANDARD_STATUS_MEMBERS)('%s is already canonical and passes through', (member) => {
    expect(migrateLegacySavedSearchStatus(member)).toBe(member);
  });

  it.each(['FUTURE', 'OFFEROUT'])('%s has no proven member and does NOT migrate', (v) => {
    expect(migrateLegacySavedSearchStatus(v)).toBeNull();
  });

  it('a migrated value is the MEMBER, so it renders as the member predicate', () => {
    const member = migrateLegacySavedSearchStatus('UNDER_CONTRACT');
    expect(standardStatusOData([member]).filter).toBe("StandardStatus eq 'ActiveUnderContract'");
  });
});

describe('human labels are presentation, and do not change the value', () => {
  it.each([
    ['ActiveUnderContract', 'Under Contract'],
    ['ComingSoon', 'Coming Soon'],
    ['Pending', 'Pending'],
    ['Active', 'Active'],
  ])('%s displays as %s', (member, label) => {
    expect(statusDisplayLabel(member)).toBe(label);
  });

  it('labelling does not mutate the underlying member', () => {
    const listing = mapped({ StandardStatus: 'ActiveUnderContract' });
    statusDisplayLabel(String(listing.status));
    expect(listing.status).toBe('ActiveUnderContract');
  });

  it('an unknown value gets a neutral label, not an invented status', () => {
    expect(statusDisplayLabel('UNKNOWN')).toBe('Status Unavailable');
  });
});
