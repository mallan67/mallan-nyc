import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The required checks are named pr-check and pr-safety. If any other workflow, action or status
// call could produce a check with one of those names, it could satisfy the required check without
// running it. pr-safety refuses a pull request that adds such a use; this test proves that the
// repository as it stands has none. It uses the same rule as the check (reservedCheckSpoofs).
const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "scripts/ci/pr-safety-check.mjs");
const OWNERS: [string, string][] = [
  ["pr-check", ".github/workflows/pr-check.yml"],
  ["pr-safety", ".github/workflows/pr-safety.yml"],
];

function filesUnder(dir: string): string[] {
  if (!fs.existsSync(path.join(ROOT, dir))) return [];
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = dir + "/" + entry.name;
    return entry.isDirectory() ? filesUnder(rel) : [rel];
  });
}

// { path: reserved names it uses without owning them } for the given [path, text] pairs.
function spoofs(files: [string, string][]): Record<string, string[]> {
  const program =
    'import fs from "node:fs";\n' +
    "import { reservedCheckSpoofs } from " + JSON.stringify(pathToFileURL(SCRIPT).href) + ";\n" +
    "const out = {};\n" +
    'for (const [file, text] of JSON.parse(fs.readFileSync(0, "utf8"))) { const s = reservedCheckSpoofs(file, text); if (s.length) out[file] = s; }\n' +
    "process.stdout.write(JSON.stringify(out));\n";
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", program], { input: JSON.stringify(files), encoding: "utf8" });
  if (run.status !== 0) throw new Error("reservedCheckSpoofs failed: " + run.stderr);
  return JSON.parse(run.stdout);
}

describe("reserved required-check names", () => {
  const workflows = [...filesUnder(".github/workflows"), ...filesUnder(".github/actions")].sort();

  test("the scan sees the repository's workflows", () => {
    expect(workflows).toEqual(expect.arrayContaining(OWNERS.map(([, owner]) => owner)));
  });

  test("no workflow or action uses a reserved check name it does not own", () => {
    const texts = workflows.map((f): [string, string] => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]);
    expect(spoofs(texts)).toEqual({});
  });

  test.each(OWNERS)("%s is emitted by its canonical workflow %s", (name, owner) => {
    expect(fs.readFileSync(path.join(ROOT, owner), "utf8")).toMatch(new RegExp("^\\s+" + name + ":\\s*$", "m"));
  });

  test("the rule catches a job id, a job name and a status context, and allows the owner", () => {
    expect(spoofs([
      [".github/workflows/fast.yml", "jobs:\n  pr-check:\n    runs-on: ubuntu-latest\n"],
      [".github/workflows/quick.yml", "jobs:\n  quick:\n    name: pr-safety\n"],
      ["scripts/mark.js", 'octokit.request("POST /repos/o/r/statuses/abc", { context: "pr-check" });\n'],
      [".github/workflows/pr-check.yml", "jobs:\n  pr-check:\n    runs-on: ubuntu-latest\n"],
      ["docs/ci.md", "pr-check and pr-safety are required.\n"],
    ])).toEqual({
      ".github/workflows/fast.yml": ["pr-check"],
      ".github/workflows/quick.yml": ["pr-safety"],
      "scripts/mark.js": ["pr-check"],
    });
  });
});
