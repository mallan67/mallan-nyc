# Buyer-side participation — PREPARED SCHEMA + BACKFILL, AWAITING AUTHORIZATION

**Status:** `AWAITING_AUTHORIZATION` — nothing in this document has been executed.
**Blocked by:** standing holds on schema migration and production backfill.
**Prepared:** 2026-08-17, from live Cotality evidence only.

---

## 1. Why this is required

CRM → Operations → My Listings must show an agent's **buyer-side representation**
alongside their listing-side inventory. Today it cannot, because Mallan does not
store buyer-side participation anywhere:

| Candidate store | State | Evidence |
|---|---|---|
| `listings` typed columns | **no buyer column exists** | `information_schema`: only `list_agent_mls_id`, `co_list_agent_mls_id`, `list_office_mls_id`, `co_list_office_mls_id` |
| `listings.raw_data` JSON | **shed** | `raw_data ? 'BuyerAgentMlsId'` → **0 of 522** terminal rows |
| `past_deals` | **empty** | `SELECT … GROUP BY` → 0 rows |

So buyer-side history is unreachable by any query. This is a storage gap, not a
reader bug — the reader correction shipped in #618 is complete for listing-side.

## 2. The provider contract — LIVE VERIFIED (2026-08-17)

Read-only probe of `api.cotality.com/trestle`. **No value below is inferred.**

### Fields (from `/odata/$metadata`, EntityType `Property`)

| Field | Metadata type |
|---|---|
| `BuyerAgentMlsId` | `Edm.String` |
| `BuyerAgentKey` | `Edm.String` |
| `BuyerOfficeMlsId` | `Edm.String` |
| `CoBuyerAgentMlsId` | `Edm.String` |
| `CoBuyerOfficeMlsId` | `Edm.String` |

(The provider declares 40+ `BuyerAgent*` and 40+ `CoBuyerAgent*` fields; only the
identity fields are proposed for storage — see §5 on PII.)

### Population, measured on 500 live `Closed` records

| Field | Populated |
|---|---|
| `BuyerAgentMlsId` | **500/500** |
| `BuyerOfficeMlsId` | **500/500** |
| `CoListAgentMlsId` | 161/500 |
| `CoBuyerAgentMlsId` | 2/500 |
| **`BuyerAgentFullName`** | **0/500** — names are NOT delivered |
| **`BuyerOfficeName`** | **0/500** |

### Value vocabulary — NOT purely numeric

| Value class | Count (of 500) |
|---|---|
| numeric MLS id | 473 |
| **`NONMEMBER`** | 18 — buyer agent outside RLS membership (**8,212 feed-wide**) |
| team codes `TM61` / `TM62` / `TM63` | 9 |

**Mapping consequence:** store as `TEXT`. Never coerce to an integer, and never
treat `NONMEMBER` or a `TM*` code as an agent identity. A numeric cast would
silently discard ~5% of real participation records.

### Filterability

`BuyerAgentMlsId` **is filterable** (`$filter=BuyerAgentMlsId eq '…'` → HTTP 200),
so a historical backfill is feasible without a full-table scan.

### The target population

| Query | Live count |
|---|---|
| `BuyerAgentMlsId eq '39361'` (Maya) | **6** |
| `CoBuyerAgentMlsId eq '39361'` | 0 |
| `ListAgentMlsId eq '39361'` | 36 |
| `BuyerAgentMlsId ne null` (whole feed) | 98,545 |

Maya's 6 buyer-side records, newest first:

```
RLS20034915  Closed  close=2025-10-08  listAgent=51215  buyerAgent=39361   <- pure buyer rep
RLS11000164  Closed  close=2024-09-02  listAgent=39361  buyerAgent=39361   <- dual agency
RLS10973841  Closed  close=2024-06-24  listAgent=39361  buyerAgent=39361   <- dual agency
RLS10929356  Closed  close=2024-01-28  listAgent=39361  buyerAgent=39361   <- dual agency
RLS10915574  Closed  close=2023-11-01  listAgent=46950  buyerAgent=39361   <- pure buyer rep
RLS10924848  Closed  close=2023-10-23  listAgent=39361  buyerAgent=39361   <- dual agency
```

