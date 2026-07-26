# Neon Phase 2A — Authoritative Media Reconciliation + PCT Write Suppression — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate `PhotosChangeTimestamp`-only full `listings`/`raw_data` rewrites by first completing an authoritative, corroborated media-reconciliation safety mechanism, then suppressing the PCT write churn on top of it — proven against the fixed acceptance contract.

**Architecture:** Add a per-listing `listing_media_sync_state` table + a pure URL-free versioned set-hash + a pure two-strike reconciliation guard (any implicit disappearance, not just empty) + a fail-closed source-set validity gate + a bounded pending-verification lane, all wired into the existing RC1 `runMediaSync` loop (which already does complete-set fetch, `tombstoneVanished`, crm preservation, fail-closed-on-write-failure). Only after that guard is green does `sync.ts` stop full-rewriting `raw_data` on PCT-only, gated by a once-per-run table-capability check.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, Prisma (pooled client `lib/prisma.ts`), Neon Postgres 17, vitest, Cotality Trestle IDX Plus OData, Cloudflare R2.

**Spec:** `docs/superpowers/specs/2026-07-26-neon-phase2a-media-reconciliation-design.md` (§12 = acceptance contract).
**Evidence folder:** `docs/superpowers/specs/evidence/2026-07-26-neon-phase2a/`.

## Global Constraints

- **Neon safety:** every Neon MCP / `neonctl` call passes explicit `projectId=hidden-mountain-87248164` + `branchId=br-crimson-frog-adr7g9gt`. Default org = STALE `morning-bread` — never operate on defaults.
- **Cotality:** base `https://api.cotality.com/trestle`; live `/odata/$metadata` is field/type authority; `Property.ListingKey` = Property identity; `Media.ResourceRecordKey` MUST equal `Property.ListingKey`; `MediaKey` = Media identity; follow every `@odata.nextLink`; `ResourceRecordID` never replaces `ResourceRecordKey`.
- **Permission is a PROOF GATE (COT-3):** NO new Permission-based deletion. `MediaStatus='Deleted'` is the only new immediate-removal signal. Documented values `Public, Private, IDX, VOW, Office Only, Firm Only, Agent Only` are comma-separated multi-enum; `IDX` may be displayable — do not implement "not exactly Public = deleted".
- **Migration discipline (NEON.md §4/§5):** one new empty table; never `NOT NULL DEFAULT` on populated tables; migration authored via `prisma migrate diff`, tested on a Neon temp branch, applied to prod main **manually before** schema-dependent code deploys; schema commits carry `[neon-preflight: OK]` + fresh `npm run ops:health`. **Applying to main + deploy + Neon branch creation = Maya-gated.**
- **Validation chain (CLAUDE.md §G) before every commit that touches compliance surfaces:** `npm run type-check && npm run rls:validate && npm run compliance-check && npm run ucba:audit && npm run idx:validate` (+ `crm:test` if `public/crm/**`). Exit 0 required; any `ucba:audit` REGRESSION is a hard stop.
- **Redaction:** no secrets, bearer tokens, complete signed URLs, PII, addresses, or unredacted listing/media identifiers in any committed artifact. Keys hashed; URLs dropped/host-class.
- **No claim is PASS** without command/query · timestamp · exact SHA/deployment · artifact path · actual result · expected result (spec §12).
- **Phase 2B (JIT URL resolution / draining the 8,477 R2 backlog / eliminating `delivery_url_refreshed`) is HELD** — out of scope.

## File Structure

| File | Responsibility |
|---|---|
| `lib/idx/media-set-hash.ts` (NEW) | Pure URL-free versioned set-hash + source-set validity (CODE-1, §4.2/§4.3b) |
| `lib/idx/media-reconcile-guard.ts` (NEW) | Pure two-strike decision engine (CODE-2, §4.3) |
| `lib/idx/listing-media-sync-state.ts` (NEW) | Prisma read/write for `listing_media_sync_state`; pending-lane query; capability check |
| `prisma/schema.prisma` (MOD) | Add `ListingMediaSyncState` model + `Listing` back-relation |
| `prisma/migrations/<ts>_add_listing_media_sync_state/migration.sql` (NEW) | CREATE TABLE + FK + unique + `pending_next_check_at` index |
| `lib/idx/media-sync.ts` (MOD) | Wire guard into `runMediaSync`; add `ResourceName` to `$select`; gate `tombstoneVanished`; pending-lane processing; new counters |
| `lib/idx/media-sync-member.ts` (MOD) | Emit new audit counters (strike1/strike2/invalid/pending age+count) |
| `lib/idx/write-suppression.ts` (MOD) | `RAW_DATA_RECONCILED_ELSEWHERE_KEYS` + capability-gated PCT exclusion |
| `lib/idx/sync.ts` (MOD) | Once-per-run capability check; pass capability into raw_data comparator |
| `scripts/phase2a/cot1-metadata-contract.ts` (NEW) | COT-1 live `$metadata` contract capture |
| `scripts/phase2a/cot2-live-probes.ts` (NEW) | COT-2 read-only Property→Media probes (redacted) |
| `scripts/phase2a/replay.ts` (NEW) | REPLAY-1 harness against a Neon branch / rollback txn |
| `lib/idx/__tests__/media-set-hash.test.ts` etc. (NEW) | Unit/integration tests per gate |

---

## Task 1: COT-1 — live metadata contract (read-only)

