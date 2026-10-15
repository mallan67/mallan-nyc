/// <reference types="jest" />
/**
 * MFA verification — the REAL POST /api/auth/mfa/verify handler, with Prisma, hashing and session creation mocked.
 *
 * Proves: a correct code issues a session cookie exactly once; a wrong code never does and counts the attempt;
 * an expired challenge, an unknown challenge, an exhausted-attempts challenge and a missing agent never do;
 * the challenge is single-use (deleted on success).
 */

import { buildPrismaMock, makeRequest, readJson } from "./helpers";

const { prisma: prismaMock } = buildPrismaMock();
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: prismaMock }));

const verifyPasswordMock = jest.fn(async (plain: string, hash: string) => hash === `hash:${plain}`);
const createSessionMock = jest.fn(async () => "new-session-token");
jest.mock("@/lib/auth", () => ({
  __esModule: true,
  verifyPassword: verifyPasswordMock,
  createSession: createSessionMock,
  SESSION_COOKIE: "session_token",
}));
jest.mock("@/lib/auth/cookie-config", () => ({
  __esModule: true,
  getSessionCookieConfig: () => ({ httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" }),
}));
const auditMock = jest.fn(async () => undefined);
jest.mock("@/lib/auth/middleware", () => ({ __esModule: true, logAuditEvent: auditMock }));

const db = prismaMock as unknown as Record<string, Record<string, jest.Mock>>;

const AGENT = { id: 7n, role: "BROKER", email: "broker@mallan.nyc", full_name: "Test Broker", first_name: "Test", last_name: "Broker" };
const mfaRow = (over: Record<string, unknown> = {}) => ({
  id: 11n,
  token: "mfa-token",
  agent_id: 7n,
  code_hash: "hash:123456",
  attempts: 0,
  expires_at: new Date(Date.now() + 4 * 60 * 1000),
  ...over,
});

async function verify(body: object) {
  const route = await import("@/app/api/auth/mfa/verify/route");
  return route.POST(makeRequest({ url: "http://localhost/api/auth/mfa/verify", body }));
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const m of ["findUnique", "update", "delete"]) {
    db.mfaSession[m].mockReset();
    db.agent[m].mockReset();
  }
  db.mfaSession.findUnique.mockResolvedValue(mfaRow());
  db.mfaSession.update.mockResolvedValue({});
  db.mfaSession.delete.mockResolvedValue({});
  db.agent.findUnique.mockResolvedValue(AGENT);
  db.agent.update.mockResolvedValue({});
});

const sessionIssued = (res: Response) => (res.headers.get("set-cookie") ?? "").includes("session_token=new-session-token");

describe("correct code", () => {
  it("issues exactly one session cookie, returns the user, and consumes the challenge (single use)", async () => {
    const res = await verify({ mfa_session: "mfa-token", code: "123456" });
    expect(res.status).toBe(200);
    expect(sessionIssued(res)).toBe(true);
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(await readJson<{ success: boolean; user: { role: string } }>(res)).toMatchObject({ success: true, user: { role: "BROKER" } });
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(db.mfaSession.delete).toHaveBeenCalledWith({ where: { id: 11n } });
    expect(auditMock).toHaveBeenCalledWith("mfa_verify_success", "agent", "7", expect.anything(), expect.anything(), undefined);
  });

  it("trims surrounding whitespace in the submitted code", async () => {
    const res = await verify({ mfa_session: "mfa-token", code: "  123456 " });
    expect(res.status).toBe(200);
  });

  it("after success the same challenge cannot be replayed (it no longer exists)", async () => {
    await verify({ mfa_session: "mfa-token", code: "123456" });
    db.mfaSession.findUnique.mockResolvedValue(null); // deleted
    const replay = await verify({ mfa_session: "mfa-token", code: "123456" });
    expect(replay.status).toBe(422);
    expect(sessionIssued(replay)).toBe(false);
    expect(createSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("wrong code", () => {
  it("is rejected (422), counts the attempt, reports the attempts left, and issues no session", async () => {
    const res = await verify({ mfa_session: "mfa-token", code: "000000" });
    expect(res.status).toBe(422);
    expect(sessionIssued(res)).toBe(false);
    expect((await readJson<{ error: string }>(res)).error).toMatch(/Invalid code\. 4 attempts remaining/);
    expect(db.mfaSession.update).toHaveBeenCalledWith({ where: { id: 11n }, data: { attempts: { increment: 1 } } });
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledWith("mfa_verify_fail", "agent", "7", expect.anything(), { attempts: 1 }, undefined);
  });

  it("the last allowed attempt says 1 attempt remaining", async () => {
    db.mfaSession.findUnique.mockResolvedValue(mfaRow({ attempts: 3 }));
    const res = await verify({ mfa_session: "mfa-token", code: "000000" });
    expect((await readJson<{ error: string }>(res)).error).toMatch(/1 attempt remaining/);
  });
});

describe("challenges that must never produce a session", () => {
  it("an expired challenge (even with the right code) -> 422, deleted, no session", async () => {
    db.mfaSession.findUnique.mockResolvedValue(mfaRow({ expires_at: new Date(Date.now() - 1000) }));
    const res = await verify({ mfa_session: "mfa-token", code: "123456" });
    expect(res.status).toBe(422);
    expect(sessionIssued(res)).toBe(false);
    expect(db.mfaSession.delete).toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("five failed attempts lock the challenge (429, deleted) even if the next code is right", async () => {
    db.mfaSession.findUnique.mockResolvedValue(mfaRow({ attempts: 5 }));
    const res = await verify({ mfa_session: "mfa-token", code: "123456" });
    expect(res.status).toBe(429);
    expect(sessionIssued(res)).toBe(false);
    expect(db.mfaSession.delete).toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("an unknown or forged challenge token -> 422, no session", async () => {
    db.mfaSession.findUnique.mockResolvedValue(null);
    const res = await verify({ mfa_session: "forged", code: "123456" });
    expect(res.status).toBe(422);
    expect(sessionIssued(res)).toBe(false);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("a challenge whose agent no longer exists -> 400, deleted, no session", async () => {
    db.agent.findUnique.mockResolvedValue(null);
    const res = await verify({ mfa_session: "mfa-token", code: "123456" });
    expect(res.status).toBe(400);
    expect(sessionIssued(res)).toBe(false);
    expect(db.mfaSession.delete).toHaveBeenCalled();
  });

  it.each([
    [{}],
    [{ mfa_session: "mfa-token" }],
    [{ code: "123456" }],
    [{ mfa_session: "", code: "" }],
  ])("missing fields %j -> 400, nothing consulted, no session", async (body) => {
    const res = await verify(body);
    expect(res.status).toBe(400);
    expect(db.mfaSession.findUnique).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});
