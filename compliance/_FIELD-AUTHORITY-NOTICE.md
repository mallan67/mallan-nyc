# ⚠️ NOT THE FIELD AUTHORITY — Derived / Compatibility Data Only

`fields.json` and `lookups.json` in this directory are **derived compatibility
data**, not the Cotality field authority. Do not use them to validate Cotality
field names or enum values.

## The only external field authority
Cotality live `$metadata`. Refresh it **before** any field validation:

```
node scripts/get-metadata.js   # writes artifacts/metadata.xml
```

`artifacts/metadata.xml` is a *refreshed snapshot* — authoritative only
immediately after a fresh pull, never inherently live.

> (Added 2026-05-30 — stale field-authority archival.)
