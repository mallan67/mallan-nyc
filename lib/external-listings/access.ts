import prisma from "@/lib/prisma";

export async function getFamilyVisibleOwnerLeadIds(memberLeadId: bigint): Promise<bigint[]> {
  const links = await prisma.familyMember.findMany({
    where: { member_lead_id: memberLeadId },
    select: { lead_id: true },
  });

  return links.map((link) => link.lead_id);
}

export async function buildPortalExternalListingWhere(leadId: bigint) {
  const familyOwnerIds = await getFamilyVisibleOwnerLeadIds(leadId);

  return {
    OR: [
      { lead_id: leadId },
      ...(familyOwnerIds.length > 0
        ? [{ lead_id: { in: familyOwnerIds }, family_visible: true }]
        : []),
    ],
  };
}

export function externalListingAccessRole(listing: { lead_id: bigint }, viewerLeadId: bigint): "owner" | "family" {
  return listing.lead_id === viewerLeadId ? "owner" : "family";
}
