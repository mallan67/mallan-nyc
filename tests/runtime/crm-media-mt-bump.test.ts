/// <reference types="jest" />
/**
 * P1C4 — CRM media routes must not bump modification_timestamp on
 * Trestle-synced rows (behavioral RED→GREEN; closes deep-review loop L8).
 *
 * The idx-sync cursor is MAX(modification_timestamp) WHERE
 * last_synced_from_trestle IS NOT NULL — MT must stay the TRESTLE row clock.
 * A CRM media action bumping MT with local NOW makes the next incremental
 * filter (MT gt SINCE) skip every unprocessed feed record older than the bump.
 *
 * Scoped stop-bump: synced listing → NO touch; CRM-only exclusive
 * (last_synced_from_trestle null) → bump preserved (sitemap/disclaimer/
 * ordering all read MT for that cohort).
 *
 * Companion guards (NOT edited): lib/idx/__tests__/sync-watermark.test.ts and
 * tests/runtime/idx-sync-cursor-modification-timestamp.test.ts stay green.
 */

import fs from 'node:fs';
import path from 'node:path';
import { makeRequest } from './helpers';

const SYNCED_AT = new Date('2026-06-01T00:00:00Z');

const listingUpdateCalls: Array<Record<string, unknown>> = [];
let listingFixture: Record<string, unknown> = {};

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: {
      findUnique: jest.fn(async () => listingFixture),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => {
        listingUpdateCalls.push(args.data);
        return {};
      }),
    },
    listingMedia: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => ({ id: 1n, media_key: 'crm:SL-0001:aaaa', media_type: 'Photo', status: 'active' })),
      create: jest.fn(async () => undefined),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({ userId: 1n, userType: 'agent', role: 'BROKER' })),
  isAuthError: jest.fn(() => false),
  logAuditEvent: jest.fn(async () => undefined),
}));

jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

import { crmListingTouchData } from '@/lib/media/crm-media';
import { PATCH as reorderPATCH } from '@/app/api/crm/listings/[id]/media-order/route';
import { DELETE as mediaDELETE } from '@/app/api/crm/listings/[id]/media/[mediaId]/route';

const CRM_KEY = 'crm:SL-0001:aaaaaaaaaaaaaaaaaaaaaaaa';

function setFixture(lastSynced: Date | null) {
  listingFixture = {
    id: 1n, listing_id: 'SL-0001', agent_id: 1n, media: [],
    last_synced_from_trestle: lastSynced,
  };
}

const mtBumps = () => listingUpdateCalls.filter((d) => 'modification_timestamp' in d);

beforeEach(() => {
  listingUpdateCalls.length = 0;
});

// DB-coupled assertions from this file were MIGRATED to
// tests/runtime/crm-media-summary-convergence.integration.test.ts. They drove a
// handcrafted Prisma object through a fake `$transaction: (ops) => Promise.all(ops)`,
// which cannot roll back and cannot model the transaction the routes now use.
// Persistence, ordering and modification-timestamp effects are proven against
// real PostgreSQL. Only non-DB assertions remain here.

describe('P1C4 — crmListingTouchData (pure)', () => {
  it('synced listing → null (no touch); CRM-only → bump object', () => {
    expect(crmListingTouchData(SYNCED_AT)).toBeNull();
    const touch = crmListingTouchData(null);
    expect(touch).not.toBeNull();
    expect(touch!.modification_timestamp).toBeInstanceOf(Date);
  });

  it('fail-closed: undefined (caller forgot the select — sync state UNKNOWN) → no touch', () => {
    expect(crmListingTouchData(undefined)).toBeNull();
  });
});

describe('P1C4 — media-order route', () => {

});

describe('P1C4 — media DELETE route', () => {

});

describe('P1C4 — upload route (structural lock; behavioral coverage via the shared helper above)', () => {
  it('upload route routes its touch through crmListingTouchData and has no unconditional bump', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/crm/listings/[id]/media/upload/route.ts'),
      'utf8',
    );
    expect(src).toContain('crmListingTouchData(listing.last_synced_from_trestle)');
    expect(src).not.toMatch(/data:\s*\{\s*modification_timestamp:\s*new Date\(\)\s*\}/);
  });
});
