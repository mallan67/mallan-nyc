#!/usr/bin/env -S npx tsx
/**
 * scripts/scanner/setup-env.ts
 *
 * Interactive helper that walks through scanner env-var setup. Opens each
 * signup page in your browser, prompts you for the value as you get it,
 * tests the value live, and appends to .env.local so the local pipeline
 * picks it up.
 *
 * After this completes, mirror the .env.local additions to Vercel:
 *   Project → Settings → Environment Variables → Add for All Environments.
 *
 * Usage:
 *   npx tsx scripts/scanner/setup-env.ts
 *   npx tsx scripts/scanner/setup-env.ts --skip=usps,neverbounce  (defer some)
 */
import { promises as fs } from "fs";
import path from "path";
import readline from "readline/promises";
import { exec } from "child_process";

const REPO_ROOT = process.cwd();
const ENV_LOCAL = path.join(REPO_ROOT, ".env.local");

type Step = {
  id: string;
  name: string;
  intro: string;
  url: string;
  envVars: Array<{ name: string; prompt: string; required: boolean }>;
  test?: (vars: Record<string, string>) => Promise<{ ok: boolean; detail: string }>;
};

const STEPS: Step[] = [
  {
    id: "soda",
    name: "NYC OpenData Socrata App Token",
    intro: `Free, ~5 minutes. Lifts the throttle on Socrata bulk pulls.`,
    url: "https://opendata.cityofnewyork.us/profile/edit/developer_settings",
    envVars: [
      { name: "NYC_SODA_APP_TOKEN", prompt: "Paste the App Token", required: true },
    ],
    test: async (vars) => {
      const tok = vars.NYC_SODA_APP_TOKEN;
      if (!tok) return { ok: false, detail: "missing token" };
      try {
        const url = "https://data.cityofnewyork.us/resource/64uk-42ks.json?$limit=1";
        const r = await fetch(url, { headers: { "X-App-Token": tok } });
        if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
        return { ok: true, detail: "Token accepted by Socrata" };
      } catch (e) {
        return { ok: false, detail: (e as Error).message };
      }
    },
  },
  {
    id: "acris-parties",
    name: "ACRIS Real Property Parties dataset id",
    intro: `Already has a fallback to "636b-3b5g" in code. This step just makes it explicit.`,
    url: "https://data.cityofnewyork.us/Government/ACRIS-Real-Property-Parties/636b-3b5g",
    envVars: [
      { name: "SODA_DATASET_ACRIS_PARTIES", prompt: "Dataset id (default 636b-3b5g — press Enter to accept)", required: false },
    ],
  },
  {
    id: "usps",
    name: "USPS Addresses v3",
    intro: `Free with USPS dev account, ~30 minutes. Required for address verification.`,
    url: "https://developer.usps.com/",
    envVars: [
      { name: "USPS_CLIENT_ID", prompt: "USPS Consumer Key", required: true },
      { name: "USPS_CLIENT_SECRET", prompt: "USPS Consumer Secret", required: true },
    ],
    test: async (vars) => {
      const id = vars.USPS_CLIENT_ID;
      const secret = vars.USPS_CLIENT_SECRET;
      if (!id || !secret) return { ok: false, detail: "missing creds" };
      try {
        const body = new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret });
        const r = await fetch("https://apis.usps.com/oauth2/v3/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
        if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
        const data = (await r.json()) as { access_token?: string };
        return { ok: !!data.access_token, detail: data.access_token ? "OAuth token issued" : "no access_token in response" };
      } catch (e) {
        return { ok: false, detail: (e as Error).message };
      }
    },
  },
  {
    id: "neverbounce",
    name: "NeverBounce email validation",
    intro: `Paid (~$0.005/email). Optional — falls back to free DNS MX check if not configured.`,
    url: "https://app.neverbounce.com/register",
    envVars: [
      { name: "NEVERBOUNCE_API_KEY", prompt: "NeverBounce API Key", required: true },
    ],
    test: async (vars) => {
      const k = vars.NEVERBOUNCE_API_KEY;
      if (!k) return { ok: false, detail: "missing key" };
      try {
        const url = `https://api.neverbounce.com/v4.2/account/info?key=${encodeURIComponent(k)}`;
        const r = await fetch(url);
        if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
        const data = (await r.json()) as { status?: string; credits_info?: unknown };
        return { ok: data.status === "success", detail: data.status === "success" ? "API key valid" : `status=${data.status}` };
      } catch (e) {
        return { ok: false, detail: (e as Error).message };
      }
    },
  },
];

