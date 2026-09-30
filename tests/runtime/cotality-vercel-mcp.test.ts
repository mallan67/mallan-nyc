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

  test("exposes contract-only read tools and no listing-row endpoint", () => {
    for (const tool of [
      "cotality_service_document",
      "cotality_metadata_search",
      "cotality_field_catalog",
      "cotality_lookup_catalog",
    ]) {
      expect(source).toContain(tool);
    }
    expect(source).not.toContain('/odata/Property');
    expect(source).not.toContain('/odata/Member');
    expect(source).not.toContain('/odata/Office');
    expect(source).not.toContain('/odata/Media');
  });

  test("fails closed if the configured provider URL leaves Cotality", () => {
    expect(source).toContain('url.hostname !== "api.cotality.com"');
    expect(source).toContain('url.pathname !== "/trestle"');
  });
});
