/**
 * Read-only Project Health probe — refreshes the AUTO-PROBED block of
 * docs/PROJECT-HEALTH-DASHBOARD.md (between the HEALTH:AUTO markers).
 *
 * STRICTLY READ-ONLY against every live system. It shells out to read-only `git`, `gh`, and
 * `neonctl` commands, parses vercel.json, and (only if a canonical DATABASE_URL is present) runs a
 * few read-only COUNT/MAX queries. It NEVER writes to production, env, cron, or Neon — the ONLY file
 * it writes is the dashboard markdown. Any probe that fails (tool missing / not authed / offline)
 * degrades to ⚪ UNVERIFIED rather than throwing, so a partial refresh is still honest.
 *
 * Usage:  npx tsx scripts/health/probe.ts      (or)  npm run health:probe
 *
 * The assessed-tier sections of the dashboard (outside the markers) are left untouched — those are
 * maintained by an agent with the right tool (Vercel MCP, Lighthouse, manual smoke), not this probe.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { dbGrowthCell, cotalityFreshnessCell, cotalityOutcomeCell } from "./health-status";

// NO override: a shell-supplied env (the operator's explicit canonical `DATABASE_URL_UNPOOLED=… npm
// run health:probe`) must WIN over a possibly-stale workstation .env.local (Codex #466).
dotenv.config({ path: path.resolve(".env.local") });

const NOW = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const DASH = path.resolve("docs/PROJECT-HEALTH-DASHBOARD.md");
const AUTO_START = "<!-- HEALTH:AUTO:START -->";
const AUTO_END = "<!-- HEALTH:AUTO:END -->";

// Canonical Neon identity (mirror of AGENTS.md / CLAUDE.md — the probe fails closed if these drift).
const NEON_PROJECT = "hidden-mountain-87248164";
const NEON_ORG = "org-wild-king-99967357";
const NEON_DEFAULT_BRANCH = "br-crimson-frog-adr7g9gt";
const CANONICAL_ENDPOINT = "ep-cold-waterfall-adno3ao2";

function sh(cmd: string): string {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60_000 }).trim();
}
/** Run a probe; on ANY failure call the thunk (which records UNVERIFIED cells) — never throw. */
function tryProbe(fn: () => void, onFail: () => void): void {
  try { fn(); } catch { onFail(); }
}
async function tryProbeAsync(fn: () => Promise<void>, onFail: () => void): Promise<void> {
  try { await fn(); } catch { onFail(); }
}

type Status = "🟢" | "🟡" | "🔴" | "⚪";
interface Cell { area: string; status: Status; evidence: string }
const cells: Cell[] = [];
const add = (area: string, status: Status, evidence: string) => cells.push({ area, status, evidence });

// ── 1. Git / main SHA ───────────────────────────────────────────────────────
tryProbe(() => {
  const mainSha = sh("git rev-parse --short main");
  const branch = sh("git rev-parse --abbrev-ref HEAD");
  add("Repo / main HEAD", "🟢", `main \`${mainSha}\`; probed from branch \`${branch}\``);
}, () => add("Repo / main HEAD", "⚪", "git unavailable"));

