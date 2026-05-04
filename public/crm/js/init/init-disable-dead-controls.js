        // ═══════════════════════════════════════════════════════════════════
        // CRM search — disable controls that silently do nothing
        //
        // Per the proof-matrix audit (2026-05-04), the following control
        // categories appear active in the UI but never produce a backend
        // OData clause OR are stripped by the server-side whitelist in
        // lib/search/crm-idx-filter.ts. Checking them was a UX trap:
        // users saw the box check, results changed in unexpected ways
        // (because the OTHER active filters narrowed) but the dead
        // checkbox itself contributed nothing — or worse, broke the
        // search by sending OData the backend silently dropped.
        //
        // Per user direction "Do not allow visible controls that silently
        // do nothing," each dead control is disabled at page load with a
        // "Not currently supported" tooltip. The label is grayed via
        // Tailwind utilities so the disabled state is visible even before
        // hovering.
        //
        // BACKEND TEST CONTRACT (regression alarm):
        //   lib/search/__tests__/crm-idx-filter.test.ts
        //   "BATCH 2 — DEAD-pattern regressions" (commit c7a294c6)
        // pins what the backend currently doesn't support. This file is
        // the FRONTEND mirror — every category in BATCH 2 must appear in
        // DEAD_SELECTORS below. When a category gains real backend
        // support, REMOVE its selector here AND update the corresponding
        // dead-pattern test to assert the new (correct) OData output.
        //
        // Re-applies on `mallan:data:ready` because some advanced-search
        // panels render lazily after the initial DOMContentLoaded.
        // ═══════════════════════════════════════════════════════════════════

        (function () {
            'use strict';

            var TOOLTIP = 'Not currently supported';

            var DEAD_SELECTORS = [
                // ── Non-whitelisted checkboxFilter fields ──
                // The server-side whitelist in lib/search/crm-idx-filter.ts:252
                // does NOT include these data-field values. The frontend
                // collects them into criteria.checkboxFilters and the backend
                // silently drops them.
                'input[data-field="AttendanceType"]',
                'input[data-field="Furnished"]',
                'input[data-field="OwnerPays"]',
                'input[data-field="Concessions"]',
                'input[data-field="BuildingRules"]',
                'input[data-field="RentingAllowedYN"]',
                'input[data-field="MaximumFinancingPercent"]',
                'input[data-field="ListOfficeMlsId"]',
                'input[data-field="RLSParticipantOnly"]',
                // InternetEntireListingDisplayYN is BOTH non-whitelisted AND
                // REBNY-policy-suppressed at the OData $filter level (Trestle
                // returns HTTP 400 — see Bug A8 round-2 diagnostic). It can
                // never be filtered, only read.
                'input[data-field="InternetEntireListingDisplayYN"]',

                // ── CRM-local fields (no Trestle correspondence) ──
                // data-field="CRM" is a sentinel for AdvertisingAllowed /
                // DiplomatsAllowed which exist only in CRM concepts, not in
                // Trestle/REBNY metadata.
                'input[data-field="CRM"]',

                // ── data-local-field flags (never reach API by design) ──
                // search-engine.js generic scanner reads `data-field`, not
                // `data-local-field`. These checkboxes are intentionally
                // CRM-local and never serialized to /api/idx/search.
                'input[data-local-field="CrossListing"]',
                'input[data-local-field="Conversion"]',
                'input[data-local-field="ConstructionType"]',

                // ── Operator-prefixed data-value (lte:/gte:/gt:/eq:) ──
                // Frontend uses values like data-value="lte:1946" for
                // "Pre-War" or "eq:0" for "No Financing". Backend builds
                // literal equality — `Field eq 'lte:1946'` — which won't
                // match any Trestle row. Affects: Pre-War, Post-War,
                // Low-Rise (≤6 stories), Financing variants.
                'input[data-field][data-value^="lte:"]',
                'input[data-field][data-value^="gte:"]',
                'input[data-field][data-value^="gt:"]',
                'input[data-field][data-value^="eq:"]',

                // ── "Any" compound placeholder ──
                // Frontend uses data-value="Any" as a parent stand-in for
                // multi-child enums (e.g., "Any Attended" → DoormanYes |
                // ConciergeYes | ...). Backend has no expansion logic; sends
                // literal "Any" which won't match any Trestle enum.
                'input[data-field][data-value="Any"]',

                // ── data-not negations ──
                // Frontend scanner reads only data-value, not data-not, so
                // the negation never reaches the API. Affects: "No Pets",
                // "No Subletting", "No Smoking", "No Corporate Ownership",
                // "No Pied-A-Terre", "No Guarantors", "No Live/Work",
                // "No Washer/Dryer Install", and "Smoking" (compound
                // data-value + data-not).
                'input[data-not]',
            ];

            function disableDeadControls() {
                var disabledCount = 0;
                DEAD_SELECTORS.forEach(function (sel) {
                    var nodes = document.querySelectorAll(sel);
                    for (var i = 0; i < nodes.length; i++) {
                        var el = nodes[i];
                        if (el.dataset && el.dataset.deadControlMarked === 'true') continue;
                        el.disabled = true;
                        if (!el.title) el.title = TOOLTIP;
                        if (el.dataset) el.dataset.deadControlMarked = 'true';
                        // Visual hint so the disabled state reads at a glance.
                        // Tailwind utility classes already loaded by the CRM.
                        var label = el.closest && el.closest('label');
                        if (label) label.classList.add('opacity-60', 'cursor-not-allowed');
                        disabledCount++;
                    }
                });
                if (disabledCount > 0 && typeof console !== 'undefined') {
                    console.log(
                        '[CRM Search] Disabled ' + disabledCount +
                        ' unsupported control(s) at page load. ' +
                        'See public/crm/js/init/init-disable-dead-controls.js for the full list.'
                    );
                }
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', disableDeadControls);
            } else {
                disableDeadControls();
            }

            // Some advanced-search panels and filter modals render lazily
            // after the initial data load (mallan:data:ready). Re-run so
            // late-rendered controls also get disabled.
            window.addEventListener('mallan:data:ready', disableDeadControls);
        })();
