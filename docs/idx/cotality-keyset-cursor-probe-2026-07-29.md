# Sanitized Cotality/Trestle probe evidence — two-stream keyset cursor

Phase 1A, branch `fix/phase1a-legacy-media-complete-response-2026-07-29`.

- probe UTC: **2026-07-29T08:56:03.439Z**
- endpoint: `https://api.cotality.com/trestle/odata/Property`
- auth: OAuth2 `client_credentials`. **No tokens, Authorization headers, client id/secret or any credential value appears in this file.**
- mutations: **none** — every request below is a GET with `$filter`/`$select`/`$orderby`/`$top`/`$count` only.

## A. Baseline OR-filter window (today's production shape)

### A1 — OR filter, server default order
- filter: `(ModificationTimestamp gt 2026-07-20T00:00:00Z or PhotosChangeTimestamp gt 2026-07-20T00:00:00Z)`
- orderby: `(none)`
- `$top`: 3
- HTTP: **200**
- `@odata.count`: **7147**
- rows returned: 3
- records missing ListingKey: **0**
- first: ListingKey=`1178500993` MT=2026-07-29T04:13:47.060-00:00 PCT=2026-07-29T04:14:51.497-00:00
- last:  ListingKey=`1178499612` MT=2026-07-29T03:19:19.313-00:00 PCT=2026-07-29T03:19:51.160-00:00

### A2 — OR filter, `ModificationTimestamp desc` (today's default)
- filter: `(ModificationTimestamp gt 2026-07-20T00:00:00Z or PhotosChangeTimestamp gt 2026-07-20T00:00:00Z)`
- orderby: `ModificationTimestamp desc`
- `$top`: 3
- HTTP: **200**
- `@odata.count`: **7147**
- rows returned: 3
- records missing ListingKey: **0**
- first: ListingKey=`1168251742` MT=2026-07-29T08:54:48.600-00:00 PCT=2026-07-29T08:54:51.833-00:00
- last:  ListingKey=`1174200683` MT=2026-07-29T08:54:14.593-00:00 PCT=2026-07-29T08:54:51.833-00:00

### A3 — OR filter, `PhotosChangeTimestamp asc` (shows why one ordering cannot serve both clocks)
- filter: `(ModificationTimestamp gt 2026-07-20T00:00:00Z or PhotosChangeTimestamp gt 2026-07-20T00:00:00Z)`
- orderby: `PhotosChangeTimestamp asc`
- `$top`: 3
- HTTP: **200**
- `@odata.count`: **7147**
- rows returned: 3
- records missing ListingKey: **0**
- first: ListingKey=`1114220851` MT=2026-07-22T09:31:30.607-00:00 PCT=2026-04-07T23:53:19.247-00:00
- last:  ListingKey=`1128125035` MT=2026-07-29T06:07:40.630-00:00 PCT=2026-04-07T23:53:53.023-00:00

## B. Compound keyset ORDER shapes

### B1 — MT stream ordering
- filter: `ModificationTimestamp gt 2026-07-20T00:00:00Z`
- orderby: `ModificationTimestamp asc,ListingKey asc`
- `$top`: 3
- HTTP: **200**
- `@odata.count`: **7145**
- rows returned: 3
- records missing ListingKey: **0**
- first: ListingKey=`1092348639` MT=2026-07-20T00:06:34.660-00:00 PCT=2026-07-20T00:07:07.407-00:00
- last:  ListingKey=`1177033382` MT=2026-07-20T00:17:55.890-00:00 PCT=2026-07-20T00:18:51.827-00:00

### B2 — PCT stream ordering
- filter: `PhotosChangeTimestamp gt 2026-07-20T00:00:00Z`
- orderby: `PhotosChangeTimestamp asc,ListingKey asc`
- `$top`: 3
- HTTP: **200**
- `@odata.count`: **7046**
- rows returned: 3
- records missing ListingKey: **0**
- first: ListingKey=`1092348639` MT=2026-07-20T00:06:34.660-00:00 PCT=2026-07-20T00:07:07.407-00:00
- last:  ListingKey=`1177033382` MT=2026-07-20T00:17:55.890-00:00 PCT=2026-07-20T00:18:51.827-00:00