**Gate:** COT-1. **Files:** Create `scripts/phase2a/cot1-metadata-contract.ts`; Output `docs/superpowers/specs/evidence/2026-07-26-neon-phase2a/01-cotality-contract.json`.
**Interfaces:** Produces the field/type contract consumed by COT-3 + CODE fixtures.

- [ ] **Step 1:** Write `cot1-metadata-contract.ts` — GET `${TRESTLE_API}/odata/$metadata` via `lib/idx/auth.ts` `getAccessToken()`; on 200, compute `sha256` of the raw XML; parse the `Property` + `Media` EntityTypes; emit the exact JSON shape from spec §12.1 (`captured_at_utc`, `base_url`, `metadata_endpoint`, `http_status`, `metadata_sha256`, `property_fields{...}`, `media_fields{...}` with actual EDM types).

```ts
// scripts/phase2a/cot1-metadata-contract.ts  (skeleton — real EDM parse, no invented types)
import { getAccessToken } from "@/lib/idx/auth";
import { createHash } from "node:crypto";
const BASE = process.env.TRESTLE_API_URL ?? "https://api.cotality.com/trestle";
const PROPERTY = ["ListingKey","PhotosChangeTimestamp","ModificationTimestamp","PhotosCount"];
const MEDIA = ["MediaKey","ResourceRecordKey","ResourceName","MediaURL","MediaStatus","Permission","Order","PreferredPhotoYN","MediaModificationTimestamp","ModificationTimestamp"];
async function main() {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/odata/$metadata`, { headers: { Authorization: `Bearer ${token}` } });
  const xml = await res.text();
  const sha = createHash("sha256").update(xml).digest("hex");
  const typeOf = (entity: string, field: string) => {
    // parse <EntityType Name="entity"> ... <Property Name="field" Type="Edm.X"/> from xml
    const block = xml.match(new RegExp(`<EntityType[^>]*Name="${entity}"[\\s\\S]*?</EntityType>`))?.[0] ?? "";
    return block.match(new RegExp(`<Property Name="${field}" Type="([^"]+)"`))?.[1] ?? "MISSING";
  };
  const contract = {
    captured_at_utc: new Date().toISOString(), base_url: BASE, metadata_endpoint: "/odata/$metadata",
    http_status: res.status, metadata_sha256: sha,
    property_fields: Object.fromEntries(PROPERTY.map(f => [f, typeOf("Property", f)])),
    media_fields: Object.fromEntries(MEDIA.map(f => [f, typeOf("Media", f)])),
  };
  process.stdout.write(JSON.stringify(contract, null, 2));
}
main();
```

- [ ] **Step 2:** Run (needs Trestle creds — Vercel runtime or Maya-provided): `npx tsx scripts/phase2a/cot1-metadata-contract.ts > docs/.../01-cotality-contract.json`. Expected: `http_status=200`, every field type non-`MISSING`. If creds unavailable locally, capture via runtime; record the command+timestamp.
- [ ] **Step 3:** Cross-check the parsed types against the trestle-fields MCP (already: Media 56 fields; `Permission`=multi-enum; `PhotosChangeTimestamp`=DateTime). Assert agreement with the code's `$select` + parser.
- [ ] **Step 4:** Update `00-acceptance-matrix.md` COT-1 → ✅ with command/ts/artifact/actual/expected. Commit `docs(neon-phase2a): COT-1 live metadata contract`.

---

## Task 2: COT-2 — live read-only Property→Media probes

**Gate:** COT-2. **Files:** Create `scripts/phase2a/cot2-live-probes.ts`; Output `02-cotality-live-probes.jsonl`.
**Interfaces:** Produces redacted real-shape payloads reused as REPLAY-1 fixtures.

- [ ] **Step 1:** Write `cot2-live-probes.ts` — for a curated cohort (one-page · multi-page · photos+floorplan/video/virtual · Permission populated · null/absent optional fields · R2-mirrored · not-yet-mirrored — select candidate `ListingKey`s from prod via Neon MCP `run_sql` on `listing_media` r2 columns). For each: GET Property, then page `/odata/Media?$filter=ResourceRecordKey eq '<key>'&$select=...,ResourceName&$orderby=Order asc&$top=...` following **every** `@odata.nextLink`; emit the §12.2 JSON per probe with `property_listing_key_hash` (sha256, never raw), `permission_shapes` (raw serialization observed), `resource_name_values`, `duplicate_media_keys`, `resource_record_key_mismatches`, `invalid_active_rows`. **GET only.**
- [ ] **Step 2:** Run in the runtime/with creds. Save redacted `.jsonl`.
- [ ] **Step 3:** Assert PASS conditions: every `@odata.nextLink` followed; `rows_received == @odata.count` when present; every `ResourceRecordKey == ListingKey`; MediaKeys unique; ResourceName + Permission serialization recorded.
- [ ] **Step 4:** Capture 3–5 probes' **redacted** raw page shapes into `04-replay-fixtures/` (keys hashed, URLs dropped) for REPLAY-1. Update matrix COT-2 → ✅. Commit.

---

## Task 3: COT-3 — Permission contract (proof gate)

**Gate:** COT-3. **Files:** Output `03-permission-contract.md`.

- [ ] **Step 1:** From COT-1 (metadata enum values) + COT-2 (observed `permission_shapes`) + REBNY canonical docs (`.claude/skills/rebny-compliance/SKILL.md` §2, `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` §7/§8), complete the §12.3 table for `Public`, `IDX`, `Public,IDX`, `Private`, `null`, `unknown` — each with proven displayable? / immediate-deactivation? + the exact Cotality/REBNY source.
- [ ] **Step 2:** State the comma-separated multi-enum parse rule and null/empty/unknown/malformed/multi behavior (fail-closed: unknown ⇒ no display, no destructive action).
- [ ] **Step 3:** Record the ruling: **until this table is proven, Phase 2A implements NO Permission deletion**; `MediaStatus='Deleted'` remains the only new immediate-removal signal. Update matrix COT-3 → ✅ (or leave PENDING if COT-2 creds unavailable — then §4.6 still ships; Permission behavior stays frozen). Commit.

---

## Task 4: media-set hash + source-set validity (CODE-1)

**Gate:** CODE-1. **Files:** Create `lib/idx/media-set-hash.ts`; Test `lib/idx/__tests__/media-set-hash.test.ts`.
**Interfaces — Produces:** `stableMediaSetHash(items, listingKey): MediaSetHashResult`, `validateMediaSourceSet(items, listingKey): MediaSetValidity`, `MEDIA_SET_HASH_VERSION`, `EMPTY_MEDIA_SET_HASH`, types `MediaSetItem`, `MediaSetHashResult`, `MediaSetValidity`, `MediaSetInvalidReason`.

- [ ] **Step 1: Write the failing test** (`media-set-hash.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { stableMediaSetHash, validateMediaSourceSet, EMPTY_MEDIA_SET_HASH } from "@/lib/idx/media-set-hash";
const row = (o: Partial<any> = {}) => ({ mediaKey:"m1", resourceRecordKey:"L1", mediaUrl:"https://api.cotality.com/x.jpg?sig=a",
  mediaType:"photo", mediaCategory:"Photo", mediaClassification:null, order:1, preferredPhotoYN:true,
  mediaModificationTs:new Date("2026-01-01T00:00:00Z"), modificationTs:new Date("2026-01-01T00:00:00Z"), ...o });
