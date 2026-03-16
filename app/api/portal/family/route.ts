// GET /api/portal/family
// List the client's family members.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePortalRole, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requirePortalRole(req, "buyer", "renter", "seller", "landlord");
  if (isAuthError(auth)) return auth;

  const members = await prisma.familyMember.findMany({
    where: { lead_id: auth.userId },
    include: {
      member: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          status: true,
        },
      },
    },
    orderBy: { created_at: "asc" },
  });

  const serialized = members.map((m) => ({
    id: m.id.toString(),
    relationship: m.relationship,
    member: {
      id: m.member.id.toString(),
      name: `${m.member.first_name} ${m.member.last_name}`,
      email: m.member.email,
      active: m.member.status === "active",
    },
    created_at: m.created_at,
  }));

  return NextResponse.json({ family: serialized });
}
