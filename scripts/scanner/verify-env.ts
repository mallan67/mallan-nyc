#!/usr/bin/env -S npx tsx
/**
 * scripts/scanner/verify-env.ts
 *
 * Live test of every scanner-related env var. Hits each provider's API
 * with a tiny request, reports which are configured, which work, which
 * fail. Safe to re-run — every probe is read-only and well under any
 * free-tier budget.
 *
 * Usage:
 *   npm run scanner:verify-env
 */
import "dotenv/config";

interface Probe {
  name: string;
  envVars: string[];
  required: boolean;
  test: () => Promise<{ ok: boolean; detail: string; configured: boolean }>;
}

const PROBES: Probe[] = [
  {
    name: "NYC OpenData Socrata App Token",
    envVars: ["NYC_SODA_APP_TOKEN", "NYC_SOCRATA_APP_TOKEN", "SOCRATA_APP_TOKEN", "SODA_APP_TOKEN", "NYC_SODA_TOKEN"],
    required: true,
    test: async () => {
      const tok = process.env.NYC_SODA_APP_TOKEN || process.env.NYC_SOCRATA_APP_TOKEN
        || process.env.SOCRATA_APP_TOKEN || process.env.SODA_APP_TOKEN || process.env.NYC_SODA_TOKEN;
      if (!tok) return { ok: false, configured: false, detail: "no token in env" };
      try {
        const r = await fetch("https://data.cityofnewyork.us/resource/64uk-42ks.json?$limit=1", {
          headers: { "X-App-Token": tok },
        });
        if (!r.ok) return { ok: false, configured: true, detail: `HTTP ${r.status}: ${await r.text().then((t) => t.slice(0, 100))}` };
        const data = await r.json();
        return { ok: Array.isArray(data), configured: true, detail: `Token accepted by Socrata (returned ${(data as unknown[]).length} sample row)` };
      } catch (e) {
        return { ok: false, configured: true, detail: (e as Error).message };
      }
    },
  },
  {
    name: "PLUTO dataset id",
    envVars: ["SODA_DATASET_PLUTO"],
    required: true,
    test: async () => {
      const id = process.env.SODA_DATASET_PLUTO;
      if (!id) return { ok: false, configured: false, detail: "SODA_DATASET_PLUTO not set" };
      try {
        const tok = process.env.NYC_SODA_APP_TOKEN || process.env.NYC_SOCRATA_APP_TOKEN || process.env.SOCRATA_APP_TOKEN;
        const headers: Record<string, string> = { Accept: "application/json" };
        if (tok) headers["X-App-Token"] = tok;
        const r = await fetch(`https://data.cityofnewyork.us/resource/${encodeURIComponent(id)}.json?$limit=1`, { headers });
        if (!r.ok) return { ok: false, configured: true, detail: `HTTP ${r.status}` };
        const data = await r.json() as Array<Record<string, unknown>>;
        const sample = data[0] || {};
        const cols = Object.keys(sample).slice(0, 5).join(", ");
        return { ok: true, configured: true, detail: `id=${id} · ${data.length} sample · cols include: ${cols}` };
      } catch (e) {
        return { ok: false, configured: true, detail: (e as Error).message };
      }
    },
  },
  {
    name: "ACRIS Master dataset id",
    envVars: ["SODA_DATASET_ACRIS_MASTER"],
    required: true,
    test: async () => {
      const id = process.env.SODA_DATASET_ACRIS_MASTER;
      if (!id) return { ok: false, configured: false, detail: "SODA_DATASET_ACRIS_MASTER not set" };
      try {
        const tok = process.env.NYC_SODA_APP_TOKEN || process.env.NYC_SOCRATA_APP_TOKEN || process.env.SOCRATA_APP_TOKEN;
        const headers: Record<string, string> = { Accept: "application/json" };
        if (tok) headers["X-App-Token"] = tok;
        const r = await fetch(`https://data.cityofnewyork.us/resource/${encodeURIComponent(id)}.json?$limit=1&$select=document_id,doc_type`, { headers });
        if (!r.ok) return { ok: false, configured: true, detail: `HTTP ${r.status}` };
        const data = await r.json() as Array<Record<string, unknown>>;
        return { ok: true, configured: true, detail: `id=${id} · sample doc_id=${data[0]?.document_id || "(none)"}` };
      } catch (e) {
        return { ok: false, configured: true, detail: (e as Error).message };
      }
    },
  },
  {
    name: "ACRIS Real Property (Legals) dataset id",
    envVars: ["SODA_DATASET_ACRIS_REALPROPERTY", "SODA_DATASET_ACRIS_LEGALS"],
    required: true,
    test: async () => {
      const id = process.env.SODA_DATASET_ACRIS_REALPROPERTY || process.env.SODA_DATASET_ACRIS_LEGALS;
      if (!id) return { ok: false, configured: false, detail: "SODA_DATASET_ACRIS_REALPROPERTY not set" };
      try {
        const tok = process.env.NYC_SODA_APP_TOKEN || process.env.NYC_SOCRATA_APP_TOKEN || process.env.SOCRATA_APP_TOKEN;
        const headers: Record<string, string> = { Accept: "application/json" };
        if (tok) headers["X-App-Token"] = tok;
        const r = await fetch(`https://data.cityofnewyork.us/resource/${encodeURIComponent(id)}.json?$limit=1&$select=document_id,borough,block,lot`, { headers });
        if (!r.ok) return { ok: false, configured: true, detail: `HTTP ${r.status}` };
        const data = await r.json() as Array<Record<string, unknown>>;
        return { ok: true, configured: true, detail: `id=${id} · sample BBL=${data[0]?.borough}-${data[0]?.block}-${data[0]?.lot}` };
      } catch (e) {
        return { ok: false, configured: true, detail: (e as Error).message };
      }
    },
  },
  {
    name: "ACRIS Parties dataset id",
    envVars: ["SODA_DATASET_ACRIS_PARTIES"],
    required: false,
    test: async () => {
      const id = process.env.SODA_DATASET_ACRIS_PARTIES || "636b-3b5g";
      const fromFallback = !process.env.SODA_DATASET_ACRIS_PARTIES;
      try {
        const tok = process.env.NYC_SODA_APP_TOKEN || process.env.NYC_SOCRATA_APP_TOKEN || process.env.SOCRATA_APP_TOKEN;
        const headers: Record<string, string> = { Accept: "application/json" };
        if (tok) headers["X-App-Token"] = tok;
        const r = await fetch(`https://data.cityofnewyork.us/resource/${encodeURIComponent(id)}.json?$limit=1&$select=document_id,party_type,name`, { headers });
        if (!r.ok) return { ok: false, configured: !fromFallback, detail: `HTTP ${r.status}` };
        const data = await r.json() as Array<Record<string, unknown>>;
        return {
          ok: true,
          configured: !fromFallback,
          detail: `id=${id}${fromFallback ? " (using fallback)" : ""} · sample party=${(data[0]?.name as string)?.slice(0, 30) || "(none)"}`,
        };
      } catch (e) {
        return { ok: false, configured: !fromFallback, detail: (e as Error).message };
      }
    },
  },
  {
    name: "Twilio Lookup (phone verification)",
    envVars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    required: false,
    test: async () => {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      if (!sid || !token) return { ok: false, configured: false, detail: "TWILIO_ACCOUNT_SID/AUTH_TOKEN not set" };
      try {
        // Twilio's own number — safe to look up, free for owner
        const url = "https://lookups.twilio.com/v2/PhoneNumbers/+15558675309";
        const r = await fetch(url, {
          headers: { "Authorization": "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
        });
        if (!r.ok) return { ok: false, configured: true, detail: `HTTP ${r.status}` };
        return { ok: true, configured: true, detail: "Twilio Lookup v2 reachable, auth accepted" };
      } catch (e) {
        return { ok: false, configured: true, detail: (e as Error).message };
      }
    },
  },
  {
    name: "USPS Addresses v3",
    envVars: ["USPS_CLIENT_ID", "USPS_CLIENT_SECRET"],
    required: false,
    test: async () => {
      const id = process.env.USPS_CLIENT_ID;
      const secret = process.env.USPS_CLIENT_SECRET;
      if (!id || !secret) return { ok: false, configured: false, detail: "USPS_CLIENT_ID/CLIENT_SECRET not set" };
      try {
        const body = new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret });
        const r = await fetch("https://apis.usps.com/oauth2/v3/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
        if (!r.ok) return { ok: false, configured: true, detail: `HTTP ${r.status}` };
        const data = (await r.json()) as { access_token?: string };
        return { ok: !!data.access_token, configured: true, detail: data.access_token ? "OAuth token issued" : "no access_token in response" };
      } catch (e) {
        return { ok: false, configured: true, detail: (e as Error).message };
      }
    },
  },
  {
    name: "NeverBounce email validation",
    envVars: ["NEVERBOUNCE_API_KEY"],
    required: false,
    test: async () => {
      const k = process.env.NEVERBOUNCE_API_KEY;
      if (!k) return { ok: false, configured: false, detail: "NEVERBOUNCE_API_KEY not set" };
      try {
        const r = await fetch(`https://api.neverbounce.com/v4.2/account/info?key=${encodeURIComponent(k)}`);
        if (!r.ok) return { ok: false, configured: true, detail: `HTTP ${r.status}` };
        const data = (await r.json()) as { status?: string };
        return { ok: data.status === "success", configured: true, detail: `status=${data.status}` };
      } catch (e) {
        return { ok: false, configured: true, detail: (e as Error).message };
      }
    },
  },
];

