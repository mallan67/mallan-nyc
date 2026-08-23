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

All of these stay exactly as spelled. But they were **not all established the same way**,
and an earlier version of this table said "verified live in `$metadata`" over the whole
set — which is false for half of it. That is precisely the blending the evidence discipline
was introduced to stop, so the table is split.

### 1a · EXACT_COTALITY_RAW_NAME — `$metadata`, `INDEPENDENTLY_REPRODUCED`

Declared field and type names. Confirmed against the connector by a second party.

| term | where |
|---|---|
| `MlsStatus` | `Property` field, type `Cotality.DataStandard.Cotality.DD.Enums.MlsStatus` |
| `ListAgentMlsId` · `ListOfficeMlsId` | `Property` fields, distinct from `ListAgentKey` / `ListOfficeKey` |
| `Cotality.DataStandard.Cotality.DD.Enums.*` · `…Enums.Multi.*` | every enum type reference — `PropertySubType`, `StructureType`, `CommonInterest`, … |

### 1b · EXACT_COTALITY_RAW_VALUE — live row observation, `CLAUDE_LIVE_RUN`

**Not `$metadata` facts.** These are values seen in responses, so they are observations, and
**independent reproduction is PENDING** — the connector available for independent checking
does not expose arbitrary population queries.

| term | how it was established |
|---|---|
| observed `OriginatingSystemName` value `"RLS"` | 35/35 Mallan-office rows in a live census |
| observed `SourceSystemID` value `"TRESTLE"` | same census |
| `ListingId` values carrying an `RLS…` prefix | observed in live responses |
| `BuyerAgentRLSParticipantYN` | an observed key inside the opaque `CustomFields` payload — **not declared anywhere in `$metadata`** |

**Preserve these only as explicitly labelled provider evidence**, in the form
`Observed Cotality OriginatingSystemName value = "RLS"`. Do **not** convert an observation
into Mallan architecture terminology — that is how `RLS → REBNY → Trestle` came to exist as
a pipeline concept the provider never described. That chain is now removed from
`field-registry.ts`, and the observed values are quoted individually in its place.

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

**The rename alone was not enough — it fixed the vocabulary and left the authority defect
underneath.** The entry still declared `fixed` / `cotality` while its own note said the
value may be a Mallan `SL-`/`RL-` identifier, which cannot be Cotality-authored. Proven from
`prisma/schema.prisma`, model `Listing`:

```
id          BigInt @id @default(autoincrement())   <- canonical OBJECT identity, Mallan-generated
listing_id  String @unique                         <- canonical REFERENCE, DUAL-DOMAIN
```

So **three identities are now separated**, and the resolver enforces the difference:

| criterion | maps to | authority | may a suppressed provider row supply it? |
|---|---|---|---|
| `listing_object_identity` | `Listing.id` | `fixed` / `mallan_crm` | **no** |
| `listing_id_canonical` | `Listing.listing_id` | **`by_listing_authority`** | **no** — resolve the local twin first |
| `provider_listing_id` | Cotality `ListingId` | `fixed` / `cotality` | **yes — that is what evidence means** |
| `listing_key` | Cotality `ListingKey` | `fixed` / `cotality` | yes; also the media join key |

The suppressed-source rule needed no new mechanism: the resolver already admits a value from
a `mallan_office_representation` **only** when it is `fixed` / `cotality`, so correcting the
declaration corrected the behaviour. `listing_id_canonical` moved from the resolver's
ALLOWED list to REFUSED, and `provider_listing_id` took its place. 12 negative tests pin it.

---

## CATEGORY 4 — PRESERVED, WITH THE REASON DOCUMENTED

| term | why it stays |
|---|---|
| `mls_status` (canonical key) · `uiLabel 'MLS Status'` | mirrors the **exact** Cotality field `MlsStatus`. Renaming would break the correspondence with the provider field it maps |
| *(the three legacy `rls*` identifiers are no longer grouped — see below)* | grouping them was too broad; they are three different problems |
| "REBNY RLS" where it means **the body** | its rules, UCBA, display obligations, provider-health tracking. This is the correct use of the name |
| `mls_status` **projection column** | renaming a column is a schema migration — **HELD** |

---

## LEGACY `rls*` IDENTIFIERS — categorised INDIVIDUALLY, after tracing

Grouping these as "cannot be renamed" was too broad. They are three different problems with
three different answers.

| identifier | traced | category | decision |
|---|---|---|---|
| **`rls_eligible`** | **4 Prisma column declarations · ~700 references across 137 files** | **`LEGACY_PERSISTED_NAME`** | **MIGRATION HELD.** It is a real database column with readers throughout storage, projection and gates. Renaming needs a controlled migration plus a compatibility layer, and schema changes are held |
| **`isMallanRlsReturnCopy`** | **0 in Prisma · 5 files** (`lib/auth/listing-capabilities.ts`, `lib/listings/mallan-source-identity.ts`, `lib/listings/return-copy-canonical.ts`, `app/api/listings/suggest/route.ts`, + its test) | **`LEGACY_INTERNAL_SYMBOL`** | **Safe to rename — a refactor, not a schema problem.** `mallan_office_representation` already exists as the canonical term for the same concept. **DEFERRED, with a reason:** `tests/runtime/mallan-rls-return-copy-suppression.test.ts` currently has **uncommitted changes from another workstream**, and renaming across it would collide with in-flight work |
| **`rls:validate`** → `scripts/validate-rls-compliance.js` | npm script + CI | **`CURRENT_COMPLIANCE_TERM`** | **PRESERVED, and the reason is real:** the script header reads *"REBNY RLS COMPLIANCE VALIDATOR"* — it validates compliance with **the body's** display and submission rules. "REBNY RLS" here means the rules body, which is the correct use of the name, not a data-source claim |

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

**The terminology work is NOT complete, and this document does not say it is.**

- It covers `lib/search/canonical/**`, its tests, and the Search documents in
  `docs/search/` and `docs/idx/`. Corrected in this pass: the `RLS → REBNY → Trestle`
  pipeline chain, `RLS-side keys`, and `provider/REBNY factual-source obligation` — all in
  `field-registry.ts`, all replaced with either the provider-role wording or the raw
  observed values quoted individually.
- It does not cover `prisma/schema.prisma` comments, `public/crm/**`, or the PR body. The
  schema comments are **known** to carry stale provider-layer wording (Category 2 above) and
  a schema-comment-only pass is recorded as follow-up.
- It does not rename anything persisted, on the wire, or public-facing.
