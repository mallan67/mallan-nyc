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
