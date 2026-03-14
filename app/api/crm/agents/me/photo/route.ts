// POST /api/crm/agents/me/photo
// Upload agent headshot. Accepts multipart/form-data with a single "file" field.
// Strips EXIF/GPS, resizes to WebP variants, uploads to R2.
// Updates agent.photo in DB with the card-size URL.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { validateImage, optimizeImage } from "@/lib/images/optimize";
import { uploadToR2, hasR2Config } from "@/lib/images/r2";

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  if (!hasR2Config()) {
    return NextResponse.json(
      { error: "Image storage not configured" },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data. Send multipart/form-data with a 'file' field." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Missing 'file' field" },
      { status: 400 }
    );
  }

  const validation = validateImage(file.size, file.type);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const agent = await prisma.agent.findUnique({
    where: { id: auth.userId },
    select: { id: true, public_slug: true },
  });
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Process image: strip EXIF/GPS, resize to WebP variants
  const rawBuffer = Buffer.from(await file.arrayBuffer());
  const variants = await optimizeImage(rawBuffer, "content");

  // Upload card-size variant to R2: agents/{slug}/headshot.webp
  const slug = agent.public_slug || agent.id.toString();
  const cardVariant = variants.find((v) => v.variant === "card") ?? variants[0];
  const key = `agents/${slug}/headshot.webp`;
  const publicUrl = await uploadToR2(key, cardVariant.buffer, "image/webp");

  // Update agent record
  await prisma.agent.update({
    where: { id: agent.id },
    data: { photo: publicUrl },
  });

  await logAuditEvent(
    "update",
    "agent",
    agent.id.toString(),
    auth,
    { field: "photo", self_upload: true },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    photo: publicUrl,
    message: "Photo uploaded successfully",
  });
}