// ── 2. Open PRs + #465 gate state ────────────────────────────────────────────
tryProbe(() => {
  // --limit 200: gh defaults to 30, which would silently undercount the open-PR backlog (Codex #466).
  const prs = JSON.parse(sh("gh pr list --state open --limit 200 --json number,title")) as Array<{ number: number; title: string }>;
  const codePrs = prs.filter((p) => !/report-only/i.test(p.title));
  add("Open PRs", prs.length > 12 ? "🟡" : "🟢",
    `${prs.length} open (${codePrs.length} non-audit): ${codePrs.slice(0, 4).map((p) => `#${p.number}`).join(", ") || "none"}`);
}, () => add("Open PRs", "⚪", "gh unavailable / not authed"));

tryProbe(() => {
  // No --jq (single-quoted jq breaks under cmd.exe on Windows); parse the JSON in-process instead.
  // #465 merged 2026-07-02 — once MERGED, report that fact instead of stale
  // "review before merge" CI guidance (Codex #467: auto tier contradicted the
  // assessed tier after the merge). Row auto-retires to a merged notice.
  const view = JSON.parse(sh("gh pr view 465 --json state,statusCheckRollup,mergedAt")) as {
    state?: string; mergedAt?: string; statusCheckRollup?: Array<Record<string, unknown>>;
  };
  if (view.state === "MERGED") {
    // Codex #467 r3: claim ONLY what this probe verified (gh merge state).
    // Deploy/runtime liveness is proven separately (Vercel MCP + RW-004).
    add("PR #465 (rehydration guard)", "🟢",
      `MERGED ${String(view.mergedAt || "").slice(0, 16)}Z (gh merge-state only — deploy/runtime proof lives in RW-004)`);
    return;
  }
  const roll = view.statusCheckRollup ?? [];
  const norm = roll.map((c) => String(c.conclusion || c.state || c.status || "").toUpperCase());
  const fails = norm.filter((v) => /FAIL|ERROR|CANCEL|TIMED/.test(v)).length;
  const pending = norm.filter((v) => v === "" || /PENDING|QUEUED|IN_PROGRESS|EXPECTED/.test(v)).length;
  const s: Status = fails ? "🔴" : pending ? "🟡" : "🟢";
  add("PR #465 CI (rehydration guard)", s,
    `${norm.length} checks — ${fails} fail, ${pending} pending; review CURRENT HEAD before merge`);
}, () => add("PR #465 (rehydration guard)", "⚪", "gh checks unavailable"));

// ── 3. Neon canonical identity + rollback branch ─────────────────────────────
tryProbe(() => {
  const raw = sh(`neonctl branches list --project-id ${NEON_PROJECT} --org-id ${NEON_ORG} --output json`);
  const branches = JSON.parse(raw) as Array<{ id: string; name: string; default: boolean; current_state: string }>;
  const def = branches.find((b) => b.default);
  const rollback = branches.find((b) => /pre-gate6/.test(b.name));
  const canonicalOk = def?.id === NEON_DEFAULT_BRANCH;
  add("Neon canonical identity", canonicalOk ? "🟢" : "🔴",
    canonicalOk
      ? `default \`${def!.name}\`=\`${NEON_DEFAULT_BRANCH}\` (${def!.current_state}); ${branches.length} branch(es)`
      : `DEFAULT BRANCH MISMATCH — expected ${NEON_DEFAULT_BRANCH}, got ${def?.id ?? "none"}`);
  add("Gate 6 rollback branch", rollback ? "🟢" : "🟡",
    rollback ? `\`${rollback.name}\` (${rollback.id}) ${rollback.current_state}` : "no pre-gate6 rollback branch present");
}, () => {
  add("Neon canonical identity", "⚪", "neonctl unavailable / not authed");
  add("Gate 6 rollback branch", "⚪", "neonctl unavailable / not authed");
});

// ── 3b. Neon facts drift gate (OPS-016) — authoritative check = scripts/neon-verify.ts ──
// Reuses the single source of truth; exit 0 = docs match live, 1 = DRIFT, 2 = UNVERIFIED.
tryProbe(() => {
  let code = 0;
  try {
    sh("npx tsx scripts/neon-verify.ts");
  } catch (e) {
    // A real drift exits 1; an unreachable/unauthed Neon exits 2. If the runner
    // itself is missing (npx/tsx ENOENT → status undefined), treat as UNVERIFIED
    // (2, ⚪), not a false DRIFT (🔴).
    const st = (e as { status?: number }).status;
    code = typeof st === "number" ? st : 2;
  }
  const s: Status = code === 0 ? "🟢" : code === 2 ? "⚪" : "🔴";
  add("Neon facts drift (neon:verify)", s,
    code === 0 ? "NEON.md NEON:FACTS block == live Neon (12/12 facts incl. history_retention 21600s)"
      : code === 2 ? "UNVERIFIED — neonctl not authed/offline (run `npm run neon:verify` locally)"
        : "DRIFT — NEON.md disagrees with live Neon; run `npm run neon:verify` for the field diff");
}, () => add("Neon facts drift (neon:verify)", "⚪", "neon:verify unavailable"));

// ── 4. Cron cadence from vercel.json (schedule = source of truth) ────────────
tryProbe(() => {
  const vercel = JSON.parse(readFileSync(path.resolve("vercel.json"), "utf8")) as { crons?: Array<{ path: string; schedule: string }> };
  const crons = vercel.crons ?? [];
  const find = (p: string) => crons.find((c) => c.path === p)?.schedule ?? "MISSING";
  // CORRECTED 2026-08-07 (commit 8C). This expected idx-sync `*/10`,
  // media-sync `*/15` and db-keepalive `*/15` as DIRECT schedules. All three
  // are now stale and the probe reported a permanent amber:
  //   - idx-sync / media-sync are MEMBERS of /api/cron/one-cycle, which is
  //     itself driven by the scheduled /api/cron/one-cycle-preflight (the
  //     pre-Neon skip boundary). Neither has its own entry BY DESIGN.
  //   - db-keepalive was REMOVED in the approved 2026-07 compute reduction
  //     (PR #481) so the endpoint can autosuspend —
  //     docs/architecture/NEON-COST-CONTROL-POLICY.md:32. Its ABSENCE is the
  //     healthy state; monitoring must never flag it as unhealthy.
  // Same "green = stays out of vercel.json" pattern already used for
  // media-backfill below. Newer canonical cost policy wins over older
  // operational prose.
  const preflight = find("/api/cron/one-cycle-preflight");
  const keepaliveAbsent = find("/api/cron/db-keepalive") === "MISSING";
  const cadenceOk = preflight === "*/10 * * * *" && keepaliveAbsent;
  add("Cron cadence (live Cotality)", cadenceOk ? "🟢" : "🟡",
    `${crons.length} crons; one-cycle-preflight \`${preflight}\` (drives idx-sync + media-sync); ` +
    `db-keepalive intentionally absent: ${keepaliveAbsent ? "yes" : "NO — unexpected schedule present"}`);
  // QUAL-006/OPS-008 resolved 2026-07-02: the media-backfill route was DELETED
  // (unscheduled since PR #176). Green = stays out of vercel.json; a schedule
  // entry reappearing without a route is the idx:validate "SCHEDULED BUT
  // MISSING" critical.
  const backfillScheduled = crons.some((c) => c.path === "/api/cron/media-backfill");
  // Codex #471: green must verify BOTH halves of the QUAL-006 resolution —
  // no vercel.json entry AND the route file gone. If the route file
  // reappears unscheduled, that recreates the original idx:validate
  // NOT-SCHEDULED critical, so this cell must go red, not stay green.
  const backfillRouteExists = existsSync(path.resolve(process.cwd(), "app/api/cron/media-backfill/route.ts"));
  const backfillState: Status = backfillScheduled || backfillRouteExists ? "🔴" : "🟢";
  add("media-backfill removal (QUAL-006/OPS-008)", backfillState,
    backfillScheduled
      ? "vercel.json schedules /api/cron/media-backfill but the route was deleted 2026-07-02"
      : backfillRouteExists
        ? "route file REAPPEARED without a schedule — recreates the idx:validate NOT-SCHEDULED critical (QUAL-006 regression)"
        : "not scheduled AND route file absent (both verified) — idx:validate 0-critical baseline restored 2026-07-02");
}, () => add("Cron cadence (live Cotality)", "⚪", "vercel.json unreadable"));

async function main(): Promise<void> {
  // ── 5. DB growth + Cotality ingestion freshness (only if canonical DATABASE_URL present) ──
  const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";
  const dbIsCanonical = (() => { try { return new URL(dbUrl).hostname.startsWith(CANONICAL_ENDPOINT); } catch { return false; } })();
  if (dbIsCanonical) {
    await tryProbeAsync(async () => {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
      try {
        const total = await prisma.listing.count();
        const archived = await prisma.listing.count({ where: { sync_status: "archived" } });
        // Freshness = the RUN-ATTEMPT clock (SyncState.last_run_at), NOT
        // MAX(listings.last_synced_from_trestle): Phase 3 write-suppression
        // stops bumping per-row telemetry on unchanged listings, so a
        // quiet-but-healthy feed would age the row-level max into yellow/red
        // (Codex post-merge review). last_run_at advances on every attempt.
        const propertySync = await prisma.syncState.findUnique({ where: { resource: "Property" } });
        const last = propertySync?.last_run_at ?? null;
        const ageMin = last ? Math.round((Date.now() - new Date(last).getTime()) / 60000) : null;
        const fresh = cotalityFreshnessCell(ageMin);
        const outcome = cotalityOutcomeCell(propertySync?.last_run_status ?? null, propertySync?.rows_with_errors ?? null);
        add("Cotality sync attempt freshness", fresh.status, fresh.evidence);
        add("Cotality last-run outcome", outcome.status, outcome.evidence);
        // Gate on a sane floor — a successful read of an empty/restored branch must NOT show 🟢 (Codex #466).
        const growth = dbGrowthCell(total, archived);
        add("DB growth / archive state", growth.status, growth.evidence);

        // ── Feed-bloat invariant (Maya 2026-07-05) ──
        // Third-party, never-active Closed listings the incremental sync must NEVER create
        // (root-cause guard: shouldSkipNewTerminalListing in lib/idx/sync.ts). If this ever
        // goes non-zero after a sync, the guard regressed — alert. Same hardened predicate
        // used for the one-time cleanup (excludes any Mallan-owned/attributed row).
        const bloatRows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
          `SELECT count(*)::int AS n FROM listings
             WHERE status='Closed' AND first_active_date IS NULL AND agent_id IS NULL AND idx_display_yn=false
               AND listing_id NOT LIKE 'SL-%' AND listing_id NOT LIKE 'RL-%'
               AND rls_eligible IS DISTINCT FROM false AND owner_client_id IS NULL
               AND (list_office_name IS NULL OR list_office_name NOT ILIKE '%mallan%')`);
        const bloatN = Number(bloatRows[0]?.n ?? 0);
        add("Feed-bloat invariant (never-active third-party Closed)", bloatN === 0 ? "🟢" : "🔴",
          bloatN === 0
            ? "0 rows — incremental-sync guard holding; no third-party Closed bloat"
            : `${bloatN} never-active third-party Closed rows present — sync guard regressed OR pre-cleanup backlog remains (expected 0 after cleanup + guard)`);
      } finally {
        await prisma.$disconnect();
      }
    }, () => {
      add("Cotality sync attempt freshness", "⚪", "DB read failed");
      add("Cotality last-run outcome", "⚪", "DB read failed");
      add("DB growth / archive state", "⚪", "DB read failed");
    });
  } else {
    add("Cotality sync attempt freshness", "⚪", "no canonical DATABASE_URL in env (pass cold-waterfall to fill)");
    add("Cotality last-run outcome", "⚪", "no canonical DATABASE_URL in env (pass cold-waterfall to fill)");
    add("DB growth / archive state", "⚪", "no canonical DATABASE_URL in env (pass cold-waterfall to fill)");
  }

  // ── Render + splice into the dashboard between the markers ──────────────────
  const header = `Last probed (UTC): **${NOW}** — refreshed by \`npm run health:probe\` (read-only). ⚪ = not verified this run.`;
  const table = [
    "| Area | Status | Evidence |",
    "|------|--------|----------|",
    ...cells.map((c) => `| ${c.area} | ${c.status} | ${c.evidence} |`),
  ].join("\n");
  const block = `${AUTO_START}\n_${header}_\n\n${table}\n${AUTO_END}`;

  const doc = readFileSync(DASH, "utf8");
  const start = doc.indexOf(AUTO_START);
  const end = doc.indexOf(AUTO_END);
  if (start === -1 || end === -1) {
    console.error(`FATAL: markers not found in ${DASH} — cannot refresh.`);
    process.exit(1);
  }
  writeFileSync(DASH, doc.slice(0, start) + block + doc.slice(end + AUTO_END.length), "utf8");

  console.log(`[health:probe] refreshed ${cells.length} auto cells at ${NOW}`);
  for (const c of cells) console.log(`  ${c.status} ${c.area} — ${c.evidence}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
