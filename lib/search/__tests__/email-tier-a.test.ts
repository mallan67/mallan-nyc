import * as fs from "node:fs";
import * as path from "node:path";

// ──────────────────────────────────────────────────────────────────────
// Email Tier A P0 — static source guards.
//
// Three regression alarms locked here:
//   1. lib/email/sendgrid.ts no longer exports sendTemplatedEmail
//      (the dead-code stub from the SendGrid-templates era).
//   2. No file in app/ or lib/ imports sendTemplatedEmail.
//   3. lib/email/sendgrid.ts contains the Lead-level opt-out boundary
//      check — specifically the `last_unsubscribe_at` lookup gated by
//      the transactional flag.
//
// Route-level tests live in tests/runtime/email-tier-a.test.ts.
// ──────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "../../../");

function readFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

describe("Email Tier A P0 — static source guards", () => {
  describe("Fix #3 — sendTemplatedEmail dead-code stub deleted", () => {
    const sendgridSrc = readFile("lib/email/sendgrid.ts");

    it("lib/email/sendgrid.ts no longer exports sendTemplatedEmail", () => {
      // Source-grep for the function definition. The stub previously
      // appeared as: `export async function sendTemplatedEmail(...)`.
      // It is replaced by a documentation comment that does NOT match
      // this pattern.
      expect(sendgridSrc).not.toMatch(/export\s+async\s+function\s+sendTemplatedEmail\b/);
      expect(sendgridSrc).not.toMatch(/export\s+function\s+sendTemplatedEmail\b/);
    });

    it("comment references the deletion so future contributors see why", () => {
      expect(sendgridSrc).toMatch(/legacy `sendTemplatedEmail` stub/i);
    });
  });

  describe("Fix #3 — no callers of sendTemplatedEmail anywhere", () => {
    function walkSources(dir: string, exts: Set<string>): string[] {
      const out: string[] = [];
      function recurse(d: string) {
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(d, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          const full = path.join(d, e.name);
          if (e.isDirectory()) {
            // Skip node_modules / .next / build outputs / archive
            if (
              e.name === "node_modules" ||
              e.name === ".next" ||
              e.name === ".git" ||
              e.name === "archive" ||
              e.name === "dist" ||
              e.name === "build" ||
              e.name === "_backup"
            ) continue;
            recurse(full);
          } else {
            const dot = e.name.lastIndexOf(".");
            if (dot === -1) continue;
            const ext = e.name.slice(dot);
            if (exts.has(ext)) out.push(full);
          }
        }
      }
      recurse(dir);
      return out;
    }

    it("no .ts / .tsx / .js / .mjs file references sendTemplatedEmail", () => {
      const exts = new Set([".ts", ".tsx", ".js", ".mjs"]);
      const candidates = [
        path.join(REPO_ROOT, "app"),
        path.join(REPO_ROOT, "lib"),
        path.join(REPO_ROOT, "scripts"),
        path.join(REPO_ROOT, "tests"),
      ];
      const offenders: string[] = [];
      for (const dir of candidates) {
        if (!fs.existsSync(dir)) continue;
        const files = walkSources(dir, exts);
        for (const f of files) {
          // Skip:
          //   - email-tier-a tests (they reference the name in
          //     descriptions / assertions, not as calls)
          //   - lib/email/sendgrid.ts itself (the deletion comment
          //     documents what was removed; that's documentation,
          //     not a call site)
          if (f.endsWith("email-tier-a.test.ts")) continue;
          const rel = path.relative(REPO_ROOT, f).replace(/\\/g, "/");
          if (rel === "lib/email/sendgrid.ts") continue;
          const src = fs.readFileSync(f, "utf8");
          if (/\bsendTemplatedEmail\b/.test(src)) {
            offenders.push(rel);
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe("Fix #2 — Lead-level opt-out boundary check present", () => {
    const sendgridSrc = readFile("lib/email/sendgrid.ts");

    it("sendEmail() checks opt-out via the shared suppression helper (Lead + AuditEvent)", () => {
      // The Lead lookup moved into lib/email/suppression.ts (findEmailSuppression), which
      // now suppresses on EITHER Lead.last_unsubscribe_at OR the email_unsubscribed
      // AuditEvent — so non-Lead recipients (e.g. cold ACRIS emails) are suppressed too.
      expect(sendgridSrc).toMatch(/findEmailSuppression\(/);
      const suppressionSrc = readFile("lib/email/suppression.ts");
      expect(suppressionSrc).toMatch(/lead\.findUnique/);
      expect(suppressionSrc).toMatch(/last_unsubscribe_at/);
      expect(suppressionSrc).toMatch(/email_unsubscribed/);
    });

    it("the boundary check is gated by the transactional flag", () => {
      // The source includes `if (opts?.transactional !== true)` to skip
      // the lookup for transactional sends. This is the CAN-SPAM
      // transactional carve-out at 15 USC 7702(2)(B).
      expect(sendgridSrc).toMatch(/opts\?\.transactional\s*!==\s*true/);
    });

    it("recipient email is normalized (lowercase + trim) before lookup", () => {
      // Normalization moved into normalizeEmail() in the shared suppression module.
      const suppressionSrc = readFile("lib/email/suppression.ts");
      expect(suppressionSrc).toMatch(/toLowerCase\(\)\.trim\(\)/);
    });

    it("suppressed return shape includes _suppressed: true", () => {
      // The contract for suppressed sends: success=false, _suppressed=true.
      // Mirrors the existing _devMode pattern.
      expect(sendgridSrc).toMatch(/_suppressed:\s*true/);
    });

    it("suppression is recorded in the audit log", () => {
      expect(sendgridSrc).toMatch(/send_suppressed_unsubscribed/);
    });

    it("Lead lookup failure falls through to send (does not throw)", () => {
      // The implementation wraps the prisma call in try/catch and
      // proceeds with send on lookup failure.
      expect(sendgridSrc).toMatch(/opt-out lookup failed/i);
    });
  });

  describe("Fix #1 — listingExpirationEmail template + cron wiring", () => {
    const templatesSrc = readFile("lib/email/templates.ts");
    const cronSrc = readFile("app/api/cron/listing-expiration/route.ts");

    it("listingExpirationEmail template is exported", () => {
      expect(templatesSrc).toMatch(/export\s+function\s+listingExpirationEmail\b/);
    });

    it("template supports both urgent_7d and deadline_passed variants", () => {
      expect(templatesSrc).toMatch(/variant.*"urgent_7d"\s*\|\s*"deadline_passed"/);
      expect(templatesSrc).toMatch(/variant === "urgent_7d"/);
    });

    it("template includes UCBA Article I framing in both variants", () => {
      // The body explicitly cites UCBA Art. I §6/§7 so the agent reads
      // the legal context without hunting for it.
      expect(templatesSrc).toMatch(/UCBA Art\. I/);
      expect(templatesSrc).toMatch(/§6.*§7|§6\s*\/\s*§7/);
    });

    it("cron imports sendEmail and listingExpirationEmail", () => {
      expect(cronSrc).toMatch(/from\s+["']@\/lib\/email\/sendgrid["']/);
      expect(cronSrc).toMatch(/listingExpirationEmail/);
    });

    it("cron sends transactional company-channel email on the 7-day urgent branch", () => {
      // Find the Task 2 block (warnings_7d++) and assert sendEmail with
      // transactional + company channel appears in the same region.
      const task2 = cronSrc.split("results.warnings_7d++")[0];
      expect(task2).toMatch(/sendEmail\(/);
      expect(task2).toMatch(/channel:\s*["']company["']/);
      expect(task2).toMatch(/transactional:\s*true/);
      expect(task2).toMatch(/variant:\s*["']urgent_7d["']/);
    });

    it("cron sends transactional company-channel email on the deadline-passed branch", () => {
      // Same check for Task 4a (deadlines_missed++).
      const task4a = cronSrc.split("results.deadlines_missed++")[0];
      // Walk back to the start of Task 4a — the missed-deadline block
      // begins after Task 3's `results.periods_created++`.
      const taskBlocks = task4a.split("results.periods_created++");
      const task4aBlock = taskBlocks[taskBlocks.length - 1];
      expect(task4aBlock).toMatch(/sendEmail\(/);
      expect(task4aBlock).toMatch(/channel:\s*["']company["']/);
      expect(task4aBlock).toMatch(/transactional:\s*true/);
      expect(task4aBlock).toMatch(/variant:\s*["']deadline_passed["']/);
    });
  });
});
