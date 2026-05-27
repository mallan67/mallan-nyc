// TEMPORARY — minimal listing create test. Broker-only. Remove after diagnosis.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  try {
    // Step 1: Test DB connection
    const count = await prisma.listing.count();

    // Step 2: Try minimal listing create
    const listing = await prisma.listing.create({
      data: {
        listing_id: "TEST-" + Date.now(),
        status: "Draft",
        listing_type: "sale",
        list_price: 100000,
        agent_id: auth.userId,
        address: { StreetNumber: "333", StreetName: "Test", City: "New York" },
        features: {},
        media: [],
        compliance: {},
        agent_info: {},
        raw_data: {},
        modification_timestamp: new Date(),
      },
    });

    // Step 3: Clean up test listing
    await prisma.listing.delete({ where: { id: listing.id } });

    return NextResponse.json({
      success: true,
      dbConnection: "OK",
      listingCount: count,
      testCreate: "OK — created and deleted TEST-" + listing.listing_id,
      userId: auth.userId.toString(),
      userRole: auth.role,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code;
    return NextResponse.json({
      success: false,
      error: msg,
      prismaCode: code,
    }, { status: 500 });
  }
}
