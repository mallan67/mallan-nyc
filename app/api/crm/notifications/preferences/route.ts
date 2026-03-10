// /api/crm/notifications/preferences — GET + PUT notification preferences
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const prefs = await prisma.notificationPreference.findUnique({
    where: { recipient_type_recipient_id: { recipient_type: "agent", recipient_id: auth.userId } },
  });

  if (!prefs) {
    return NextResponse.json({
      ok: true,
      item: { new_match: true, price_drop: true, showing_updates: true, offer_updates: true, email_digest: "daily", sms_enabled: false },
    });
  }

  return NextResponse.json({
    ok: true,
    item: { ...prefs, id: prefs.id.toString(), recipient_id: prefs.recipient_id.toString() },
  });
}

export async function PUT(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const { new_match, price_drop, showing_updates, offer_updates, email_digest, sms_enabled } = body;

  const prefs = await prisma.notificationPreference.upsert({
    where: { recipient_type_recipient_id: { recipient_type: "agent", recipient_id: auth.userId } },
    create: {
      recipient_type: "agent",
      recipient_id: auth.userId,
      new_match: new_match ?? true,
      price_drop: price_drop ?? true,
      showing_updates: showing_updates ?? true,
      offer_updates: offer_updates ?? true,
      email_digest: email_digest ?? "daily",
      sms_enabled: sms_enabled ?? false,
    },
    update: {
      new_match: new_match ?? undefined,
      price_drop: price_drop ?? undefined,
      showing_updates: showing_updates ?? undefined,
      offer_updates: offer_updates ?? undefined,
      email_digest: email_digest ?? undefined,
      sms_enabled: sms_enabled ?? undefined,
    },
  });

  return NextResponse.json({
    ok: true,
    item: { ...prefs, id: prefs.id.toString(), recipient_id: prefs.recipient_id.toString() },
  });
}
