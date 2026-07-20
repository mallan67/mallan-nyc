# Media Coverage Remediation Packet — READ-ONLY audit + dry-run framework

> **Re-derived and hardened through Round 6 (2026-07-20)** on post-#539 main
> (`0b920c97`), replacing the 2026-07-16 original (reference: old PR #525 @
> `d7303a2f`, which stays untouched and unmerged). **Nothing in this packet
> writes anything, anywhere.** The production audit run itself is **NOT
> authorized by this PR** — per the program roadmap it executes only AFTER
> #530/#535/#533/#534 land and compute is re-measured. Any actual backfill or
> R2 deletion gets its own reviewed write PR and explicit authorization from
> Maya.

## What this is

A bounded, resumable, fail-closed evidence framework that classifies every
listing's media coverage into buckets and dry-run-plans Bucket-B backfills —
so future write campaigns can never delete or backfill the wrong media.
**It does not itself reduce compute or storage.**

## Buckets

| Bucket | Meaning |
|---|---|
| A | active relational usable photos exist |
| B_NEW | third-party, no relational rows ever, Cotality CONFIRMED photos → planned inserts |
| B_INACTIVE | third-party, inactive/deleted rows exist, Cotality CONFIRMED photos → restores/updates |
| C | legacy JSON has usable photos → the render fix already serves it |
| D | no media in DB and Cotality CONFIRMED zero |
| E | Mallan-owned authoritative state — never backfilled from Cotality |
| F | hidden / withdrawn / non-displayable |
| U | UNKNOWN — probe not run / errored / incomplete: never coerced to B or D |

## Exact manual commands

The tooling is reachable ONLY through three `npm` scripts (pinned by test) —
no cron, route, workflow, or admin surface can invoke it, and there is no
`--apply` flag anywhere.

```bash
# 1. Neon-only audit (NO Cotality). Every probe-needing third-party listing
#    finalizes UNKNOWN (U) because coverage is not verified without a probe.
npm run media:audit -- --max-listings 500 --page-size 200

# 2. Cotality-verified audit (adds --with-cotality). Bounded probing.
npm run media:audit:cotality -- \
  --max-listings 500 --max-probes 100 --max-requests 500 \
  --concurrency 2 --timeout-ms 15000 --retries 1 \
  --checkpoint .media-audit.json

#    Resume a previously-checkpointed audit (completed pages never repeat):
npm run media:audit:cotality -- --checkpoint .media-audit.json --resume

#    Explicit, bounded re-evaluation of PERMANENT unknowns (see below):
npm run media:audit:cotality -- --checkpoint .media-audit.json --resume --recheck-permanent

# 3. Bucket-B backfill DRY-RUN planner (NOTHING is written; no --apply exists).
#    Probing here is intentionally SEQUENTIAL — there is NO --concurrency flag.
npm run media:backfill:dryrun -- \
  --max-listings 500 --max-requests 300 \
  --checkpoint .media-dryrun.json
npm run media:backfill:dryrun -- --checkpoint .media-dryrun.json --resume
npm run media:backfill:dryrun -- --checkpoint .media-dryrun.json --resume --recheck-permanent
```

Strict flags fail closed: an unknown/misspelled/duplicate flag, a bound flag
with a missing or non-integer/out-of-range value, `--resume` without an
existing checkpoint, or an existing `--checkpoint` without `--resume` all exit
1 before any work. `--recheck-permanent` on the audit CLI requires
`--with-cotality` (it re-probes) — it is refused otherwise.

## Completeness semantics (three separate claims, never conflated)

- **`scanComplete`** — the Neon candidate scan finished this run: no page is
  pending and no per-run bound (`--max-listings` / time budget / a probe or
  request cap) cut the scan short. It says nothing about whether media coverage
  was verified.
- **`coverageComplete`** — every probe-requiring listing is verified: no `U`
  rows remain **and** both the `retryableUnknown` and `permanentUnknown` queues
  are empty. A Neon-only run (no `--with-cotality`) can **never** claim this
  while any probe-requiring listing exists.
- **`planComplete`** (dry-run only) — `coverageComplete` **and** zero CONFLICT
  listings. A CONFLICT (R2-key collision, duplicate existing `media_key`,
  multiple existing rows sharing a normalized URL, or a provider item matching
  different rows by key vs. URL) emits **no** executable-looking plan and keeps
  `planComplete` false.

**Exit 2:** the audit CLI exits 2 whenever `coverageComplete` is false; the
dry-run CLI exits 2 whenever `planComplete` is false. Reaching any limit, an
OAuth/timeout/provider/pagination error, a skipped probe, or an interrupted run
therefore reports INCOMPLETE — never a silent "full audit."

