# Mallan return-copy reconciliation — live evidence

**Every provider fact here came from an HTTP response received from `api.cotality.com`
on 2026-08-21.** Dated evidence, not authority. Production Neon was NOT queried — the
Neon acceptance window is still open — so the local-twin side is explicitly marked
UNVERIFIED below rather than guessed.

## The contract this serves

A Mallan-authored listing exists twice: the **canonical local Mallan listing** (created in
the Mallan web app, editable) and a **Cotality return-copy** that comes back through the
provider feed after external submission. Until a direct Mallan → Cotality feed is
implemented and proven, the local listing wins and the return-copy is suppressed as a
competing listing — while remaining useful provider evidence.

Suppression applies **only** to proven Mallan return-copies. Third-party Cotality
inventory is not suppressed.

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
| `OriginatingSystemKey` | 35/35 | RLS's own key (e.g. 34332844), not Mallan's |

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

## 5. OPEN DEFECT — suppression does not require a proven twin

`excludeMallanRlsReturnCopies()` suppresses on `list_office_mls_id ∈ MALLAN_LIST_OFFICE_MLS_IDS`
**alone**. It does not ask whether a local canonical twin actually exists.

Two different situations are therefore treated identically:

| situation | correct behaviour | current behaviour |
|---|---|---|
| Mallan Cotality row **with** a proven local twin | suppress the duplicate; show the local | suppressed — correct |
| Mallan Cotality row with **no** local twin | it is Mallan's only representation of that listing — it must remain visible, or be raised for reconciliation | **suppressed — the listing disappears entirely** |

That is the same gap issue #622 describes as "Mallan Cotality participation + no proven
local canonical row — the missing product path".

**UNVERIFIED:** whether either of the two live Active rows actually has a local twin. That
requires reading production Neon, which is deliberately not done while the Neon acceptance
window is open. It must be answered against the isolated Preview database or after the
window closes — never assumed.

---

## 6. Media follows listing identity, not the reverse

The return-copy can bring back the same photos submitted locally. Listing identity must
resolve FIRST; media authority then follows the canonical listing. A suppressed
return-copy must never become the hero image, floorplan, video or report media source
merely because it arrived through the feed.

`ListingKey` is the provider media join key, so the identity resolution above is a
prerequisite for media reconciliation, not a parallel exercise.

---

## 7. What must not be done

- Do NOT use `source = Cotality` as the editability decision. A Mallan-authored listing
  legitimately HAS a Cotality return-copy; observation path is not ownership.
- Do NOT match on address alone, or on `ListOfficeName` resembling Mallan.
- Do NOT delete the return-copy. It carries `ListingKey`, statuses, permissions,
  timestamps and media relationships that reconciliation needs.
- Do NOT let a returned provider value overwrite a Mallan-authored field merely because it
  came back through the feed. Differences are classified and reconciled deliberately.
- Do NOT add a database column for this. The existing suppression, source-identity and
  return-copy-canonical structures already carry the concepts.
