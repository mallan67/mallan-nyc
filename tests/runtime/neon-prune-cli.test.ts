/// <reference types="jest" />
import fs from "node:fs";
import path from "node:path";
import { runPruneCli } from "@/scripts/neon-prune-branches";

describe("neon-prune-branches CLI — quarantined direct provider control", () => {
  test("refuses dry-run and execute modes without touching provider state", async () => {
    expect(await runPruneCli([], {})).toBe(2);
    expect(
      await runPruneCli(["--execute"], {
        NEON_API_KEY: "unused",
        NEON_PROJECT_ID: "hidden-mountain-87248164",
      }),
    ).toBe(2);
  });

  test("source has no direct provider helper or mutation credentials", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../scripts/neon-prune-branches.ts"),
      "utf8",
    );
    expect(source).not.toContain('from "@/lib/neon/branches"');
    expect(source).not.toContain("NEON_API_KEY");
    expect(source).not.toContain("NEON_PROJECT_ID");
    expect(source).toContain("QUARANTINED_DIRECT_NEON_CONTROL");
  });
});
