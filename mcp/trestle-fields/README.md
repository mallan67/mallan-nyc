# Cotality live contract MCP server

This MCP is the agent-facing adapter for Mallan's **single live Cotality reader**.
It does not parse or cache a separate provider dictionary. Every tool delegates to
`scripts/cotality/query-live.mjs`, which uses `scripts/cotality/live-client.mjs`.

**Provider rule:** the authenticated live Cotality API is the only provider-data authority.
There is **no metadata/CSV/document fallback**. If authentication, the endpoint, or a query
cannot be verified, the tool returns/fails **UNVERIFIED** instead of presenting stale data as
current.

## Tools

- `trestle_census` — current resources, field counts and relationships from `$metadata`.
- `trestle_list_fields` — every live field/relationship for one resource.
- `trestle_lookup_field` / `trestle_validate_field` — exact field existence/type/resource.
- `trestle_get_picklist` — exact enum members from current `$metadata`.
- `trestle_lookup_values` — live `Lookup` rows including query token, display value, override and definition.
- `trestle_query_resource` — bounded read-only resource query with `$select/$filter/$orderby/$expand/$count`.
- `trestle_page_resource` — follow `@odata.nextLink` with an explicit maximum and completeness state.
- `trestle_probe_field` — select/filter/population/order/type-operator proof with `SUPPORTED / PROVIDER_REJECTED / UNVERIFIED`.
- `trestle_probe_relationship` — live `$expand` acceptance and sampled relationship-payload proof.
- `trestle_data_system` — live DataSystem endpoint.
- `trestle_service_document` — live OData service document.

The MCP is for interactive inspection. The exhaustive contract run is:

```bash
npm run cotality:startup-gate
npm run cotality:compile
npm run cotality:search:verify
```

The compiler output is **evidence only**, never a replacement authority. Re-run it whenever a
provider fact is needed for implementation or drift is suspected.

## Rebuild + reload after MCP changes

`dist/` is gitignored. `.mcp.json` runs `mcp/trestle-fields/dist/index.js`, so source changes do
not affect a running MCP until it is rebuilt and reloaded.

```bash
cd mcp/trestle-fields
npm install      # first time / dependency change
npm run build
```

Then restart/reload the MCP host. Any PR changing this server must record that rebuild/reload
requirement in its handoff.
