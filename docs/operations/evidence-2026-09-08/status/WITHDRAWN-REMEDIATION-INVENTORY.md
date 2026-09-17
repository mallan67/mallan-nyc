# Withdrawn provenance — read-only remediation inventory (2026-09-09)

Owner instruction: *"produce a read-only remediation inventory for the incorrectly inferred Withdrawn rows. Do not
relabel those rows without evidence."*

**Nothing was relabelled. No write of any kind was issued.** Every number below comes from read-only `SELECT`s
against the canonical production database (`hidden-mountain-87248164`, branch `main`), run 2026-09-09. The
repeatable script is `scripts/audit/withdrawn-provenance-inventory.mjs` (read-only; `--sql` prints the query).

## 1. Why these rows are stuck

Mallan's older reconciliation manufactured a `Withdrawn` status when a listing merely disappeared from the licensed
feed. That behaviour is gone — departure is now a PRESENCE fact (`sync_status = 'off_feed'`, Mallan state
"Off Market"), never a status. But the reconciler cannot repair what it created: `lib/idx/reconcile-decision.ts`
returns `departed_noop` for an already-terminal row that is absent from the feed —

```
if (dbTerminal) return { action: 'none', className: 'departed_noop',
                         reason: `terminal '${db}' + absent — already hidden` }
```

so a row wrongly stored `Withdrawn` stays `Withdrawn` indefinitely. It is never re-examined.

## 2. What is actually there

6,959 rows are stored `Withdrawn`. Classified by the evidence on each row:

| Provenance | Rows | Sale | Rent | Has OffMarketDate | Still `synced` |
|---|---:|---:|---:|---:|---:|
| **INFERRED — no evidence** (provider's retained `StandardStatus` is on-market: Active / Pending) | **6,949** | 5,872 | 1,077 | 21 | 6,799 |
| Has a real `WithdrawnDate` | 5 | 5 | 0 | 5 | 0 |
| Other (Closed provider status + OffMarketDate) | 4 | 0 | 4 | 4 | 0 |
| No provider status retained | 1 | 1 | 0 | 0 | 0 |
| Provider itself said `Withdrawn` | **0** | 0 | 0 | — | — |

**Not one row in the database was withdrawn according to Cotality.** 6,949 of 6,959 carry a retained provider
status of `Active` (6,750) or `Pending` (199) with no `WithdrawnDate`, and 6,799 of those are still marked
`sync_status = 'synced'` — the row was never even recorded as having left the feed. The change timestamps cluster
in bulk (796 rows on 2026-04-24, 206 on 2026-07-05, 158 on 2026-06-03, …), which is a machine signature, not agents
withdrawing listings.

A correction to an earlier cut of this inventory: it classified on `mls_id IS NULL` and reported only 479 suspect
rows. That was wrong — most provider rows in this database carry a null `mls_id` alongside an `RLS…` listing id and
full provider `raw_data`, so the rule mislabelled ~6,450 provider rows as Mallan exclusives. The honest
discriminator is the listing-id prefix plus the retained provider status, and the script now uses it.

## 3. What is NOT claimed

- No statement here about what each row's status *should* be. The provider's retained `StandardStatus` is the last
  value Cotality delivered; it is not proof of the listing's state today.
- No relabelling, and no correction SQL is proposed for execution. Deciding the target state is the owner's, and
  any rewrite is a separate authorized production write (CLAUDE.md §A.7).

## 4. The evidence a decision would need

For the 6,949 rows, the only authority for the current state is the live feed. A read-only next step (not run here,
because it is 6,949 live lookups and a decision the owner has not made) would be, per row:

1. `ListingId` present in the licensed feed today? → its live `StandardStatus` is the answer.
2. Absent from the feed? → the row genuinely departed; the correct representation is the LAST VERIFIED provider
   status (`raw_data.StandardStatus`) plus `sync_status = 'off_feed'`, which renders as Mallan "Off Market" — not
   `Withdrawn`. The removal DATE is unknown; `terminal_since` is only the day Mallan detected the disappearance
   (`marketDom` now reports such an end as `off_feed_detected` with `estimated: true`).

Until that decision is made, the rows keep their stored status and every reader shows them correctly through the
lifecycle projection.