4 of 6 are dual agency (already visible via listing-side). **2 are pure buyer
representation and are invisible today** — `RLS20034915` and `RLS10915574`.

## 3. Prepared schema change — NOT APPLIED

```prisma
model Listing {
  // … existing fields …

  /// Cotality `BuyerAgentMlsId`. TEXT, not numeric: the live vocabulary
  /// includes the `NONMEMBER` sentinel and team codes (`TM61`/`TM62`/`TM63`).
  buyer_agent_mls_id     String? @map("buyer_agent_mls_id")
  /// Cotality `CoBuyerAgentMlsId`. Rare (2/500 live) but real.
  co_buyer_agent_mls_id  String? @map("co_buyer_agent_mls_id")
  /// Cotality `BuyerOfficeMlsId` — brokerage-scope participation.
  buyer_office_mls_id    String? @map("buyer_office_mls_id")

  @@index([buyer_agent_mls_id], map: "listings_buyer_agent_mls_id_idx")
  @@index([co_buyer_agent_mls_id], map: "listings_co_buyer_agent_mls_id_idx")
}
```

Migration SQL:

```sql
ALTER TABLE listings ADD COLUMN buyer_agent_mls_id    TEXT;
ALTER TABLE listings ADD COLUMN co_buyer_agent_mls_id TEXT;
ALTER TABLE listings ADD COLUMN buyer_office_mls_id   TEXT;
CREATE INDEX CONCURRENTLY listings_buyer_agent_mls_id_idx    ON listings (buyer_agent_mls_id);
CREATE INDEX CONCURRENTLY listings_co_buyer_agent_mls_id_idx ON listings (co_buyer_agent_mls_id);
```

Additive and nullable — no rewrite of existing rows, no default backfill, and no
lock beyond the catalog update. `CONCURRENTLY` keeps index creation online.

## 4. Prepared backfill — NOT EXECUTED

Scoped to Mallan participation rather than the whole 98,545-row population:

```
GET /odata/Property
  ?$filter=BuyerAgentMlsId eq '<agents.trestle_mls_id>'
  &$select=ListingId,ListingKey,BuyerAgentMlsId,CoBuyerAgentMlsId,BuyerOfficeMlsId,StandardStatus,CloseDate
```

Then `UPDATE listings SET buyer_agent_mls_id = … WHERE listing_id = …`, matched on
`ListingId`.

Two conditions must be honoured:

1. **Rows may not exist locally.** Maya's oldest buyer-side record closed
   2023-10-23; the local `listings` table may no longer retain it. The backfill
   must **not** create canonical `Listing` rows for records Mallan never
   ingested — that would re-import third-party inventory as Mallan inventory,
   which is the same class of defect as the My Listings incident.
2. **Zero public invalidation.** These columns feed a CRM ownership predicate;
   no public reader consumes them. The backfill must emit **no** cache tags.

## 5. Compliance note

Only the **identity** fields are proposed. `BuyerAgentEmail`,
`BuyerAgentDirectPhone`, `BuyerAgentStateLicense` and the rest of the
`BuyerAgent*` block are **deliberately excluded** — they are agent PII with no
CRM ownership purpose, and the live feed does not even populate
`BuyerAgentFullName`. Storing an identity is sufficient to answer "is this mine?".

## 6. Code readiness

`lib/crm/personal-participation.ts` is already structured for this. Enabling
buyer-side is two lines inside the existing `participationWhere`, with no change
to any caller:

```ts
clauses.push({ buyer_agent_mls_id: identity.trestleMlsId });
clauses.push({ co_buyer_agent_mls_id: identity.trestleMlsId });
```

`BUYER_PARTICIPATION_HOLD` in that module records the contract, the required
columns and the sentinel vocabulary, and is asserted by
`lib/crm/__tests__/personal-participation.test.ts` so it cannot be quietly
forgotten.

## 7. Authorization required

- [ ] Schema migration (3 nullable columns + 2 indexes)
- [ ] Production backfill (scoped per agent `trestle_mls_id`)
- [ ] Enable the two buyer-side clauses

**None of these has been performed.**
