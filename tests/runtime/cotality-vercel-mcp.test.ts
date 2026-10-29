import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const routePath = path.join(ROOT, "app/api/mcp/cotality/route.ts");

describe("Vercel-hosted Cotality MCP boundary", () => {
  const source = fs.readFileSync(routePath, "utf8");

  test("uses Vercel runtime env names and the canonical Cotality URL", () => {
    expect(source).toContain("process.env.TRESTLE_API_URL");
    expect(source).toContain("https://api.cotality.com/trestle");
    expect(source).toContain('import { getAccessToken } from "@/lib/idx/auth"');
    expect(source).not.toContain(".env.local");
    expect(source).not.toContain("CONTROL_PLANE_API_KEY");
  });

  test("is remote HTTP MCP, not a local stdio/tunnel dependency", () => {
    expect(source).toContain('message.method === "initialize"');
    expect(source).toContain('message.method === "server/discover"');
    expect(source).toContain('message.method === "tools/list"');
    expect(source).toContain('message.method === "tools/call"');
    expect(source).not.toContain("StdioServerTransport");
    expect(source).not.toContain("tunnel-client");
  });

  test("exposes contract tools plus one bounded live-resource read tool", () => {
    for (const tool of [
      "cotality_service_document",
      "cotality_metadata_search",
      "cotality_field_catalog",
      "cotality_lookup_catalog",
      "cotality_resource_query",
    ]) {
      expect(source).toContain(tool);
    }
    expect(source).toContain("liveEntitySets()");
    expect(source).toContain("entitySets.has(resource)");
    expect(source).toContain("Math.min(100");
    expect(source).toContain("readOnlyHint: true");
    expect(source).not.toContain("POST /odata");
    expect(source).not.toContain("PATCH /odata");
    expect(source).not.toContain("DELETE /odata");
  });

  test("fails closed if the configured provider URL leaves Cotality", () => {
    expect(source).toContain('url.hostname !== "api.cotality.com"');
    expect(source).toContain('url.pathname !== "/trestle"');
  });
});

jest.mock("@/lib/idx/auth", () => ({ getAccessToken: jest.fn() }));
import { NextRequest } from "next/server";
import { getAccessToken } from "@/lib/idx/auth";
import { POST, GET, DELETE } from "@/app/api/mcp/cotality/route";

const MCP_TOKEN = "test-cotality-mcp-token-32-characters-long";
const initialToken = process.env.COTALITY_MCP_TOKEN;
const initialFetch = global.fetch;
const providerToken = getAccessToken as jest.Mock;

function request(body: unknown, authorization?: string): NextRequest {
  return new NextRequest("https://mallan.nyc/api/mcp/cotality", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authorization ? { authorization } : {}) },
    body: JSON.stringify(body),
  });
}
const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
const query = { jsonrpc: "2.0", id: 2, method: "tools/call", params: {
  name: "cotality_field_catalog", arguments: { filter: "SensitiveFilter eq 'private'", top: 1 },
} };

describe("Cotality MCP authorization and bounded execution", () => {
  beforeEach(() => {
    process.env.COTALITY_MCP_TOKEN = MCP_TOKEN;
    providerToken.mockReset();
    providerToken.mockResolvedValue("provider-token-must-stay-private");
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ value: [] }), {
      headers: { "Content-Type": "application/json" },
    }));
  });
  afterEach(() => {
    if (initialToken === undefined) delete process.env.COTALITY_MCP_TOKEN;
    else process.env.COTALITY_MCP_TOKEN = initialToken;
    global.fetch = initialFetch;
    jest.restoreAllMocks();
  });

  for (const token of [undefined, "", "short", "x".repeat(31)]) {
    it(`is disabled with a missing or short server token (${String(token)})`, async () => {
      if (token === undefined) delete process.env.COTALITY_MCP_TOKEN;
      else process.env.COTALITY_MCP_TOKEN = token;
      const response = await POST(request(query, `Bearer ${MCP_TOKEN}`));
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(providerToken).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  }

  for (const header of [undefined, "Basic wrong", "Bearer wrong", `Bearer ${MCP_TOKEN}x`, `Bearer ${MCP_TOKEN.slice(1)}`]) {
    it(`rejects an invalid credential (${header?.split(" ")[0] ?? "missing"})`, async () => {
      const response = await POST(request(query, header));
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
      expect(providerToken).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  }

  it("authenticates before parsing a malformed body", async () => {
    const req = request(query);
    const parse = jest.spyOn(req, "json");
    expect((await POST(req)).status).toBe(401);
    expect(parse).not.toHaveBeenCalled();
  });

  for (const handler of [GET, DELETE]) {
    it(`also protects ${handler.name}`, async () => {
      delete process.env.COTALITY_MCP_TOKEN;
      expect((await handler(request(ping))).status).toBe(404);
      process.env.COTALITY_MCP_TOKEN = MCP_TOKEN;
      expect((await handler(request(ping))).status).toBe(401);
      const allowed = await handler(request(ping, `Bearer ${MCP_TOKEN}`));
      expect(allowed.status).toBe(405);
      expect(allowed.headers.get("Allow")).toBe("POST");
      expect(providerToken).not.toHaveBeenCalled();
    });
  }

  it("allows a correctly authenticated ping", async () => {
    const response = await POST(request(ping, `Bearer ${MCP_TOKEN}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
    expect(providerToken).not.toHaveBeenCalled();
  });

  it("allows discovery only after authentication", async () => {
    const discovery = { jsonrpc: "2.0", id: 1, method: "tools/list" };
    expect((await POST(request(discovery))).status).toBe(401);
    const response = await POST(request(discovery, `Bearer ${MCP_TOKEN}`));
    const body = await response.json();
    expect(body.result.tools).toHaveLength(5);
  });

  it("accepts ten requests, rejects eleven before provider access", async () => {
    const ten = Array.from({ length: 10 }, (_, id) => ({ ...ping, id }));
    const accepted = await POST(request(ten, `Bearer ${MCP_TOKEN}`));
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toHaveLength(10);
    const rejected = await POST(request(Array.from({ length: 11 }, () => query), `Bearer ${MCP_TOKEN}`));
    expect(rejected.status).toBe(413);
    expect(providerToken).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects an empty batch", async () => {
    expect((await POST(request([], `Bearer ${MCP_TOKEN}`))).status).toBe(400);
  });

  for (const body of [null, 12, "invalid"]) {
    it(`answers an invalid message without throwing (${String(body)})`, async () => {
      const response = await POST(request(body, `Bearer ${MCP_TOKEN}`));
      expect((await response.json()).error.code).toBe(-32600);
      expect(providerToken).not.toHaveBeenCalled();
    });
  }

  it("logs one bounded audit line without filters or either token", async () => {
    const audit = jest.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await POST(request(query, `Bearer ${MCP_TOKEN}`));
    expect(response.status).toBe(200);
    expect(providerToken).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledTimes(1);
    const text = JSON.stringify(audit.mock.calls);
    expect(text).toContain("cotality_field_catalog");
    expect(text).toContain("success");
    for (const value of ["SensitiveFilter", "private", MCP_TOKEN, "provider-token-must-stay-private"]) {
      expect(text).not.toContain(value);
    }
  });

  it("audits failed calls once without the upstream error or filter", async () => {
    providerToken.mockRejectedValue(new Error("private provider failure"));
    const audit = jest.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await POST(request(query, `Bearer ${MCP_TOKEN}`));
    expect((await response.json()).result.isError).toBe(true);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(audit.mock.calls)).toContain("error");
    expect(JSON.stringify(audit.mock.calls)).not.toContain("private");
  });
});