## C. Compound keyset TIE-FILTER shapes (the cursor predicate)

### C1 — MT tie filter
- filter: `(ModificationTimestamp gt 2026-07-20T00:06:34.660-00:00 or (ModificationTimestamp eq 2026-07-20T00:06:34.660-00:00 and ListingKey gt '1092348639'))`
- orderby: `ModificationTimestamp asc,ListingKey asc`
- `$top`: 3
- HTTP: **200**
- `@odata.count`: **7144**
- rows returned: 3
- records missing ListingKey: **0**
- first: ListingKey=`1176676260` MT=2026-07-20T00:07:07.637-00:00 PCT=2026-07-20T00:08:09.507-00:00
- last:  ListingKey=`1155950678` MT=2026-07-20T00:39:41.980-00:00 PCT=2026-07-20T00:39:51.280-00:00

### C2 — PCT tie filter
- filter: `(PhotosChangeTimestamp gt 2026-07-20T00:07:07.407-00:00 or (PhotosChangeTimestamp eq 2026-07-20T00:07:07.407-00:00 and ListingKey gt '1092348639'))`
- orderby: `PhotosChangeTimestamp asc,ListingKey asc`
- `$top`: 3
- HTTP: **200**
- `@odata.count`: **7045**
- rows returned: 3
- records missing ListingKey: **0**
- first: ListingKey=`1176676260` MT=2026-07-20T00:07:07.637-00:00 PCT=2026-07-20T00:08:09.507-00:00
- last:  ListingKey=`1155950678` MT=2026-07-20T00:39:41.980-00:00 PCT=2026-07-20T00:39:51.280-00:00

## D. String `gt` on ListingKey behaves consistently

### D1 — same timestamp, `ListingKey gt` tie-break only
- filter: `(ModificationTimestamp eq 2026-07-20T00:06:34.660-00:00 and ListingKey gt '1092348639')`
- orderby: `ListingKey asc`
- `$top`: 3
- HTTP: **200**
- `@odata.count`: **0**
- rows returned: 0
- records missing ListingKey: **0**
- first: (none)
- last:  (none)

- anchor ListingKey: `1092348639`
- every returned key sorts strictly after the anchor: **true**

## E. PCT-only cohort (old MT, new PCT) — the records skipped today

### E1 — PCT-only inside the 9-day window
- filter: `(PhotosChangeTimestamp gt 2026-07-20T00:00:00Z and ModificationTimestamp le 2026-07-20T00:00:00Z)`
- orderby: `PhotosChangeTimestamp asc,ListingKey asc`
- `$top`: 5
- HTTP: **200**
- `@odata.count`: **2**
- rows returned: 2
- records missing ListingKey: **0**
- first: ListingKey=`1092341794` MT=2026-05-15T11:12:44.223-00:00 PCT=2026-07-25T11:43:51.697-00:00
- last:  ListingKey=`1092340194` MT=2026-05-15T11:12:44.223-00:00 PCT=2026-07-29T08:43:51.450-00:00

- sample: ListingKey=`1092341794` MT=2026-05-15T11:12:44.223-00:00 PCT=2026-07-25T11:43:51.697-00:00
- sample: ListingKey=`1092340194` MT=2026-05-15T11:12:44.223-00:00 PCT=2026-07-29T08:43:51.450-00:00

## F. PCT bootstrap lower-bound counts (§7)

### F — PCT stream since 9 days ago (2026-07-20T08:56:05Z)
- filter: `PhotosChangeTimestamp gt 2026-07-20T08:56:05Z`
- orderby: `PhotosChangeTimestamp asc,ListingKey asc`
- `$top`: 1
- HTTP: **200**
- `@odata.count`: **7014**
- rows returned: 1
- records missing ListingKey: **0**
- first: ListingKey=`1159669593` MT=2026-07-20T10:11:52.510-00:00 PCT=2026-07-20T10:12:52.953-00:00
- last:  ListingKey=`1159669593` MT=2026-07-20T10:11:52.510-00:00 PCT=2026-07-20T10:12:52.953-00:00

