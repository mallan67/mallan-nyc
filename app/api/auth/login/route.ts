// POST /api/auth/login
// Authenticates agent or client. Sets session_token httpOnly cookie.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword, createSession, SESSION_COOKIE } from "@/lib/auth";

/**
 * Login request body:
 *   { email: string, password: string, portalType?: "auto"|"agent"|"client"|"buyer"|"tenant"|"seller"|"landlord" }
 *
 * portalType defaults to "auto" — tries Agent table first, then Lead table.
 * "agent" only checks the Agent table.
 * "client", "buyer", "tenant", "seller", "landlord" only check the Lead table.
 */
export async function POST(req: NextRequest) {
  let step = "init";
  try {
    step = "parse-body";
    const body = await req.json();
    const { email, password, portalType } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const type = portalType || "auto";

    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined;
    const ua = req.headers.get("user-agent") ?? undefined;

    const clientPortals = ["client", "buyer", "tenant", "seller", "landlord"];
    const tryAgent = type === "auto" || type === "agent" || type === "broker";
    const tryLead = type === "auto" || clientPortals.includes(type);

    // --- Try Agent table ---
    if (tryAgent) {
      step = "find-agent";
      const agent = await prisma.agent.findUnique({
        where: { email: normalizedEmail },
      });
      if (agent) {
        if (agent.status !== "active") {
          return NextResponse.json(
            { error: "Account is inactive or suspended" },
            { status: 403 }
          );
        }
        step = "verify-password";
        const valid = await verifyPassword(password, agent.password_hash);
        if (!valid) {
          return NextResponse.json(
            { error: "Invalid email or password", step, foundAgent: true, hashPrefix: agent.password_hash.substring(0, 7), pwLen: password.length },
            { status: 401 }
          );
        }

        step = "create-session";
        const token = await createSession("agent", agent.id, agent.role, ip, ua);

        step = "update-last-login";
        await prisma.agent.update({
          where: { id: agent.id },
          data: { last_login: new Date() },
        });

        step = "build-response";
        const res = NextResponse.json({
          success: true,
          user: {
            id: agent.id.toString(),
            name: agent.full_name || `${agent.first_name} ${agent.last_name}`,
            email: agent.email,
            role: agent.role,
            userType: "agent",
          },
        });

        res.cookies.set(SESSION_COOKIE, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 24 * 60 * 60,
        });

        return res;
      }
    }

    // --- Try Lead table ---
    if (tryLead) {
      step = "find-lead";
      const lead = await prisma.lead.findUnique({
        where: { email: normalizedEmail },
      });
      if (lead) {
        if (!lead.password_hash) {
          return NextResponse.json(
            { error: "Your account doesn't have a password yet. Check your email for an invite link, or use Forgot Password to set one." },
            { status: 401 }
          );
        }
        step = "verify-lead-password";
        const valid = await verifyPassword(password, lead.password_hash);
        if (!valid) {
          return NextResponse.json(
            { error: "Invalid email or password" },
            { status: 401 }
          );
        }

        // Use the portal_role stored on the lead, or the requested type, or default to buyer
        const role = lead.portal_role || (type !== "auto" && type !== "client" ? type : "buyer");
        step = "create-lead-session";
        const token = await createSession("lead", lead.id, role, ip, ua);

        const res = NextResponse.json({
          success: true,
          user: {
            id: lead.id.toString(),
            name: `${lead.first_name} ${lead.last_name}`,
            email: lead.email,
            role,
            userType: "lead",
          },
        });

        res.cookies.set(SESSION_COOKIE, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 24 * 60 * 60,
        });

        return res;
      }
    }

    // No account found in either table
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  } catch (err) {
    console.error("Login error at step:", step, err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Internal server error", step, debug: msg },
      { status: 500 }
    );
  }
}
