/*
 * Authenticated Search executable-criteria boundary.
 *
 * Provider authority is the live Cotality API. The browser may contain old UI
 * labels/markup for compatibility, but no non-Cotality status is allowed to
 * leave this boundary as a provider criterion.
 *
 * The server independently validates StandardStatus again. This file is a
 * browser safety boundary, not a competing provider mapping authority.
 */
(function installCotalityCriteriaBoundary() {
    'use strict';

    var STANDARD_STATUS = Object.freeze([
        'Active',
        'ActiveUnderContract',
        'Canceled',
        'Closed',
        'ComingSoon',
        'Delete',
        'Expired',
        'Hold',
        'Incomplete',
        'Pending',
        'Withdrawn'
    ]);
    var STANDARD_STATUS_SET = new Set(STANDARD_STATUS);

    // One-way compatibility for values produced by older Mallan UI/saved state.
    // These are NOT canonical Search values and are never persisted/sent after
    // this boundary. Unsupported business sub-statuses deliberately have no map.
    var LEGACY_STATUS = Object.freeze({
        ACTIVE: 'Active',
        UNDER_CONTRACT: 'ActiveUnderContract',
        CONTRACT: 'ActiveUnderContract',
        ACTIVEUNDERCONTRACT: 'ActiveUnderContract',
        ACTIVE_UNDER_CONTRACT: 'ActiveUnderContract',
        CANCELED: 'Canceled',
        CANCELLED: 'Canceled',
        CLOSED: 'Closed',
        COMING_SOON: 'ComingSoon',
        COMINGSOON: 'ComingSoon',
        EXPIRED: 'Expired',
        HOLD: 'Hold',
        INCOMPLETE: 'Incomplete',
        PENDING: 'Pending',
        WITHDRAWN: 'Withdrawn',
        DELETE: 'Delete'
    });

    function migrateOnce(value) {
        var raw = String(value == null ? '' : value).trim();
        if (!raw) return null;
        if (STANDARD_STATUS_SET.has(raw)) return raw;
        return LEGACY_STATUS[raw] || null;
    }

    function exactStatuses(values) {
        var out = [];
        var rejected = [];
        (Array.isArray(values) ? values : []).forEach(function(value) {
            var migrated = migrateOnce(value);
            if (!migrated) {
                rejected.push(String(value));
                return;
            }
            if (out.indexOf(migrated) === -1) out.push(migrated);
        });
        if (rejected.length) {
            var err = new Error(
                'Unsupported Cotality status criterion: ' + rejected.join(', ') +
                '. This filter cannot be sent because it is not a live StandardStatus member.'
            );
            err.code = 'UNSUPPORTED_CRITERION';
            err.criterion = 'status';
            err.unsupportedValues = rejected;
            throw err;
        }
        return out;
    }

    function disableNonCotalityStatusControls() {
        document.querySelectorAll('[data-field="MlsStatus"][data-sub-status]').forEach(function(el) {
            el.checked = false;
            el.disabled = true;
            el.setAttribute('aria-disabled', 'true');
            el.setAttribute(
                'title',
                'Unavailable: this historical Mallan sub-status is not a live Cotality StandardStatus criterion.'
            );
            var label = el.closest('label');
            if (label) {
                label.classList.add('opacity-50');
                label.setAttribute('data-cotality-unsupported', 'status-substatus');
            }
        });
    }

    function installSerializerGuard() {
        if (typeof window.buildIdxSearchParams !== 'function') return false;
        if (window.buildIdxSearchParams.__cotalityExactStatusBoundary) return true;

        var original = window.buildIdxSearchParams;
        var wrapped = function(criteria) {
            var input = criteria || {};
            var normalized = Object.assign({}, input);
            if (Array.isArray(input.statuses) && input.statuses.length) {
                normalized.statuses = exactStatuses(input.statuses);
            }

            var params = original(normalized);
            if (normalized.statuses && normalized.statuses.length) {
                // Exact members only; no browser mapping table and no invented
                // aliases cross the provider boundary.
                params.status = normalized.statuses.join(',');
            }
            return params;
        };
        wrapped.__cotalityExactStatusBoundary = true;
        window.buildIdxSearchParams = wrapped;
        return true;
    }

    // Expose only for focused tests/diagnostics.
    window.CotalityStatusCriteria = Object.freeze({
        members: STANDARD_STATUS.slice(),
        migrateOnce: migrateOnce,
        exactStatuses: exactStatuses
    });

    disableNonCotalityStatusControls();
    installSerializerGuard();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            disableNonCotalityStatusControls();
            installSerializerGuard();
        }, { once: true });
    }
})();
