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
        // search by sending OData the backend rejectped.
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
                // REJECTS them (fail-closed: an unsupported criterion returns a named 400, it is no longer dropped).
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
                // data-field="CRM" is a sentinel for AdvertisingAllowed, a
                // CRM-only concept with no Trestle/REBNY metadata correspondence.
                // (A CRM checkbox that proxied national origin / citizenship /
                // immigration status was removed 2026-07-07 for Fair Housing.)
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

                // ── P1: Sub-status checkboxes ──
                // OfferOut, OfferAccepted, ContractOut, AllContractSigned,
                // ContractSigned, ContractSignedThruUs, OfferThruUs,
                // OfferAcceptedThruUs, ContractOutThruUs, BackOnMarket,
                // Future, BoardApproved, Sold, SoldThruUs, ACRISVerified,
                // Financed, NoFinancing, NominalSales, OtherACRIS,
                // ApplicationIn, ApplicationAccepted, LeaseOut,
                // LeaseOutThruUs, AppAcceptedThruUs, AppInThruUs,
                // AllLeaseSigned, LeaseSigned, LeaseSignedThruUs,
                // Rented, RentedThruUs.
                //
                // search-engine.js:822 pushes the data-sub-status string
                // verbatim into criteria.statuses; the OData builder then
                // emits StandardStatus eq 'OFFEROUT' (etc.) — literal
                // strings that match no Trestle enum value. Confirmed by
                // the BATCH 2 dead-pattern test at
                // lib/search/__tests__/crm-idx-filter.test.ts.
                'input[data-sub-status]',
            ];

            // ── P1: Container-level dead controls ──────────────────────
            // Some traps live on non-input elements: subway-line spans
            // (.rounded-full), date-range-picker triggers (.drp-trigger
            // div elements), Manhattan-grid select rows. Disabling them with
            // the input-only mechanism above would miss the click
            // surface, so we apply container-level neutralization:
            //
            //   - aria-disabled="true"       (a11y hint to screen readers)
            //   - pointer-events: none       (clicks/taps no-op)
            //   - opacity 0.6                (visible "off" state)
            //   - cursor: not-allowed        (cursor on hover)
            //   - data-dead-container="true" (so JS can early-out)
            //   - title="Not currently supported" on the container
            //
            // Plus a small inline notice prepended to the container so
            // the agent reads the reason without hovering.
            //
            // Targets:
            //   1. Transit panels — Latitude / Longitude do not exist on
            //      the REBNY IDX Plus feed. Both transit-search.js
            //      toODataFilter() and the LIRR/Ferry/Bus checkboxes
            //      drive Lat/Lng-bounded queries that return zero rows.
            //   2. Manhattan grid (#adv-grid-* and #bldg-grid-*) — same
            //      root cause: builds Lat/Lng OData clauses against
            //      always-null fields.
            //   3. Open-House DRP wrappers — openHouseDateFrom/To produce
            //      no clause (DEAD test at crm-idx-filter.test.ts:278).
            //      The frontend forwards the param; the backend drops it.
            //
            // When the underlying engine gains support (PR 5+ projection
            // adds geocoded Lat/Lng; or a Property $expand=OpenHouse
            // route is added), REMOVE the corresponding selector here
            // AND update the DEAD test.
            var DEAD_CONTAINERS = [
                // Transit panels — 4 search modes (sale/rent/building/advanced)
                { selector: '#saleTransitExpand', reason: 'Transit search not supported — REBNY IDX feed does not provide listing coordinates.' },
                { selector: '#rentalTransitExpand', reason: 'Transit search not supported — REBNY IDX feed does not provide listing coordinates.' },
                { selector: '#buildingTransitExpand', reason: 'Transit search not supported — REBNY IDX feed does not provide listing coordinates.' },
                { selector: '#advancedTransitExpand', reason: 'Transit search not supported — REBNY IDX feed does not provide listing coordinates.' },
                // Manhattan grid — locate the parent of the 4 grid selects
                // and disable the whole panel. Each grid prefix has 4
                // selects (north/south/east/west); we disable the immediate
                // parent of the north select (which holds all 4).
                { idAnchor: 'adv-grid-north', reason: 'Manhattan grid search not supported — REBNY IDX feed does not provide listing coordinates.' },
                { idAnchor: 'bldg-grid-north', reason: 'Manhattan grid search not supported — REBNY IDX feed does not provide listing coordinates.' },
                // Open House DRP wrappers — backend has no OpenHouse expansion
                { selector: '[data-drp="saleOpenHouse"]', reason: 'Open House date range not supported by the search backend.' },
                { selector: '[data-drp="rentalOpenHouse"]', reason: 'Open House date range not supported by the search backend.' },
                // Open House preset buttons next to the DRP wrappers — they
                // stamp values onto the wrapper that the builder ignores.
                // Use class selector for all four-per-side preset buttons.
                { selector: '.oh-preset[data-oh="saleOpenHouse"]', reason: 'Open House date range not supported by the search backend.' },
                { selector: '.oh-preset[data-oh="rentalOpenHouse"]', reason: 'Open House date range not supported by the search backend.' },
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
                // Container-level neutralization (P1).
                var containerCount = 0;
                DEAD_CONTAINERS.forEach(function (entry) {
                    var nodes;
                    if (entry.selector) {
                        nodes = document.querySelectorAll(entry.selector);
                    } else if (entry.idAnchor) {
                        // For Manhattan grid: locate the anchor select then walk
                        // up to its containing column. The HTML structure is:
                        //   outer-grid container
                        //     column container (the parent we disable)
                        //       select#bldg-grid-north
                        //       (3 more sibling selects for east/south/west)
                        var anchor = document.getElementById(entry.idAnchor);
                        nodes = anchor && anchor.parentElement ? [anchor.parentElement] : [];
                    } else {
                        nodes = [];
                    }
                    for (var j = 0; j < nodes.length; j++) {
                        var container = nodes[j];
                        if (container.dataset && container.dataset.deadContainerMarked === 'true') continue;
                        container.setAttribute('aria-disabled', 'true');
                        container.setAttribute('data-dead-container', 'true');
                        if (!container.title) container.title = TOOLTIP;
                        // Inline styles are necessary because Tailwind's
                        // pointer-events-none requires JIT generation that may
                        // not always pick up our class addition timing. Use
                        // direct style for guaranteed behavior.
                        container.style.pointerEvents = 'none';
                        container.style.opacity = '0.6';
                        container.style.cursor = 'not-allowed';
                        // Disable every interactive child so saved-form
                        // restoration / programmatic checks also no-op.
                        var children = container.querySelectorAll('input, select, button, textarea, [tabindex]');
                        for (var k = 0; k < children.length; k++) {
                            var child = children[k];
                            try {
                                child.disabled = true;
                                child.setAttribute('aria-disabled', 'true');
                                child.setAttribute('tabindex', '-1');
                            } catch (e) { /* read-only properties on some elements */ }
                        }
                        // Prepend a small notice if not already present.
                        if (!container.querySelector('[data-dead-container-notice]')) {
                            var notice = document.createElement('div');
                            notice.setAttribute('data-dead-container-notice', 'true');
                            // Keep visual styling minimal; we only need an
                            // unmistakable text label, not custom Tailwind.
                            notice.style.cssText =
                                'pointer-events:auto;font-size:11px;color:#92400e;background:#fef3c7;' +
                                'border:1px solid #fcd34d;border-radius:4px;padding:4px 8px;margin-bottom:6px;';
                            notice.textContent = entry.reason || TOOLTIP;
                            container.insertBefore(notice, container.firstChild);
                        }
                        if (container.dataset) container.dataset.deadContainerMarked = 'true';
                        containerCount++;
                    }
                });
                if ((disabledCount > 0 || containerCount > 0) && typeof console !== 'undefined') {
                    console.log(
                        '[CRM Search] Disabled ' + disabledCount +
                        ' unsupported control(s) and ' + containerCount +
                        ' unsupported panel(s) at page load. ' +
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
