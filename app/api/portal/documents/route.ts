// /api/portal/documents — Seller/Landlord document access
// GET: List documents shared with this client (disclosures, agreements, etc.)
// Documents are created by agent via CRM, visible to seller/landlord for review/signature
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  if (auth.userType !== "lead") {
    return NextResponse.json(
      { error: "Portal access requires a client account" },
      { status: 403 }
    );
  }

  // Get lead's agent to find their documents
  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { agent_id: true, portal_role: true },
  });

  if (!lead?.agent_id) {
    return NextResponse.json({ documents: [] });
  }

  // Find listings owned by this lead to scope documents
  const ownedListings = await prisma.listing.findMany({
    where: { owner_client_id: auth.userId },
    select: { address: true },
  });
  const ownedAddresses = ownedListings
    .map((l) => l.address)
    .filter(Boolean) as string[];

  // Scope documents to this agent's deals that match the lead's listing addresses
  const documents = await prisma.document.findMany({
    where: {
      agent_id: lead.agent_id,
      deal: {
        property_address: ownedAddresses.length > 0
          ? { in: ownedAddresses }
          : undefined,
      },
    },
    include: {
      signatures: {
        select: {
          id: true,
          signer_name: true,
          signer_email: true,
          signer_role: true,
          status: true,
          signed_at: true,
        },
      },
    },
    orderBy: { created_at: "desc" },
    take: 50,
  });

  const serialized = documents.map((doc) => ({
    id: doc.id.toString(),
    name: doc.name,
    doc_type: doc.doc_type,
    status: doc.status,
    requires_signature: doc.requires_signature,
    file_url: doc.file_url,
    created_at: doc.created_at,
    signatures: doc.signatures.map((sig) => ({
      id: sig.id.toString(),
      signer_name: sig.signer_name,
      signer_role: sig.signer_role,
      status: sig.status,
      signed_at: sig.signed_at,
    })),
  }));

  return NextResponse.json({ documents: serialized });
}
