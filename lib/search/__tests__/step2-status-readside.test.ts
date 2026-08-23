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
 * // Cotality StandardStatus`), and then three transformations disagreed:
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
import { migrateLegacyStatusValue } from '@/lib/search/legacy-status-migration';
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
    expect(migrateLegacyStatusValue(legacy)).toBe(member);
  });

  it.each(STANDARD_STATUS_MEMBERS)('%s is already canonical and passes through', (member) => {
    expect(migrateLegacyStatusValue(member)).toBe(member);
  });

  it.each(['FUTURE', 'OFFEROUT'])('%s has no proven member and does NOT migrate', (v) => {
    expect(migrateLegacyStatusValue(v)).toBeNull();
  });

  it('a migrated value is the MEMBER, so it renders as the member predicate', () => {
    const member = migrateLegacyStatusValue('UNDER_CONTRACT');
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

/**
 * THE INBOUND API BOUNDARY — caught by CI, not by me.
 *
 * `app/api/crm/agent-inquiry` accepts `listing_status` in a caller's payload.
 * After the read-side closure its label function compared exact members and let
 * anything else fall through to a defensive
 * `raw.charAt(0) + raw.slice(1).toLowerCase().replace(/_/g, ' ')`.
 *
 * A caller still sending the legacy `COMING_SOON` therefore produced
 * **"Coming soon"** — lower-case s — in an email to a listing agent. The whole
 * point of that assertion is that a raw machine enum must never leak into
 * client-facing text, and a cosmetically reformatted one is the same defect
 * wearing a nicer coat: it LOOKS like a label, so nobody checks it.
 *
 * The fix is not another label branch. It is to migrate at the boundary — the
 * same one-way migration saved searches use — and then label from the exact
 * member.
 */
describe('an inbound API boundary migrates legacy input before labelling', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { migrateLegacyStatusValue } = require('@/lib/search/legacy-status-migration');

  it('the legacy value CI caught resolves to the member', () => {
    expect(migrateLegacyStatusValue('COMING_SOON')).toBe('ComingSoon');
  });

  it('and the member produces the correctly-cased label', () => {
    expect(statusDisplayLabel(migrateLegacyStatusValue('COMING_SOON'))).toBe('Coming Soon');
  });

  it.each([
    ['COMING_SOON', 'Coming Soon'],
    ['ComingSoon', 'Coming Soon'],
    ['PENDING', 'Pending'],
    ['Pending', 'Pending'],
  ])('%s labels as %s whichever spelling arrives', (input, label) => {
    expect(statusDisplayLabel(migrateLegacyStatusValue(input))).toBe(label);
  });

  it('never cosmetically reformats an unrecognised value into a label', () => {
    // 'Coming soon', 'Offer out', 'Some future status' — all of these LOOK like
    // labels, which is exactly why they are dangerous.
    for (const junk of ['OFFEROUT', 'SOME_FUTURE_STATUS', 'Leased']) {
      const member = migrateLegacyStatusValue(junk);
      expect(member).toBeNull();
      expect(statusDisplayLabel(member)).toBe('Status Unavailable');
    }
  });

  it('an absent status does not read as Active', () => {
    expect(statusDisplayLabel(migrateLegacyStatusValue(null))).toBe('Status Unavailable');
  });
});
