/// <reference types="jest" />
/**
 * Session and access-control enforcement — the REAL validateSession and require* helpers, with Prisma mocked.
 *
 * Covers: unauthenticated requests, forged tokens, expired sessions (and their cleanup), near-expiry rotation,
 * CRM (agent/broker) access vs portal (lead) users, and portal-role separation.
 */

import { NextRequest } from "next/server";
import { buildPrismaMock, readJson } from "./helpers";

const { prisma: prismaMock } = buildPrismaMock();
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: prismaMock }));

import { validateSession } from "@/lib/auth/session";
import { requireAuth, requireRole, requireBroker, requireAgentOrBroker, requirePortalRole, isAuthError } from "@/lib/auth/middleware";

const db = prismaMock as unknown as Record<string, Record<string, jest.Mock>>;

const DAY = 24 * 60 * 60 * 1000;
const req = (cookie?: string) =>
  new NextRequest("https://mallan.nyc/api/crm/anything", cookie ? { headers: { cookie } } : undefined);

const row = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  token: "tok",
  user_id: 7n,
  user_type: "agent",
  role: "BROKER",
  expires_at: new Date(Date.now() + 5 * DAY),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  db.session.findUnique.mockReset();
  db.session.update.mockReset();
  db.session.delete.mockReset();
  db.lead.findUnique.mockReset();
  db.session.update.mockResolvedValue({});
  db.session.delete.mockResolvedValue({});
});

describe("unauthenticated and forged requests", () => {
  it("no cookie -> 401 and the database is never consulted", async () => {
    const res = await requireAuth(req());
    expect(isAuthError(res)).toBe(true);
    if (isAuthError(res)) {
      expect(res.status).toBe(401);
      expect(await readJson<{ error: string }>(res)).toEqual({ error: "Authentication required" });
    }
    expect(db.session.findUnique).not.toHaveBeenCalled();
  });

  it("a forged session_token that matches no session -> 401 and the cookie is cleared", async () => {
    db.session.findUnique.mockResolvedValue(null);
    const res = await requireAuth(req("session_token=forged-not-a-real-token"));
    expect(isAuthError(res)).toBe(true);
    if (isAuthError(res)) {
      expect(res.status).toBe(401);
      expect(await readJson<{ error: string }>(res)).toEqual({ error: "Session expired or invalid" });
      expect(res.headers.get("set-cookie") ?? "").toMatch(/session_token=;|session_token=\s*;|Max-Age=0|expires=/i);
    }
  });

  it("a forged token is rejected by every CRM role gate", async () => {
    db.session.findUnique.mockResolvedValue(null);
    for (const gate of [requireAgentOrBroker, requireBroker]) {
      const res = await gate(req("session_token=forged"));
      expect(isAuthError(res) && res.status).toBe(401);
    }
  });
});

describe("expired sessions", () => {
  it("validateSession returns null for an expired session and deletes the row", async () => {
    db.session.findUnique.mockResolvedValue(row({ expires_at: new Date(Date.now() - 1000) }));
    expect(await validateSession("tok")).toBeNull();
    expect(db.session.delete).toHaveBeenCalledWith({ where: { token: "tok" } });
  });

  it("requireAuth turns an expired session into 401 (not a pass-through)", async () => {
    db.session.findUnique.mockResolvedValue(row({ expires_at: new Date(Date.now() - 60_000) }));
    const res = await requireAuth(req("session_token=tok"));
    expect(isAuthError(res) && res.status).toBe(401);
  });

  it("a session that expired one millisecond ago is expired; one that expires in a day is valid", async () => {
    db.session.findUnique.mockResolvedValueOnce(row({ expires_at: new Date(Date.now() - 1) }));
    expect(await validateSession("tok")).toBeNull();
    db.session.findUnique.mockResolvedValueOnce(row({ expires_at: new Date(Date.now() + DAY) }));
    expect(await validateSession("tok")).toMatchObject({ userId: 7n, userType: "agent", role: "BROKER" });
  });
});

