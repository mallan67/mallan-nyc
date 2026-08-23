# Mallan return-copy reconciliation — live evidence

**Every provider fact here came from an HTTP response received from `api.cotality.com`
on 2026-08-21.** Dated evidence, not authority. Production Neon was NOT queried — the
Neon acceptance window is still open — so the local-twin side is explicitly marked
UNVERIFIED below rather than guessed.

## The contract this serves

A Mallan-authored listing exists twice: the **canonical local Mallan listing** (created in
the Mallan web app, editable) and a **Mallan-office Cotality representation** that comes
back through the provider feed after an external submission path files it with REBNY RLS.
Until a direct Mallan → Cotality feed is implemented and proven, the local listing wins and
the provider representation is suppressed as a competing listing — while remaining useful
provider evidence.

Suppression applies to **every verified Mallan-office Cotality representation**, whether or
not its local twin has yet been proven — see §5. It does NOT apply to third-party Cotality
inventory.

The intermediary that performs the submission is deliberately not named anywhere in this
contract. It is not Mallan architecture, not a source system and not a data authority.

**The Cotality API is the ONLY external source.** REBNY RLS is the MLS / rules body the
listing is filed with — it is not the API, not the source of any field, and not an
architectural source name. Where a Cotality response carries a raw `RLS…` string (a
`ListingId` value, `OriginatingSystemName = RLS`), that is provider provenance preserved
exactly at the boundary, never promoted into a Mallan layer or used as a source term.

---

## 1. The population is small and checkable

`ListOfficeMlsId eq '7041'` (Mallan Real Estate Inc):

| scope | count |
|---|---|
| all statuses | **35** |
| search-eligible (Active / ComingSoon / ActiveUnderContract) | **2** |
| Closed | 33 |

The two search-eligible rows:

| ListingId | ListingKey | address | ZIP |
|---|---|---|---|
| `RLS20099289` | 1175519507 | 400 90TH 4D | 10128 |
| `RLS20093870` | 1170236599 | 333 46TH 2G | 10017 |

So the live blast radius of return-copy suppression is **two active listings**. That is
small enough to verify individually rather than statistically.

---

## 2. NO MALLAN IDENTIFIER ROUND-TRIPS — the decisive constraint

The obvious reconciliation design would match the return-copy to its local twin by a
Mallan identifier echoed back through the feed. **That identifier does not exist.**

Measured across all 35 Mallan-office rows:

| field | populated | value |
|---|---|---|
| `SourceSystemName` | **0/35** | — |
| `SourceSystemKey` | **0/35** | — |
| `SourceSystemID` | 35/35 | `TRESTLE` |
| `OriginatingSystemName` | 35/35 | `RLS` |
| `OriginatingSystemID` | 31/35 | `REBNY` — **null on both Active rows** |
| `OriginatingSystemKey` | 35/35 | the MLS pipeline's own key (e.g. 34332844), not Mallan's |

Every "source system" field describes the MLS pipeline (RLS / REBNY / Trestle). None
carries a Mallan-side identifier. The round trip is **lossy with respect to Mallan
identity**.

Two consequences:

1. **Reconciliation cannot use a provider-carried Mallan key today.** It must combine
   Mallan REPRESENTATION (`ListOfficeMlsId`) with strict PHYSICAL-UNIT identity.
2. **The future direct-feed design must solve this explicitly.** Either the submission
   path must round-trip a Mallan identifier, or Mallan must persist the returned
   `ListingKey` against the local listing at submission time. Without one of those, every
   future reconciliation stays inferential.

---

## 3. Identity evidence that IS available

| field | populated | note |
|---|---|---|
| `ListingKey` | 35/35 | provider identity, `Edm.String(?)` |
| `ListingKeyNumeric` | 35/35 | `Edm.Int64`, same value as ListingKey here |
| `ListingId` | 35/35 | `RLS…` display id |
| `ListOfficeMlsId` | 35/35 | `7041` — proves Mallan REPRESENTATION |
| `ListOfficeKey` | 35/35 | 5671398 |
| `ListAgentMlsId` | 35/35 | 39361 (Maya) |
| `ListAgentKey` | 35/35 | 25272030 |
| `StreetNumber` / `StreetName` / `UnitNumber` / `PostalCode` | **35/35 each** | strict unit key inputs |

`UnitNumber` being populated on **35/35** matters: the repo's strict physical-unit key
(`buildAddressKeyFromDbRow`) REQUIRES a unit and returns null without one. So every
Mallan-office row is eligible for strict unit-level matching — different apartments in one
building cannot collapse.

---

## 4. What the existing code already does correctly

- `isMallanRlsReturnCopy()` matches on **`list_office_mls_id`**, not on address and not on
  `ListOfficeName`. That satisfies "do not match on address alone" and "not solely because
  the office name resembles Mallan".