### The two unknown queues

- **`retryableUnknown`** — a genuine, transient provider error (a probe that
  errored/deferred) finalizes the listing as `U` **and** queues it for a
  bounded re-probe. On the next `--resume` the queue is processed FIRST, via
  chunked single-id Neon reads: each queued listing is re-evaluated against
  **current** Neon state (a listing that gained media, went hidden, became
  Mallan-owned, or vanished is resolved with **zero** Cotality), and only a
  still-probe-needing listing is re-probed. A successful re-probe REPLACES the
  `U` record in place (tally adjusted, no duplicates).
- **`permanentUnknown`** — a listing that EXHAUSTS the retry policy leaves the
  retryable queue and moves here (cumulative, unique). While it is non-empty,
  `coverageComplete` and `planComplete` are false.
- **source-missing** — a queued listing that has disappeared from Neon since it
  was queued is dropped and recorded as a **non-blocking `warnings` entry**. It
  is deliberately **never** an `incompleteReasons` entry, so a run can never be
  "incomplete" and complete at once.

### Permanent UNKNOWN is not auto-re-probed

`permanentUnknown` listings are **not** re-probed by a normal resume. Bringing
them back is an **explicit, bounded opt-in** via `--recheck-permanent` — there
is no hand-editing of the checkpoint. With the flag, the permanent queue is
re-evaluated BEFORE the retryable queue, under the **same** per-run
`--max-listings` / time / `--max-probes` / `--max-requests` budgets: a fresh
Neon read first (resolve with zero Cotality when possible), a re-probe only when
still needed, removal from `permanentUnknown` on success (the audit replaces the
inventory record; the dry-run adds the plan), and — on another failure — the
listing stays permanent with an updated `recheck:` reason and is **never** moved
back into `retryableUnknown`. Recheck mode is not identity-bound: because it only
ever resolves or annotates permanent entries, resuming with or without the flag
is safe.

## Bounded per-run behavior (both queues, both engines)

A single shared queue walker owns the bounded behavior for the retryable and
permanent queues in both the audit and the dry-run, so the two can never
diverge:

- every **examined** (fetched) retry listing consumes one `--max-listings` unit
  and is **never** refunded;
- when the probe cap (`--max-probes`) is already spent, the phase stops **before**
  the next read — no wasted Neon read;
- when a probe **defers** because the request cap (`--max-requests`) is spent,
  the phase stops **after** that one fetch;
- in both stop cases the current entry plus the untouched tail stay queued and
  no further retry ids are read — a clean, safe resume.

## Retry policy — one value, enforced and bound

- **`MAX_UNKNOWN_RETRIES = 100`** is the shared ceiling. `--max-unknown-retries`
  above it is refused (the tool never mints a checkpoint it would later reject).
- The **selected** policy (`--max-unknown-retries`, default 3) is bound into the
  checkpoint's `RunIdentity`. Both the runtime budget and the identity must agree
  on it, and it must be an integer in `[1, MAX_UNKNOWN_RETRIES]`; this is
  asserted at the top of `runAudit`/`runDryRun` **before any Neon or Cotality
  access**, so a direct programmatic caller can never run identity policy N
  against budget policy M.
- **Changing the policy on resume is rejected** — a checkpoint whose identity
  carries a different `maxUnknownRetries` fails the fail-closed identity match.

## Cotality access — approved endpoint + per-request boundary

- **Exact approved provider base: `https://api.cotality.com/trestle`.** The base
  (and therefore the token endpoint derived from it) must match this allowlist
  exactly (normalized origin+path); an arbitrary host, the correct host with a
  wrong path, a subdomain/suffix lookalike, or an alternate port is rejected
  **before** the OAuth client credentials can be posted.
- **Every authenticated data request** — the Property lookup, the first Media
  page, and every `@odata.nextLink` — is parsed and origin/path-checked (https,
  no embedded credentials, exact allowed origin, inside the allowed `/odata/`
  path) immediately before the Authorization header is added. String prefixes
  are never used.
- **Redirects fail closed** — the framework's `fetch` uses `redirect: 'error'`,
  so a redirect is never followed with the bearer token.
- **Pre-existing auth concern, out of scope:** the shared token helper
  (`lib/idx/auth` `getAccessToken`) is NOT changed by this read-only PR. Any
  redirect behavior of that shared helper itself remains a pre-existing
  authentication concern to address separately; this PR only governs the
  read-only audit/dry-run request path described above.

## Checkpoint durability

