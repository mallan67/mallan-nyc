import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePortalRole, isAuthError } from '@/lib/auth';
import { resolveOwnerListing } from '@/lib/portal/listing-ownership';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/landlord/relist
 * Returns relist timing data: relist_reminder_date, lease_end_date, vacancy_risk, listing status.
 * Auth: seller or landlord portal role.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePortalRole(request, "seller", "landlord");
  if (isAuthError(auth)) return auth;

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      relist_reminder_date: true,
      lease_end_date: true,
      vacancy_risk: true,
      active_rental_listing_id: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // THE HINT IS NOT AUTHORIZATION.
  //
  // This read the listing straight off `lead.active_rental_listing_id`:
  //
  //     findFirst({ where: { listing_id: lead.active_rental_listing_id } })
  //
  // with no ownership clause at all. `active_rental_listing_id` is a plain
  // nullable String column with no FK, no unique constraint and no index — a
  // HINT about which owned listing is current, not proof that it is theirs. A
  // stale or foreign value returned another listing's market status to this
  // landlord.
  //
  // `resolveOwnerListing` queries `owner_client_id` — the canonical relation —
  // and honours the hint only from inside the owned set.
  const listing = await resolveOwnerListing<{ listing_id: string; status: string | null }>(
    prisma,
    {
      leadId: lead.id,
      listingType: "rent",
      hintedListingId: lead.active_rental_listing_id,
      select: { listing_id: true, status: true },
    },
  );

  return NextResponse.json({
    relist_reminder_date: lead.relist_reminder_date,
    lease_end_date: lead.lease_end_date,
    vacancy_risk: lead.vacancy_risk,
    // NULL here now means one of two things, and both are truthful: the
    // landlord owns no rental listing, or the listing they own has no market
    // status yet. Neither is another owner's status.
    listing_status: listing?.status ?? null,
    // Report the listing actually resolved, not the unverified hint — the
    // client should never be handed an id it has no right to.
    active_rental_listing_id: listing?.listing_id ?? null,
  });
}
