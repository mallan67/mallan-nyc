# trestle-fields MCP server

Optional local developer helper for live Cotality/Trestle field and enum lookup. It parses the **live**
`$metadata` contract using OAuth2 client credentials and exposes:
`trestle_lookup_field`, `trestle_list_fields`, `trestle_get_picklist`, and
`trestle_validate_field`.

## Authority and failure behavior

- The source of field/enum truth is the **live authorized Cotality/Trestle contract**.
- **No local snapshot fallback is permitted.** If OAuth or live `$metadata` access fails, the helper fails closed and the dependent provider fact remains unverified.
- `artifacts/metadata.xml`, when present elsewhere in the repo, is historical/diagnostic evidence only and must never satisfy live provider proof.
- This local MCP helper is optional convenience, not the provider authority itself.

## Runtime path

Checked-in `.mcp.json` runs the TypeScript source directly:

```text
npx --no-install tsx mcp/trestle-fields/index.ts
```

There is no checked-in or required `dist` runtime for this MCP configuration. The root project dependencies must already be installed so `tsx` and the MCP SDK are available.

After changing `index.ts` or this MCP configuration, restart/reload the MCP host so the running process loads the new source. **Do not run a build merely to regenerate an ignored `dist` file; `.mcp.json` does not execute it.**

The helper caches successfully fetched live metadata in memory for the configured TTL. That cache is process-local and does not become a fallback after a fresh live fetch fails once the cache is expired.

## Fix history

- **2026-07-05 — multi-schema parse fix + cadence + dynamic resources.** The live Cotality
  `$metadata` has **5** `<Schema>` namespaces (`RESO.DD` = entities, `RESO.DD.Enums` +
  `.Enums.Multi` = enums). The parser read a single `Schema`, so it saw `undefined` for
  `EntityType`/`EnumType` and parsed **0 fields** — every lookup wrongly returned "not found"
  (broke at the CoreLogic→Cotality rebrand). Fixed to iterate all schemas. Refresh cadence
  moved 24h → 10-min TTL, aligned to the system's Cotality `idx-sync` cadence unless Cotality
  specifies otherwise. `trestle_list_fields` now accepts **any live resource** (dynamic,
  case-insensitive) instead of a hardcoded enum that silently dropped sections such as
  `Media` (photos/video), `HistoryTransactional`, `Model`, `Enumeration`.
