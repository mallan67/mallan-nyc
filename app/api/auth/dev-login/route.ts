// POST /api/auth/dev-login
// Dev-only auto-login — creates a REAL session for the broker (Maya).
// Only works on localhost. Returns 404 in production.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createSession, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  // Block in production — NODE_ENV is set by the runtime, not spoofable like Host header
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    // Find the broker agent (Maya)
    const agent = await prisma.agent.findFirst({
      where: { role: "BROKER", status: "active" },
    });

    if (!agent) {
      return NextResponse.json(
        { error: "No active broker found in database" },
        { status: 404 }
      );
    }

    const token = await createSession("agent", agent.id, agent.role);

    await prisma.agent.update({
      where: { id: agent.id },
      data: { last_login: new Date() },
    });

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
      secure: false, // localhost
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60,
    });

    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
