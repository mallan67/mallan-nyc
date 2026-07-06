# trestle-fields MCP server

Live Cotality field/enum lookup for the RLS resources. Parses the **live**
`https://api.cotality.com/trestle/odata/$metadata` (OAuth2 client_credentials, same creds as
`lib/idx/auth.ts`), refreshes it on a **10-min TTL** (`TRESTLE_METADATA_TTL_MS`) — aligned to the
system's Cotality `idx-sync` cadence unless Cotality specifies otherwise — and exposes 4 tools:
`trestle_lookup_field`, `trestle_list_fields`, `trestle_get_picklist`, `trestle_validate_field`.

Source of truth is the **live Cotality API only**. If the live fetch fails it falls back to
`artifacts/metadata.xml` (a current-format snapshot), never a hardcoded field list.

## ⚠️ HARD RULE — rebuild + reload after any change

`dist/` is **gitignored**. `.mcp.json` runs `mcp/trestle-fields/dist/index.js`, so editing
`index.ts` does **nothing** at runtime until you rebuild — and a running MCP server keeps the
**old** `dist` loaded until it is reloaded.

**After merging any change here (or pulling one):**

```bash
cd mcp/trestle-fields
npm install      # first time only
npm run build    # regenerate dist/index.js  ← REQUIRED
```

Then **reload the MCP server** (restart the Claude Code session / MCP host). Skipping this means
the code is "fixed" but the running server still uses the old build.

> Any PR that changes this server MUST state the rebuild + reload requirement in its description.

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