function openInBrowser(url: string) {
  const cmd = process.platform === "win32" ? `start "" "${url}"`
    : process.platform === "darwin" ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => { /* swallow — best effort */ });
}

async function readExisting(): Promise<Record<string, string>> {
  try {
    const text = await fs.readFile(ENV_LOCAL, "utf-8");
    const out: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

async function appendToEnvLocal(updates: Record<string, string>) {
  const existing = await readExisting();
  const lines: string[] = [];
  for (const [k, v] of Object.entries(updates)) {
    if (existing[k] === v) continue;
    lines.push(`${k}=${v}`);
  }
  if (lines.length === 0) return;
  let header = "";
  try { await fs.stat(ENV_LOCAL); }
  catch { header = "# Created by scripts/scanner/setup-env.ts\n"; }
  const block = `\n# Scanner env (added ${new Date().toISOString()})\n` + lines.join("\n") + "\n";
  await fs.appendFile(ENV_LOCAL, header + block);
}

async function main() {
  const skip = new Set<string>();
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--skip=")) a.slice("--skip=".length).split(",").forEach((s) => skip.add(s.trim()));
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const updates: Record<string, string> = {};
  const summary: Array<{ step: string; result: string }> = [];

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("  Scanner env-var setup helper");
  console.log("══════════════════════════════════════════════════════════════════\n");
  console.log(`Will write to: ${ENV_LOCAL}`);
  console.log(`After this finishes, mirror the additions to Vercel:`);
  console.log(`  Project → Settings → Environment Variables → Add (All Environments)\n`);

  const existing = await readExisting();

  for (const step of STEPS) {
    if (skip.has(step.id)) {
      console.log(`\n── Skipping ${step.name} (--skip=${step.id}) ──\n`);
      summary.push({ step: step.name, result: "skipped" });
      continue;
    }
    console.log(`\n── ${step.name} ──`);
    console.log(`  ${step.intro}`);
    console.log(`  URL: ${step.url}`);
    const open = (await rl.question("\n  Open this URL in your browser now? (Y/n) ")).trim().toLowerCase();
    if (open !== "n") {
      openInBrowser(step.url);
      console.log("  (Browser launched. Sign up / generate the credentials, then come back here.)");
    }

    const stepValues: Record<string, string> = {};
    let cancelled = false;
    for (const v of step.envVars) {
      const existingVal = existing[v.name];
      const note = existingVal ? `  (existing value found, press Enter to keep)` : "";
      const prompt = `  ${v.prompt}${note}: `;
      const answer = (await rl.question(prompt)).trim();
      const final = answer || existingVal || "";
      if (!final && v.required) {
        console.log(`  ⚠ ${v.name} is required — skipping this step.`);
        summary.push({ step: step.name, result: "skipped (no value provided)" });
        cancelled = true;
        break;
      }
      if (final) stepValues[v.name] = final;
    }
    if (cancelled) continue;

    // Test if the step has a tester
    if (step.test && Object.keys(stepValues).length > 0) {
      console.log("\n  Testing…");
      const result = await step.test(stepValues);
      if (result.ok) {
        console.log(`  ✅ ${result.detail}`);
        summary.push({ step: step.name, result: `ok — ${result.detail}` });
      } else {
        console.log(`  ❌ ${result.detail}`);
        const keep = (await rl.question("  Save the value anyway? (y/N) ")).trim().toLowerCase();
        if (keep !== "y") {
          summary.push({ step: step.name, result: `failed test, not saved — ${result.detail}` });
          continue;
        }
        summary.push({ step: step.name, result: `saved despite failure — ${result.detail}` });
      }
    } else {
      summary.push({ step: step.name, result: "saved (no live test)" });
    }
    Object.assign(updates, stepValues);
  }

  rl.close();

  if (Object.keys(updates).length > 0) {
    await appendToEnvLocal(updates);
    console.log(`\n  ✅ Wrote ${Object.keys(updates).length} value(s) to ${path.relative(REPO_ROOT, ENV_LOCAL)}`);
  }

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("  Summary");
  console.log("══════════════════════════════════════════════════════════════════");
  for (const s of summary) {
    console.log(`  ${s.step}: ${s.result}`);
  }
  console.log("\n  Next steps:");
  console.log("    1. Mirror the .env.local additions to Vercel (Settings → Environment Variables)");
  console.log("    2. Run: npm run scanner:verify-env");
  console.log("    3. Run: npm run scanner:refresh-from-soda\n");
}

main().catch((err) => {
  console.error("[setup-env] fatal:", err);
  process.exit(1);
});
