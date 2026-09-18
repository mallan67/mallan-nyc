import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("agent authority docs stay on live sources", () => {
  const authorityDocs = [
    "AGENTS.md",
    "CLAUDE.md",
    "NEON.md",
    "docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md",
  ];

  test("canonical agent docs forbid Desktop working-state drift", () => {
    for (const rel of authorityDocs) {
      const body = read(rel);
      expect(body).not.toContain("C:\\Users\\MayaAllan\\Desktop");
    }

    expect(read("AGENTS.md")).toContain("GitHub-only working state");
    expect(read("CLAUDE.md")).toContain("GitHub-only working-state rule");
  });

  test("Cotality live access path is real and executable from repo configuration", () => {
    const mcp = JSON.parse(read(".mcp.json"));
    const trestle = mcp?.mcpServers?.["trestle-fields"];

    expect(trestle).toBeDefined();
    expect(trestle.command).toBe("node");
    expect(trestle.args).toContain("mcp/trestle-fields/dist/index.js");
    expect(trestle.env).toMatchObject({
      IDX_CLIENT_ID: "${IDX_CLIENT_ID}",
      IDX_CLIENT_SECRET: "${IDX_CLIENT_SECRET}",
      TRESTLE_API_URL: "${TRESTLE_API_URL}",
    });

    const auth = read("lib/idx/auth.ts");
    expect(auth).toContain("process.env.TRESTLE_API_URL");
    expect(auth).toContain('"https://api.cotality.com/trestle"');
    expect(auth).toContain('grant_type: "client_credentials"');
    expect(auth).toContain('scope: "api"');
    expect(auth).toContain("data.expires_in");

    const agents = read("AGENTS.md");
    expect(agents).toContain("authorized live Cotality/Trestle contract");
    expect(agents).toContain(".mcp.json");
    expect(agents).toContain("lib/idx/auth.ts");
    expect(agents).not.toContain("Known live truths (2026-07-05)");
  });

  test("Neon authority path is Vercel-managed and stale claims cannot re-enter canonical docs", () => {
    const combined = authorityDocs.map(read).join("\n");

    expect(combined).toContain("store_K9l79ICRUTMsiRh2");
    expect(combined).toContain("hidden-mountain-87248164");
    expect(combined).toContain("ep-cold-waterfall-adno3ao2");
    expect(combined).toContain("vercel integration open neon neon-green-school");

    for (const stale of [
      "2/5000",
      "This is where preview branches accumulate",
      "NEON_PROJECT_ID on Vercel Production still names the legacy",
      '`round-recipe-12208101` / "neon-green-door" is NOT connected',
    ]) {
      expect(combined).not.toContain(stale);
    }
  });

  test("current prune documentation matches the fail-closed route shape", () => {
    const route = read("app/api/cron/neon-branch-prune/route.ts");
    const neon = read("NEON.md");

    expect(route).toContain("if (!apiKey || !projectId)");
    expect(route).toContain("{ status: 503 }");
    expect(route).toContain("isCanonicalNeonProject(projectId)");

    expect(neon).toContain("returns HTTP 503");
    expect(neon).toContain("does **not** call `pruneBranches()`");
  });
  test("GitHub enforcement workflows use canonical base authority", () => {
    const prCheck = read(".github/workflows/pr-check.yml");
    expect(prCheck).toContain("Mallan execution control");
    expect(prCheck).toContain("fetch-depth: 0");
    expect(prCheck).toContain("scripts/ci/mallan-execution-control.mjs");

    const root = read(".github/workflows/authority-root.yml");
    expect(root).toContain("pull_request_target:");
    expect(root).toContain("contents: read");
    expect(root).toContain("github.event.pull_request.base.sha");
    expect(root).toContain("cp scripts/ci/mallan-execution-control.mjs /tmp/mallan-execution-control.mjs");
    expect(root).toContain("github.event.pull_request.head.sha");
    expect(root).toContain("node /tmp/mallan-execution-control.mjs");

    const branchGuard = read(".github/workflows/branch-authority.yml");
    expect(branchGuard).toContain("create:");
    expect(branchGuard).toContain("contents: write");
    expect(branchGuard).toContain("ref: main");
    expect(branchGuard).toContain("--branch-created");
    expect(branchGuard).toContain("gh api -X DELETE");
  });

});
