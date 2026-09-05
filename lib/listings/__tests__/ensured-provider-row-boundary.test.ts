/// <reference types="jest" />
/**
 * SOURCE BOUNDARY of an ensured Cotality row (Packet 2 closure, P0).
 *
 * The exact row the ensure helper creates is run through every canonical authority that reads
 * the eligibility flag: it must classify as third-party / Cotality-source-owned everywhere,
 * for every actor including the principal broker; RLS address withholding must survive the
 * local identity; and the row the Trestle sync later writes must keep that classification.
 */
const createMock = jest.fn<Promise<unknown>, [unknown]>(async (args: unknown) => ({ id: 9001n, listing_id: (args as { data: { listing_id: string } }).data.listing_id }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: { listing: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null), create: createMock } } }));
jest.mock("@/lib/search/listing-search-projection", () => ({ __esModule: true, dualWriteProjectionForListingId: jest.fn(async () => undefined) }));

import { ensureInputFromSearchDto, ensureLocalListing } from "@/lib/listings/ensure-local-listing";
import { classifyListingSource, listingCapabilities } from "@/lib/auth/listing-capabilities";
import { isMallanLocalListing } from "@/lib/listings/mallan-source-identity";
import { isMallanExclusiveListing } from "@/lib/listings/exclusive-agent-assignment";
import { isMallanOwnedListing as mediaIsMallanOwned } from "@/lib/media/listing-media-resolver";
import { decideDbPublicAddress } from "@/lib/compliance/db-address-decision";
import { isRlsBackedForCampaign } from "@/lib/compliance/campaign-distribution-gate";
import { computeGateColumns } from "@/lib/idx/trestle-mapper";

const dto = { id: "RLS20059088", mlsStatus: "Active", address: "217 W 57TH STREET", unit: "PH-4A", neighborhood: "Tribeca", borough: "Manhattan", zip: "10019", price: 1850000, beds: 2, fullBaths: 2, halfBaths: 0, latitude: 40.7654, longitude: -73.9821, internetDisplayYN: true, addressDisplayYN: false, permissions: { ownerOptOut: false, participantOnly: false }, images: [] };

async function ensuredRow() {
  await ensureLocalListing(ensureInputFromSearchDto(dto, "sale"));
  const data = (createMock.mock.calls[0][0] as { data: Record<string, unknown> }).data;
  return { id: 9001n, ...data } as unknown as Record<string, unknown> & { listing_id: string; rls_eligible: boolean; agent_id?: null; last_synced_from_trestle?: null; internet_entire_listing_display_yn: boolean; internet_address_display_yn: boolean; list_office_mls_id?: null };
}

beforeEach(() => jest.clearAllMocks());

test("the ensured row is third-party / Cotality-source-owned in every authority", async () => {
  const row = await ensuredRow();
  const capRow = { listing_id: row.listing_id, rls_eligible: row.rls_eligible, agent_id: null, last_synced_from_trestle: null, list_office_mls_id: null };
  expect(isMallanLocalListing(capRow)).toBe(false);
  expect(classifyListingSource(capRow)).toBe("third-party-rls");
  expect(isMallanExclusiveListing({ listing_id: row.listing_id, rls_eligible: row.rls_eligible })).toBe(false);
  expect(mediaIsMallanOwned({ listingId: row.listing_id, rlsEligible: row.rls_eligible } as never)).toBe(false);
  expect(isRlsBackedForCampaign({ rls_eligible: row.rls_eligible } as never)).toBe(true);
});

test("no actor — not even the principal broker — may manage it as Mallan-local, upload new local media, run Mallan open houses, view the seller report, or edit source-derived fields", async () => {
  const row = await ensuredRow();
  const capRow = { listing_id: row.listing_id, rls_eligible: row.rls_eligible, agent_id: null, last_synced_from_trestle: null, list_office_mls_id: null };
  for (const role of ["BROKER", "PRINCIPAL_BROKER", "ASSOCIATE_BROKER", "SALESPERSON", "AGENT"]) {
    const caps = listingCapabilities({ userId: 1n, role }, capRow) as unknown as Record<string, unknown>;
    expect(caps.sourceClass).toBe("third-party-rls");
    for (const k of ["mayManageMallanLocalListing", "mayManageMallanPublicOpenHouse", "mayViewSellerReport", "mayUploadNewLocalMedia", "mayEditSourceDerivedThirdPartyField"]) {
      expect({ role, capability: k, value: caps[k] }).toEqual({ role, capability: k, value: false });
    }
  }
});

test("RLS address withholding survives local canonicalization: the DB address decision stays suppressed; street/unit/coordinates cannot surface", async () => {
  const row = await ensuredRow();
  const decision = decideDbPublicAddress({ listing_id: row.listing_id, rls_eligible: row.rls_eligible, internet_entire_listing_display_yn: row.internet_entire_listing_display_yn, internet_address_display_yn: row.internet_address_display_yn });
  expect(decision).toEqual({ addressDisplayable: false, suppressAddress: true, isRlsBacked: true });
  // The row itself still carries the provider facts (they are the identity's data), but every
  // public reader must consult the decision above — which withholds them.
  expect(row.internet_address_display_yn).toBe(false);
});

test("a website-only (rls_eligible=false) row would have taken the Mallan branch — which is exactly why the stub never carries it", () => {
  const decision = decideDbPublicAddress({ listing_id: "RLS20059088", rls_eligible: false, internet_entire_listing_display_yn: true, internet_address_display_yn: false });
  expect(decision.isRlsBacked).toBe(false);
  expect(decision.suppressAddress).toBe(false);
  expect(isMallanLocalListing({ listing_id: "RLS20059088", rls_eligible: false })).toBe(true);
});

test("a later Trestle sync preserves the classification: the sync's own gate computation for a Trestle row keeps rls_eligible true", () => {
  // lib/idx/sync.ts writes `rls_eligible: true` for every Trestle-sourced row (create and update payloads);
  // computeGateColumns treats omitted/null as true for the same reason. The ensured row starts true, so no
  // reconciliation can flip it into the website-only class.
  const g = computeGateColumns({ status: "Active", internetEntireListingDisplayYN: null, internetAddressDisplayYN: false, rls_eligible: true });
  expect(g.rls_eligible).toBe(true);
  expect(g.idx_display_yn).toBe(true);
  expect(g.internet_address_display_yn).toBe(false);
  const g2 = computeGateColumns({ status: "Active", internetEntireListingDisplayYN: null, internetAddressDisplayYN: false });
  expect(g2.rls_eligible).toBe(true);
});
