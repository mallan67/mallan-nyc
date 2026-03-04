// /api/crm/clients
// GET: Returns client/lead list with ownership enforcement.
// POST: Create a new client.
// Agent: only their assigned clients. Broker: all clients.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {};

  // Ownership: agent sees only their assigned clients, broker sees all
  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  if (status) where.status = status;

  const [clients, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { updated_at: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        phone: true,
        roles: true,
        status: true,
        portal_role: true,
        agent_id: true,
        source: true,
        created_at: true,
        updated_at: true,
      },
    }),
    prisma.lead.count({ where }),
  ]);

  const serialized = clients.map((c) => ({
    ...c,
    id: c.id.toString(),
    agent_id: c.agent_id?.toString() ?? null,
  }));

  return NextResponse.json({
    clients: serialized,
    total,
    limit,
    offset,
  });
}

/**
 * POST /api/crm/clients
 * Create a new client (lead). Agent or broker.
 */
export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const firstName = body.first_name as string | undefined;
  const lastName = body.last_name as string | undefined;
  const email = body.email as string | undefined;
  const phone = body.phone as string | undefined;
  const roles = body.roles as string[] | undefined;

  if (!firstName || !lastName || !email || !phone) {
    return NextResponse.json(
      { error: "first_name, last_name, email, and phone are required" },
      { status: 400 }
    );
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Invalid email format" },
      { status: 400 }
    );
  }

  // Validate roles
  const validRoles = ["buyer", "renter", "seller", "landlord"];
  if (roles && !roles.every((r) => validRoles.includes(r))) {
    return NextResponse.json(
      { error: "roles must be from: buyer, renter, seller, landlord" },
      { status: 400 }
    );
  }

  // Check unique email
  const existing = await prisma.lead.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "A client with this email already exists" },
      { status: 409 }
    );
  }

  const client = await prisma.lead.create({
    data: {
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      roles: roles ?? [],
      status: "new",
      portal_role: (body.portal_role as string) ?? null,
      agent_id: auth.userId,
      source: (body.source as string) ?? "manual",
    },
  });

  await logAuditEvent(
    "create",
    "lead",
    client.id.toString(),
    auth,
    { email, roles },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json(
    {
      id: client.id.toString(),
      email: client.email,
      status: client.status,
    },
    { status: 201 }
  );
}
