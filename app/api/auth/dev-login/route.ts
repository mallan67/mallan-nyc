// POST /api/auth/dev-login
// Dev-only auto-login — creates a REAL session for the broker (Maya).
// Only works on localhost. Returns 404 in production.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  createSession,
  SESSION_COOKIE,
} from "@/lib/auth";

type DevLoginResult =
  | {
      ok: true;
      token: string;
      agent: { id: string; name: string; email: string; role: string };
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

// GET handler — so you can just visit the URL in the browser
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEV_LOGIN !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Reuse POST logic, set cookie, then show a page that redirects
  const result = await _devLogin(req);
  if (result.ok) {
    const html = `<!DOCTYPE html><html><head></head>
      <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
      <div style="text-align:center">
        <h2 style="color:green">&#10003; Logged in as ${result.agent?.name}</h2>
        <p>Click the link below to open the CRM:</p>
        <a href="/crm/index-built.html" style="font-size:20px;color:blue;text-decoration:underline">Open CRM Search</a>
      </div></body></html>`;
    const res = new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html" } });
    res.cookies.set(SESSION_COOKIE, result.token, {
      httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 24 * 60 * 60,
    });
    return res;
  }
  return NextResponse.json(
    { error: result.error },
    { status: result.status }
  );
}

async function _devLogin(req: NextRequest): Promise<DevLoginResult> {
  try {
    const agent = await prisma.agent.findFirst({
      where: { role: "BROKER", status: "active" },
    });
    if (!agent) return { ok: false, error: "No active broker found", status: 404 };

    // Development-only broker session. The route already 404s unless
    // NODE_ENV !== "production" && ALLOW_DEV_LOGIN === "true"; createSession
    // re-checks both defensively, so this exception cannot exist in production
    // even if this route were reached another way.
    const token = await createSession("agent", agent.id, agent.role, undefined, undefined, {
      kind: "dev_login",
    });

    await prisma.agent.update({ where: { id: agent.id }, data: { last_login: new Date() } });
    console.warn("[DEV-LOGIN] Dev login used at", new Date().toISOString(), "from", req.headers.get("x-forwarded-for") || "local");

    return {
      ok: true,
      token,
      agent: {
        id: agent.id.toString(),
        name: agent.full_name || `${agent.first_name} ${agent.last_name}`,
        email: agent.email,
        role: agent.role,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message, status: 500 };
  }
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEV_LOGIN !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const result = await _devLogin(req);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  const res = NextResponse.json({
    success: true,
    user: { ...result.agent, userType: "agent" },
  });
  res.cookies.set(SESSION_COOKIE, result.token, {
    httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 24 * 60 * 60,
  });
  return res;
}
