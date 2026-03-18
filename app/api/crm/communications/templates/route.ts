// /api/crm/communications/templates — GET: return email templates for compose modal.
// Stored as agent-scoped AuditEvents (action: "email_template").
// Falls back to system defaults if none saved.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

const SYSTEM_TEMPLATES = [
  {
    id: "sys_intro",
    name: "Introduction",
    subject: "Nice to meet you — {agentName} at Mallan Real Estate",
    body: "Hi {clientName},\n\nIt was great connecting with you. I'd love to help you find the perfect property in New York City.\n\nI'll be sending you listings that match your criteria. Feel free to reach out anytime with questions.\n\nBest regards,\n{agentName}",
    system: true,
  },
  {
    id: "sys_followup",
    name: "Follow Up After Showing",
    subject: "How did you like {address}?",
    body: "Hi {clientName},\n\nThank you for viewing {address} yesterday. I'd love to hear your thoughts.\n\nDid anything stand out to you? Would you like to schedule a second visit or see similar properties?\n\nLooking forward to hearing from you.\n\nBest,\n{agentName}",
    system: true,
  },
  {
    id: "sys_checkin",
    name: "Check In",
    subject: "Checking in — any updates on your search?",
    body: "Hi {clientName},\n\nJust wanted to check in and see how your property search is going. The market has had some interesting new listings recently.\n\nWould you like me to send you some updated options?\n\nBest,\n{agentName}",
    system: true,
  },
];

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  // Look for agent-saved custom templates
  const customTemplates = await prisma.auditEvent.findMany({
    where: {
      action: "email_template",
      user_id: auth.userId,
    },
    orderBy: { created_at: "desc" },
    take: 50,
  });

  const custom = customTemplates.map((t) => {
    const data = (t.changes || {}) as Record<string, unknown>;
    return {
      id: t.id.toString(),
      name: (data.name as string) || "Untitled Template",
      subject: (data.subject as string) || "",
      body: (data.body as string) || "",
      system: false,
    };
  });

  return NextResponse.json({
    templates: [...SYSTEM_TEMPLATES, ...custom],
  });
}
