# TERMINOLOGY AUDIT — Cotality provider names vs Mallan architecture vocabulary

**By category, not by substring count.** A raw grep cannot tell an exact provider field
name from invented architecture vocabulary, and a blind search/replace would corrupt the
wire contract.

## The rule being applied

> **Cotality API terminology for provider facts + Mallan terminology for Mallan facts.**
>
> Exact Cotality raw names are **wire-contract names** and are never renamed, even when
> Cotality itself spells them with `Mls`. What must not exist is a second, invented
> provider-vocabulary layer around them.

## The four categories

| # | category | action |
|---|---|---|
| **1** | **EXACT COTALITY RAW CONTRACT** | preserve exact spelling, always |
| **2** | **HISTORICAL / STALE COMMENT** | remove or rewrite to Cotality/Mallan terms |
| **3** | **MALLAN INTERNAL CANONICAL NAME** | rename **only after** tracing every reader, writer and test |
| **4** | **COMPLIANCE / LEGAL TERM with an independent current purpose** | preserve, and document why |

---

## CATEGORY 1 — EXACT COTALITY RAW CONTRACT · preserved, never renamed

Verified live in `$metadata`. These strings are what the API returns; renaming them would
break the wire contract.

| term | where |
|---|---|
| `MlsStatus` | `Property` field, `Cotality.DataStandard.RESO.DD.Enums.MlsStatus` |
| `ListAgentMlsId` · `ListOfficeMlsId` | `Property` fields (distinct from `ListAgentKey` / `ListOfficeKey`) |
| `Cotality.DataStandard.RESO.DD.Enums.*` · `…Enums.Multi.*` | every enum type reference, including `PropertySubType`, `StructureType`, `CommonInterest` |
| `OriginatingSystemName` and its observed value `RLS` | provider lineage — a **raw observed value**, preserved at the boundary as provenance |
| `ListingId` values carrying an `RLS…` prefix | raw provider values; provenance, never a source claim |
| `BuyerAgentRLSParticipantYN` | an observed `CustomFields` extension key — the provider's own key name |

> **`Mls` in a Cotality field name is Cotality's spelling, not ours.** It is not evidence of
> a Mallan terminology problem and must not be "cleaned up".

---

## CATEGORY 2 — HISTORICAL / STALE COMMENTS · corrected

| what it said | where | correction |
|---|---|---|
| `"Trestle ListingId OR internal SL-/RL- prefix"` presented as the definition | `field-registry.ts` `listing_key` note | the schema comment is now **quoted as a quote** and explicitly flagged as carrying stale provider-layer wording, with a schema-comment-only pass recorded as follow-up. The quote is preserved because rewriting it would misquote the schema |
| `"Trestle ListingId"` used as the architectural concept | `field-registry.ts` `listing_id_canonical` note | → **"Cotality API ListingId"** |
| a geocoding **vendor** named inside the factual-authority model | `source-provenance.ts` (×2) | removed. The axis now states: **factual authority does not encode an upstream vendor** — it classifies who authored the fact, not which supplier was called |
| the same vendor as an authority example | `resolve-factual-authority.ts` | → "a Mallan-derived coordinate" |
| the same vendor in a test comment | `canonical-a1-contract.test.ts` | → "geocoding, transit, canonical address normalisation" |

**Scoped scan after correction:** across `lib/search`, `lib/listings`, `lib/idx`,
`lib/compliance` and `tests/runtime`, the only remaining occurrence of that vendor name is
in `tests/runtime/sitemap-slug-canonical-parity.test.ts`, where it means the **search-engine
crawler** — an unrelated, legitimate usage.

> **Why this is stated with a scope.** Two previous reports claimed the vendor was "gone"
> when the check had only covered one file. The claim above names the exact directories
> scanned, and the one surviving hit, so it can be checked rather than trusted.

---

## CATEGORY 3 — MALLAN INTERNAL CANONICAL NAMES · traced, then renamed

### 3a. `cotality_rebny` → `cotality` — **RENAMED**

Invented vocabulary that fused the **provider** (the Cotality API) with the **MLS body**
(REBNY). Under the standing rule those are different things: the Cotality API is the
source; REBNY is the body a listing is filed with. A *source authority* may only name the
source.

**Tracing before the rename:**

| check | result |
|---|---|
| occurrences | **69** across **9** files |
| source files | `attribution.ts` · `field-registry.ts` · `inventory-scope.ts` · `resolve-factual-authority.ts` · `source-provenance.ts` — all in `lib/search/canonical/` |
| test files | 4, all in `lib/search/__tests__/` |
| persisted in Prisma? | **NO** — no column, no enum, no migration |
| serialised into JSON / audit payloads? | **NO** |
| emitted in any API response or DTO? | **NO** — `SourceAuthority` / `AttributionEnvelope` are not wired to any route |
| test coverage | full — the canonical suite exercises every authority path |

**Blast radius is in-code only.** Verified after: `type-check` 0 errors, `lib/search`
876/876.

### 3b. `listing_id_mls` → `listing_id_canonical`, `uiLabel 'MLS #'` → `'Listing ID'` — **RENAMED**

The canonical key embedded `mls` while the entry's own note says the value is **dual-domain**
— a Cotality API `ListingId` **or** an internal `SL-`/`RL-` identifier. It is the *Mallan
canonical listing identity*, so its name must not imply a single provider source.

**Tracing:** registry entry + 2 test references. `uiLabel` is **registry-internal — not
consumed by any runtime reader**, so no broker-facing text changed.

> `uiLabel` is nonetheless *intended* broker-facing wording. `'Listing ID'` is proposed, not
> imposed: if brokers should read something else, that is a product call.

---

## CATEGORY 4 — PRESERVED, WITH THE REASON DOCUMENTED

| term | why it stays |
|---|---|
| `mls_status` (canonical key) · `uiLabel 'MLS Status'` | mirrors the **exact** Cotality field `MlsStatus`. Renaming would break the correspondence with the provider field it maps |
| `rls_eligible` · `rls:validate` · `isMallanRlsReturnCopy` | existing identifiers that cannot be renamed without a schema or public-surface change. Already documented as legacy naming |
| "REBNY RLS" where it means **the body** | its rules, UCBA, display obligations, provider-health tracking. This is the correct use of the name |
| `mls_status` **projection column** | renaming a column is a schema migration — **HELD** |

---

## DEFECT FOUND DURING THE AUDIT

**D10 — the projection column `mls_status` does not carry `MlsStatus`.**
`standard_status.projectionColumn` is `mls_status`, i.e. the column named after one provider
field holds a **different** one (`StandardStatus`). `MlsStatus` is separately
provider-suppressed and not `$filter`-able (HTTP 400), so the two are not interchangeable.

Recorded in the registry note, **not fixed** — renaming the column is a schema migration and
is HELD. Until then the column name contradicts its contents, and any reader that trusts the
name will be wrong.

---

## WHAT THIS AUDIT DOES **NOT** CLAIM

- It does not claim the whole repository is terminology-clean. It covers
  `lib/search/canonical/**`, its tests, and the Search documents in `docs/search/` and
  `docs/idx/`.
- It does not cover `prisma/schema.prisma` comments, `public/crm/**`, or the PR body. The
  schema comments are **known** to carry stale provider-layer wording (Category 2 above) and
  a schema-comment-only pass is recorded as follow-up.
- It does not rename anything persisted, on the wire, or public-facing.