- **Exclusive lock** — a `.lock` file is created with `openSync(..., 'wx')`; a
  second process against the same checkpoint is refused. The `try/finally`
  releasing the lock begins immediately after acquisition, so no setup failure
  can orphan a `.lock`.
- **Atomic writes** — each save goes to a **unique** per-pid temp file, then an
  atomic `renameSync` onto the checkpoint path (no fixed `.tmp` collision).
- **Identity binding** — every checkpoint carries a non-secret `RunIdentity`
  (schema version, tool version, tool mode audit/dryrun, probe mode
  neon-only/cotality, normalized Cotality origin+path, a one-way fingerprint of
  the non-secret Cotality client id, a sanitized Neon host+port+db+user+schema
  fingerprint, the selected retry policy, and the checkpoint path). Resume fails
  closed on ANY mismatch — a Neon-only checkpoint can never resume in Cotality
  mode, and a checkpoint from one database/provider/client/tool-version/policy
  can never resume against another.
- **Dry-run probing is SEQUENTIAL** — there is intentionally **no**
  `--concurrency` flag on the dry-run CLI (a safety control with no effect would
  be dishonest); the dry-run CLI rejects `--concurrency` as an unknown flag.

## Canonical rules (locked)

- **Ownership** — the classifier and the audit delegate to the real
  `isMallanExclusiveListing` (`lib/listings/exclusive-agent-assignment.ts`),
  matching the PR #539 media read path exactly. `agent_id`, `owner_client_id`,
  assignment history, or a current agent association can never establish
  media ownership (the input shapes carry no such fields).
- **Display eligibility** — the production `isListingDisplayable` gate;
  hidden/opted-out/participant-only/terminal listings classify F, never B.
- **Media classification** — the production resolver counts usable photos;
  the Cotality probe uses a STRICT classifier whose MediaCategory/MediaType
  allowlists were transcribed from the **committed local `artifacts/metadata.xml`**
  (a read-only file, not a live network `$metadata` request). A row with an
  ABSENT category/type is `unknown`, never a photo (deliberately stricter than
  the lenient ingest default). Floorplans, videos, virtual tours, documents and
  unrecognized records are never counted as photos.
- **Cotality keying** — Property record first → its ACTUAL `ListingKey` →
  `Media?$filter=ResourceRecordKey eq '<ListingKey>'`, provider `Order`
  preserved verbatim (never the array index), every valid `@odata.nextLink`
  followed; an incomplete traversal is UNKNOWN, never a confirmed zero.
- **Photo-first** — a planned media set is ordered hero-first (the
  `PreferredPhotoYN` photo leads), then ascending provider `Order` — the
  production photo/hero-first contract. Non-photos never enter a plan.

## Dry-run action taxonomy

`insert` (no matching row) · `restore` (inactive row matched by stable
`media_key` first, then normalized provider URL) · `update` (ACTIVE matched
row whose authorized mutable fields differ — provider order / normalized
source URL / media key / media type / preferred-photo flag — with the exact
`changedFields` recorded) · `unchanged` (identical active match). Duplicate
provider items and rows already claimed by a proposal are suppressed — an
inactive or changed row representing the same provider media item never yields
a duplicate insert. R2 keys come from the canonical `buildMediaR2Key` with the
provider Order; two distinct planned photos that would generate the same R2 key
are a CONFLICT, not a silent overwrite. URL identity normalization lowercases
scheme+host only and PRESERVES pathname case.

## RLS20103891

RLS20103891 remains **UNKNOWN (bucket U)** unless and until THIS listing
receives its own successful, complete, recorded Cotality probe. Its status is
never inferred from the separate eight-listing production sample of
2026-07-19 (that sample reconciled OTHER listings).

## Read-only guarantee

Logic modules receive injected read-only reader interfaces
(`ListingPageReader`/`DryRunPageReader`, `CotalityMediaReader`) that expose no
create/update/upsert/delete/raw/R2 method at the type level; runtime tests
additionally source-scan every framework file for mutation tokens and pin
that exactly three manual npm scripts — and no cron, route, workflow, or
admin surface — can invoke the tooling. There is no `--apply` anywhere.
**No production audit or dry-run is authorized by this PR.**

## Where this sits in the roadmap

1. #539 merged + production-proven (done — the ownership rules this
   classification depends on).
2. **This packet** — the safety/evidence layer (read-only, not yet executed
   against production).
3. #530 / #535 / #533 / #534 — the actual compute + future-storage savings.
4. Re-measure compute, writes, scans, WAL, R2 growth.
5. Run the bounded production audit (`media:audit:cotality` with explicit
   budgets) → definitive inventory.
6. Separate, individually approved backfill and R2 deletion/lifecycle
   campaigns.
