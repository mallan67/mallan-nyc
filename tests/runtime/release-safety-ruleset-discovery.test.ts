import fs from "node:fs";
import path from "node:path";

/**
 * Ruleset discovery decides which check-runs Release Truth treats as REQUIRED before it
 * will call a deploy proven. Every defect this file guards has the same shape: a response
 * the validator could not actually understand was read as "no more required checks", and
 * discovery returned ok with a short list. That fails OPEN — the aggregator then proves a
 * release against fewer checks than the branch actually requires.
 *
 * These tests run the SHIPPED function text rather than a retyped copy: the source is read
 * off disk, the three relevant functions are lifted out, and `gh` is replaced with a stub
 * that returns exactly the payload under test. If the file stops containing those
 * functions, the harness throws instead of silently testing nothing.
 */

const SOURCE = path.join(process.cwd(), "scripts", "validate-release-status.js");

type Discovery = { ok: boolean; checks: Array<{ context: string; integration_id: number | null }>; reason: string | null };

function loadDiscovery(responses: Record<string, string | null>): () => Discovery {
  const src = fs.readFileSync(SOURCE, "utf8");
  const start = src.indexOf("function refPatternMatches(");
  const endMarker = "const rulesetDiscovery = requiredChecksFromApplicableMainRulesets();";
  const end = src.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("ruleset discovery functions not found in " + SOURCE);
  }
  const block = src.slice(start, end);
  if (!block.includes("function requiredChecksFromApplicableMainRulesets()")) {
    throw new Error("discovery function missing from the lifted block");
  }

  // The stub matches on a distinctive fragment so the test does not depend on the exact
  // flag order of the gh invocation.
  const gh = (command: string): string | null => {
    for (const [fragment, payload] of Object.entries(responses)) {
      if (command.includes(fragment)) return payload;
    }
    throw new Error("unstubbed gh call: " + command);
  };

  // eslint-disable-next-line no-new-func
  return new Function("gh", block + "\nreturn requiredChecksFromApplicableMainRulesets;")(gh);
}

const LIST_ONE_ACTIVE = JSON.stringify([[{ id: 19435006, enforcement: "active", target: "branch" }]]);

function detail(rules: unknown): string {
  return JSON.stringify({
    id: 19435006,
    enforcement: "active",
    target: "branch",
    conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
    rules,
  });
}

describe("main-ruleset required-check discovery", () => {
  test("a well-formed ruleset yields its required contexts", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": detail([
        { type: "required_status_checks", parameters: { required_status_checks: [{ context: "pr-check", integration_id: 15368 }] } },
      ]),
    });
    const result = discover();
    expect(result.ok).toBe(true);
    expect(result.checks).toEqual([{ context: "pr-check", integration_id: 15368 }]);
  });

  // The regression: an entry the validator cannot read was skipped, so a truncated detail
  // dropped a required context and discovery still reported success.
  test("an empty check entry makes discovery unknown rather than silently short", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": detail([
        { type: "required_status_checks", parameters: { required_status_checks: [{}] } },
      ]),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.checks).toEqual([]);
    expect(result.reason).toContain("ruleset-check-context-missing");
  });

  test("a non-object check entry makes discovery unknown", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": detail([
        { type: "required_status_checks", parameters: { required_status_checks: ["pr-check"] } },
      ]),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ruleset-check-entry-malformed");
  });

  test("a check entry losing only its context is not read as a blank context", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": detail([
        { type: "required_status_checks", parameters: { required_status_checks: [{ context: "   ", integration_id: 15368 }] } },
      ]),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ruleset-check-context-missing");
  });

  test("a non-integer integration id makes discovery unknown", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": detail([
        { type: "required_status_checks", parameters: { required_status_checks: [{ context: "pr-check", integration_id: "15368" }] } },
      ]),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ruleset-check-integration-malformed");
  });

  test("a non-array required_status_checks makes discovery unknown", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": detail([
        { type: "required_status_checks", parameters: { required_status_checks: { context: "pr-check" } } },
      ]),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ruleset-required-checks-malformed");
  });

  test("a truncated detail without a rules array makes discovery unknown", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": detail(undefined),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ruleset-detail-malformed-rules");
  });

  // --slurp wraps one array per page. typeof [] and typeof {} are both 'object', so an
  // un-paged shape used to pass and drop every ruleset after the malformed element.
  test("an un-paged list shape makes discovery unknown", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": JSON.stringify([{ id: 1, enforcement: "active", target: "branch" }]),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("ruleset-list-not-paged");
  });

  test("a bare empty array is an anomalous response, not an honest empty result", () => {
    const discover = loadDiscovery({ "rulesets -f includes_parents=true": JSON.stringify([]) });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("ruleset-list-empty");
  });

  test("a repository with genuinely no rulesets reports an empty page set as ok", () => {
    const discover = loadDiscovery({ "rulesets -f includes_parents=true": JSON.stringify([[]]) });
    const result = discover();
    expect(result.ok).toBe(true);
    expect(result.checks).toEqual([]);
  });

  test("an unavailable list makes discovery unknown", () => {
    const discover = loadDiscovery({ "rulesets -f includes_parents=true": null });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("ruleset-list-unavailable");
  });

  test("an unavailable detail makes discovery unknown", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": null,
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ruleset-detail-unavailable");
  });

  test("a ruleset that does not apply to main contributes nothing", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": JSON.stringify({
        id: 19435006,
        enforcement: "active",
        target: "branch",
        conditions: { ref_name: { include: ["refs/heads/release/*"], exclude: [] } },
        rules: [
          { type: "required_status_checks", parameters: { required_status_checks: [{ context: "release-only" }] } },
        ],
      }),
    });
    const result = discover();
    expect(result.ok).toBe(true);
    expect(result.checks).toEqual([]);
  });

  test("main excluded from an otherwise matching ruleset contributes nothing", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": JSON.stringify({
        id: 19435006,
        enforcement: "active",
        target: "branch",
        conditions: { ref_name: { include: ["~ALL"], exclude: ["~DEFAULT_BRANCH"] } },
        rules: [
          { type: "required_status_checks", parameters: { required_status_checks: [{ context: "everything-but-main" }] } },
        ],
      }),
    });
    const result = discover();
    expect(result.ok).toBe(true);
    expect(result.checks).toEqual([]);
  });
});
