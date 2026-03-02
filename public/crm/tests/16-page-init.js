// Initialize agent-scoped UI on page load
document.addEventListener('DOMContentLoaded', function() {
    // Render agent badge
    var badge = document.getElementById('agentBadge');
    if (badge) {
        var initials = LOGGED_IN_AGENT.name.split(' ').map(function(n) { return n[0]; }).join('').substring(0, 2);
        document.getElementById('agentBadgeInitials').textContent = initials;
        document.getElementById('agentBadgeName').textContent = LOGGED_IN_AGENT.name;
        document.getElementById('agentBadgeRole').textContent = LOGGED_IN_AGENT.role === 'broker' ? 'Broker' : 'Agent';
    }
    // Render scoped client cards and dropdown
    renderClientGrid();
    populateClientSelect();

    // Run REBNY Test Suite on page load (verbose first run)
    REBNYTestSuite({ verbose: true, context: 'pageload' });
});

document.addEventListener('DOMContentLoaded', function() {
    var missing = [];
    ['performSearch','collectSearchCriteria','filterListings','initializeSearchResults',
     'renderSearchResults','showSearchSection','toggleSearchTab','backToSearch','renderManageSection','toggleManageMode','toggleManageView','renderManageCards','toggleOHOverview','renderOHOverview',
     'clearSearchForm','updateResultsCount','getFilteredListings','REBNYComplianceDoctor','REBNYWiringTest','REBNYBehaviorTest','REBNYComplianceExtended','REBNYTestSuite',
     'NoVOWDriftTests','AllowlistLeakTests','SearchCorrectnessTests','SecurityHardeningV2Tests','AccessibilityRESOPerfTests','MutationRegressionTests',
     'StrictIntegrityTests','SourceIntegrityTests','setupStrictGuards','teardownStrictGuards','markFallbackUsed','computeDatasetHash','safeSuiteCall'].forEach(function(fn) {
        if (typeof window[fn] !== 'function') missing.push(fn);
    });
    if (missing.length > 0) {
        alert('WARNING: These functions failed to load:\n' + missing.join('\n') + '\n\nThe main script may have an error.');
    }
});
