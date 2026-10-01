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

  function hasAffirmativeLocalWorkingInstruction(body: string): boolean {
    return body.split(/\r?\n/).some((line) => {
      const l = line.toLowerCase();
      const local = /desktop|local worktree|local checkout|local clone|scratch repo/.test(l);
      const affirmative = /repository work happens|work from|working state is|use .* as .*authority/.test(l);
      const negated = /do not|never|not authority|cannot|must not/.test(l);
      return local && affirmative && !negated;
    });
  }

  test("canonical agent docs require GitHub working authority without rejecting prohibition text", () => {
    expect(hasAffirmativeLocalWorkingInstruction("Repository work happens on a local Desktop checkout.")).toBe(true);
    expect(hasAffirmativeLocalWorkingInstruction("Do not use a local Desktop checkout as working state or authority.")).toBe(false);
    for (const rel of authorityDocs) expect(hasAffirmativeLocalWorkingInstruction(read(rel))).toBe(false);
    expect(read("AGENTS.md")).toContain("Repository work happens in GitHub");
    expect(read("CLAUDE.md")).toContain("GitHub-only working-state rule");
  });

  test("Cotality helper is optional, executable from source, and fail-closed on live-provider loss", () => {
    const mcp = JSON.parse(read(".mcp.json"));
    const trestle = mcp?.mcpServers?.["trestle-fields"];

    expect(trestle).toBeDefined();
    expect(trestle.command).toBe("npx");
    expect(trestle.args).toEqual(["--no-install", "tsx", "mcp/trestle-fields/index.ts"]);
    expect(String(trestle.description)).toContain("Optional local helper");

    const source = read("mcp/trestle-fields/index.ts");
    expect(source).not.toContain("LOCAL_METADATA_FALLBACK");
    expect(source).not.toContain("artifacts/metadata.xml");
    expect(source).not.toContain("local_fallback");
    expect(source).toContain("Live Cotality $metadata unavailable");
    expect(source).toContain("No local snapshot fallback is permitted");

    const auth = read("lib/idx/auth.ts");
    expect(auth).toContain("process.env.TRESTLE_API_URL");
    expect(auth).toContain('grant_type: "client_credentials"');
    expect(auth).toContain('scope: "api"');
    expect(auth).toContain("data.expires_in");

    const readme = read("mcp/trestle-fields/README.md");
    expect(readme).toContain("mcp/trestle-fields/index.ts");
    expect(readme).toContain("No local snapshot fallback");
    expect(readme).not.toContain("dist/index.js");
    expect(readme).not.toContain("falls back to");

    const agents = read("AGENTS.md");
    expect(agents).toContain("optional local developer helper");
    expect(agents).toContain("authorized live Cotality contract");
  });

  test("Execution State does not create a parallel defect-ID registry", () => {
    const state = read("docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md");
    expect(state).toContain("docs/PLATFORM-ISSUE-REGISTRY.md");
    expect(state).not.toContain("Forensic defect register");
    expect(state).not.toContain("B17–B24");
    expect(state).not.toContain("C25–C32");
    expect(state).not.toContain("G63–G68");
  });

  test("Neon authority is Vercel-managed and lifetime-history overclaims stay out", () => {
    const combined = authorityDocs.map(read).join("\n");
    expect(combined).toContain("store_K9l79ICRUTMsiRh2");
    expect(combined).toContain("hidden-mountain-87248164");
    expect(combined).toContain("Vercel-managed");
    expect(combined).not.toContain("exactly one branch ever");
    expect(combined).not.toContain("has never created one");
  });

  test("obsolete direct-Neon control paths are deleted, not quarantined", () => {
    // Mallan reaches Neon only through the Vercel-managed Marketplace resource.
    // A fail-only tombstone is still a Mallan path: it keeps the retired
    // architecture in the tree, keeps its name in catalogs and scripts, and can
    // be revived by deleting three lines. Absence is therefore the assertion.
    // A "contains QUARANTINED" test would pass on a stub and prove nothing.
    const mustNotExist = [
      ".github/workflows/cleanup-neon-preview-branch.yml",
      ".github/workflows/rotate-db-keys.yml",
      "app/api/cron/neon-branch-prune/route.ts",
      "lib/neon/branches.ts",
      "scripts/neon-prune-branches.ts",
      "scripts/branch-prune-health.js",
      "scripts/neon-verify.ts",
    ];
    for (const rel of mustNotExist) {
      expect({ path: rel, exists: fs.existsSync(path.join(ROOT, rel)) }).toEqual({ path: rel, exists: false });
    }

    // The schedule that drove the deleted route must be gone from Vercel config.
    const vercel = JSON.parse(read("vercel.json"));
    expect((vercel.crons || []).some((c: { path?: string }) => c.path === "/api/cron/neon-branch-prune")).toBe(false);

    // No operator entry point may survive the code it invoked.
    const pkg = JSON.parse(read("package.json"));
    expect(Object.keys(pkg.scripts || {}).filter((s) => s.includes("neon-prune"))).toEqual([]);

    // The generated route catalog must not advertise a route that no longer exists.
    // BOTH generated catalogs, not just the JSON. One generator
    // (scripts/reso/route-catalog.js) writes api-route-catalog.json AND
    // api-route-catalog.md. Asserting only the JSON let the Markdown keep
    // advertising the retired endpoint and its deleted route file.
    for (const catalog of ["artifacts/api-route-catalog.json", "artifacts/api-route-catalog.md"]) {
      expect({ catalog, advertisesRetiredRoute: read(catalog).includes("/api/cron/neon-branch-prune") })
        .toEqual({ catalog, advertisesRetiredRoute: false });
    }

    // The generator must own both outputs, so the Markdown cannot silently drift
    // behind the JSON again.
    const generator = read("scripts/reso/route-catalog.js");
    expect(generator).toContain("api-route-catalog.md");
    expect(generator).toContain("api-route-catalog.json");
  });

  test("the retired execution wall is gone and pr-check is read-only", () => {
    // Retired 2026-09-29 by Maya's decision (#646; Master §27.15, §27.18). Absence is the assertion,
    // so the wall cannot quietly return. This proves only the interim unblock: it requires no
    // future gate and pins no provider validator.
    for (const rel of [
      ".github/workflows/branch-authority.yml",
      ".github/workflows/authority-root.yml",
      "scripts/ci/mallan-execution-control.mjs",
      "tests/runtime/mallan-execution-control.test.ts",
    ]) {
      expect({ path: rel, exists: fs.existsSync(path.join(ROOT, rel)) }).toEqual({ path: rel, exists: false });
    }

    const prCheck = read(".github/workflows/pr-check.yml").replace(/\r\n/g, "\n");
    // No controller call remains.
    expect(prCheck).not.toMatch(/mallan-execution-control|authority-root|MALLAN_CONTROL_PHASE|MALLAN_EXECUTION_PROOFS/);
    // Read-only: the pull request's own code runs in this job and never receives write credentials.
    expect(prCheck).toMatch(/^permissions:\n  contents: read\n/m);
    expect(prCheck).not.toMatch(/:\s*write\b/);
    expect(prCheck).toContain("persist-credentials: false");
  });

});
