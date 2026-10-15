/// <reference types="jest" />
/**
 * Every inline <script> in every shipped CRM page must parse.
 *
 * A syntax error silently disables the whole script block, so none of that page's logic runs. Two classes
 * of defect shipped for months before this test existed:
 *   - an unterminated string (`window.location.href = '/crm/login.html;`) from a bulk edit, which disabled the
 *     rental viewer, the sale viewer, and the auth gate of both deal forms;
 *   - a raw `</script>` inside a JS string, which ends the script early in the HTML parser (the sale and
 *     rental viewers' "email agent sheet" template).
 * While broken, the viewers' role-masking code never executed, and checks that only grepped for its text
 * still passed. This test uses V8's own parser, with the same end-of-script rule as the HTML parser.
 */

import { readFileSync, readdirSync } from "fs";
import * as path from "path";
import * as vm from "vm";

const CRM = path.resolve(__dirname, "../../public/crm");
const pages = readdirSync(CRM).filter((f) => f.endsWith(".html"));

function inlineScripts(html: string): { body: string; line: number }[] {
  const out: { body: string; line: number }[] = [];
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = m[1] || "";
    if (/\bsrc=/.test(attrs)) continue; // external
    if (/type=["'](?!text\/javascript|module)/.test(attrs)) continue; // json / templates
    out.push({ body: m[2], line: html.slice(0, m.index).split("\n").length });
  }
  return out;
}

describe("CRM pages: inline scripts parse", () => {
  it("finds the CRM pages", () => {
    expect(pages.length).toBeGreaterThan(5);
    expect(pages).toEqual(expect.arrayContaining(["SALE-FORM-WITH-TOOLS.html", "RENTAL-FORM-WITH-TOOLS.html", "index-built.html"]));
  });

  it.each(pages)("%s", (file) => {
    const html = readFileSync(path.join(CRM, file), "utf8");
    const failures: string[] = [];
    inlineScripts(html).forEach(({ body, line }, i) => {
      try {
        new vm.Script(body, { filename: `${file}#script${i + 1}` });
      } catch (e) {
        failures.push(`script #${i + 1} (starts at line ${line}): ${(e as Error).message}`);
      }
    });
    expect(failures).toEqual([]);
  });

  it("no CRM page has an unterminated '/crm/login.html redirect string", () => {
    const hits = pages.filter((f) => /['"]\/crm\/login\.html;\s*$/m.test(readFileSync(path.join(CRM, f), "utf8")));
    expect(hits).toEqual([]);
  });
});