const ok = (r: ReturnType<typeof stableMediaSetHash>) => { if(!r.ok) throw new Error("invalid"); return r.hash; };
describe("stableMediaSetHash", () => {
  it("order-independent", () => {
    const a = ok(stableMediaSetHash([row({mediaKey:"a"}),row({mediaKey:"b"})],"L1"));
    const b = ok(stableMediaSetHash([row({mediaKey:"b"}),row({mediaKey:"a"})],"L1"));
    expect(a).toBe(b);
  });
  it("ignores signed query + host/path changes on the URL", () => {
    const a = ok(stableMediaSetHash([row({mediaUrl:"https://api.cotality.com/x.jpg?sig=a"})],"L1"));
    const b = ok(stableMediaSetHash([row({mediaUrl:"https://cdn.other.com/DIFF/x.jpg?sig=z"})],"L1"));
    expect(a).toBe(b);
  });
  it("changes on MediaKey/order/preferred/category/type/revision-ts", () => {
    const base = ok(stableMediaSetHash([row()],"L1"));
    for (const patch of [{mediaKey:"m2"},{order:2},{preferredPhotoYN:false},{mediaCategory:"Floorplan"},
      {mediaType:"video"},{modificationTs:new Date("2026-02-02T00:00:00Z")}]) {
      expect(ok(stableMediaSetHash([row(patch)],"L1"))).not.toBe(base);
    }
  });
  it("empty valid set → sentinel", () => expect(ok(stableMediaSetHash([],"L1"))).toBe(EMPTY_MEDIA_SET_HASH));
  it("duplicate MediaKey → invalid, no hash", () => {
    const r = stableMediaSetHash([row({mediaKey:"d"}),row({mediaKey:"d"})],"L1");
    expect(r.ok).toBe(false);
  });
  it("missing identity → invalid", () => {
    expect(stableMediaSetHash([row({mediaKey:null})],"L1").ok).toBe(false);
    expect(stableMediaSetHash([row({mediaUrl:null})],"L1").ok).toBe(false);
  });
});
describe("validateMediaSourceSet", () => {
  it("RRK mismatch is unsafe", () =>
    expect(validateMediaSourceSet([row({resourceRecordKey:"OTHER"})],"L1").safe).toBe(false));
});
```

- [ ] **Step 2: Run → fail.** `npx vitest run lib/idx/__tests__/media-set-hash.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement `lib/idx/media-set-hash.ts`** (complete):