### F — PCT stream since 30 days ago (2026-06-29T08:56:05Z)
- filter: `PhotosChangeTimestamp gt 2026-06-29T08:56:05Z`
- orderby: `PhotosChangeTimestamp asc,ListingKey asc`
- `$top`: 1
- HTTP: **200**
- `@odata.count`: **12674**
- rows returned: 1
- records missing ListingKey: **0**
- first: ListingKey=`1135698247` MT=2026-06-29T12:00:15.677-00:00 PCT=2026-06-29T12:00:50.450-00:00
- last:  ListingKey=`1135698247` MT=2026-06-29T12:00:15.677-00:00 PCT=2026-06-29T12:00:50.450-00:00

### F — PCT stream since 90 days ago (2026-04-30T08:56:06Z)
- filter: `PhotosChangeTimestamp gt 2026-04-30T08:56:06Z`
- orderby: `PhotosChangeTimestamp asc,ListingKey asc`
- `$top`: 1
- HTTP: **200**
- `@odata.count`: **318326**
- rows returned: 1
- records missing ListingKey: **0**
- first: ListingKey=`1148438722` MT=2026-04-30T12:11:44.827-00:00 PCT=2026-04-30T12:11:51.620-00:00
- last:  ListingKey=`1148438722` MT=2026-04-30T12:11:44.827-00:00 PCT=2026-04-30T12:11:51.620-00:00

## G. Tie-breaker proven against a REAL colliding timestamp

`D1` in the previous probe returned 0 rows because its anchor timestamp was unique, so the
tie-break path was never exercised. This section uses `ModificationTimestamp = 2026-05-15T11:12:44.223-00:00`,
which the PCT-only cohort showed is shared by more than one listing.

### G1 — all records sharing that exact timestamp
- filter: `ModificationTimestamp eq 2026-05-15T11:12:44.223-00:00`
- orderby: `ListingKey asc`
- HTTP: **200**
- `@odata.count`: **1203**
  - ListingKey=`1091329763`
  - ListingKey=`1091329951`
  - ListingKey=`1091329980`
  - ListingKey=`1091330375`
  - ListingKey=`1091330401`
  - ListingKey=`1091330413`
  - ListingKey=`1091330514`
  - ListingKey=`1091330540`
  - ListingKey=`1091330543`
  - ListingKey=`1091330665`

### G2 — tie-break excludes the anchor and returns exactly the strictly-greater keys
- filter: `(ModificationTimestamp eq 2026-05-15T11:12:44.223-00:00 and ListingKey gt '1091329763')`
- HTTP: **200**
- `@odata.count`: **1202**
- anchor: `1091329763`
- expected strictly-greater keys: ["1091329951","1091329980","1091330375","1091330401","1091330413","1091330514","1091330540","1091330543","1091330665"]
- returned keys: ["1091329951","1091329980","1091330375","1091330401","1091330413","1091330514","1091330540","1091330543","1091330665","1091330737"]
- anchor excluded: **true**
- matches expected set exactly: **false**
- every returned key sorts strictly after the anchor (string compare): **true**

- NOTE on `matches expected set exactly: false` — this is a comparison artifact, not a
  discrepancy. G1 returned 10 rows (`$top=10`); after dropping the anchor, 9 remain. G2 also
  requested `$top=10`, so it returned those same 9 **plus the next key in order**
  (`1091330737`). The meaningful assertions are `anchor excluded: true` and
  `every returned key sorts strictly after the anchor: true`, plus the counts:
  **1203 → 1202**, i.e. exactly one record (the anchor) was excluded.

---

## Conclusions

1. **Compound keyset ordering is supported.** `ModificationTimestamp asc,ListingKey asc` and
   `PhotosChangeTimestamp asc,ListingKey asc` both return HTTP 200 (§B).
2. **The compound tie-filter shape is supported.** Both `X gt ts or (X eq ts and ListingKey gt
   key)` forms return HTTP 200 (§C).
3. **`ListingKey` was present in every returned probe sample** — 0 missing across every row
   returned by the queries in this document. This is a SAMPLE property, not a population
   property: each probe returned between 1 and 10 rows, never the full 7,000-318,000 matched
   set. Section H attempted a population count and could not establish one (see below), so the
   missing-key population is **undetermined by probe** and the runtime guard is mandatory.
