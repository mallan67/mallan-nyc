// /api/crm/clients
// GET: Returns client/lead list with ownership enforcement.
// POST: Create a new client.
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { findClients, clientEmailExists, createClient } from "@/lib/db/clients";
import { parseBody } from "@/lib/api/parse-body";
import { createClientSchema } from "@/lib/api/schemas/client";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const result = await findClients({
    userId: auth.userId,
    role: auth.role,
    status: searchParams.get("status"),
    limit: parseInt(searchParams.get("limit") || "50"),
    offset: parseInt(searchParams.get("offset") || "0"),
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { data, error } = await parseBody(req, createClientSchema);
  if (error) return error;

  if (await clientEmailExists(data.email)) {
    return NextResponse.json(
      { error: "A client with this email already exists" },
      { status: 409 }
    );
  }

  const client = await createClient({
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email,
    phone: data.phone,
    roles: data.roles as string[] | undefined,
    portal_role: data.portal_role ?? null,
    agent_id: auth.userId,
    source: data.source ?? "manual",
  });

  await logAuditEvent(
    "create",
    "lead",
    String(client.id),
    auth,
    { email: data.email, roles: data.roles },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json(
    { id: client.id, email: client.email, status: client.status },
    { status: 201 }
  );
}
