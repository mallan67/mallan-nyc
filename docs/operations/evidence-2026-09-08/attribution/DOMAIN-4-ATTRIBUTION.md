# Domain 4 — agent and office attribution: what the feed delivers, who renders it, what "ours" means (2026-09-08)

Scope: every listing-agent / office value Mallan reads, stores or renders — list side, co-list side, buyer side —
and the identity rule that decides whether a listing is Mallan's own. Evidence: `attribution-consumer-census.json`
(28 read-only agents; every "cannot receive a value" claim independently refuted or confirmed), the navigation
capability matrix, the live field census, and a Neon read-only count.

## 1. Provider facts (live, whole corpus)

| Side | Scalars on Property | Navigation |
|---|---|---|
| List agent / office | populated (`ListAgentFullName`, `ListOfficeName` 591,607; `ListAgentEmail` 591,607; `ListAgentDirectPhone` 580,228; `ListAgentMlsId` 591,197). `ListAgentMobilePhone`, `ListAgentStateLicense` SUPPRESSED. `ListAgentOfficePhone`, `ListTeamKey/Name` 0. | `ListAgent→Member` 431,008 · `ListOffice→Office` 522,739 payloads; a member absent from the 11,191-row roster yields an empty payload (inactive / departed licensees). |
| Co-list | `CoListAgent*` ~207k; **`CoListAgent2*` ~51k, `CoListOffice2*` 50,994, `CoListAgent3*` ~8k populated scalars** (not RLS fields). | `CoListAgent→Member` returns only the FIRST co-list agent; agent 2 resolves by direct `Member?$filter=MemberKey eq …`. |
| Buyer / co-buyer | **every scalar SUPPRESSED** (null on all 591,597 rows) except `BuyerAgentMlsId` 100,112, `BuyerOfficeMlsId` 100,463, `CoBuyerAgentMlsId` 3,168, `CoBuyerOfficeMlsId` 3,173. | `BuyerAgent→Member` 80,460 / `BuyerOffice→Office` 99,256 payloads — **Closed rows only**; `CoBuyer*` navigations always empty. |
| Member / Office resources | Member 91 entitled fields (39 populated, roster 11,191); Office 80 (38 populated, 578 offices). | direct access HTTP 200 by key or MlsId. |

## 2. What the consumers actually do (census)

- **No consumer renders a buyer-side name or office**, and storage cannot hold one (no column; the keep-list drops
  every buyer scalar; the mapper's `PRIVATE_FIELDS` strips the buyer agent id). The buyer side is consumed in exactly
  one place: `syncAgentHistory` matches `BuyerAgentMlsId` in the OData filter and stamps `agent_id` (the Mallan
  agent) on the row. The agent-listings page needs only that stamp, never a buyer name.
- **Public attribution is office-name only** (REBNY: public attribution = office). Every public surface (DTO, listing
  page, search cards, featured, similar, building units, agent pages, open houses) renders `ListOfficeName`;
  `ListAgentFullName` is fetched but no public card renders it. Closed history is attributed to the LIST office.
- **Co-list agents 2 / 3 were selected and discarded** (the sync persists only the 8 typed list / first-co-list
  columns and `agent_info` JSON is no longer stored); `CoListOffice2*` was never selected.
- 26 buyer / co-buyer scalars are selected although suppressed — harmless (the select is accepted, the value null),
  kept per the rule that a zero today is not an unsupported contract.
- The CRM viewers' `rebnyAgents = { mallan: [] }` dropdowns are never loaded from any API (held CRM JS).
- `ListingSidePanel.tsx` has no call site (dead component) and gates its courtesy line on a truthy office name.

## 3. The identity defect (fixed)

`syncAgentHistory` stamps `agent_id` on THIRD-PARTY feed rows where a Mallan agent was the **buyer**. Four other
readers already refuse `agent_id` as ownership; the public provenance classifier (`classifyDbListing`) did not: a
non-null `agent_id` made a row `mallan-exclusive`, which (a) rendered "Exclusive listing by Mallan Real Estate Inc."
for another brokerage's listing (NY DOS 19 NYCRR §175.25, UCBA Art. III §2(C)) and (b) built the exclusive contact
card from the row's typed list-agent columns — the other brokerage's agent email and phone. Production today:
34 such rows (33 Mallan-list-office return copies, 1 genuine buyer-side stamp), all Closed and hidden — latent, real.

Now: `classifyDbListing` uses the canonical identity (`isMallanExclusiveListing`: CRM-authored SL-/RL- id, or
`rls_eligible = false`) or a Mallan client owner (`owner_client_id`); `agent_id` alone is third-party. The agent
page's third-party card falls back to the neutral attribution (`publicListOfficeName`), never Mallan. Tests:
`lib/idx/__tests__/c1-classification.test.ts` (pins rewritten: agent_id alone → third-party; the buyer-side stamp
never yields the exclusive card), `tests/runtime/attribution-authority.test.ts`, `agent-listing-card-attribution.test.ts`.

## 4. Lossless retention

Selected and kept in `raw_data` (no schema change): `CoListAgent2FullName`, `CoListAgent3FullName`,
`CoListOffice2Name`, `CoListOffice2MlsId` (+ `CoListOffice2Key` selected), `BuyerOfficeMlsId`, `CoBuyerOfficeMlsId`.
The buyer AGENT ids stay private (mapper `PRIVATE_FIELDS`), consistent with the list-agent id policy.

## 5. Not built (no consumer asked for it; capability proven)

A buyer-side name / office on a Closed comp or the agent's "represented the buyer" history is available only through
the `BuyerAgent` / `BuyerOffice` navigations (Closed rows) or a direct `Member` / `Office` lookup by MlsId. No surface
renders it today; wiring it is a product decision, not convergence. Recorded as available, not implemented.