4. **String `gt` on `ListingKey` is consistent** — proven against a real collision in §G, not
   merely asserted. The first attempt (§D1) returned 0 rows because its anchor timestamp was
   unique, so it proved nothing; §G repeats it against a timestamp shared by 1,203 records.
5. **A timestamp-only cursor is provably unsafe.** `ModificationTimestamp =
   2026-05-15T11:12:44.223-00:00` is shared by **1,203 listings** — 4.8× the 250-record page
   budget. A cursor that advanced past that timestamp after one page would permanently skip 953
   listings. The `ListingKey` tie-breaker is mandatory, not defensive.
6. **One ordering cannot serve both clocks.** §A3 orders the OR-filtered query by
   `PhotosChangeTimestamp asc` and returns rows whose PCT is *older* than `since`, because they
   matched via the MT clause. No single scalar cursor over the OR filter is safe.
7. **The PCT-only cohort is real and unreachable today.** §E1 finds 2 records inside the 9-day
   window with `ModificationTimestamp = 2026-05-15` — thousands of rows past the 500 cap under
   today's `ModificationTimestamp desc` ordering.

### Stream cardinality in the 9-day window

| set | `@odata.count` |
|---|---:|
| OR filter (today's shape) | 7,147 |
| MT stream only | 7,145 |
| PCT stream only | 7,046 |
| PCT-only (old MT, new PCT) | 2 |
| MT-only (derived: 7,147 − 7,046) | 101 |
| overlap (derived: 7,145 + 7,046 − 7,147) | 7,044 |

Overlap is ~98.6%, so union-and-dedupe by `ListingKey` is essential — without it the run would
process most records twice.

### PCT bootstrap lower bound (§7)

| window | `@odata.count` | cycles at 250/cycle | elapsed at 10-min cadence |
|---|---:|---:|---|
| 9 days | 7,014 | 29 | ~4h 50m |
| 30 days | 12,674 | 51 | ~8h 30m |
| 90 days | 318,326 | 1,274 | **~8.8 days** |

**Chosen bootstrap lower bound: 30 days — an approved bounded OPERATIONAL bootstrap.**

> Thirty days is the approved bounded operational bootstrap. It does not constitute a complete
> repair of all older historical PCT drift.

This is a COST decision, not a completeness proof. What the evidence supports:

- 30 days is 12,674 records, nominally ~51 cycles (~8h30m) at the fixed 250/cycle budget;
- 90 days is 318,326 records, nominally ~1,274 cycles (~8.8 days) of continuous draining;
- a bulk re-stamp sits just outside 30 days — the §E1 PCT-only samples both carry
  `ModificationTimestamp = 2026-05-15T11:12:44.223`, the timestamp §G shows is shared by 1,203
  listings — which accounts for part, but demonstrably NOT all, of the 90-day population.

What the evidence does NOT support: that processing the older records would yield no correctness
gain. Some PCT events older than 30 days may still represent stale galleries. That population is
recorded here as **deferred historical reconciliation**, a separate controlled obligation — not
repaired, and not irrelevant.

The ~8h30m figure is also a best-case nominal duration. Failures, partial batches, deployment
gaps and newly arriving records all extend it.

---

## H. Missing / empty `ListingKey` count probes

Requested because the earlier conclusion "ListingKey is present on every matched record"
was drawn from the handful of rows each probe returned, not from the full matched
population. These are count-only queries over the whole bootstrap window.

- probe UTC: **2026-07-29T09:07:14.503Z**
- bootstrap boundary used: `2026-06-29T00:00:00Z`
- auth: OAuth2 `client_credentials`. **No tokens, Authorization headers or credential values in this file.**

### H0 — MT stream total in window (denominator)
- filter: `ModificationTimestamp ge 2026-06-29T00:00:00Z`
- HTTP: **200**
- `@odata.count`: **12876**

### H1 — PCT stream total in window (denominator)
- filter: `PhotosChangeTimestamp ge 2026-06-29T00:00:00Z`
- HTTP: **200**
- `@odata.count`: **12698**

### H2 — MT stream, ListingKey eq null
- filter: `ModificationTimestamp ge 2026-06-29T00:00:00Z and ListingKey eq null`
- HTTP: **200**
- `@odata.count`: **0**

### H3 — MT stream, ListingKey eq ''
- filter: `ModificationTimestamp ge 2026-06-29T00:00:00Z and ListingKey eq ''`
- HTTP: **200**
- `@odata.count`: **12876**

### H4 — PCT stream, ListingKey eq null
- filter: `PhotosChangeTimestamp ge 2026-06-29T00:00:00Z and ListingKey eq null`
- HTTP: **200**
- `@odata.count`: **0**

### H5 — PCT stream, ListingKey eq ''
- filter: `PhotosChangeTimestamp ge 2026-06-29T00:00:00Z and ListingKey eq ''`
- HTTP: **200**
- `@odata.count`: **12698**

## I. Records exactly ON the bootstrap boundary

The initial cursor must INCLUDE these; a bare `gt` would silently drop them.

### I1 — MT exactly on the boundary
- filter: `ModificationTimestamp eq 2026-06-29T00:00:00Z`
- HTTP: **200**
- `@odata.count`: **0**

### I2 — PCT exactly on the boundary
- filter: `PhotosChangeTimestamp eq 2026-06-29T00:00:00Z`
- HTTP: **200**
- `@odata.count`: **0**

### I3 — MT strictly greater than the boundary
- filter: `ModificationTimestamp gt 2026-06-29T00:00:00Z`
- HTTP: **200**
- `@odata.count`: **12876**

### I4 — MT greater than OR EQUAL to the boundary
- filter: `ModificationTimestamp ge 2026-06-29T00:00:00Z`
- HTTP: **200**
- `@odata.count`: **12876**

## J. Empty-string comparison reliability + bootstrap boundary choice

- probe UTC: **2026-07-29T09:08:21.062Z**
- auth: OAuth2 `client_credentials`. **No tokens, headers or credential values recorded.**

### J0 — MT total at/after boundary (denominator)
- filter: `ModificationTimestamp ge 2026-06-29T00:00:00Z`
- HTTP: **200**
- `@odata.count`: **12876**

### J1 — MT window AND `ListingKey gt ''`
- filter: `ModificationTimestamp ge 2026-06-29T00:00:00Z and ListingKey gt ''`
- HTTP: **200**
- `@odata.count`: **12876**

### J2 — MT window AND `ListingKey ne null`
- filter: `ModificationTimestamp ge 2026-06-29T00:00:00Z and ListingKey ne null`
- HTTP: **200**
- `@odata.count`: **12876**

### J3 — plain `gt` at a boundary 1ms EARLIER (the chosen bootstrap form)
- filter: `ModificationTimestamp gt 2026-06-28T23:59:59.999Z`
- HTTP: **200**
- `@odata.count`: **12876**

### Interpretation

- `ListingKey eq ''` returned the FULL population in probe H, so Cotality does not evaluate
  empty-string equality as a predicate. `eq null` returned 0, but because the sibling form is
  provably mishandled, 0 cannot be read as proof that no null keys exist.
- therefore the missing-key population is **UNDETERMINED by probe**, and the runtime guard is
  mandatory rather than belt-and-braces.
- `gt ''` returned 12876 against a denominator of 12876.
- `ne null` returned 12876.
- the bootstrap therefore uses a timestamp 1 ms BEFORE the boundary with a plain `gt`, so it
  never depends on empty-string comparison semantics at all.

---

## Linux / LF validation (§F)

Windows checkout showed one persistent failure,
`tests/runtime/building-manifest-cache-size.test.ts`, which asserts a literal
`\n`-containing source substring against `lib/buildings/public-building-data.ts`.
That file is 0 files in this branch's diff. Re-run on an LF/Linux checkout of the
same commit to confirm the failure was a checkout artifact and not a defect.

Environment: WSL2 Ubuntu, node v20.19.6, npm 10.8.2. Clone taken with
`core.autocrlf=false`; `lib/buildings/public-building-data.ts` contained **0 CR
bytes**. Commit under test: `988980c8`.

| command | exit |
|---|---:|
| `npm ci --no-audit --no-fund` | **0** |
| `npx tsc --noEmit -p tsconfig.json` | **0** |
| `npx jest tests/runtime/building-manifest-cache-size.test.ts` | **0** — 4/4 passed |
| `npx jest lib/idx tests/runtime` | **0** — 283 suites, 4,514 passed, 0 failed |
| `npx jest` (entire suite) | **0** — 338 suites, 5,795 passed, 0 failed |

Conclusion: the manifest assertion **passes on LF/Linux**. The Windows failure was
a line-ending artifact of the local checkout, exactly as diagnosed, and the branch
has **zero test failures** on a Linux checkout.

---

## Final validation (Phase 1A sign-off)

**Code SHA tested**

```
5197d5012e984f052a4c081c867010cf789680da
```

**Environment**

```
WSL2 Ubuntu
Node v20.19.6
core.autocrlf=false
LF checkout
```

**Commands, exit codes and results for that SHA**

```
npx tsc --noEmit -p tsconfig.json
exit 0

npx jest tests/runtime/building-manifest-cache-size.test.ts
exit 0

npx jest
exit 0
339 suites
5,814 passed
0 failed
```

The previously-failing `building-manifest-cache-size` assertion passes on LF; the
Windows failure was a line-ending artifact of the local checkout, not a defect.

> **This evidence commit is docs-only.** It appends this section and changes
> nothing under `lib/`, `app/`, `prisma/`, `scripts/` or `tests/`. It therefore
> moves the branch head PAST the tested code SHA
> `5197d5012e984f052a4c081c867010cf789680da` **without changing any application
> or test code**. The validation above remains accurate for the application code
> at the branch head.

---

## Final validation — corrected Phase 1A (PR #589)

Supersedes nothing above; this section covers the **corrected** branch, not the
reverted PR #587 work.

### Tested-SHA distinction

| | |
|---|---|
| Linux/LF validation first run at | `c7f6f45842ca73a3dd4deeac17734500674476b0` |
| Final PR #589 head | `aaefeab1ba8266cad37aa0c11ab09d358068a90b` |
| Commits in between | 1 — `aaefeab1 docs(ops): synchronise OPS-025 status across registry and dashboard` |
| Files changed in between | 2, **both under `docs/`** |
| Non-documentation files changed | **0** |

Verified with:

```
git diff --name-only c7f6f45842ca73a3dd4deeac17734500674476b0..aaefeab1ba8266cad37aa0c11ab09d358068a90b
  docs/PLATFORM-ISSUE-REGISTRY.md
  docs/PROJECT-HEALTH-DASHBOARD.md
```

Because the intervening commit is documentation-only, the earlier run remained
valid — but the suite was **re-run directly at the final head** so the evidence
below requires no inference.

### Environment

```
WSL2 Ubuntu
node  v20.19.6
npm   10.8.2
core.autocrlf  (unset — LF default on Linux)
LF checkout confirmed: lib/buildings/public-building-data.ts contains 0 CR bytes
```

### Commands, exit codes and results — captured at `aaefeab1`

```
git rev-parse HEAD
  aaefeab1ba8266cad37aa0c11ab09d358068a90b

npx tsc --noEmit -p tsconfig.json
  exit 0

npx jest
  exit 0
  Test Suites: 6 skipped, 340 passed, 340 of 346 total
  Tests:       32 skipped, 5826 passed, 5858 total
  FAIL lines in output: 0
```

**Suites passed 340 · tests passed 5,826 · tests failed 0 · suites failed 0.**
These figures are transcribed from the captured command output at the final head,
not carried forward from the earlier run.

The `building-manifest-cache-size` assertion — the only failure on a Windows
checkout — passes here, confirming it is a line-ending artifact rather than a
defect.

### What this does and does not prove

Proven: the corrected code type-checks and the entire suite passes on an LF
checkout at the exact PR head, including the OPS-024 regression suite that fails
against the defective `039c173e`.

**Not proven:** production behaviour. PR #589 is draft, unmerged and undeployed.
Cursor advancement, ingestion recovery and media settlement remain
**production-unproven** until an approved deployment is observed over several
scheduled cycles. `implemented` ≠ `merged` ≠ `deployed` ≠ `production_proven`.
