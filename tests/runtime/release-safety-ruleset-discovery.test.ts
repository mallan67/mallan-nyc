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

  // A ruleset whose conditions cannot be read used to fall through rulesetAppliesToMain
  // as "does not apply to main", silently dropping every check it requires. Unreadable
  // and inapplicable are different answers, and only one of them is safe to act on.
  test("a ruleset with no conditions block makes discovery unknown", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": JSON.stringify({
        id: 19435006,
        enforcement: "active",
        target: "branch",
        rules: [
          { type: "required_status_checks", parameters: { required_status_checks: [{ context: "pr-check" }] } },
        ],
      }),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ruleset-ref-name-missing");
  });

  test("a ruleset whose conditions are not an object makes discovery unknown", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": JSON.stringify({
        id: 19435006,
        enforcement: "active",
        target: "branch",
        conditions: "refs/heads/main",
        rules: [],
      }),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ruleset-conditions-malformed");
  });

  test("a ruleset whose include list is not an array makes discovery unknown", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": JSON.stringify({
        id: 19435006,
        enforcement: "active",
        target: "branch",
        conditions: { ref_name: { include: "~DEFAULT_BRANCH", exclude: [] } },
        rules: [],
      }),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ruleset-ref-include-malformed");
  });

  test("a ruleset whose exclude list is not an array makes discovery unknown", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": JSON.stringify({
        id: 19435006,
        enforcement: "active",
        target: "branch",
        conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: "release/*" } },
        rules: [],
      }),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ruleset-ref-exclude-malformed");
  });

  // Three instances of one fail-open were reported in this function, each in a different
  // branch. These two are the remaining ones, found by re-reading every skip against the
  // same question rather than waiting for a fourth report.
  test("a list entry missing its own metadata makes discovery unknown", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": JSON.stringify([[{ id: 19435006 }]]),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ruleset-list-item-metadata-missing");
  });

  test("a list entry with no usable id makes discovery unknown", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": JSON.stringify([[{ enforcement: "active", target: "branch" }]]),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ruleset-list-item-id-missing");
  });

  // A rule with no readable type may well BE the required-checks rule, so skipping it
  // drops every context it declares.
  test("a rule with no readable type makes discovery unknown", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": detail([
        { parameters: { required_status_checks: [{ context: "pr-check" }] } },
      ]),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ruleset-rule-type-missing");
  });

  test("a rule that is not an object makes discovery unknown", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": detail(["required_status_checks"]),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ruleset-rule-not-object");
  });

  // The boundary: a rule of a DIFFERENT but readable type is legitimately skipped, and a
  // list entry that is readably not an active branch ruleset is legitimately skipped.
  test("a readable rule of another type is skipped without blocking", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": detail([
        { type: "pull_request", parameters: { required_approving_review_count: 1 } },
        { type: "required_status_checks", parameters: { required_status_checks: [{ context: "pr-check" }] } },
      ]),
    });
    const result = discover();
    expect(result.ok).toBe(true);
    expect(result.checks).toEqual([{ context: "pr-check", integration_id: null }]);
  });

  test("a readably inactive list entry is skipped without blocking", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": JSON.stringify([[{ id: 1, enforcement: "disabled", target: "branch" }]]),
    });
    const result = discover();
    expect(result.ok).toBe(true);
    expect(result.checks).toEqual([]);
  });
  // The list said active branch. A detail that omits or contradicts that is not a detail
  // saying the ruleset does not apply; it is a detail that cannot be trusted to say
  // anything. Reading it as inapplicable dropped an authority-root requirement.
  test("a detail omitting its own enforcement and target makes discovery unknown", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": JSON.stringify({
        id: 19435006,
        conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
        rules: [
          { type: "required_status_checks", parameters: { required_status_checks: [{ context: "authority-root" }] } },
        ],
      }),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ruleset-detail-metadata-mismatch");
  });

  test("a detail contradicting the list enforcement makes discovery unknown", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": JSON.stringify({
        id: 19435006,
        enforcement: "disabled",
        target: "branch",
        conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
        rules: [],
      }),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ruleset-detail-metadata-mismatch");
  });

  test("a detail that is not an object at all makes discovery unknown", () => {
    const discover = loadDiscovery({
      "rulesets -f includes_parents=true": LIST_ONE_ACTIVE,
      "rulesets/19435006": JSON.stringify("truncated"),
    });
    const result = discover();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ruleset-detail-not-object");
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