```ts
import { createHash } from "node:crypto";
export const MEDIA_SET_HASH_VERSION = "v1";
export const EMPTY_MEDIA_SET_HASH = `${MEDIA_SET_HASH_VERSION}:empty`;
export type MediaSetInvalidReason =
  | "missing_media_key" | "missing_media_url" | "duplicate_media_key"
  | "resource_record_key_mismatch" | "malformed_field";
export interface MediaSetItem {
  mediaKey: string | null | undefined; resourceRecordKey: string | null | undefined;
  mediaUrl: string | null | undefined; mediaType: string | null | undefined;
  mediaCategory: string | null | undefined; mediaClassification: string | null | undefined;
  order: number | null | undefined; preferredPhotoYN: boolean | null | undefined;
  mediaModificationTs: Date | string | null | undefined; modificationTs: Date | string | null | undefined;
}
export interface MediaSetValidity { safe: boolean; reasons: MediaSetInvalidReason[]; }
export type MediaSetHashResult = { ok: true; hash: string; count: number } | { ok: false; reasons: MediaSetInvalidReason[] };
const MALFORMED = " MALFORMED";
function isoOrEmpty(v: Date | string | null | undefined): string {
  if (v == null) return "";
  const d = v instanceof Date ? v : new Date(v);
  const t = d.getTime();
  return Number.isNaN(t) ? MALFORMED : d.toISOString();
}
export function validateMediaSourceSet(items: MediaSetItem[], listingKey: string): MediaSetValidity {
  const reasons = new Set<MediaSetInvalidReason>(); const seen = new Set<string>();
  for (const it of items) {
    const key = it.mediaKey == null ? "" : String(it.mediaKey);
    if (key === "") { reasons.add("missing_media_key"); continue; }
    if (seen.has(key)) reasons.add("duplicate_media_key"); else seen.add(key);
    if (it.mediaUrl == null || String(it.mediaUrl).trim() === "") reasons.add("missing_media_url");
    if (it.resourceRecordKey != null && String(it.resourceRecordKey) !== listingKey) reasons.add("resource_record_key_mismatch");
    if (isoOrEmpty(it.mediaModificationTs) === MALFORMED || isoOrEmpty(it.modificationTs) === MALFORMED) reasons.add("malformed_field");
  }
  return { safe: reasons.size === 0, reasons: [...reasons] };
}
export function stableMediaSetHash(items: MediaSetItem[], listingKey: string): MediaSetHashResult {
  const v = validateMediaSourceSet(items, listingKey);
  if (!v.safe) return { ok: false, reasons: v.reasons };
  if (items.length === 0) return { ok: true, hash: EMPTY_MEDIA_SET_HASH, count: 0 };
  const rows = items.map((it) => [
    String(it.mediaKey), it.mediaType ?? "", it.mediaCategory ?? "", it.mediaClassification ?? "",
    it.order == null ? "" : String(it.order), it.preferredPhotoYN == null ? "" : it.preferredPhotoYN ? "1" : "0",
    isoOrEmpty(it.mediaModificationTs), isoOrEmpty(it.modificationTs),
  ].join(""));
  rows.sort();
  const digest = createHash("sha256").update(rows.join("")).digest("hex");
  return { ok: true, hash: `${MEDIA_SET_HASH_VERSION}:${digest}`, count: items.length };
}
```

- [ ] **Step 4: Run → pass.** `npx vitest run lib/idx/__tests__/media-set-hash.test.ts` → PASS. Capture output → `05-replay-results.json` (CODE-1 section). Then `npm run type-check`.
- [ ] **Step 5: Commit.** `git commit -am "feat(neon-phase2a): pure URL-free versioned media-set hash + source-set validity (CODE-1)"`

---

## Task 5: reconcile guard decision engine (CODE-2)

**Gate:** CODE-2. **Files:** Create `lib/idx/media-reconcile-guard.ts`; Test `lib/idx/__tests__/media-reconcile-guard.test.ts`.
**Interfaces — Consumes:** `MediaSetHashResult` (Task 4). **Produces:** `decideReconcile(input: ReconcileGuardInput): ReconcileDecision`, types `PendingCandidateState`, `ReconcileGuardInput`, `ReconcileDecision`, `ReconcileAction`.

- [ ] **Step 1: Write the failing test** — one case per CODE-2 truth-table row (§12.5). Representative:

