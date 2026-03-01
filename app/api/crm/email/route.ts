// POST /api/crm/email
// Agent sends an email to their client. Validates recipient is agent's client.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { sendEmail } from "@/lib/email/sendgrid";
import {
  portalInviteEmail,
  listingAlertEmail,
  showingConfirmEmail,
  dealStatusEmail,
  passwordResetEmail,
} from "@/lib/email/templates";

// Template registry — maps template names to generator functions
const TEMPLATE_GENERATORS: Record<
  string,
  (vars: Record<string, unknown>) => { subject: string; html: string }
> = {
  portal_invite: (vars) => ({
    subject: "You're Invited to Your Client Portal — Mallan Real Estate",
    html: portalInviteEmail(
      (vars.clientName as string) || "Client",
      (vars.inviteToken as string) || "",
      (vars.agentName as string) || "Your Agent",
      (vars.portalRole as string) || "buyer"
    ),
  }),
  listing_alert: (vars) => ({
    subject: `${((vars.listings as unknown[]) || []).length} New Listing${((vars.listings as unknown[]) || []).length !== 1 ? "s" : ""} Match Your Criteria`,
    html: listingAlertEmail(
      (vars.listings as { address: string; price: string; beds: number; baths: number; url: string }[]) || [],
      (vars.clientName as string) || "Client"
    ),
  }),
  showing_confirm: (vars) => ({
    subject: `Showing Confirmed — ${(vars.address as string) || "Property"}`,
    html: showingConfirmEmail(vars as {
      clientName: string; address: string; date: string;
      time: string; type: string; agentName: string; notes?: string;
    }),
  }),
  deal_status: (vars) => ({
    subject: `Deal Update: ${(vars.newStatus as string) || "Status Changed"} — ${(vars.address as string) || ""}`,
    html: dealStatusEmail(vars as {
      agentName: string; address: string; newStatus: string; dealId: string; notes?: string;
    }),
  }),
  password_reset: (vars) => ({
    subject: "Reset Your Password — Mallan Real Estate",
    html: passwordResetEmail(
      (vars.token as string) || "",
      vars.userName as string | undefined
    ),
  }),
};

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const { to, subject, template, vars, html } = body;

    if (!to || typeof to !== "string") {
      return NextResponse.json(
        { error: "to (email address) is required" },
        { status: 400 }
      );
    }

    // Validate recipient is agent's client (unless broker)
    if (auth.role !== "BROKER") {
      const client = await prisma.lead.findFirst({
        where: {
          email: to,
          agent_id: auth.userId,
        },
      });
      if (!client) {
        return NextResponse.json(
          { error: "Recipient is not your client" },
          { status: 403 }
        );
      }
    }

    let emailSubject: string;
    let emailHtml: string;

    if (template && typeof template === "string") {
      // Use template
      const generator = TEMPLATE_GENERATORS[template];
      if (!generator) {
        return NextResponse.json(
          { error: `Unknown template: ${template}. Valid: ${Object.keys(TEMPLATE_GENERATORS).join(", ")}` },
          { status: 400 }
        );
      }
      const generated = generator(vars || {});
      emailSubject = subject || generated.subject;
      emailHtml = generated.html;
    } else if (subject && html) {
      // Custom email
      emailSubject = subject;
      emailHtml = html;
    } else {
      return NextResponse.json(
        { error: "Provide either (template + vars) or (subject + html)" },
        { status: 400 }
      );
    }

    const result = await sendEmail(to, emailSubject, emailHtml, auth);

    await logAuditEvent("email_send", "email", to, auth, {
      template: template || "custom",
      subject: emailSubject,
      success: result.success,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send email" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    });
  } catch (err) {
    console.error("Email send error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
