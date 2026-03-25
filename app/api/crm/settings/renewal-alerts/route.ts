// /api/crm/settings/renewal-alerts — GET + POST: license renewal alert settings
// Stored as AuditEvent with action "settings_renewal_alerts" (no dedicated model)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(req: NextRequest) {
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  // Find the most recent settings entry
  const latest = await prisma.auditEvent.findFirst({
    where: {
      action: "settings_renewal_alerts",
      entity_type: "settings",
      user_id: auth.userId,
    },
    orderBy: { created_at: "desc" },
  });

  const defaults = { license_reminder_days: 90, ce_reminder_days: 60, eo_reminder_days: 90 };
  const settings = latest?.changes ? { ...defaults, ...(latest.changes as Record<string, unknown>) } : defaults;

  return NextResponse.json({ settings });
}

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const settings = {
    license_reminder_days: Number(body.license_reminder_days) || 90,
    ce_reminder_days: Number(body.ce_reminder_days) || 60,
    eo_reminder_days: Number(body.eo_reminder_days) || 90,
  };

  await logAuditEvent("settings_renewal_alerts", "settings", "renewal_alerts", auth, settings);

  return NextResponse.json({ settings });
}