- `resolveReturnCopyCanonicalTarget()` requires **exactly one** proven local twin under the
  strict unit key and otherwise fails closed with a reason
  (`no-address-key` / `no-local-twin` / `ambiguous-local-twins`). That is the required
  MATCHED / AMBIGUOUS / UNRESOLVED shape.
- The stored return-copy is never mutated or deleted — it stays reconciliation evidence.

---

## 5. TWO SEPARATE DECISIONS — and one must never reverse the other

An earlier version of this section concluded that a Mallan-office row with no local twin
"must remain visible". **That was wrong for the current business rule**, and the reasoning
behind it was wrong too: it treated VISIBILITY as the thing to protect, when the thing to
protect is CANONICAL AUTHORITY.

The two decisions are independent:

**1. CLASSIFICATION — is this a Mallan-office Cotality representation?**
Answered by verified list-side office identity (`ListOfficeMlsId = 7041`) alone.

**2. TWIN COTALITYLUTION — which local Mallan listing does it reconcile to?**
A stricter identity problem: `MATCHED` / `AMBIGUOUS` / `UNRESOLVED`.

**Failure of (2) NEVER reverses (1).** Until a direct Mallan → Cotality feed is implemented
and proven, EVERY verified Mallan-office representation stays suppressed as a competing
listing:

| situation | required behaviour |
|---|---|
| representation **+ exactly one** local twin | suppress the provider copy · use the local canonical listing · reconcile provider identity/evidence onto it |
| representation **+ no** local twin | **keep suppressed** · raise a HIGH-SEVERITY reconciliation/canonical-data defect · do NOT expose the provider copy as fallback canonical inventory |
| representation **+ multiple** candidate twins | **keep suppressed** · classify `AMBIGUOUS` · raise an integrity defect · do not guess |
| third-party Cotality listing | normal read-only inventory, unaffected by this suppression |

Mallan authors the listing locally FIRST. A missing local row is therefore an integrity
failure to repair, not a licence for the provider copy to become canonical. This is
fail-closed on canonical AUTHORITY, never fail-open to Cotality.

### Terminology

Two terms, deliberately distinct, because "return-copy" wrongly implies the local target
has already been proven:

- **Mallan-office Cotality representation** — classification only. Decision (1).
- **matched Mallan return-copy** — a representation whose local twin is PROVEN. Decision (2).

Every one of the 35 rows is a representation. How many are matched return-copies is
**UNVERIFIED** — that needs production Neon, deliberately not read while the Neon
acceptance window is open. It must be answered against the isolated Preview database or
after the window closes, never assumed.

### Suppressed means

Not independently searchable · not independently counted · not separately rendered · not
used in CMA candidate pools · not separately represented in Building inventory · not
exposed in Reports/CRM/client portal/public pages · not an independent Media authority.

It does **not** mean deleted. `ListingKey`, `ListingKeyNumeric`, `ListingId`, provider
statuses, permissions, timestamps, attribution and Media relationships are all retained as
provider evidence.

---

## 6. Media follows listing identity, not the reverse

The return-copy can bring back the same photos submitted locally. Listing identity must
resolve FIRST; media authority then follows the canonical listing. A suppressed
return-copy must never become the hero image, floorplan, video or report media source
merely because it arrived through the feed.

`ListingKey` is the provider media join key, so the identity resolution above is a
prerequisite for media reconciliation, not a parallel exercise.

---

## 7. Future direct feed

The absence of a round-tripped Mallan identifier (§2) is the thing the direct feed must
fix. When Mallan submits directly, the provider `ListingKey`/`ListingId` returned in the
submission acknowledgement should be persisted against the local listing, making future
reconciliation DETERMINISTIC rather than address-inferential.

That depends on the authorized Cotality WRITE contract supporting such an
acknowledgement, which has not been verified and must not be assumed now.

Suppression is not removed when direct-feed development begins. It is removed only after
the full round trip is proven end-to-end, with zero duplicates and one retained identity —
and the transition must never create a period where both representations are
independently visible.

## 8. What must not be done

- Do NOT use `source = Cotality` as the editability decision. A Mallan-authored listing
  legitimately HAS a Cotality return-copy; observation path is not ownership.
- Do NOT match on address alone, or on `ListOfficeName` resembling Mallan.
- Do NOT delete the return-copy. It carries `ListingKey`, statuses, permissions,
  timestamps and media relationships that reconciliation needs.
- Do NOT let a returned provider value overwrite a Mallan-authored field merely because it
  came back through the feed. Differences are classified and reconciled deliberately.
- Do NOT add a database column for this. The existing suppression, source-identity and
  return-copy-canonical structures already carry the concepts.
