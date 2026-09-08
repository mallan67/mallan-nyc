# Ruling 1 — the 20 form-binding errors, classified under Cotality authority (2026-09-08)

Maya's ruling: Cotality is the current provider; RLS is the old system / provider framing. REBNY/RLS may remain only
where it is compliance, attribution, membership / business rules, contractual terminology or historical evidence —
never field authority, provider API, mapping authority, provider status vocabulary or current architecture. The 20
`rls:validate` errors cannot be "held legacy errors": each is one of (a) an obsolete RLS/RESO provider binding,
(b) an exact current Cotality field, (c) a legitimate REBNY/RLS compliance binding, (d) a Mallan business / form field.

## 1. What the validator was doing wrong

The former "DEAD BINDING" verdict declared a control mis-bound whenever REBNY's system referenced **no member** of the
bound field's vocabulary (`Lookup.SystemReferences` includes RLS — a Cotality catalogue fact about REBNY's membership,
not about field availability). That made REBNY's reference list the field authority — exactly what the ruling forbids.
Now (`scripts/validate-rls-compliance.js` Section 1): the bound field's existence and vocabulary are judged by the live
Cotality contract only; REBNY's reference is an **advisory warning** (the binding stands; whether REBNY's input accepts
a value is a business question for Maya). The two remaining error verdicts are Cotality facts: WRONG VALUE (not a live
member) and SHAPE MISMATCH (a yes/no control on a multi-select field). The CI cross-check `npm run validate:form-rls`
(`scripts/validate-form-rls.js`) no longer reads the retired REBNY CSVs or the CSV-generated bindings JSON: it loads
the live contract under tsx and accepts live Property fields, live CustomProperty fields and declared Mallan-internal
keys. Both validators accept `data-cotality-field` (the current binding name) beside the legacy `data-rls-field`.

## 2. The 20, one row per distinct control (each appears on two forms: REDESIGN + WITH-TOOLS)

| # | Control (form) | Bound field | Live Cotality fact (2026-09-08) | Classification | Verdict now | What the form needs |
|---|---|---|---|---|---|---|
| 1–2 | `<select id="saleLivingAreaSource">` (sale ×2) | `LivingAreaSource` | exact field: Enums.AreaSource, 18 live members, filterable, populated 0; all 9 form values are live members (Appraiser, Assessor, Builder, Estimated, Owner, Plans, PublicRecords, SeeRemarks, Other) | **(b) exact current Cotality field** — REBNY references no member (advisory) | no error; 1 advisory | nothing — the binding is a Cotality binding. Whether REBNY's input accepts it: Maya |
| 3–4 | `checkbox name="saleBusinessType"` (sale ×2) | `BusinessType` | exact field: 139 live members (multi), populated 0; all 21 form values are live members | **(b) exact current Cotality field** | no error; 1 advisory | nothing |
| 5–6 | `checkbox name="rentalBusinessType"` (rental ×2) | `BusinessType` | as above | **(b)** | no error; 1 advisory | nothing |
| 7–10 | `radio name="saleCurrentUse"` values `Healthcare`, `Professional` (sale ×2, 2 values) | `CurrentUse` | exact field: 66 live members, populated 786; `Investment` is a member; `Healthcare` / `Professional` are members of nothing (not in the 2026-03 REBNY workbook either) | **(d) Mallan form values** on an exact Cotality field | WRONG VALUE ×4 | remap to live members — Maya's mapping (nearest: `MedicalDental`, `Office`) |
| 11–14 | `radio name="fireplace"` values `Yes` / `No` (sale ×2) | `InteriorFeatures` | the Boolean `FireplaceYN` is an exact live field (populated 96,628); `InteriorFeatures` is a 299-member multi-select | **(d) Mallan yes/no control mis-bound**; the correct binding is **(b) `FireplaceYN`** | SHAPE MISMATCH ×4 | rebind to `FireplaceYN` |
| 15–16 | `checkbox name="saleSyndicateYN"` (sale ×2) | `SyndicateTo` | exact field: 28 live members = portal names (Apartmentscom … ZillowTrulia, SyndicationAllowed), populated 0 (input-side); a bare yes/no checkbox | **(d) Mallan business decision** ("syndicate this listing" — UCBA syndication consent) | SHAPE MISMATCH ×2 (yes/no decision on a multi-select) | a Mallan decision key (syndication is HELD: `MALLAN_OFFICE_MLS_IDS=[]`); `SyndicateTo` only for a member list |
| 17–18 | `checkbox name="rentalSyndicateYN"` (rental ×2) | `SyndicateTo` | as above | **(d)** | SHAPE MISMATCH ×2 | as above |
| 19–20 | `<select id="rentalLeaseType">` values `NonStabilizedLease`, `StabilizedLease` (rental ×2, 2 values) | `AvailableLeaseType` | exact field: 23 live members = commercial lease structures (AbsoluteNet, Gross, Nnn, GroundLease …), populated 0; no Property or CustomProperty field carries rent stabilization (searched: `ExistingLeaseType`, `LeaseTerm`, `LeaseTermOptions` 0 rows; CustomFields keys carry `MaxLeaseMonths` only) | **(d) Mallan / NY business field** (rent-stabilization status) bound to an unrelated provider field — an obsolete binding | WRONG VALUE ×4 | a Mallan-internal key (e.g. rent-stabilization status); `AvailableLeaseType` is not it |

Totals after the re-base: **16 errors** (all Cotality-authority verdicts on held forms: CurrentUse 4, fireplace 4,
SyndicateYN 4, AvailableLeaseType 4) and **12 advisories** (LivingAreaSource, BusinessType, SyndicateTo,
AvailableLeaseType — exact Cotality fields REBNY references no member of — across the four forms). None
is a REBNY/RLS compliance binding (c); none is an obsolete RESO binding by name — every bound field name is an exact
current Cotality field; the obsolete part is the value vocabulary (CurrentUse, AvailableLeaseType) or the control shape.

## 3. Held

`public/crm/**` is held: the rebinding (FireplaceYN), the value maps (CurrentUse), the Mallan keys (syndication
consent, rent stabilization) and the attribute rename (`data-rls-field` → `data-cotality-field`) are the form edits Maya
must release. Until then `rls:validate` exits 1 with the 16 Cotality verdicts and `validate:form-rls` (CI) exits 0
with the same four value verdicts as warnings (`tests/runtime/rls-validator-canonical-reporter.test.ts` "exits 0"
stays red for the same reason — a held-form fact, not a validator defect).