async function main() {
  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("  Scanner env-var verification");
  console.log("══════════════════════════════════════════════════════════════════\n");

  let okCount = 0;
  let notConfiguredCount = 0;
  let failCount = 0;
  let requiredMissing = 0;

  for (const probe of PROBES) {
    process.stdout.write(`  ${probe.name.padEnd(48)}… `);
    const r = await probe.test();
    if (!r.configured) {
      console.log(probe.required ? "⚠ NOT CONFIGURED (required)" : "○ not configured (optional)");
      console.log(`      env: ${probe.envVars.join(" or ")}`);
      if (probe.required) requiredMissing++;
      notConfiguredCount++;
    } else if (r.ok) {
      console.log("✅ ok");
      console.log(`      ${r.detail}`);
      okCount++;
    } else {
      console.log("❌ FAIL");
      console.log(`      ${r.detail}`);
      failCount++;
    }
    console.log("");
  }

  console.log("──────────────────────────────────────────────────────────────────");
  console.log(`  ✅ ok:                ${okCount}`);
  console.log(`  ○  not configured:   ${notConfiguredCount}${requiredMissing ? ` (${requiredMissing} required)` : ""}`);
  console.log(`  ❌ failing:           ${failCount}`);
  console.log("──────────────────────────────────────────────────────────────────");
  if (requiredMissing > 0) {
    console.log("\n  Required env vars are missing — the Socrata refresh will not run end-to-end.");
    console.log("  Add them to .env.local for local testing AND to Vercel for production.\n");
    process.exit(1);
  }
  if (failCount > 0) {
    console.log("\n  Some configured providers failed live test. Check the detail above.\n");
    process.exit(2);
  }
  console.log("\n  All required env vars verified. Ready to run:");
  console.log("    npm run scanner:refresh-from-soda\n");
}

main().catch((err) => {
  console.error("[verify-env] fatal:", err);
  process.exit(1);
});