describe("valid sessions", () => {
  it("a valid broker session passes requireAuth, requireBroker and requireAgentOrBroker", async () => {
    db.session.findUnique.mockResolvedValue(row());
    for (const gate of [requireAuth, requireBroker, requireAgentOrBroker]) {
      const res = await gate(req("session_token=tok"));
      expect(isAuthError(res)).toBe(false);
    }
  });

  // A session inside the one-hour refresh window is extended by its role's full duration, not expired.
  it.each([
    ["broker agent", "agent", "BROKER", 24 * 60 * 60 * 1000],
    ["agent", "agent", "AGENT", 8 * 60 * 60 * 1000],
    ["client (lead)", "lead", "buyer", 30 * DAY],
  ])("a %s session near expiry is extended by its role duration", async (_label, userType, role, durationMs) => {
    db.session.findUnique.mockResolvedValue(row({ user_type: userType, role, expires_at: new Date(Date.now() + 10 * 60 * 1000) }));
    expect(await validateSession("tok")).not.toBeNull();
    expect(db.session.update).toHaveBeenCalledTimes(1);
    const next = (db.session.update.mock.calls[0][0] as { data: { expires_at: Date } }).data.expires_at.getTime();
    expect(Math.abs(next - (Date.now() + durationMs))).toBeLessThan(5_000);
  });

  it("a session with plenty of time left is not touched", async () => {
    db.session.findUnique.mockResolvedValue(row({ expires_at: new Date(Date.now() + 5 * DAY) }));
    expect(await validateSession("tok")).not.toBeNull();
    expect(db.session.update).not.toHaveBeenCalled();
  });
});

describe("CRM routes versus portal users", () => {
  it("an AGENT session cannot pass a broker-only gate (403)", async () => {
    db.session.findUnique.mockResolvedValue(row({ role: "AGENT" }));
    const res = await requireBroker(req("session_token=tok"));
    expect(isAuthError(res) && res.status).toBe(403);
  });

  it.each(["buyer", "tenant", "seller", "landlord"])("a %s (lead) session is refused by the agent/broker CRM gate (403)", async (portalRole) => {
    db.session.findUnique.mockResolvedValue(row({ user_type: "lead", role: portalRole }));
    const res = await requireAgentOrBroker(req("session_token=tok"));
    expect(isAuthError(res) && res.status).toBe(403);
  });

  it("role matching is case-insensitive (a lowercase 'broker' session still gets broker access)", async () => {
    db.session.findUnique.mockResolvedValue(row({ role: "broker" }));
    expect(isAuthError(await requireRole(req("session_token=tok"), "BROKER"))).toBe(false);
  });
});

describe("portal role separation", () => {
  const leadSession = (portalRole: string) => {
    db.session.findUnique.mockResolvedValue(row({ user_type: "lead", role: portalRole }));
    db.lead.findUnique.mockResolvedValue({ portal_role: portalRole });
  };

  it("a buyer is refused on a seller-only portal route (403), and admitted on a buyer route", async () => {
    leadSession("buyer");
    expect(isAuthError(await requirePortalRole(req("session_token=tok"), "seller", "landlord"))).toBe(true);
    leadSession("buyer");
    expect(isAuthError(await requirePortalRole(req("session_token=tok"), "buyer"))).toBe(false);
  });

  it("a seller is refused on a buyer-only route", async () => {
    leadSession("seller");
    const res = await requirePortalRole(req("session_token=tok"), "buyer");
    expect(isAuthError(res) && res.status).toBe(403);
  });

  it("tenant and renter are the same portal role", async () => {
    leadSession("tenant");
    expect(isAuthError(await requirePortalRole(req("session_token=tok"), "renter"))).toBe(false);
  });

  it("agents and brokers bypass portal role checks", async () => {
    db.session.findUnique.mockResolvedValue(row({ user_type: "agent", role: "AGENT" }));
    expect(isAuthError(await requirePortalRole(req("session_token=tok"), "seller"))).toBe(false);
  });

  it("an unauthenticated visitor is refused before any portal role lookup", async () => {
    const res = await requirePortalRole(req(), "buyer");
    expect(isAuthError(res) && res.status).toBe(401);
    expect(db.lead.findUnique).not.toHaveBeenCalled();
  });
});
