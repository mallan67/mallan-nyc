> # 🛑 HISTORICAL EVIDENCE ONLY — NOT AN INSTRUCTION
>
> **This file cannot override the Master Plan or the Execution State.**
>
> - Product/system authority: `MALLAN-PLATFORM-MASTER-PLAN.md` (repo root, canonical lineage PR #595 / `agent/publish-mallan-platform-master-plan-2026-08-04`
> - Execution state: `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` (STATUS ONLY)
> - Agent operating instructions: `AGENTS.md` · `CLAUDE.md`
>
> The closing report for integration rounds 1-3. Its line-2 status, "WORKING CANDIDATE. Not landed.
> PR #595 untouched", was true when written and is **now overtaken**: `CLAUDE.md` and `AGENTS.md`
> (commit `6a977a8e`, 2026-09-10) name `MALLAN-PLATFORM-MASTER-PLAN.md` the ONLY product/system
> authority. Retained because it is the only copy of the three-lens escalation block, the rounds-2/3
> tallies and the quarantine count. Its `L####` citations resolve against a 6,334-line snapshot, not
> against the current plan.
>
> Banner added 2026-09-10. Body unchanged.

# Master Plan integration — combined review after rounds 1, 2 and 3

**Status: WORKING CANDIDATE. Not landed. PR #595 untouched.**

| | Round 1 | Round 2 | Round 3 | Total |
|---|---|---|---|---|
| Requirements ruled | 399 | 175 | 71 | **645** |
| Rejected — already present | 7 | 22 | 19 | **48** |
| Edits applied | 112 | 41 | 38 | **191** |
| Edits quarantined | 0 | 0 | 1 | **1** |

Line count: 4,084 (original #595) -> 5,630 -> 5,963 -> **6,334**. Growth +2,250 lines (+55%).

---

## 1. Contradiction matrix — all 18

| # | Existing rule | New requirement | Real? | Classification | Resolution | Deletes? |
|---|---|---|---|---|---|---|
| 1 | §2.1, CURRENT L117: heading `## 2.1 Two views`, two-branch diagram at L119-127 (BROKERAGE VIEW = firm-wide oversight and exceptions; MY BUSINESS = the... | Directive EXISTING §2: "Clarify that Mallan operates through: BROKERAGE VIEW / MY BUSINESS / AGENT WORKSPACE / CLIENT EXPERIENCE /... | RECONCILABLE — the two lists count different things at ... | **NO CONFLICT — DIFFERENT LAYER** | NO EDIT REQUIRED IN ROUND 3. The surface model already lives in its own subsection: §2.5 "Permissioned views over one canonical record" at CURRENT L205-229, carrying all four surfaces (L208-219), the no-second-truth rule... | NO. §2.1 L117-134 is byte-identical to original #595 (L87-10... |
| 2 | §19.1, CURRENT L3408: "Do not overbuild lead routing when simple explicit assignment works." The recorded second limb — Lead absent from the §3 canoni... | Directive EXISTING §5: "Search must participate in: LEAD / CLIENT ↓ OPPORTUNITY ↓ SAVED SEARCH ↓ EXPLICIT REQUIREMENTS ↓ CURRENT S... | RECONCILABLE — L3408 constrains the ROUTING MECHANISM l... | **NO CONFLICT — DIFFERENT LAYER** | MAYA DECIDED (FIRST block item 4, recorded against row 10; it governs this row by cross-reference, so this row is not itself one of her four): "CONFIRMED: these are NOT contradictory. Preserve 'Do not overbuild lead rout... | NO for existing authority — §19.1 L3408 stays verbatim and t... |
| 3 | §8, CURRENT L1778: "Mallan has one deterministic shared calculator/scenario engine across Seller, Landlord, Buyer, Tenant and Investor workflows." §1,... | Directive EXISTING §6: CMA / Property Intelligence must contextualize the subject across an axis list whose thirteenth entry is `C... | RECONCILABLE — the recorded fork misread "§6 must SHOW ... | **CLARIFICATION** | §8 COMPUTES, §6 PRESENTS — settled on existing authority, no new Maya decision. `carrying cost` was ALREADY a §8 role preset in unmodified #595 (595 L1557, now CURRENT L1789), so the directive asks §6 to display a number... | NO. Every touch is additive against #595 — CURRENT L1251, L1... |
| 4 | §7.3 Mallan-authored listing control list, CURRENT L1505-1515 (Edit Listing; Media; Marketing/E-blast; Open Houses; Listing Reporting; Offers/Applicat... | Directive EXISTING §7: the Workspace "should connect, where applicable" a sixteen-item list ending `OFFER / APPLICATION / ACCEPTED... | RECONCILABLE — the directive's operative verbs are "con... | **CLARIFICATION** | LINK, not OWN — closable on existing plan authority without a new Maya decision, because OWN would require repealing three unrepealed rules nobody asked to repeal. The rule is ALREADY WRITTEN at CURRENT L1747: "**These s... | NO. §7.3's control list (CURRENT L1505-1515) is byte-identic... |
| 5 | §17 preamble, CURRENT L3172: "The system should make professional obligations visible and actionable without turning Mallan into an HR system." Reinfo... | Mallan must govern the business records needed to operate licensed independent-contractor Agents and Associate Brokers: Independen... | RECONCILABLE — contractual, licensing, regulatory and t... | **SCOPE NARROWING** | MAYA DECIDED (FIRST block item 1 — one of her four). Her words: KEEP the existing boundary that Mallan is not an HR system; NARROW its meaning. Mallan DOES govern the listed contractual, licensing, regulatory, tax and br... | NO for existing authority — L3172 (§17) and §2.2 L140/L144 s... |
| 6 | §20.3 "Transaction document checklist" (heading CURRENT L3808), rule sentence CURRENT L3812: "Documents attach to the actual canonical Transaction/Ref... | Agency / Fair Housing / anti-discrimination disclosures, touring and buyer/tenant representation forms, and seller/landlord exclus... | REAL CONFLICT (resolved by Maya) — this is the one row ... | **SUPERSEDED — MAYA DECISION REQUIRED** | MAYA DECIDED (FIRST block item 2 — one of her four); her sign-off is already in hand in her own words, so this row is unblocked even though it replaces existing authority. Her decision: do NOT make every document belong ... | YES — AND THIS IS THE ONLY ROW OF THE EIGHTEEN THAT TOUCHES ... |
| 7 | §11.9 "Transaction document families" — heading CURRENT L2624; framing sentence L2628 ("The brokerage record should distinguish at least:") over nine ... | Architecturally distinguish a BROKERAGE / AGENT OPERATING DOCUMENT class as the first of the document types — "These are not clien... | RECONCILABLE — these are two disjoint document classes,... | **DUPLICATE — DO NOT ADD** | ALREADY IN THE PLAN — DO NOT ADD IT AGAIN. §11.12 "Brokerage ↔ Agent operating documents" exists at CURRENT L2759-2800 and states everything the directive asks for: the class is not client transaction documents, does not... | NO. §11.9's heading (L2624), framing sentence (L2628), nine ... |
| 8 | §17 preamble, CURRENT L3172: "The system should make professional obligations visible and actionable without turning Mallan into an HR system." §2.2, ... | §17 carries the ordered agent lifecycle chain: RECRUIT / ADD AGENT → IDENTITY → LICENSE / PROFESSIONAL DATA → BROKERAGE AGREEMENTS... | RECONCILABLE — the chain is a brokerage records/identit... | **SCOPE NARROWING** | PAIRED WITH ROW 5 — same boundary, same classification, governed by the SAME decision: Maya's FIRST-block item 1, recorded as row 5. This row is therefore not itself one of her four, but it is decided, not open. Applying... | NO for existing authority — L3172 (§17 preamble) and L144 (§... |
| 9 | §1, CURRENT L85: "Seller, Landlord, Buyer and Tenant remain four separate first-class opportunities and workflows. Investor/1031 uses the same canonic... | Cross-role links: §16 connect Investor Intelligence to Property, Seller/Landlord, Buyer, current ownership, rent, valuation, finan... | RECONCILABLE — and on the base text there is no conflic... | **NO CONFLICT — MORE SPECIFIC DETAIL** | NO EDIT REQUIRED. Keep L85, L5370 and L4846 exactly as they are; no amendment to any of the three. Every cross-role link takes one fixed form — SAME canonical Party + SAME canonical Property → a NEW role Opportunity, wit... | NO. No existing authority is deleted or reworded, and no edi... |
| 10 | §19.1 Brokerage leads, closing restraint, CURRENT L3408, verbatim: "Do not overbuild lead routing when simple explicit assignment works." | Expand Lead Management into a full first-class lifecycle: LEAD SOURCE → INQUIRY/LEAD → PARTY RESOLUTION → ASSIGNMENT/OWNERSHIP → C... | RECONCILABLE — Maya has ruled they are not contradictor... | **NO CONFLICT — DIFFERENT LAYER** | MAYA DECIDED (FIRST block item 4 — one of her four). Her words: "CONFIRMED: these are NOT contradictory." PAIRED WITH ROW 2 — same tension, same layer split, one shared decision text. Preserve L3408 verbatim as a standin... | NO for existing authority — L3408 is preserved verbatim and ... |
| 11 | §20 section heading, CURRENT L3741: `# 20. TRANSACTIONS / DEAL SUPPORT / PAYMENT READINESS`. Four other headings name the same section: §23.5 `## 23.5... | "For purposes of Mallan, this section is: # BROKERAGE DEAL PROGRESSION + COMMISSION CLOSEOUT." | RECONCILABLE — this is a business-meaning correction, n... | **DUPLICATE — DO NOT ADD** | ALREADY IN THE PLAN — DO NOT ADD IT AGAIN, AND DO NOT RENAME. Round 1 already executed option (a) and I confirmed it in the current base: CURRENT L3743 reads "For Mallan this section is brokerage deal progression and com... | NO as executed — heading L3741 and the sibling headings at L... |
| 12 | §21.1 Authority stack (heading CURRENT L3876; stack fence L3878-3897). The provider sits BELOW the authority line: `PROVIDER + SOURCE ADAPTERS` (L3891... | The directive's §21 authority stack joins `TRESTLE / COTALITY CONTRACT` and `TRESTLE / COTALITY API RULES` with `+` at the same le... | RECONCILABLE — Maya has ruled that the directive's `+` ... | **CLARIFICATION** | MAYA DECIDED (FIRST block item 3 — one of her four). Her words: KEEP the existing hierarchy; Cotality/Trestle must NOT be promoted to the same authority level as law. The legal/business authority boundary is NEW YORK / F... | NO. Nothing in the L3878-3897 stack, L3899, L3901, L13 or L1... |
| 13 | §21.1 Authority stack, three tiers the directive's stack omits: (a) authority tier `NYS AG OFFERING-PLAN / APPLICABLE GOVERNMENT SOURCE RULES` at CURR... | The directive's replacement authority stack contains none of the three — no NYS AG offering-plan authority tier, no StreetEasy sup... | RECONCILABLE — the two artefacts sit at different layer... | **NO CONFLICT — DIFFERENT LAYER** | Treat the merged stack as a strict SUPERSET and change nothing inside the L3878-3897 fence. The superset is already stated at L3921 and needs no re-litigation. Two OPTIONAL additive items only, neither required to close ... | NO as proposed — L3885, L3893 and L3894 stay exactly as draw... |
| 14 | §22.1 Practical intelligence views — heading CURRENT L4252; the three views verbatim at L4255-4257: `BROKERAGE INTELLIGENCE` / `AGENT BUSINESS INTELLI... | Directive: "Rename conceptually: # HUMAN, CLIENT, PROPERTY, MARKET & AGENT INTELLIGENCE" — a five-noun scope that names Agent but ... | RECONCILABLE — the new material is the existing intelli... | **NO CONFLICT — MORE SPECIFIC DETAIL** | NO EDIT REQUIRED. The reframing is ADDITIVE and the de-scope reading is a misreading. Maya settles it in her own words, THIRD block section F: "§22 cannot remain only an alert-code system. Preserve the existing attention... | NO. L4219 heading, L4255-4257 views and §18's L3345 consumpt... |
| 15 | §27.3 "Fact authority — no invented replacement for missing provider data", heading CURRENT L5521. It defines the plan's only platform-wide fact taxon... | Directive EXISTING §27: "KEEP THIS SECTION AS EXECUTION CONTROL. Do not let §27 redefine the business architecture. … Architecture... | RECONCILABLE — the directive is a statement about WHERE... | **CLARIFICATION** | Keep §27.3 verbatim and in place. EDITS REQUIRED (this is why the row stays CLARIFICATION, and it is the heaviest of the §27 trio because §27.3 is the SOLE home of its rule rather than a restatement): (a) add a pointer i... | NO under the recommended resolution — §27.3's text (CURRENT ... |
| 16 | §27.2 "Production-truth requirements revealed by Baseline A", heading CURRENT L5508. Opens "The following are hard system requirements, not optional a... | Directive EXISTING §27: "Do not let §27 redefine the business architecture," plus the directive's global rule: "If the requirement... | RECONCILABLE — the eight bullets are factually CONSISTE... | **CLARIFICATION** | EDIT REQUIRED, and it is per-bullet: preserve all eight bullets verbatim as recovery evidence and annotate each with its owning section — L5513 → §9.4/§10.5; L5514 → §5.5; L5515 → §4.4; L5516 → §2.3/§2.4; L5518 → §5.19; ... | NO under the recommended resolution — the eight bullets keep... |
| 17 | §27.4 (heading "Convergence before feature expansion", CURRENT L5548) → sub-block `### Agent lifecycle / PR #627`. It states the professional-identity... | Directive EXISTING §27: "Do not let §27 redefine the business architecture. … Architecture comes from the preceding Master Plan. E... | RECONCILABLE — §27.4's three values are character-for-c... | **NO CONFLICT — MORE SPECIFIC DETAIL** | NO EDIT REQUIRED. Keep the CURRENT L5564-5568 block exactly as written — it is the frozen #627 acceptance case, and deleting the concrete values would remove the only thing that makes the case black-box testable. The dir... | NO — nothing is deleted or reworded; §27.4's block keeps its... |
| 18 | CURRENT HANDOFF (heading CURRENT L5926), bullet at CURRENT L5946: "Immediate technical product sequence remains **Search → CMA → Backend Listings/Oppo... | Directive EXISTING §25: "Engineering sequence is subordinate to business architecture" with the chain BUSINESS REQUIREMENT → CANON... | RECONCILABLE — "subordinate" governs two different laye... | **NO CONFLICT — DIFFERENT LAYER** | NO EDIT REQUIRED for either rule to be read correctly. Keep BOTH statements verbatim: §25 at CURRENT L5244 already carries the exact disambiguation the record asked for — "§27 sequences **how** existing proven work conve... | NO — both statements stay verbatim, and no edit is required.... |

### Classification tally

- NO CONFLICT — DIFFERENT LAYER — **5**
- CLARIFICATION — **5**
- NO CONFLICT — MORE SPECIFIC DETAIL — **3**
- SCOPE NARROWING — **2**
- DUPLICATE — DO NOT ADD — **2**
- SUPERSEDED — MAYA DECISION REQUIRED — **1**

### Escalation recommendations from the three challenge lenses

- **Row 2 -> TRUE BUSINESS DECISION REQUIRED**
- **Row 8 -> TRUE BUSINESS DECISION REQUIRED**
- **Row 2 -> SUPERSEDED — MAYA DECISION REQUIRED**
- **Row 3 -> SUPERSEDED — MAYA DECISION REQUIRED**
- **Row 4 -> SUPERSEDED — MAYA DECISION REQUIRED**
- **Row 10 -> SUPERSEDED — MAYA DECISION REQUIRED**
- **Row 13 -> SUPERSEDED — MAYA DECISION REQUIRED**
- **Row 2 -> NO CONFLICT — DIFFERENT LAYER**
- **Row 5 -> SCOPE NARROWING**
- **Row 7 -> DUPLICATE — DO NOT ADD**
- **Row 8 -> SCOPE NARROWING**
- **Row 10 -> NO CONFLICT — DIFFERENT LAYER**
- **Row 14 -> NO CONFLICT — MORE SPECIFIC DETAIL**