```ts
import { describe, it, expect } from "vitest";
import { decideReconcile } from "@/lib/idx/media-reconcile-guard";
const H = { ok: true as const, hash: "v1:AAA", count: 8 };
const base = { listingKey:"L1", cycleRunId:"cyc-1", hashResult:H, previousActiveFeedKeys:["a","b"],
  candidateFeedKeys:["a","b"], pending:null, observedPct:new Date("2026-01-02T00:00:00Z"),
  observedSourceModTs:new Date("2026-01-02T00:00:00Z"), lastCheckpointHash:null, now:new Date("2026-01-03T00:00:00Z") };
it("no disappearance → reconcile_normal, checkpoint advances", () => {
  const d = decideReconcile(base);
  expect(d.action).toBe("reconcile_normal"); expect(d.advanceCheckpoint).toBe(true);
});
it("first implicit shrink → record_pending, NO tombstone/checkpoint", () => {
  const d = decideReconcile({ ...base, candidateFeedKeys:["a"] });
  expect(d.action).toBe("record_pending"); expect(d.tombstoneVanishedFeed).toBe(false);
  expect(d.advanceCheckpoint).toBe(false); expect(d.pendingWrite?.confirmationCount).toBe(1);
});
it("same candidate, SAME cycle id → not confirmed", () => {
  const pending = { candidateSetHash:"v1:AAA", candidateMediaCount:1, missingMediaCount:1,
    photosChangeTimestamp:base.observedPct, sourceModificationTs:base.observedSourceModTs,
    firstObservedAt:base.now, lastObservationRunId:"cyc-1", confirmationCount:1 };
  const d = decideReconcile({ ...base, candidateFeedKeys:["a"], pending, cycleRunId:"cyc-1" });
  expect(d.action).toBe("record_pending"); expect(d.tombstoneVanishedFeed).toBe(false);
});
it("same candidate, DIFFERENT cycle, non-regressing → confirm_removal", () => {
  const pending = { candidateSetHash:"v1:AAA", candidateMediaCount:1, missingMediaCount:1,
    photosChangeTimestamp:base.observedPct, sourceModificationTs:base.observedSourceModTs,
    firstObservedAt:base.now, lastObservationRunId:"cyc-0", confirmationCount:1 };
  const d = decideReconcile({ ...base, candidateFeedKeys:["a"], pending, cycleRunId:"cyc-1" });
  expect(d.action).toBe("confirm_removal"); expect(d.tombstoneVanishedFeed).toBe(true);
  expect(d.advanceCheckpoint).toBe(true);
});
it("regressing PCT on 2nd obs → not confirmed", () => {
  const pending = { candidateSetHash:"v1:AAA", candidateMediaCount:1, missingMediaCount:1,
    photosChangeTimestamp:new Date("2026-02-01T00:00:00Z"), sourceModificationTs:base.observedSourceModTs,
    firstObservedAt:base.now, lastObservationRunId:"cyc-0", confirmationCount:1 };
  const d = decideReconcile({ ...base, candidateFeedKeys:["a"], pending, cycleRunId:"cyc-1" });
  expect(d.action).toBe("record_pending");
});
it("invalid hash → unsafe_retry, no destructive action", () => {
  const d = decideReconcile({ ...base, hashResult:{ ok:false, reasons:["duplicate_media_key"] } });
  expect(d.action).toBe("unsafe_retry"); expect(d.tombstoneVanishedFeed).toBe(false); expect(d.advanceCheckpoint).toBe(false);
});
it("candidate == last checkpoint & no new disappearance → no_op", () => {
  const d = decideReconcile({ ...base, candidateFeedKeys:["a","b"], lastCheckpointHash:"v1:AAA" });
  expect(d.action).toBe("no_op"); expect(d.invalidateCachesAfterCommit).toBe(false);
});
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement `lib/idx/media-reconcile-guard.ts`** (complete):

```ts
import type { MediaSetHashResult } from "./media-set-hash";
export interface PendingCandidateState {
  candidateSetHash: string | null; candidateMediaCount: number | null; missingMediaCount: number | null;
  photosChangeTimestamp: Date | null; sourceModificationTs: Date | null; firstObservedAt: Date | null;
  lastObservationRunId: string | null; confirmationCount: number;
}
export interface ReconcileGuardInput {
  listingKey: string; cycleRunId: string; hashResult: MediaSetHashResult;
  previousActiveFeedKeys: string[]; candidateFeedKeys: string[]; pending: PendingCandidateState | null;
  observedPct: Date | null; observedSourceModTs: Date | null; lastCheckpointHash: string | null; now: Date;
}
export type ReconcileAction = "unsafe_retry" | "reconcile_normal" | "record_pending" | "confirm_removal" | "no_op";
export interface ReconcileDecision {
  action: ReconcileAction; tombstoneVanishedFeed: boolean; updateSummary: boolean; advanceCheckpoint: boolean;
  checkpointHash: string | null; pendingWrite: PendingCandidateState | null; invalidateCachesAfterCommit: boolean; reason: string;
}
function missingKeys(prev: string[], cand: string[]): string[] { const c = new Set(cand); return prev.filter((k) => !c.has(k)); }
function nonRegressing(a: Date | null, b: Date | null): boolean {
  if (b == null) return true; if (a == null) return false; return a.getTime() >= b.getTime();
}
export function decideReconcile(input: ReconcileGuardInput): ReconcileDecision {
  if (!input.hashResult.ok) return { action:"unsafe_retry", tombstoneVanishedFeed:false, updateSummary:false,
    advanceCheckpoint:false, checkpointHash:null, pendingWrite:input.pending, invalidateCachesAfterCommit:false,
    reason:`invalid:${input.hashResult.reasons.join(",")}` };
  const candHash = input.hashResult.hash;
  const missing = missingKeys(input.previousActiveFeedKeys, input.candidateFeedKeys);
  if (missing.length === 0) {
    if (input.lastCheckpointHash === candHash) return { action:"no_op", tombstoneVanishedFeed:false, updateSummary:false,
      advanceCheckpoint:false, checkpointHash:candHash, pendingWrite:null, invalidateCachesAfterCommit:false, reason:"unchanged_confirmed" };
    return { action:"reconcile_normal", tombstoneVanishedFeed:true, updateSummary:true, advanceCheckpoint:true,
      checkpointHash:candHash, pendingWrite:null, invalidateCachesAfterCommit:true, reason:"no_implicit_disappearance" };
  }
  const p = input.pending;
  const priorStrike = p != null && p.confirmationCount > 0 && p.candidateSetHash != null;
  const confirms = !!priorStrike && p!.candidateSetHash === candHash && p!.lastObservationRunId !== input.cycleRunId
    && nonRegressing(input.observedPct, p!.photosChangeTimestamp) && nonRegressing(input.observedSourceModTs, p!.sourceModificationTs);
  if (confirms) return { action:"confirm_removal", tombstoneVanishedFeed:true, updateSummary:true, advanceCheckpoint:true,
    checkpointHash:candHash, pendingWrite:null, invalidateCachesAfterCommit:true, reason:"strike2_confirmed" };
  const sameCandidate = !!priorStrike && p!.candidateSetHash === candHash;
  const pendingWrite: PendingCandidateState = {
    candidateSetHash:candHash, candidateMediaCount:input.candidateFeedKeys.length, missingMediaCount:missing.length,
    photosChangeTimestamp:input.observedPct, sourceModificationTs:input.observedSourceModTs,
    firstObservedAt: sameCandidate ? (p!.firstObservedAt ?? input.now) : input.now,
    lastObservationRunId:input.cycleRunId, confirmationCount: sameCandidate ? p!.confirmationCount : 1,
  };
  return { action:"record_pending", tombstoneVanishedFeed:false, updateSummary:false, advanceCheckpoint:false,
    checkpointHash:null, pendingWrite, invalidateCachesAfterCommit:false, reason: sameCandidate ? "pending_refresh" : "strike1_recorded" };
}
```

- [ ] **Step 4: Run → pass.** Append results to `06-test-results.txt`. `npm run type-check`.
- [ ] **Step 5: Commit.** `feat(neon-phase2a): pure two-strike reconcile guard decision engine (CODE-2)`

---

## Task 6: schema model + migration (authored, NOT applied) + state helpers + capability check

**Gate:** DB-1 (authoring only; apply = Task 12). **Files:** Modify `prisma/schema.prisma`; Create migration dir; Create `lib/idx/listing-media-sync-state.ts`; Test `lib/idx/__tests__/listing-media-sync-state.test.ts`.
**Interfaces — Produces:** `getListingMediaSyncState(listingId)`, `writePendingCandidate(...)`, `commitReconcileCheckpoint(...)`, `clearPending(listingId)`, `selectPendingLane(limit, now)`, `mediaSyncStateTableAvailable(): Promise<boolean>`, `PendingCandidateRow`.

- [ ] **Step 1:** Add to `prisma/schema.prisma` (model + back-relation on `Listing`) exactly per spec §4.1 (incl. `pending_next_check_at` + `@@index`). Add `listing_media_sync_state ListingMediaSyncState?` to `Listing`.
- [ ] **Step 2:** Generate migration SQL (do NOT apply): `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` is not the pattern — instead `npx prisma migrate dev --create-only --name add_listing_media_sync_state` against a **shadow/local** DB to author `migration.sql`. Verify it is a single `CREATE TABLE "listing_media_sync_state" (...)` + FK to `listings(listing_id) ON DELETE CASCADE` + `UNIQUE(listing_id)` + `CREATE INDEX ... (pending_next_check_at)` — no `ALTER` on existing tables.
- [ ] **Step 3: Write the failing test** for the helpers (mock Prisma) — `mediaSyncStateTableAvailable` returns false when the table query throws (fail-closed); `selectPendingLane` filters `pending_confirmation_count > 0` ordered by `pending_next_check_at`; `commitReconcileCheckpoint` writes only `last_*` (never `pending_*`).
- [ ] **Step 4: Implement `lib/idx/listing-media-sync-state.ts`** — Prisma read/write mapping the model to `PendingCandidateState` (from Task 5) + reconciled checkpoint; `mediaSyncStateTableAvailable()` does a `SELECT 1 FROM listing_media_sync_state LIMIT 1` wrapped in try/catch → false on error (capability check, once-per-run cached by caller). `selectPendingLane(limit, now)`: `where { pending_confirmation_count: { gt: 0 }, OR: [{ pending_next_check_at: null }, { pending_next_check_at: { lte: now } }] } orderBy { pending_next_check_at: "asc" } take limit`.
- [ ] **Step 5: Run tests → pass.** `npm run type-check`. **Do NOT run `prisma generate` against prod.**
- [ ] **Step 6: Commit** with `[neon-preflight: OK]` after a fresh `npm run ops:health` (NEON.md §5 hook). `feat(neon-phase2a): listing_media_sync_state model + migration (unapplied) + state helpers + capability check [neon-preflight: OK]`

---

## Task 7: wire the guard into `runMediaSync` + `ResourceName` `$select` + gated tombstone

**Gate:** CODE-2 (integration). **Files:** Modify `lib/idx/media-sync.ts`; Test `lib/idx/__tests__/media-sync-reconcile-guard.test.ts`.
**Interfaces — Consumes:** Tasks 4/5/6.

- [ ] **Step 1: Write the failing integration test** — inject `fetchMedia` returning: (a) an unchanged set → `upsertListingMedia` called with `tombstoneVanished:true`, checkpoint written; (b) an implicit shrink (prev 3 keys, candidate 2) → `upsertListingMedia` called with `tombstoneVanished:FALSE`, pending row written, NO summary change; (c) invalid set (dup key) → no tombstone, no checkpoint, listing retried.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** in `runMediaSync`'s per-listing block (around `media-sync.ts:3122-3132`):
  - Add `ResourceName` to `defaultFetchMedia`'s `$select` (`media-sync.ts:2758`).
  - After `fetchMedia` resolves: read `previousActiveFeedKeys` (active non-`crm:` `media_key`s for the listing) + `getListingMediaSyncState(listingId)`; compute `stableMediaSetHash(candidate, listingKey)`; call `decideReconcile(...)`.
  - Map decision: call `upsertListingMedia(listingId, mediaRows, { photosChangeTsSnapshot, tombstoneVanished: decision.tombstoneVanishedFeed })`. If `decision.action==="unsafe_retry"` or `record_pending`, pass `tombstoneVanished:false` (safe adds/updates still upsert; no implicit tombstone). On `confirm_removal`/`reconcile_normal` in one txn: upsert + (tombstone) + summary + `commitReconcileCheckpoint`. On `record_pending`: `writePendingCandidate(...)` (+ `pending_next_check_at = now + backoff`). Cursor advances via existing `ProcessedListing.ok` only when not `unsafe_retry`/incomplete.
  - Revalidate caches only after the txn commits and only when `decision.invalidateCachesAfterCommit`.
- [ ] **Step 4: Run → pass.** Full media/idx test suite: `npx vitest run lib/idx`. `npm run type-check`.
- [ ] **Step 5:** §G validation chain. **Step 6: Commit.** `feat(neon-phase2a): wire two-strike guard into runMediaSync; ResourceName select; gated tombstone`

---

## Task 8: bounded pending-verification lane (CODE-3)

**Gate:** CODE-3. **Files:** Modify `lib/idx/media-sync.ts`; Test `lib/idx/__tests__/media-pending-lane.test.ts`.

- [ ] **Step 1: Write the failing test** — one pending listing + later normal listings: the pending listing is re-checked next natural cycle (different `cycleRunId`), later listings still process, no cursor freeze, no premature tombstone, same-cycle re-check never confirms; failed verification stays pending (backoff advances `pending_next_check_at`).
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — at the start of each `runMediaSync`, `selectPendingLane(PENDING_BATCH_LIMIT, now)` (bounded batch, e.g. reuse an R2-drain-style constant + time budget); for each, re-fetch complete set → `decideReconcile` with `cycleRunId` = current One-Cycle run id; a confirm executes the same atomic tombstone txn. The pending lane runs independently of the PCT/media cursor (its own query), so a stuck pending never blocks cursor advance. Emit `pending_queue_count` + `pending_queue_oldest_age_seconds`.
- [ ] **Step 4: Run → pass.** `npm run type-check`. **Step 5: Commit.** `feat(neon-phase2a): bounded pending-verification lane (CODE-3)`

---

## Task 9: audit counters

**Gate:** PROD-1 telemetry. **Files:** Modify `lib/idx/media-sync-member.ts`, `lib/idx/media-sync.ts`; extend `lib/idx/__tests__/media-sync-cron.test.ts`.

- [ ] **Step 1:** Write failing test asserting the `media_sync_cron` payload now carries: `implicit_disappearance_strike1`, `implicit_disappearance_confirmed`, `source_set_invalid`, `pct_only_suppressed` (from sync side via One-Cycle aggregation is separate — here media-side), `pending_queue_count`, `pending_queue_oldest_age_seconds`, `crm_media_tombstones` (must be 0).
- [ ] **Step 2–4:** Add the counters to `UpsertListingMediaResult`/run aggregates + the explicit (non-spread) payload in `media-sync-member.ts:80-108`; run → pass; type-check.
- [ ] **Step 5: Commit.** `feat(neon-phase2a): reconcile audit counters (strike1/confirmed/invalid/pending age+count)`

---

## Task 10: PCT carve-out (capability-gated) + pre-flip reader verification

**Gate:** CODE-2/PROD-1. **Files:** Modify `lib/idx/write-suppression.ts`, `lib/idx/sync.ts`; Test extends `tests/runtime/sync-change-attribution-behavior.test.ts` + new `lib/idx/__tests__/pct-carveout.test.ts`.

- [ ] **Step 1: Pre-flip reader verification (BLOCKER).** Grep the 8 code files for a **read** of `raw_data.PhotosChangeTimestamp` (pattern `raw_data?.PhotosChangeTimestamp`, `raw_data["PhotosChangeTimestamp"]`, `.raw_data as ...).PhotosChangeTimestamp`). Confirm media-sync reads PCT from the Property record + typed column, not `raw_data`. Record the finding (file:line or "no readers") in `06-test-results.txt`. If a reader exists, STOP and revisit before Step 3.
- [ ] **Step 2: Write the failing test** — with capability=true: a PCT-only `raw_data` delta (no typed change, no mod-ts move) → `listingUpdateMateriallyUnchanged` true (write suppressed); with mod-ts also moved → `classifyListingChangeReasons` = `["modification_timestamp_only"]` (row write, no cache invalidation); with capability=false → PCT stays material (write proceeds, current behavior).
- [ ] **Step 3: Implement** — add `export const RAW_DATA_RECONCILED_ELSEWHERE_KEYS = new Set(["PhotosChangeTimestamp"])` to `write-suppression.ts`; thread a `capability: boolean` param (default false = fail-closed) into `rawDataMateriallyEqual`/`changedRawDataMaterialKeys`/`classifyListingChangeReasons` (or a module-level capability set once per run) that, when true, strips `RAW_DATA_RECONCILED_ELSEWHERE_KEYS` (like the provenance clocks). In `sync.ts:554` region, compute `mediaSyncStateTableAvailable()` **once per run** and pass it in.
- [ ] **Step 4: Run → pass.** `npx vitest run lib/idx tests/runtime`. §G chain.
- [ ] **Step 5: Commit.** `feat(neon-phase2a): capability-gated PhotosChangeTimestamp carve-out in listing sync`

---

## Task 11: deterministic replay (REPLAY-1)

**Gate:** REPLAY-1. **Files:** Create `scripts/phase2a/replay.ts`; Output `05-replay-results.json`; fixtures in `04-replay-fixtures/`.

- [ ] **Step 1:** Build fixtures from Task 2's redacted real shapes for each CODE-2 row (`shrink-10-to-8`, `complete-empty`, `additions-only`, `dup-key-invalid`, `wrong-rrk`, `crm-preserved`, `restored-set`, etc.), each with the §12.8 JSON (`cotality_property`, `cotality_media_pages`, `starting_listing_media`, `starting_sync_state`, `run_id`, `expected`).
- [ ] **Step 2:** `replay.ts` seeds a **Neon branch** (Maya-gated: `create_branch` from `br-crimson-frog-adr7g9gt`) OR a local rollback txn, runs each fixture through the **real** parser→hash→guard→txn→summary, captures actual deltas.
- [ ] **Step 3:** Assert actual == expected exactly; reorder pages/rows → same; replay identical input → idempotent; different `run_id` → confirms only the intended strike 2; no test bypasses real code. Write `05-replay-results.json`. Delete the Neon branch.
- [ ] **Step 4: Commit.** `test(neon-phase2a): deterministic replay harness + fixtures (REPLAY-1)`

---

## Task 12: DB-1 migration apply — **HELD (Maya-gated)**

**Gate:** DB-1. **Files:** Output `07-migration-proof.md`.

- [ ] **Step 1:** `npm run ops:health` (headroom) + capture preflight.
- [ ] **Step 2 (SAFE, temp branch):** Neon MCP `prepare_database_migration({ projectId:"hidden-mountain-87248164", migrationSql:<CREATE TABLE...>})` → applies to a **temporary branch**; verify with `run_sql`/`describe_table_schema` on that branch (table/columns/FK/unique/index present; `explain_sql_statement` shows the `pending_next_check_at` index usable).
- [ ] **Step 3 (Maya authorization required):** on explicit go, apply to prod main — either `complete_database_migration` (MCP) OR `DATABASE_URL=<prod> npx prisma migrate deploy` (NEON.md §5) → `npx prisma migrate status`. Record Maya authorization timestamp + apply timestamp + duration.
- [ ] **Step 4:** Post-apply verify on `br-crimson-frog-adr7g9gt`: `describe_table_schema listing_media_sync_state`; `compare_database_schema` (only the new table); re-run the §12.12 baseline query — `listings=23,686`, `listing_media_active` and `crm=64` **unchanged** (no rewrites); capability check returns true. Fill `07-migration-proof.md` with every §12.7 field + rollback procedure (`DROP TABLE` / `neon snapshots` restore). Update matrix DB-1 → ✅.

---

## Task 13: PROD-1 — three natural cycles — **HELD (Maya-gated deploy)**

**Gate:** PROD-1. **Files:** Output `08-production-natural-cycles.jsonl`, `09-production-db-invariants.txt`.

- [ ] **Step 1 (Maya-gated):** merge PR → production deploy; capture Git SHA + deployment ID + READY via Vercel MCP `get_deployment`.
- [ ] **Step 2:** Over **three natural One Cycles (no manual trigger)**, capture via Vercel MCP `get_runtime_logs` (the `media_sync_cron` + `[IDX Sync][diag]` payloads) → `08-...jsonl` with every §12.9 field.
- [ ] **Step 3:** Neon MCP `run_sql` (explicit project+branch) DB invariants → `09-...txt`: assert all PROD-1 zeros (`unconfirmed_implicit_tombstones=0`, `crm_media_tombstones=0`, `same_cycle_confirmations=0`, `pct_only_full_listing_writes=0 when capability=true`, `cursor_freezes=0`, `source_set_invalid_destructive_actions=0`); every confirmed removal traceable (listing hash · candidate hash · strike-1 run · strike-2 run · same hash · non-regressing ts · committed · post-commit revalidation). Update matrix PROD-1 → ✅.

---

## Task 14: PROD-2 — 24-hour normalized write trend — **HELD**

**Gate:** PROD-2. **Files:** Append `09-production-db-invariants.txt`.

- [ ] **Step 1:** After 24h, compute normalized rates via Neon MCP `run_sql` + Vercel MCP `get_runtime_errors` (§12.10): PCT-only full writes / PCT events → ~0 when capability; listing_media writes / media rows; WAL bytes / properties; pending oldest age; pending processed/admitted. `neon inspect db` for compute/storage trend.
- [ ] **Step 2:** Assert pass criteria (rate → ~0, no incorrect clears, pending bounded+draining, cursor advancing, no new error class/connection regression, lower WAL/write rate). 7-day trend noted as ongoing, not a hold. Update matrix PROD-2 → ✅.

---

## Task 15: final verdict

**Gate:** final. **Files:** Output `10-final-verdict.md`; update `00-acceptance-matrix.md`.

- [ ] **Step 1:** Compile the §12.11 binary matrix — each line PASS only with command/query · timestamp · exact SHA/deployment · artifact path · actual · expected. List any unproven claims. Residual = Phase 2B only.
- [ ] **Step 2:** Final verdict ACCEPTED / NOT ACCEPTED. Commit `docs(neon-phase2a): final acceptance verdict`.

---

## Self-Review (spec coverage)

- COT-1/2/3 → Tasks 1/2/3. CODE-1 → Task 4. CODE-2 → Tasks 5+7. CODE-3 → Task 8. DB-1 → Tasks 6(author)+12(apply). REPLAY-1 → Task 11. PROD-1/2 → Tasks 13/14. Final → Task 15.
- Permission proof-gate: honored (Task 3 gates; Tasks 7/9 never tombstone on Permission).
- crm preservation: Tasks 7/9 assert `crm_media_tombstones=0`.
- Capability fail-closed: Tasks 6/10 (PCT stays material when table absent).
- Types consistent across tasks: `MediaSetItem`/`MediaSetHashResult` (Task 4) → `ReconcileGuardInput.hashResult` (Task 5) → `runMediaSync` wiring (Task 7); `PendingCandidateState` (Task 5) ↔ state helpers (Task 6).
- Gated actions (Neon branch create, migration-to-main, deploy) are isolated in Tasks 11/12/13/14 and marked HELD.
