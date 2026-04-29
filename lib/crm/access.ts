import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { safeBigInt } from "@/lib/utils/safe-bigint";

export function isBroker(auth: SessionUser) {
  return auth.role === "BROKER";
}

export async function assertLeadAccess(auth: SessionUser, leadId: bigint) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, agent_id: true },
  });

  if (!lead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (!isBroker(auth) && lead.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  return null;
}

export async function assertLeadIdStringAccess(auth: SessionUser, value: string | number | null | undefined) {
  const leadId = safeBigInt(String(value || ""));
  if (!leadId) {
    return {
      leadId: null,
      response: NextResponse.json({ error: "Invalid client id" }, { status: 400 }),
    };
  }

  const response = await assertLeadAccess(auth, leadId);
  return { leadId, response };
}

export async function assertLeadIdsAccess(auth: SessionUser, values: string[]) {
  const ids: bigint[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const id = safeBigInt(String(value || ""));
    if (!id) {
      return {
        ids,
        response: NextResponse.json({ error: "Invalid client id" }, { status: 400 }),
      };
    }
    const key = id.toString();
    if (!seen.has(key)) {
      seen.add(key);
      ids.push(id);
    }
  }

  const leads = await prisma.lead.findMany({
    where: { id: { in: ids } },
    select: { id: true, agent_id: true },
  });

  if (leads.length !== ids.length) {
    return {
      ids,
      response: NextResponse.json({ error: "One or more clients were not found" }, { status: 404 }),
    };
  }

  if (!isBroker(auth) && leads.some((lead) => lead.agent_id !== auth.userId)) {
    return {
      ids,
      response: NextResponse.json({ error: "Access denied" }, { status: 403 }),
    };
  }

  return { ids, response: null };
}
