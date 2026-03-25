// POST /api/crm/agents/[id]/photo — Broker uploads photo for a specific agent
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { validateImage, optimizeImage } from "@/lib/images/optimize";
import { uploadToR2, hasR2Config } from "@/lib/images/r2";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  if (!hasR2Config()) {
    return NextResponse.json({ error: "Image storage not configured" }, { status: 503 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
  }

  const validation = validateImage(file.size, file.type);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const agent = await prisma.agent.findUnique({
    where: { id: BigInt(id) },
    select: { id: true, public_slug: true },
  });
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());
  const variants = await optimizeImage(rawBuffer, "content");

  const slug = agent.public_slug || agent.id.toString();
  const cardVariant = variants.find((v) => v.variant === "card") ?? variants[0];
  const key = `agents/${slug}/headshot.webp`;
  const publicUrl = await uploadToR2(key, cardVariant.buffer, "image/webp");

  await prisma.agent.update({
    where: { id: agent.id },
    data: { photo: publicUrl },
  });

  await logAuditEvent("update", "agent", id, auth, { field: "photo", broker_upload: true }, req.headers.get("x-forwarded-for") || "unknown");

  return NextResponse.json({ photo: publicUrl, message: "Photo uploaded successfully" });
}
