# Building-Manifest Cache — Production Field-Length Evidence — 2026-07-24

Durable record of the read-only evidence backing the manifest page byte
budget (PR #560). Referenced by `tests/runtime/building-manifest-cache-size.test.ts`.

- **Environment:** production Neon `hidden-mountain-87248164` ("neon-green-school"),
  branch `main` (`br-crimson-frog-adr7g9gt`), endpoint `ep-cold-waterfall-adno3ao2`.
- **Measured at:** `2026-07-24T01:58:33.870Z` (server `now()`).
- **Population:** displayable actives — `idx_display_yn AND status IN
  ('Active','ComingSoon','ActiveUnderContract')` — **n = 9,805**.
  (An earlier chat message cited "4,805" — that was a typo; every committed
  artifact and both query runs say 9,805.)

## Exact query (read-only)

```sql
SELECT now() AS measured_at, count(*) AS n,
  max(length(address->>'StreetName')) AS street_max,
  percentile_disc(0.95) WITHIN GROUP (ORDER BY length(address->>'StreetName')) AS street_p95,
  percentile_disc(0.99) WITHIN GROUP (ORDER BY length(address->>'StreetName')) AS street_p99,
  max(length(address->>'UnitNumber')) AS unit_max,
  percentile_disc(0.95) WITHIN GROUP (ORDER BY length(address->>'UnitNumber')) AS unit_p95,
  max(length(primary_photo_url)) AS photo_max,
  percentile_disc(0.95) WITHIN GROUP (ORDER BY length(primary_photo_url)) AS photo_p95,
  max(length(listing_id)) AS lid_max
FROM listings
WHERE idx_display_yn AND status IN ('Active','ComingSoon','ActiveUnderContract');
```

## Results

| Field | max | p95 | p99 |
|---|---|---|---|
| `address->>'StreetName'` (chars) | 22 | 9 | 13 |
| `address->>'UnitNumber'` (chars) | 20 | 5 | — |
| `primary_photo_url` (chars) | 161 | 161 | 161 |
| `listing_id` (chars) | 11 | — | — |
| `address->>'BuildingName'` | null in every displayable-active address JSON | | |

## Interpretation

Every string in the size test's worst-case fixture row EXCEEDS the real
production maximum (e.g. a 50-char street name vs real max 22; a 68-char
building name vs real null; a ~200-char proxy-wrapped photo URL vs real max
161 pre-wrap), so the proven full-page bound is strictly conservative.
Independent of this evidence, the page builder also shrinks dynamically to
the `MANIFEST_CACHE_MAX_BYTES` budget (measured on the actual serialized
result), so real-world drift beyond these lengths degrades page size —
never cacheability.
