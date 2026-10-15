# Mallan Exclusives Syndication — MVP Plan (REPORT ONLY · v2)

> **Status:** Architecture plan only. **No code from this doc.** Docs-only PR.
> **Date:** 2026-05-18 · **Version 2 — corrected, with MVP decisions** · **Author:** Claude Code under Maya direction
> **What v2 corrects vs v1:** v1 used `source='manual'` as the primary discriminator and treated `source='trestle'` as automatically disqualifying. **That was wrong.** Mallan's own exclusive listings can arrive in this codebase with `source='trestle'` — they reach REBNY RLS outside mallan.nyc and return inbound through Trestle IDX. The correct gate is **listing-side control + explicit syndication authorization + compliance-safe public advertising rights** — not source-based.
> **Holds preserved (Maya's spec):** no IDX/RLS/Trestle co-brokerage export · no other brokerage's listings · no ListingSearchProjection changes · no IDX sync changes · no PR #148 / PR 5B · no reconciliation · no env vars · no Neon · no migrations · no cron · no agents / skills / workflows.
> **Truth source:** current `main` HEAD `b95e5f44`.

---

## MVP Decisions (Maya, 2026-05-18) — read FIRST

These seven decisions are binding for the MVP. Every section below is interpreted under these constraints.

| # | Decision | Implication for MVP |
|---:|---|---|
| **1** | **Mallan office MLS ID(s) — UNKNOWN.** Must be confirmed from REBNY / Trestle / live-data audit BEFORE any implementation. | PR 1 ships a config file with empty `MALLAN_OFFICE_MLS_IDS` and ships the read-only audit script. Until Maya confirms the values and they're populated, the eligibility gate blocks every row (correct fail-closed default). |
| **2** | **`Agent.trestle_mls_id` backfill — DEFER.** Do not run SQL or data updates yet. PR 1 may include a read-only audit script to identify observed `ListAgentMlsId` / `ListOfficeMlsId` values. Backfill happens only AFTER Maya verifies IDs. | PR 1 = audit-only. No `UPDATE agents` statement, no Prisma write, no migration. The audit script is read-only against `listings.agent_info` JSON. |
| **3** | **Co-list authorization — DEFAULT BLOCK.** Unless explicit written authorization exists. | Eligibility gate Layer 1c (co-list match) is DISABLED for MVP. Even if `CoListAgentMlsId` / `CoListOfficeMlsId` matches Mallan, the row is INELIGIBLE unless `Listing.compliance.syndication.co_list_authorization_url` is populated. Default state for every existing row: no URL → blocked. |
| **4** | **Seller advertising authorization — MANUAL ATTESTATION.** No standardized form yet. MVP requires manual broker/Maya attestation stored in `Listing.compliance.seller_advertising_authorization` JSON. | The admin UI captures attestation as a single broker action: "I attest the seller authorized syndication for these channels." Stored as `{ attested_by, attested_at, channels, attestation_note }`. NO seller-side signature workflow yet. NO form upload required. Replace with a real signed form later (Class B). |
| **5** | **Approval workflow — SINGLE BROKER (Maya) MANUAL APPROVAL.** | No multi-step approvals in MVP. No agent-side pre-approval. The single broker (Maya) reviews each eligibility checklist and clicks "Approve + Export". One AuditEvent per action. |
| **6** | **Channel scope — JSON + CSV preview/download only.** No XML in MVP. No automatic push. No partner API integrations. | PR 3 ships exactly two adapters: `lib/syndication/adapters/json.ts` and `lib/syndication/adapters/csv.ts`. No XML adapter. No HTTP push to any partner. PR 5 (partner-specific CSV templates) is HOLD on Class C partner contracts. |
| **7** | **`/exclusives` public page — LATER.** Show ONLY listings explicitly approved for the public `/exclusives` channel, not every eligible exclusive by default. | PR 6 is HOLD until Maya re-approves. When it lands, the page queries the same gate AND requires `Listing.compliance.syndication.channels` to include the literal string `"mallan_exclusives_public_page"`. Default: not approved → not on the page. |

**Operator note:** Until decision 1 and 2 are completed, the eligibility gate cannot match anything. That is the correct fail-closed state. Nothing public-facing changes until Maya verifies the IDs.

---

## A. Current repo findings

The repo already carries every field needed to identify **Mallan-as-listing-side**. The data is split across two surfaces:

1. **Typed columns on `Listing`** (`prisma/schema.prisma:437-571`) — promoted from JSON for fast read paths.
2. **`agent_info` JSON column on `Listing`** — full Trestle agent identifiers as they come off the IDX feed. Required because the typed columns only carry the two display fields (`list_agent_full_name`, `list_office_name`) — the canonical MLS IDs stay in JSON until a schema promotion later.

### A.1 Where Mallan-controlled listings live

| Source | Where they enter | How they're stored |
|---|---|---|
| **Trestle IDX (where Mallan is listing side)** | `lib/idx/fetch.ts` → `lib/idx/trestle-mapper.ts` → `Listing` upsert with `source='trestle'` | Same `listings` table. `agent_info` JSON carries `ListAgentMlsId`, `ListOfficeMlsId`, `ListAgentFullName`, `ListOfficeName`, etc. Typed columns `list_agent_full_name` + `list_office_name` (`schema.prisma:506-507`) carry the two display fields. |
| **Mallan-side Trestle rows** | Not a direct integration and not a Mallan component. However a Mallan listing reaches REBNY RLS, mallan.nyc only ever reads it back through the Trestle IDX pipeline. **From this codebase's perspective these are simply Trestle-sourced rows where Mallan is the listing side.** | Same as Trestle row above. |
| **Manual / admin-created** | `app/api/crm/listings/route.ts` POST → CRM form (`public/crm/SALE-FORM-REDESIGN.html`, `RENTAL-FORM-REDESIGN.html`) → `Listing` insert with `source='manual'` default | Same `listings` table. `agent_id` column FK to `Agent`. `agent_info` JSON populated from form input. `listing_id` prefixed `SL-` / `RL-`. |
| **Other internal/admin** | None at present | n/a |

### A.2 How the system already separates Mallan-controlled from general RLS/IDX inventory — the data IS in the row, just not in a typed column

The Trestle mapper (`lib/idx/trestle-mapper.ts`) already ingests every relevant Trestle agent/office identifier into `agent_info` JSON on every Property upsert. Specifically (from `trestle-mapper.ts`):

| Trestle field | What it identifies | Stored where |
|---|---|---|
| `ListAgentMlsId` | Listing agent's REBNY MLS member ID | `Listing.agent_info.ListAgentMlsId` (JSON) |
| `ListAgentKey` | Listing agent's Trestle internal key | `Listing.agent_info.ListAgentKey` (JSON) |
| `ListAgentFullName` | Listing agent's display name | `Listing.agent_info.ListAgentFullName` (JSON) + promoted to `Listing.list_agent_full_name` typed column (`schema.prisma:506`) |
| `ListOfficeMlsId` | Listing office's REBNY MLS member ID | `Listing.agent_info.ListOfficeMlsId` (JSON) |
| `ListOfficeKey` | Listing office's Trestle internal key | `Listing.agent_info.ListOfficeKey` (JSON) |
| `ListOfficeName` | Listing office's display name | `Listing.agent_info.ListOfficeName` (JSON) + promoted to `Listing.list_office_name` typed column (`schema.prisma:507`) |
| `CoListAgentMlsId` / `CoListAgentKey` / `CoListAgentFullName` | Co-listing agent (when applicable) | `Listing.agent_info.CoList*` (JSON) |
| `CoListOfficeMlsId` / `CoListOfficeKey` / `CoListOfficeName` | Co-listing office | `Listing.agent_info.CoListOffice*` (JSON) |

So **every Trestle row already carries the listing-side identity in `agent_info` JSON**. No mapper change required. No schema change required. The eligibility gate just reads these JSON keys.

### A.3 Mallan's own canonical identifiers

| Identifier | Where it lives | Status |
|---|---|---|
| **Mallan brokerage license** (NY DOS) | `#10991205323` — referenced in `llms.txt`, `CLAUDE.md`, BUYER-DEAL-FORM.html, TENANT-DEAL-FORM.html, etc. | ✓ canonical |
| **Maya Allan agent license** (NY DOS) | `#10311201806` — referenced same places | ✓ canonical |
| **Mallan office MLS ID** (Trestle / REBNY `ListOfficeMlsId`) | **NOT** stored anywhere in the repo today | ❌ **missing — required for the gate** |
| **Mallan agent MLS IDs** (Trestle / REBNY `ListAgentMlsId`) | `Agent.trestle_mls_id` typed column at `schema.prisma:37` — "REBNY MLS member ID on Trestle (e.g. '39361') — different from state license_no" | ✓ column exists; **values must be populated** for each Mallan agent before the gate can match anything |
| **Co-listing scenarios** | No first-party data — would need explicit broker decision per row | n/a today |

**Key insight:** The repo's data model is ready, but the **canonical MLS IDs for Mallan office + each Mallan agent** must be captured into the existing column (`Agent.trestle_mls_id`) + a new config constant (for the office) before the eligibility gate can produce any matches. **This is config/data entry work, not a schema migration.**

---

## B. Fields found vs fields missing

### B.1 Fields already present (Class A — usable today)

| Field | Where | What we can do with it |
|---|---|---|
| `Listing.source` | column (default `manual`) | Diagnostic ONLY — never the eligibility decider |
| `Listing.agent_id` | FK to `Agent` | Identifies Mallan-side when set (manual listings + matched Trestle listings) |
| `Listing.owner_client_id` | FK to `Lead` | Owner/seller linkage |
| `Listing.agent_info` (JSON) | per-row | Carries `ListAgentMlsId`, `ListOfficeMlsId`, `CoList*MlsId` — the canonical listing-side identifiers |
| `Listing.list_agent_full_name`, `Listing.list_office_name` | typed columns | Display values (already promoted from JSON) |
| `Listing.status` + `TERMINAL_STATUSES` constant | column + canonical set | Active vs Coming Soon vs terminal |
| `Listing.idx_display_yn`, `internet_entire_listing_display_yn`, `internet_address_display_yn`, `internet_automated_valuation_display_yn`, `internet_consumer_comment_yn` | columns | REBNY distribution gates (must be `true` for any public display, including syndication) |
| `Listing.owner_opt_out`, `Listing.participant_only` | columns | Hard blockers — both must be `false` |
| `Listing.rls_eligible` | column | `false` = website-only (commercial); irrelevant for syndication gate |
| `Listing.compliance` (JSON) | per-row | Room to add `compliance.syndication.*` + `compliance.media_rights.*` without migration |
| `Listing.custom_fields` (JSON) | per-row | Alternative bag for syndication metadata if `compliance.*` is over-loaded |
| `Listing.modification_timestamp`, `Listing.status_changed_at` | columns | Audit + UCBA timing |
| `Listing.last_synced_from_trestle` | column | Diagnostic ONLY — never a discriminator |
| `Agent.trestle_mls_id` | column (line 37) | **Canonical Mallan agent ID** for matching against Trestle `ListAgentMlsId` |
| `Agent.license_no`, `Agent.role` | columns | Brokerage attribution + role gates |
| `AuditEvent` model | (line 695) | Audit trail for every syndication action |

### B.2 Fields missing or under-populated (gap list)

| Gap | Severity | Fix path |
|---|---|---|
| **Mallan office MLS ID(s)** — the `ListOfficeMlsId` value(s) that count as "Mallan as listing office" | **CRITICAL — gate cannot match without it** | Add `lib/syndication/mallan-identity.ts` config file exporting `MALLAN_OFFICE_MLS_IDS: string[]` and `MALLAN_BROKERAGE_LICENSE: string`. Maya provides the values. No env var. No schema. |
| **Per-agent `Agent.trestle_mls_id`** values | **CRITICAL — gate cannot match without it** | Backfill each active Mallan agent's MLS ID. Maya knows them. Pure data entry; no schema change needed (column already exists). |
| **Syndication permission state** (broker approval) | Class A — JSON works | Store at `Listing.compliance.syndication.approval_status`, `approved_at`, `approved_by`, `expires_at` |
| **Seller / owner advertising authorization** | Class A — JSON works | Store at `Listing.compliance.seller_advertising_authorization` with `signed_at`, `signed_by`, `agreement_doc_url`, `scope` (`mallan_owned_only` / `mallan_plus_authorized_partners` / `broad_public`) |
| **Media rights confirmation** | Class A — JSON works | `Listing.compliance.media_rights.{ source, confirmed_at, confirmed_by, license_doc_url }` |
| **Co-list scenario approval** (where Mallan is co-list not primary list) | Class B — HOLD or JSON-only with caveats | If `CoListAgentMlsId` matches Mallan but `ListAgentMlsId` does not, the listing belongs to the OTHER brokerage. Co-list-side syndication needs the other brokerage's explicit permission. JSON-only flag `compliance.co_list_authorization_url` until a typed model is needed. |
| **Per-channel approval matrix** (which channels this listing is approved for) | Class A — JSON works | `Listing.compliance.syndication.channels: string[]` |
| **Per-export audit retention** | Class A — already in `AuditEvent` | Existing pattern is enough |
| **Typed columns for the above** (`syndication_status`, `syndication_approved_at`, `media_rights_confirmed_at`, dedicated `SyndicationChannel` join) | **Class B — HOLD** | Promote from JSON to typed columns only after MVP volume + access patterns justify it |

---

## C. Corrected eligibility gate (5 layers, fail-closed)

The gate is a **single function** evaluated at multiple checkpoints. **It is source-agnostic.** A `source='trestle'` row CAN pass; a `source='manual'` row CAN fail. The discriminator is the union of Layers 1-5 below.

### C.0 Eligibility invariants — UPDATED 2026-05-18 (Codex PR #161 feedback)

These invariants are non-negotiable. Every test, every adapter, every UI screen must honor them.

| # | Invariant | Status |
|---:|---|---|
| **I.1** | **Manual listings are not automatically eligible.** `source='manual'` alone never passes Layer 1. | **HARD RULE** |
| **I.2** | **Trestle listings are not automatically excluded.** `source='trestle'` is irrelevant to eligibility. Trestle rows with Mallan listing-side canonical IDs CAN pass; non-Mallan rows CANNOT, regardless of source. | **HARD RULE** |
| **I.3** | **`source` alone never proves Mallan control.** The eligibility decision is driven exclusively by canonical IDs (`ListAgentMlsId`, `ListOfficeMlsId`, `CoListAgentMlsId`, `CoListOfficeMlsId`) matched against the `MALLAN_OFFICE_MLS_IDS` / `MALLAN_AGENT_MLS_IDS` config, OR by an explicit broker-approved manual-control verification flag in the row's `compliance` JSON. | **HARD RULE** |
| **I.4** | **Free-text brokerage / agent name matching is never sufficient for eligibility.** Substrings like `"mallan"` in `list_office_name` are a UI hint, never a gate input. The earlier v2 draft (Layer 1d) treated a "mallan" substring + `agent_id != null` + `source='manual'` as a sufficient eligibility path; that was unsafe and is removed. | **HARD RULE** |
| **I.5** | **If `MALLAN_OFFICE_MLS_IDS` AND `MALLAN_AGENT_MLS_IDS` are both empty, ALL listings are blocked at Layer 1.** No row can pass without at least one of those config sets being non-empty AND at least one corresponding canonical ID matching on the row. The "empty config = block all" behavior is the correct fail-closed default.<br><br>**Ordering — strengthened 2026-05-19 (Codex PR #162 review):** the empty-config guard runs **FIRST** in Layer 1, BEFORE 1a/1b/1c/1d. The broker-approved manual-control verification flag (invariant I.6) does **NOT** bypass this — when both config sets are empty, even a complete `compliance.mallan_control_verification` flag fails-closed at Layer 1 with reason `identity_config_empty_blocks_all_rows`. Rationale: with no canonical identity configured, the verification flag would be a single point of bypass (anyone with write access to `compliance` JSON could mint a passing row). | **HARD RULE** |
| **I.6** | **A manual listing may become eligible only when ONE of the following is true:** (a) canonical Mallan office or agent IDs are configured AND the row's `ListOfficeMlsId` / `ListAgentMlsId` matches (same path used for Trestle rows); OR (b) a broker-approved explicit manual-control verification flag is set on `Listing.compliance.mallan_control_verification` AFTER a deliberate human review action. There is no third path. | **HARD RULE** |
| **I.7** | **The manual-control verification flag must NEVER be auto-created by the audit script.** PR 1A's audit script is read-only and dry-run only; it cannot write any field, and specifically cannot write `compliance.mallan_control_verification`. The flag is created ONLY by an explicit broker action in the admin UI (a future PR; not in scope for PR 1A). | **HARD RULE** |
| **I.8** | **Ambiguity = block.** Every Layer fails-closed; no fallback to "try the next signal." If canonical IDs are missing OR conflicting OR partially set, the row is INELIGIBLE. | **HARD RULE** |

These eight invariants supersede any earlier description in this document. They were added 2026-05-18 in response to Codex's PR #161 finding that v2's Layer 1d (manual + `agent_id` fallback) could open the gate while canonical identifiers were unset, contradicting the fail-closed rule.

```typescript
// proposed location — not implemented yet
// lib/syndication/eligibility.ts

import { MALLAN_OFFICE_MLS_IDS, MALLAN_BROKERAGE_LICENSE } from "./mallan-identity";

interface ListingSideControl {
  passes: boolean;
  via:
    | "list_office_mls_id_match"
    | "list_agent_mls_id_match"
    | "co_list_office_mls_id_match"      // weaker — requires Layer-1b co-list authorization
    | "manual_with_mallan_agent_link"
    | null;
  ambiguity_reasons: string[];
}

interface MallanSyndicationEligibility {
  eligible: boolean;
  failed_layers: ("layer_1" | "layer_2" | "layer_3" | "layer_4" | "layer_5")[];
  reasons: string[];
  control: ListingSideControl;
  computed_at: string;
}

export async function evaluateMallanSyndicationEligibility(
  listing: Listing,
  mallanAgentMlsIds: Set<string>,    // loaded from Agent.trestle_mls_id WHERE status='active'
): Promise<MallanSyndicationEligibility> {
  const reasons: string[] = [];
  const failedLayers = new Set<"layer_1" | "layer_2" | "layer_3" | "layer_4" | "layer_5">();
  const agentInfo = (listing.agent_info ?? {}) as Record<string, unknown>;
  const compliance = (listing.compliance ?? {}) as Record<string, unknown>;
  const synd = (compliance.syndication ?? {}) as Record<string, unknown>;

  // ════════════════════════════════════════════════════════════════
  // LAYER 1 — Listing-side control via canonical IDs
  // ════════════════════════════════════════════════════════════════
  const listOfficeMlsId  = String(agentInfo.ListOfficeMlsId  ?? "").trim();
  const listAgentMlsId   = String(agentInfo.ListAgentMlsId   ?? "").trim();
  const coListOfficeId   = String(agentInfo.CoListOfficeMlsId ?? "").trim();
  const coListAgentId    = String(agentInfo.CoListAgentMlsId  ?? "").trim();
  const officeSet = new Set(MALLAN_OFFICE_MLS_IDS);

  let control: ListingSideControl = { passes: false, via: null, ambiguity_reasons: [] };

  // 1a — Office-level match (strongest signal: Mallan IS the listing office)
  if (listOfficeMlsId && officeSet.has(listOfficeMlsId)) {
    control = { passes: true, via: "list_office_mls_id_match", ambiguity_reasons: [] };
  }
  // 1b — Agent-level match (secondary: a Mallan agent is the listing agent)
  else if (listAgentMlsId && mallanAgentMlsIds.has(listAgentMlsId)) {
    // Strongly suggests Mallan-controlled, but verify the office isn't another brokerage
    if (listOfficeMlsId && !officeSet.has(listOfficeMlsId)) {
      control.ambiguity_reasons.push("agent_match_but_office_is_other_brokerage");
    } else {
      control = { passes: true, via: "list_agent_mls_id_match", ambiguity_reasons: [] };
    }
  }
  // 1c — Co-list scenarios (weakest — requires separate authorization)
  else if (
    (coListOfficeId && officeSet.has(coListOfficeId)) ||
    (coListAgentId && mallanAgentMlsIds.has(coListAgentId))
  ) {
    const coListAuth = (synd.co_list_authorization_url as string | undefined) ?? null;
    if (coListAuth) {
      control = { passes: true, via: "co_list_office_mls_id_match", ambiguity_reasons: [] };
    } else {
      control.ambiguity_reasons.push("co_list_match_but_no_co_list_authorization_doc");
    }
  }
  // 1d — Broker-approved manual-control verification (the ONLY path that
  // makes a row eligible when no canonical Trestle IDs match). MUST be set
  // by an explicit human broker action in the admin UI; NEVER auto-created
  // by the audit script or any other automated path. See invariants I.6
  // and I.7 in §C.0.
  //
  // Required shape on the row:
  //   compliance.mallan_control_verification = {
  //     verified_by:    "<broker_user_id>",   // BigInt as string
  //     verified_at:    "<ISO timestamp>",
  //     verification_note: "<free text from broker — required, audit trail>",
  //     evidence_doc_url:  "<optional URL to signed exclusive agreement>",
  //   }
  //
  // The mere presence of `agent_id`, the substring "mallan" in
  // `list_office_name`, or `source==='manual'` is NEVER sufficient by
  // itself. The Codex feedback on PR #161 explicitly rejected the earlier
  // Layer-1d "manual + agent_id fallback" because it could open the gate
  // while canonical identifiers were unset. That fallback is REMOVED.
  else if (
    typeof (compliance.mallan_control_verification as Record<string, unknown> | undefined)?.verified_at === "string" &&
    typeof (compliance.mallan_control_verification as Record<string, unknown> | undefined)?.verified_by === "string" &&
    typeof (compliance.mallan_control_verification as Record<string, unknown> | undefined)?.verification_note === "string"
  ) {
    control = { passes: true, via: "manual_control_verified", ambiguity_reasons: [] };
  }

  // 1e — Ambiguity / conflicts — fail-closed
  if (listOfficeMlsId && listAgentMlsId &&
      officeSet.has(listOfficeMlsId) === false &&
      mallanAgentMlsIds.has(listAgentMlsId) === true) {
    control.ambiguity_reasons.push("agent_says_mallan_office_says_other_brokerage");
  }

  // 1f — Empty-config guard (invariant I.5). If BOTH config sets are empty,
  // every row is blocked at Layer 1. This is the correct fail-closed default
  // until Maya populates MALLAN_OFFICE_MLS_IDS and Agent.trestle_mls_id.
  if (officeSet.size === 0 && mallanAgentMlsIds.size === 0 && !control.passes) {
    control.ambiguity_reasons.push("identity_config_empty_blocks_all_rows");
  }

  if (!control.passes) {
    failedLayers.add("layer_1");
    reasons.push(`listing_side_control_failed (via=${control.via}; ambiguities=${control.ambiguity_reasons.join("|") || "none"})`);
  }

  // ════════════════════════════════════════════════════════════════
  // LAYER 2 — Syndication authorization
  // ════════════════════════════════════════════════════════════════
  if (synd.approval_status !== "approved") {
    reasons.push("broker_approval_missing"); failedLayers.add("layer_2");
  }
  if (!synd.approved_at || !synd.approved_by) {
    reasons.push("broker_approval_signature_missing"); failedLayers.add("layer_2");
  }
  if (synd.expires_at && new Date(synd.expires_at as string) < new Date()) {
    reasons.push("broker_approval_expired"); failedLayers.add("layer_2");
  }

  const seller = (compliance.seller_advertising_authorization ?? {}) as Record<string, unknown>;
  if (!seller.signed_at || !seller.scope) {
    reasons.push("seller_advertising_authorization_missing"); failedLayers.add("layer_2");
  }

  const mediaRights = (compliance.media_rights ?? {}) as Record<string, unknown>;
  if (!mediaRights.confirmed_at) { reasons.push("media_rights_not_confirmed"); failedLayers.add("layer_2"); }
  if (mediaRights.source === "trestle_co_brokerage") {
    reasons.push("media_rights_belong_to_other_brokerage"); failedLayers.add("layer_2");
  }

  if (!listing.list_office_name && !agentInfo.ListOfficeName) {
    reasons.push("brokerage_attribution_missing"); failedLayers.add("layer_2");
  }

  // ════════════════════════════════════════════════════════════════
  // LAYER 3 — REBNY / RLS safety
  // ════════════════════════════════════════════════════════════════
  if (listing.owner_opt_out === true)        { reasons.push("owner_opt_out_true"); failedLayers.add("layer_3"); }
  if (listing.participant_only === true)     { reasons.push("participant_only_true"); failedLayers.add("layer_3"); }
  if (listing.internet_entire_listing_display_yn === false) { reasons.push("internet_entire_display_false"); failedLayers.add("layer_3"); }
  if (listing.idx_display_yn === false)      { reasons.push("idx_display_yn_false"); failedLayers.add("layer_3"); }

  const isActive = listing.status === "Active" || listing.status === "ComingSoon";
  if (!isActive) { reasons.push(`status_not_distributable (${listing.status})`); failedLayers.add("layer_3"); }

  // (Description-level Fair Housing scan runs inside the sanitizer at Layer 4 — see below.)

  // ════════════════════════════════════════════════════════════════
  // LAYER 4 marker — payload sanitizer is responsible for field stripping +
  // running Fair Housing scan on the description. We only return a flag here;
  // the actual stripping happens inside `buildMallanCanonicalPayload()`.
  // ════════════════════════════════════════════════════════════════
  // (Layer 4 is sanitizer-side and is not a yes/no boolean — it's the contract
  // of "the payload that comes out must be the allowlist." See §D.)

  // ════════════════════════════════════════════════════════════════
  // LAYER 5 marker — channel adapter re-checks eligibility AND payload shape
  // before emitting any output. Recorded here so the route handler knows it
  // must call the adapter's `prepare()` function and not skip directly to
  // the writer. See §G.
  // ════════════════════════════════════════════════════════════════

  return {
    eligible: failedLayers.size === 0,
    failed_layers: Array.from(failedLayers),
    reasons,
    control,
    computed_at: new Date().toISOString(),
  };
}
```

### C.1 Why this gate is correct (vs the v1 + early-v2 mistakes)

| Scenario | v1 verdict (WRONG) | v2 + Codex correction (CORRECT) |
|---|---|---|
| Mallan listing entered outside mallan.nyc → routed to REBNY RLS → re-ingested via Trestle with `ListOfficeMlsId = <Mallan>` and `source='trestle'` | ❌ blocked (source wrong) | ✓ Layer 1a passes; eligible if other layers pass |
| Mallan listing manually entered in CRM (`source='manual'`, `agent_id=<Mallan agent>`), NO canonical IDs, NO verification flag | ✓ passes | ❌ **BLOCKED** — early-v2 Layer 1d allowed this via free-text "mallan" substring; **that path is removed** (invariants I.1, I.3, I.4). Broker must EITHER (a) populate the canonical IDs (Decision #1 / #2) or (b) set `compliance.mallan_control_verification` via deliberate admin UI action. |
| Mallan-controlled manual listing WITH `compliance.mallan_control_verification` populated by broker action | n/a | ✓ Layer 1d passes via the explicit verification flag |
| Co-brokerage listing (some other brokerage is listing side, Mallan is buyer side) — `source='trestle'`, `ListOfficeMlsId = <another brokerage>` | ❌ blocked | ✓ blocked — Layer 1 fails (no Mallan office/agent match, no verification flag) |
| Mallan agent's old listing transferred to a partner brokerage but old `agent_id` still matches in DB | ✓ passes (WRONG — partner brokerage controls it now) | ❌ blocked — Layer 1e's "agent match + office is other brokerage" ambiguity catches this |
| Manual entry typo (`list_office_name = "Maelan Real Estate"`) — no canonical IDs, no verification flag | ✓ passes (WRONG — brittle string match) | ❌ blocked — free-text matching is not a gate input per invariant I.4 |
| **Empty config — both `MALLAN_OFFICE_MLS_IDS` and `MALLAN_AGENT_MLS_IDS` are empty** | n/a | ❌ **EVERY row blocked at Layer 1** via the empty-config guard (1f) (invariant I.5). Correct fail-closed default until Maya populates the config. |
| Audit script attempts to write `compliance.mallan_control_verification` automatically | n/a | ❌ forbidden by invariant I.7 — the audit script is read-only and dry-run only |

---

## D. Risk if listing-side IDs are ambiguous

**Default behavior: BLOCK.** Every layer fails-closed; no silent fallback. The "ambiguity = block" rule (invariant I.8) supersedes any earlier text describing a fallback path.

Specific ambiguity scenarios + what happens:

| Ambiguity | Verdict | Logged as |
|---|---|---|
| `ListAgentMlsId` matches a Mallan agent BUT `ListOfficeMlsId` is set and is NOT Mallan | **BLOCK** | `agent_says_mallan_office_says_other_brokerage` |
| Both Trestle IDs empty AND no broker-approved manual-control verification flag | **BLOCK** | `listing_side_control_failed (via=null; ambiguities=none)` |
| Co-listing scenario where Mallan is co-list but `compliance.syndication.co_list_authorization_url` is absent | **BLOCK** | `co_list_match_but_no_co_list_authorization_doc` |
| `Agent.trestle_mls_id` not populated for any Mallan agent → `mallanAgentMlsIds` set empty at runtime | **BLOCKS ALL** agent-level matches | Layer 1b cannot fire |
| `MALLAN_OFFICE_MLS_IDS` config is empty | **BLOCKS ALL** office-level matches | Layer 1a cannot fire |
| **BOTH config sets empty AND no manual-control verification flag** | **BLOCKS EVERY ROW** | `identity_config_empty_blocks_all_rows` (Layer 1f) |
| **`source='manual'` + `agent_id != null` + NO canonical IDs + NO verification flag** (the early-v2 Layer 1d path) | **BLOCK** — Codex feedback on PR #161 explicitly rejected this fallback; **the path is removed** (invariants I.1, I.3, I.4) | `listing_side_control_failed (via=null)` |
| `list_office_name` contains substring "mallan" but no canonical IDs and no verification flag | **BLOCK** — free-text matching is never sufficient (invariant I.4) | `listing_side_control_failed (via=null)` |
| Manual-control verification flag present but missing required fields (`verified_by`, `verified_at`, `verification_note`) | **BLOCK** — partial flag is not a flag | `listing_side_control_failed (via=null)` |
| Audit script attempts to set the verification flag programmatically | **NEVER OCCURS** — audit script is read-only / dry-run only (invariant I.7) | n/a |

**Operator note:** Until Maya populates `MALLAN_OFFICE_MLS_IDS` AND backfills `Agent.trestle_mls_id` (Decisions #1, #2), the gate will block every listing. That is the correct default. The MVP rollout sequence (§E PR 1A) makes the audit script (read-only / dry-run only) the first deliverable, BEFORE any backfill or export action exists.

---

## E. Safe MVP PR sequence (6 PRs, ordered)

| # | PR title | Scope | Effort | Class |
|---:|---|---|:---:|:---:|
| **1A** | `feat(syndication): canonical Mallan listing-side identifier audit script (READ-ONLY / DRY-RUN ONLY) + helper scaffolding` | (a) `lib/syndication/mallan-identity.ts` config file with **empty** arrays for `MALLAN_OFFICE_MLS_IDS`. Empty config + invariant I.5 means every row blocks at Layer 1 until Maya populates the values. (b) `lib/syndication/eligibility.ts` with the gate function reflecting invariants I.1–I.8 — no early-v2 Layer-1d fallback. (c) `lib/syndication/payload.ts` with the canonical payload TYPE + sanitizer stubs. (d) `scripts/audit-mallan-listing-side-ids.ts` — **strictly READ-ONLY / DRY-RUN ONLY**. Scans `listings.agent_info` JSON, reports unique `ListOfficeMlsId` / `ListAgentMlsId` value frequencies, computes coverage statistics. **MUST NOT** write any field, **MUST NOT** create `compliance.mallan_control_verification` flags, **MUST NOT** update `Agent.trestle_mls_id`, **MUST NOT** mutate any DB row. Output: a single human-readable report to stdout + optionally a `.json` artifact in the repo for Maya's review. Enforce read-only at compile time by importing only `prisma` and never destructuring write methods, plus a runtime guard that asserts no `$queryRaw`/`$executeRaw` with `UPDATE`/`INSERT`/`DELETE` keywords. (e) `tests/runtime/syndication-eligibility.test.ts` with the full test matrix from §I.1, including the 4 new cases added 2026-05-18. **No routes. No exports. No UI. No audit-event writes. No DB writes of any kind.** | S–M | A |
| **2** | `feat(syndication): broker-only eligible-list API (read-only, preview-only)` | `app/api/crm/syndication/eligible/route.ts` GET — broker-only, returns paginated list of listings that pass the gate. Includes `eligibility` object so the UI can show the eligibility-checklist modal. **No mutating routes. No exports. AuditEvent writes "syndication_eligibility_queried" diagnostic only.** | XS–S | A |
| **3** | `feat(syndication): JSON + CSV preview/download + payload sanitizer + AuditEvent` | (a) `lib/syndication/sanitizers/sanitizeForMallanSyndication.ts`. (b) `lib/syndication/adapters/json.ts` + `csv.ts` (XML defer to later — Maya's spec said XML only "if low-risk"; CSV is the safer minimum). (c) `app/api/crm/syndication/preview/[id]/route.ts` POST returning the JSON payload (no file write). (d) `app/api/crm/syndication/export/[id]/route.ts` POST returning the file download AND writing `AuditEvent action='syndication_export_generated'` with payload hash, OR `action='syndication_export_blocked'` on gate failure. (e) Adapter re-check pattern: every adapter calls `evaluateMallanSyndicationEligibility()` again with the row BEFORE emitting. | S–M | A |
| **4** | `feat(syndication): admin UI — eligibility checklist + preview + approve+export + audit history` | `public/crm/js/dashboard/panels/syndication.js` (new panel, broker-only). Five views per §I in the original spec: eligible list, eligibility checklist (per row), preview (JSON viewer), approve+export button, per-listing audit history. Wires to the 3 routes from PR #3. | M | A |
| **5** | `feat(syndication): partner-specific CSV templates (only after partner requirements confirmed)` | `lib/syndication/adapters/partner-csv/*.ts` — one file per partner (Sotheby's, JamesEdition, openigloo, Samaki, TBI). **Each one is gated on Maya confirming the partner's exact schema + permission letter.** No XML adapter yet; revisit only if a partner explicitly requires XML and Maya signs off on the scope. | S each | **A (gated on C — partner contracts)** |
| **6** | `feat(syndication): public /exclusives page (Mallan-controlled listings only, same gate)` | `app/exclusives/page.tsx` — server component that queries the same eligibility gate at render time and lists only the listings that pass. **Same fail-closed gate; no separate ruleset for the public surface.** Sitemap addition + robots.ts allow. | S | A |

### E.1 What is NOT in this sequence

- ❌ Schema migration (typed `syndication_*` columns) — Class B HOLD
- ❌ Automatic push to any external endpoint — Class C/D HOLD
- ❌ XML adapter — defer until proven need + low-risk validation
- ❌ Sotheby's affiliate integration / Mansion Global paid placement / JamesEdition subscription — Class C HOLD (partner contracts)
- ❌ Any cross-border data transfer — Class D HOLD (legal review)
- ❌ Reconciliation against an external "as-syndicated" record — Class C HOLD

---

## F. Exact files likely to touch later

(All new — no existing-file edits required for PRs 1-4.)

| Path | PR | Role |
|---|:---:|---|
| `lib/syndication/mallan-identity.ts` | 1 | Config constants — `MALLAN_OFFICE_MLS_IDS`, `MALLAN_BROKERAGE_LICENSE`, `MALLAN_BROKERAGE_NAME` |
| `lib/syndication/eligibility.ts` | 1 | The 5-layer gate function |
| `lib/syndication/payload.ts` | 1, 3 | Canonical `MallanCanonicalListing` type + builder |
| `lib/syndication/sanitizers/sanitizeForMallanSyndication.ts` | 3 | Field allowlist + Fair Housing scan on description |
| `lib/syndication/adapters/json.ts` | 3 | JSON file builder |
| `lib/syndication/adapters/csv.ts` | 3 | CSV builder |
| `lib/syndication/adapters/partner-csv/sothebys.ts`, `jamesedition.ts`, etc. | 5 | Per-partner templates (gated on partner contracts) |
| `app/api/crm/syndication/eligible/route.ts` | 2 | Broker-only GET list |
| `app/api/crm/syndication/preview/[id]/route.ts` | 3 | Broker-only POST preview |
| `app/api/crm/syndication/export/[id]/route.ts` | 3 | Broker-only POST export + AuditEvent |
| `app/exclusives/page.tsx` | 6 | Public page using the same gate |
| `app/sitemap.ts` | 6 | Add `/exclusives` (edit existing file — minimal addition) |
| `app/robots.ts` | 6 | Add `/exclusives` to BRAND_ALLOW (edit existing file — minimal addition) |
| `public/crm/js/dashboard/panels/syndication.js` | 4 | Admin panel module |
| `public/crm/js/dashboard/panels.js` | 4 | Wire the new panel into existing routing (edit existing file — minimal addition) |
| `scripts/audit-mallan-listing-side-ids.ts` | 1 | Read-only DB scan helper |
| `tests/runtime/syndication-eligibility.test.ts` | 1 | Full test matrix |
| `tests/runtime/syndication-no-trestle-imports.test.ts` | 1 | Source-regex pin: `lib/syndication/*` files MUST NOT import `lib/idx/*` |
| `tests/runtime/syndication-payload-allowlist.test.ts` | 3 | Asserts no blocklist field ever appears in any output payload |

**No edits to:** `lib/idx/*`, `lib/search/*`, `prisma/schema.prisma`, `prisma/migrations/`, `app/api/cron/*`, `vercel.json`, `.env*`, `.github/workflows/`, `.claude/agents/`, `.claude/skills/`, `lib/neon/*`, the `ListingSearchProjection` model or any reader of it.

---

## G. Hard gates to prevent non-Mallan RLS/IDX export

### G.1 Three runtime checkpoints

| Layer | Check | Where |
|---|---|---|
| **L1 — DB query side** | Pre-filter narrows to candidate set BEFORE row-level eligibility runs: `agent_info::jsonb ? 'ListOfficeMlsId' OR agent_id IS NOT NULL` (rows that could plausibly carry a Mallan identifier) | `app/api/crm/syndication/eligible/route.ts` GET handler |
| **L2 — Eligibility gate (5 layers, fail-closed)** | `evaluateMallanSyndicationEligibility()` returns `eligible=true` only if **every** layer passes | `lib/syndication/eligibility.ts` |
| **L3 — Adapter re-check** | Every adapter's `prepare()` calls the eligibility gate again before generating any output. If `eligible=false`, the adapter writes `AuditEvent action='syndication_export_blocked'` and returns `null` | each `lib/syndication/adapters/*.ts` |

### G.2 Two structural defenses (catch design errors, not just data errors)

| Defense | How it works | File |
|---|---|---|
| **Source-regex import test pin** | Asserts at test time that `lib/syndication/**` does NOT import from `lib/idx/**` or `lib/search/listing-search-projection.ts`. Prevents a future code change from accidentally creating cross-coupling. | `tests/runtime/syndication-no-trestle-imports.test.ts` |
| **Payload allowlist test pin** | Asserts at test time that no blocklisted field name (e.g. `raw_data`, `PrivateRemarks`, `ShowingInstructions`, `internet_*_display_yn`, `last_synced_from_trestle`) appears in the output of any adapter, for ANY input. | `tests/runtime/syndication-payload-allowlist.test.ts` |

### G.3 The Layer-4 / Layer-5 contracts (per Maya's spec)

- **Layer 4 (payload sanitizer)** — `sanitizeForMallanSyndication()`. Field allowlist enforced. Output is `MallanCanonicalListing` type; any field NOT in the type cannot appear in the output. `raw_data`, internal `compliance` keys (except surfaced sub-keys), owner PII (`owner_client_id` and joined data), lifecycle/debug/sync fields, co-broker/private/RLS-only fields, confidential seller/valuation/commission notes — none can serialize.
- **Layer 5 (channel adapter)** — each adapter re-checks Layer-1-through-3 eligibility. No automatic push in MVP. JSON / CSV preview/download only. Broker-only manual approval. Every export action creates an AuditEvent. Every payload previewable before download.

### G.4 What Maya owns (manual gate steps that the code cannot enforce alone)

1. Backfilling `Agent.trestle_mls_id` accurately for every active Mallan agent
2. Filling `MALLAN_OFFICE_MLS_IDS` config with the verified Mallan office MLS ID(s)
3. Approving each listing for syndication (recorded in `Listing.compliance.syndication.approval_status`)
4. Confirming media rights per listing
5. Confirming seller/owner advertising authorization scope
6. Reviewing the per-channel attribution + Fair Housing scan output before clicking "Export"

---

## H. Can this proceed before PR #148 / PR 5B?

**Yes — fully compatible with both holds.**

| Subject | Touched by this plan? | Notes |
|---|:---:|---|
| `ListingSearchProjection` model + readers | ❌ no | Plan reads from `Listing` directly, never from projection |
| `app/api/cron/data-retention` / `feed-reconcile` | ❌ no | No cron edits |
| `lib/idx/*` | ❌ no | Source-regex test pin enforces no-import |
| `lib/search/listing-search-projection.ts` | ❌ no | Same |
| `idx_display_yn` writes | ❌ no | Plan READS the value as a gate check; never writes |
| Reconciliation script | ❌ no | Different code path |
| Drift / IDX projection accounting | ❌ no | Different tables |
| Schema / migrations | ❌ no (MVP) | All metadata in `Listing.compliance` JSON; typed columns are Class B HOLD |
| Cron schedule (`vercel.json`) | ❌ no | No cron entry added |
| `.env*` / Neon / migrations | ❌ no | No env vars added |
| `.github/workflows/`, `.claude/agents/`, `.claude/skills/` | ❌ no | No workflow/agent/skill edits |
| Public IDX reader (`app/api/listings`) | ❌ no | Plan writes a separate `/exclusives` page (PR 6) that runs its own gate |

The IDX-projection lane and this lane are non-overlapping. They can both run in parallel.

---

## I. Go / hold recommendation

**Recommendation: GO on PR 1 once Maya provides the two missing identifiers.**

PR 1 is the canonical-ID audit + helper scaffolding + test matrix. It writes ZERO production code paths. It requires only:

1. ✓ The `Agent.trestle_mls_id` column exists (already done at `schema.prisma:37`)
2. ❓ Maya populates `trestle_mls_id` for each active Mallan agent (data entry, no migration)
3. ❓ Maya provides Mallan's office MLS ID(s) for the config file
4. ✓ The eligibility gate is source-agnostic (this plan)
5. ✓ The 5 layers are fail-closed (this plan)
6. ✓ The test matrix covers all 10 scenarios Maya specified (this plan, §J in the v1 plan, restated below)

Once those two data items are in hand, PR 1 (audit script + helper + tests, NO export action, NO routes, NO UI) is a small, low-risk delivery. The script in PR 1 will tell Maya which `ListOfficeMlsId` / `ListAgentMlsId` values currently appear in the Trestle-sourced rows — that lets her verify the office and agent IDs against the live data before any export is ever attempted.

**Hold on PR 2+** until PR 1 is reviewed, merged, and the audit script's output has been reviewed by Maya. Each subsequent PR opens only after the previous one is shipped and the next set of preconditions is confirmed.

### I.1 Test matrix — UPDATED 2026-05-18 (Codex PR #161 feedback)

The PR 1A deliverable includes `tests/runtime/syndication-eligibility.test.ts` proving all 15 cases. Cases #12–#15 were added in response to Codex's correction of the early-v2 manual-listing fallback.

| # | Case | Expected | Test enforces |
|---:|---|:---:|---|
| 1 | Mallan-listed Trestle row (`ListOfficeMlsId` matches Mallan) — all other layers pass | ✓ eligible | I.2 (Trestle CAN pass) |
| 2 | Non-Mallan Trestle / RLS row (`ListOfficeMlsId` belongs to another brokerage) | ✗ blocked at Layer 1 | I.3 |
| 3 | **Manual Mallan exclusive (`source='manual'`, `agent_id` = Mallan agent, `list_office_name` contains "mallan") — but NO canonical IDs in `agent_info` AND NO `compliance.mallan_control_verification` flag** | **✗ blocked at Layer 1** (the early-v2 Layer 1d path is removed) | I.1, I.3, I.4 |
| 4 | Ambiguous IDs (`ListAgentMlsId` matches Mallan but `ListOfficeMlsId` is another brokerage) | ✗ blocked at Layer 1 (ambiguity-fail-closed) | I.8 |
| 5 | Missing IDs (`ListAgentMlsId` empty AND `ListOfficeMlsId` empty AND `source='trestle'`) | ✗ blocked at Layer 1 | I.3 |
| 6 | `owner_opt_out=true` | ✗ blocked at Layer 3 | (REBNY §2.05) |
| 7 | `internet_entire_listing_display_yn=false` OR `idx_display_yn=false` | ✗ blocked at Layer 3 | (REBNY §2.05) |
| 8 | `Listing.compliance.media_rights.confirmed_at` missing | ✗ blocked at Layer 2 (and media never serializes) | (Decision #4) |
| 9 | Another brokerage's listing | ✗ blocked at Layer 1 | I.3 |
| 10 | Verify NO blocklisted field ever appears in any adapter output | ✓ payload allowlist enforced | (Layer 4) |
| 11 | Verify adapter re-check blocks ineligible payloads even if route handler is buggy | ✓ Layer 5 re-check fires | (Layer 5) |
| **12** | **Manual listing with `agent_id` but NO canonical ID match AND empty `MALLAN_OFFICE_MLS_IDS` / `MALLAN_AGENT_MLS_IDS` config AND NO verification flag** | **✗ blocked at Layer 1** | **I.1, I.5, I.6** |
| **13** | **Empty identity config — both `MALLAN_OFFICE_MLS_IDS` AND `MALLAN_AGENT_MLS_IDS` empty at runtime AND NO verification flag on ANY row** | **✗ EVERY ROW blocked at Layer 1** with reason `identity_config_empty_blocks_all_rows` | **I.5** |
| **14** | **Free-text "Mallan" name match only — `list_office_name='Mallan Real Estate'` BUT no canonical IDs AND no verification flag** | **✗ blocked at Layer 1** — free-text is never a gate input | **I.4** |
| **15** | **Broker-approved manual-control verification — `compliance.mallan_control_verification = { verified_by, verified_at, verification_note }` populated by deliberate admin action AND all other layers (2/3/5) pass** | **✓ eligible** via the only allowed manual path | **I.6** |
| 16 | Partial verification flag (missing `verified_at` OR `verified_by` OR `verification_note`) | ✗ blocked at Layer 1 | I.6 (partial flag is not a flag) |

### I.2 Risk mitigation

| Risk | Mitigation |
|---|---|
| Mallan office MLS ID is wrong (typo, stale value) | PR 1's audit script reports actual values currently in the data; Maya verifies before merging PR 1 |
| Agent leaves brokerage but `trestle_mls_id` still in `Agent` table with `status='active'` | Layer 1 reads from `WHERE Agent.status='active'`; off-boarded agents fall out of the set automatically (assuming HR process updates `status`) |
| Trestle changes a Mallan listing's `ListOfficeMlsId` mid-cycle (e.g. office reorganization) | Eligibility is computed at preview AND export time — never cached. New `ListOfficeMlsId` is read fresh each time. |
| Co-list scenarios | Require explicit `compliance.co_list_authorization_url` per row — Maya owns this approval |
| Description carries Fair Housing red-flag phrase that passed the original RLS submission | Description scanner in the sanitizer (Layer 4) catches it; export fails-closed |

---

## J. Compliance footprint

Same compliance gates as the rest of the codebase, applied PER export:

| Rule | Enforced where |
|---|---|
| NY DOS §175.25 — brokerage name + office address/phone in every ad | Sanitizer enforces `attribution.brokerage.{name,license_number,office_address,phone}` is always present in payload |
| NY DOS §175.25 — agent name cannot appear without brokerage name | Sanitizer pairs agent name with brokerage name |
| Fair Housing Act + NY State HRL + NYC Title 8 | Description scanner uses existing `FAIR_HOUSING_HARD_BLOCKS` from `lib/compliance/rls-enforcement.ts` |
| REBNY UCBA 2026 — no general RLS/IDX co-brokerage data | Layer 1 gate (canonical ID match) + structural defenses |
| REBNY UCBA Art. I §5(C/D/E) — no agent info / off-market language / compensation in description | Description scanner pre-export |
| FARE Act (NYC LL 119/2024) — rentals only | Sanitizer includes `fare_act` block when `listing_type='rent'`, gated on `compliance.fare_act_disclosed_at` |
| TCPA / CAN-SPAM | N/A for outbound (no lead capture in syndication payload) |
| NY SHIELD Act — audit retention | `AuditEvent` rows retained 2 years per existing data-retention cron |
| IDX Plus license terms — read-only display only on mallan.nyc | Layer 1 ensures we are NOT re-exporting co-brokerage RLS data we received under that license |

---

## K. Open questions for Maya before PR 1 — **ALL ANSWERED 2026-05-18** (see "MVP Decisions" at top of doc)

| # | Question | Answer (Maya, 2026-05-18) |
|---:|---|---|
| 1 | What is Mallan's office MLS ID on REBNY/Trestle? | **UNKNOWN** — must be confirmed via REBNY / Trestle / live-data audit before implementation. PR 1's read-only audit script surfaces observed values. |
| 2 | `Agent.trestle_mls_id` backfill — separate SQL or part of PR 1? | **DEFER.** No SQL, no Prisma write, no migration in PR 1. Audit script is read-only. Backfill only after Maya verifies IDs. |
| 3 | Co-list authorization — does Mallan have co-list arrangements? | **DEFAULT BLOCK.** Layer 1c disabled for MVP. Requires explicit written authorization in `compliance.syndication.co_list_authorization_url` before any co-list row can pass. |
| 4 | Seller advertising authorization — signed form template exists? | **NO STANDARDIZED FORM YET.** MVP uses broker/Maya manual attestation stored in `Listing.compliance.seller_advertising_authorization` JSON. Replace with a real form later (Class B). |
| 5 | Approval workflow — single broker or two-step? | **SINGLE BROKER (MAYA) MANUAL APPROVAL.** No multi-step in MVP. |
| 6 | Channel scope — which channels in admin UI? | **JSON + CSV preview/download only.** No XML. No automatic push. No partner API integrations. Partner-CSV templates (PR 5) are HOLD on Class C partner contracts. |
| 7 | `/exclusives` public page — all eligible, or only specifically-approved? | **ONLY specifically-approved.** Page is its own channel. Requires `compliance.syndication.channels` to include `"mallan_exclusives_public_page"`. Default: not approved → not on page. PR 6 itself is HOLD pending Maya re-approval. |

All seven decisions are now binding on the MVP. See the "MVP Decisions" callout at the top of this document for the operative table.

---

## L. What this delivery is and is not

**This delivery is:**
- A corrected (v2) report-only architecture plan
- A repo audit answering Maya's 12 questions
- A 5-layer eligibility gate design that is source-agnostic and Mallan-listing-side-control-driven
- A 6-PR sequence ordered by safety
- A list of structural defenses (test pins) preventing future regressions
- An explicit statement that this work is compatible with PR #148 / PR 5B holds

**This delivery is NOT:**
- Code
- A PR
- A schema change
- A cron change
- An env-var change
- A reconciliation run
- A merge of PR #148 or start of PR 5B
- An agents / skills / workflows edit
- An external integration with any partner
- An assumption that `source='manual'` or `source='trestle'` is the discriminator (corrected)

**Status:** Awaiting Maya's answers to §K. Once §K.1 and §K.2 are answered, PR 1 (audit script + helper + tests, no routes, no UI, no exports) is the next deliverable.

---

**End of plan v2.** No code modified. No DB rows touched. No env vars changed.
