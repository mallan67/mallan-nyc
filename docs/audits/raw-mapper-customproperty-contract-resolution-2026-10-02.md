# CustomProperty resource contract — PR #647 raw-mapper convergence (2026-10-02)

Split out of `docs/audits/raw-mapper-media-contract-resolution-2026-10-02.md` per Maya's
instruction: each Cotality resource gets its own verified contract. Lighter-weight pass —
one dedicated agent.

Structured per the required template: **RAW COTALITY RESOURCE CONTRACT → CANONICAL MALLAN
STORAGE FIELDS → DOWNSTREAM PROJECTION → CURRENT DEFECT/GAP → PROOF.**

---

## 1. RAW COTALITY RESOURCE CONTRACT

`CustomProperty` is its own entity set, 142 fields, reachable only via `$expand=CustomProperty`
on a `Property` query (confirmed live, `mcp__trestle-fields__trestle_list_fields(resource="CustomProperty")`).
It also exposes its own `$expand` target back to `Property`, confirming the sub-resource
relationship runs both ways. The FARE-Act-adjacent fee fields Mallan's code attempts to read:

- `AdditionalFee` — Decimal(14,2), nullable. **CustomProperty only** — does not exist as a
  flat `Property` field.
- `AdditionalFeeDescription` — String(1024), nullable. CustomProperty only.
- `AdditionalFeeYN` — Boolean, nullable. CustomProperty only.
- `AdditionalFeeFrequency` — Enum (`FeeFrequency` shared type, 16 values: `Annually,
  BiMonthly, BiWeekly, Daily, FullTerm, Monthly, NotApplicable, OneTime, Other, Quarterly,
  Seasonal, SeeAgent, SeeRemarks, SemiAnnually, SemiMonthly, Weekly`). CustomProperty only.
  **A bare field literally named `FeeFrequency` does not exist anywhere on live Trestle** —
  it is only the shared enum *type* name reused by three real fields
  (`AssociationFeeFrequency`, `AdditionalFeeFrequency`, `MembershipFeeFrequency`); confirmed
  via `trestle_lookup_field("FeeFrequency")` returning a "not found, did you mean" response.

---

## 2. CANONICAL MALLAN STORAGE FIELDS

No dedicated typed storage exists for these fields today. `lib/idx/trestle-mapper.ts`'s
`B30_FARE_ACT_FEES` block (present on current `main` HEAD; **not** present at this PR's
pinned reference commit — the file diverged after this PR branched) picks the four raw
field names into the generic `features` JSONB column via `pick()`, which silently drops any
key whose value is `undefined`/`null`.

---

## 3. DOWNSTREAM PROJECTION

Two consumers attempt to read these fields; one correctly anticipates the `$expand` shape,
one does not:

- `lib/idx/mapping.ts` — reads `AdditionalFee`, `AdditionalFeeDescription`, `AdditionalFeeYN`,
  and the nonexistent bare `FeeFrequency` as flat `raw.*` fields, with zero `$expand` logic
  anywhere in the file.
- `lib/search/crm-idx-mapper.ts` — correctly unwraps `raw.CustomProperty` as a one-element
  array (`CustomProperty[0]`) for its own `DownPaymentAssistance*` field reads, degrading
  gracefully when absent. This is the right template for any future `AdditionalFee*` fix.
- `lib/idx/fetch.ts` — defines the `expandCustomProperty` opt-in flag (default `false`); no
  caller sets it to `true` in production.

---

## 4. CURRENT DEFECT/GAP

**PROVEN_RESOURCE_GAP:** `lib/idx/mapping.ts` reads `AdditionalFee*` fields as flat `raw.*`
with no `$expand=CustomProperty` anywhere in the file — structurally unable to populate these
fields regardless of what Cotality returns, since the sub-resource is never requested.

**PROVEN_RESOURCE_GAP:** no current production code path (confirmed by repo-wide search for
`expandCustomProperty`: 3 hits total — the flag's own definition, a test fixture, and
documentation) ever sets `expandCustomProperty: true`. `raw.CustomProperty` is never
populated in production today, on any route.

**PROVEN_RESOURCE_GAP:** the bare field name `FeeFrequency`, referenced in `mapping.ts` and
in current `main`'s `trestle-mapper.ts` `B30_FARE_ACT_FEES` block, does not exist on live
Trestle — the real field is `AdditionalFeeFrequency`. Even if `$expand=CustomProperty` were
enabled, this specific field would still never populate under its current (wrong) name.

**Time-sensitive, outside this PR's scope:** current `main`'s `lib/idx/trestle-mapper.ts`
(diverged from this PR's pinned reference after branching) has independently grown the
identical flat-`pick()` defect for these same four fields, now in the primary DB-ingestion
mapper, not just the display-side `mapping.ts`. `pick()` silently drops the undefined keys,
so `features.AdditionalFee*` is silently absent from every listing `main` persists today.
This is live on production `main` right now; this PR's tooling cannot touch `main`, which is
frozen — flagging for Maya's attention separately.

**CORRECT:** `lib/search/crm-idx-mapper.ts`'s `CustomProperty[0]`-unwrapping pattern correctly
anticipates the real `$expand` shape and degrades gracefully when the sub-resource is absent
(the realistic case today, since nothing currently expands it).

---

## 5. PROOF

Live field/type/enum facts confirmed via `mcp__trestle-fields__trestle_list_fields(resource="CustomProperty")`
and `trestle_lookup_field` calls for each of the four fee fields plus `FeeFrequency` this
session. `lib/idx/mapping.ts`, `lib/search/crm-idx-mapper.ts`, and `lib/idx/fetch.ts` read
directly at PR #647's pinned reference; `lib/idx/trestle-mapper.ts` additionally read at
current `main` HEAD to confirm the time-sensitive finding above (blob SHAs differ: pinned ref
`5fe9c69…`, 1194 lines, zero `B30`/`AdditionalFee` matches; `main` HEAD `9146db5…`, 1371
lines, defines `B30_FARE_ACT_FEES`). No live-row execution or captured-row fixture exists for
this resource.
