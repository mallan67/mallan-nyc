// POST /api/auth/login
// Authenticates agent or client. Sets session_token httpOnly cookie.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword, createSession, SESSION_COOKIE } from "@/lib/auth";

/**
 * Login request body:
 *   { email: string, password: string, portalType?: "broker"|"agent"|"buyer"|"tenant"|"seller"|"landlord" }
 *
 * portalType defaults to "agent" if not provided.
 * "broker" and "agent" look up the Agent table.
 * "buyer", "tenant", "seller", "landlord" look up the Lead table.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, portalType } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const type = portalType || "agent";
    const clientPortals = ["buyer", "tenant", "seller", "landlord"];
    const isClientPortal = clientPortals.includes(type);

    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined;
    const ua = req.headers.get("user-agent") ?? undefined;

    if (isClientPortal) {
      // Client login via Lead table
      const lead = await prisma.lead.findUnique({
        where: { email: normalizedEmail },
      });
      if (!lead) {
        return NextResponse.json(
          { error: "Invalid email or password. If you just signed up, make sure you're using the same email." },
          { status: 401 }
        );
      }
      if (!lead.password_hash) {
        return NextResponse.json(
          { error: "Your account doesn't have a password yet. Check your email for an invite link, or use Forgot Password to set one." },
          { status: 401 }
        );
      }
      const valid = await verifyPassword(password, lead.password_hash);
      if (!valid) {
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 }
        );
      }

      // Use the portal_role stored on the lead, or the requested type
      const role = lead.portal_role || type;
      const token = await createSession("lead", lead.id, role, ip, ua);

      const res = NextResponse.json({
        success: true,
        // Security: token is set as httpOnly cookie only — never returned in JSON.
        // This prevents XSS-based session theft on the public CRM origin.
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
        maxAge: 24 * 60 * 60, // 24 hours
      });

      return res;
    } else {
      // Agent/Broker login via Agent table
      const agent = await prisma.agent.findUnique({
        where: { email: normalizedEmail },
      });
      if (!agent) {
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 }
        );
      }
      if (agent.status !== "active") {
        return NextResponse.json(
          { error: "Account is inactive or suspended" },
          { status: 403 }
        );
      }
      const valid = await verifyPassword(password, agent.password_hash);
      if (!valid) {
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 }
        );
      }

      const token = await createSession("agent", agent.id, agent.role, ip, ua);

      // Update last_login
      await prisma.agent.update({
        where: { id: agent.id },
        data: { last_login: new Date() },
      });

      const res = NextResponse.json({
        success: true,
        // Security: token is set as httpOnly cookie only — never returned in JSON.
        user: {
          id: agent.id.toString(),
          name: agent.full_name || `${agent.first_name} ${agent.last_name}`,
          email: agent.email,
          role: agent.role,
          userType: "agent",
          // licenseNo and phone omitted from login response — fetch via /api/auth/me if needed
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
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
