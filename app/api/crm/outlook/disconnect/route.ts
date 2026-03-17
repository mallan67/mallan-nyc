// POST /api/crm/outlook/disconnect
// Clears stored Outlook tokens for the current agent
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  await prisma.agent.update({
    where: { id: BigInt(auth.userId) },
    data: {
      outlook_access_token: null,
      outlook_refresh_token: null,
      outlook_token_expires_at: null,
    },
  });

  return NextResponse.json({ disconnected: true });
}
