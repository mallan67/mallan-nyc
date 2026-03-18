// POST /api/crm/notes
// Appends a timestamped note to a client's notes field
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: { client_id?: string | number; content?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const clientId = body.client_id ? BigInt(String(body.client_id)) : null;
  const content = (body.content || "").trim();

  if (!clientId) {
    return NextResponse.json({ error: "client_id is required" }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  // Verify client exists and belongs to agent (or broker has access)
  const client = await prisma.lead.findUnique({
    where: { id: clientId },
    select: { id: true, agent_id: true, notes: true },
  });

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && client.agent_id !== BigInt(auth.userId)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Append timestamped note
  const timestamp = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const newNote = `[${timestamp}] ${content}`;
  const existingNotes = client.notes || "";
  const updatedNotes = existingNotes
    ? newNote + "\n" + existingNotes // newest first
    : newNote;

  await prisma.lead.update({
    where: { id: clientId },
    data: { notes: updatedNotes },
  });

  await logAuditEvent(
    "update",
    "lead",
    String(clientId),
    auth,
    { field: "notes", source: body.source || "workspace" },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({ saved: true, note: newNote }, { status: 201 });
}
