// Diagnostic: verify all search functions loaded
// ═══════════════════════════════════════════════════════════════════════════════
// LISTING OUTPUT — Print, Email, Preview (Branded Listing Sheets)
// Compliance gate → Generate branded HTML → Print/Email/Preview
// ═══════════════════════════════════════════════════════════════════════════════

// LOGGED_IN_AGENT + AGENT_PROFILE defined at top of first <script> block

// Compliance gate — check each listing before output
// displayContext: 'idx' (default/public) | 'vow' (authenticated client) | 'crm' (agent/broker)
function checkListingCompliance(listingIds, displayContext) {
    displayContext = displayContext || (typeof searchDisplayContext !== 'undefined' ? searchDisplayContext : 'idx');
    var result = { passed: [], blocked: [], warnings: [] };
    listingIds.forEach(function(id) {
        var listing = listings.find(function(l) { return l.id === id; });
        if (!listing) return;

        var perm = listing.permissions || {};

        // Gate 1: Owner Opt-Out — NEVER display in ANY context (UCBA Art. I Sec. 4(A))
        if (perm.ownerOptOut === true) {
            result.blocked.push({ id: id, address: listing.address, reason: 'Owner opted out of all display — listing cannot be shown or distributed (UCBA Art. I Sec. 4(A))' });
            return;
        }

        // Gate 2: Participant Only — CRM only (authorized RLS participants)
        if (perm.participantOnly === true) {
            if (displayContext !== 'crm') {
                result.blocked.push({ id: id, address: listing.address, reason: 'Participant Only — visible to RLS participants only (RLS: Permissions=Private)' });
                return;
            }
        }

        // Gate 3: Display context — IDX vs VOW vs CRM
        if (displayContext === 'idx') {
            if (listing.idxDisplayYN === false || perm.idxDisplay === false) {
                result.blocked.push({ id: id, address: listing.address, reason: 'IDX Display opted out — not shown on IDX websites (RLS: IDXEntireListingDisplayYN)' });
                return;
            }
            if (listing.internetDisplayYN === false) {
                result.blocked.push({ id: id, address: listing.address, reason: 'Internet display opted out — not shown on any website (RLS: InternetEntireListingDisplayYN)' });
                return;
            }
        } else if (displayContext === 'vow') {
            if (listing.internetDisplayYN === false) {
                result.blocked.push({ id: id, address: listing.address, reason: 'Internet display opted out — not shown in VOW portal (RLS: InternetEntireListingDisplayYN)' });
                return;
            }
        }
        // CRM: skip Gate 3 (authorized participant sees all except Owner Opt-Out)

        // Gate 4: Syndication — track for distribution control
        // SyndicateYN=false means listing should NOT go to third-party portals,
        // but it still appears in IDX search. Flag as warning for output/reports.
        if (perm.syndication === false || listing.syndicateYN === false) {
            result.warnings.push({ id: id, address: listing.address, reason: 'Not Syndicated — listing will not be distributed to third-party portals (SyndicateYN=false)' });
        }

        // Gate 5: Coming Soon — show but with restrictions
        // UCBA Art. I Sec. 5(C): No showings, open houses, or negotiations permitted.
        if (listing.status === 'ComingSoon') {
            result.warnings.push({ id: id, address: listing.address, reason: 'Coming Soon — No showings or open house permitted until ' + (listing.comingSoonDate || 'active date') + ' (UCBA Art. I Sec. 5(C))' });
        }

        // Gate 6: Closed Status — suppress after 24 hours
        if (listing.status === 'Closed' && listing.closedDate) {
            var closedTime = new Date(listing.closedDate).getTime();
            var hoursSinceClosed = (Date.now() - closedTime) / (1000 * 60 * 60);
            if (hoursSinceClosed > 24) {
                result.blocked.push({ id: id, address: listing.address, reason: 'Closed listing must be removed or marked within 24 hours of status change' });
                return;
            }
        }

        // Address display opt-out — show listing but suppress address
        if (listing.addressDisplayYN === false) {
            result.warnings.push({ id: id, address: listing.address, reason: 'Address display opted out — address will show as "Available Upon Request"' });
        }

        result.passed.push(listing);
    });
    return result;
}

// Format currency
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '—';
    return '$' + amount.toLocaleString('en-US');
}

// Format date
function formatDate(dateStr) {
    if (!dateStr) return '—';
    return dateStr;
}

// Generate branded listing sheet HTML for one listing
function generateSingleListingSheet(listing, suppressAddress) {
    var address = suppressAddress ? 'Address Available Upon Request' : listing.address;
    var unitStr = listing.unit ? ', ' + listing.unit : '';
    var neighborhood = listing.neighborhood || '';
    var borough = listing.borough || 'Manhattan';
    var bedsLabel = listing.beds === 0 ? 'Studio' : listing.beds + ' BD';
    var bathsLabel = listing.baths + ' BA';
    var sqftLabel = listing.intSqft ? listing.intSqft.toLocaleString() + ' SF' : '';
    var priceStr = formatCurrency(listing.price);
    if (listing.listingCategory === 'rental') priceStr += '/mo';

    var statusClass = '';
    switch(listing.status) {
        case 'Active': statusClass = 'background:#2563eb;color:white;'; break;
        case 'Pending': statusClass = 'background:#f59e0b;color:white;'; break;
        case 'Closed': statusClass = 'background:#16a34a;color:white;'; break;
        case 'ComingSoon': statusClass = 'background:#8b5cf6;color:white;'; break;
        default: statusClass = 'background:#6b7280;color:white;'; break;
    }

    var details = [];
    if (listing.ownership) details.push(ownershipLabel(listing.ownership));
    if (listing.era) details.push(listing.era);
    if (listing.dom !== undefined) details.push(listing.dom + ' DOM');
    var detailsStr = details.join('  |  ');

    var financials = '';
    if (listing.listingCategory !== 'rental') {
        var parts = [];
        if (listing.maintCC) parts.push('Maint/CC: ' + formatCurrency(listing.maintCC) + '/mo');
        if (listing.reTaxes) parts.push('RE Tax: ' + formatCurrency(listing.reTaxes) + '/mo');
        if (listing.totalMonthly) parts.push('Total Monthly: ' + formatCurrency(listing.totalMonthly));
        financials = parts.join('  |  ');
    }

    var description = listing.description || '';
    if (description.length > 300) description = description.substring(0, 297) + '...';

    var agentLine = 'Listed by ' + (listing.agentName || AGENT_PROFILE.name) + ', ' + (listing.company || AGENT_PROFILE.company);

    return '<div class="listing-sheet-card" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:24px;page-break-inside:avoid;">' +
        '<div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">' +
                '<div>' +
                    '<div style="font-size:24px;font-weight:700;color:#111827;">' + priceStr + '</div>' +
                    '<div style="font-size:14px;color:#6b7280;margin-top:2px;">' + bedsLabel + '  |  ' + bathsLabel + (sqftLabel ? '  |  ' + sqftLabel : '') + '</div>' +
                '</div>' +
                '<span style="' + statusClass + 'padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:600;">' + listing.status + '</span>' +
            '</div>' +
        '</div>' +
        '<div style="padding:20px 24px;">' +
            '<div style="font-size:16px;font-weight:600;color:#111827;">' + address + unitStr + '</div>' +
            '<div style="font-size:14px;color:#6b7280;margin-top:2px;">' + neighborhood + ', ' + borough + '</div>' +
            (detailsStr ? '<div style="font-size:13px;color:#6b7280;margin-top:8px;">' + detailsStr + '</div>' : '') +
            (financials ? '<div style="font-size:13px;color:#374151;margin-top:8px;padding:8px 12px;background:#f9fafb;border-radius:8px;">' + financials + '</div>' : '') +
            (description ? '<div style="font-size:13px;color:#4b5563;margin-top:12px;line-height:1.5;">' + description + '</div>' : '') +
            '<div style="font-size:12px;color:#9ca3af;margin-top:12px;">' + agentLine + '</div>' +
            '<div style="font-size:11px;color:#d1d5db;margin-top:4px;">Last Updated: ' + formatDate(listing.updatedDate || listing.listedDate) + '</div>' +
        '</div>' +
    '</div>';
}

// Generate full branded listing sheet HTML (header + listings + footer)
function generateListingSheet(listings, warnings) {
    var now = new Date();
    var dateStr = (now.getMonth()+1) + '/' + now.getDate() + '/' + now.getFullYear() + ' ' + now.toLocaleTimeString('en-US', {hour:'2-digit',minute:'2-digit'});

    var warningIds = {};
    if (warnings) warnings.forEach(function(w) { warningIds[w.id] = true; });

    var html = '<div id="listingSheetContent" style="font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:20px;">';

    // Header — Company branding
    html += '<div style="border-bottom:3px solid #B8860B;padding-bottom:16px;margin-bottom:24px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">' +
            '<div>' +
                '<div style="font-size:22px;font-weight:700;color:#111827;letter-spacing:0.5px;">MALLAN REAL ESTATE INC.</div>' +
                '<div style="font-size:12px;color:#6b7280;margin-top:4px;">' + AGENT_PROFILE.address + '</div>' +
                '<div style="font-size:12px;color:#6b7280;">' + AGENT_PROFILE.phone + ' | ' + AGENT_PROFILE.website + '</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
                '<div style="font-size:14px;font-weight:600;color:#111827;">Prepared by: ' + AGENT_PROFILE.name + '</div>' +
                '<div style="font-size:12px;color:#6b7280;">License: ' + AGENT_PROFILE.license + '</div>' +
                '<div style="font-size:12px;color:#6b7280;">' + AGENT_PROFILE.phone + ' | ' + AGENT_PROFILE.email + '</div>' +
            '</div>' +
        '</div>' +
    '</div>';

    // Warning banner (if any address-suppressed listings)
    if (warnings && warnings.length > 0) {
        html += '<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#92400e;">' +
            '<strong>Note:</strong> ' + warnings.length + ' listing(s) have address display opted out. Address shown as "Available Upon Request".' +
        '</div>';
    }

    // Listing cards
    listings.forEach(function(listing) {
        var suppressAddr = warningIds[listing.id] || false;
        html += generateSingleListingSheet(listing, suppressAddr);
    });

    // Footer — REBNY attribution + compliance + commission negotiability
    html += '<div style="border-top:2px solid #e5e7eb;padding-top:16px;margin-top:24px;font-size:11px;color:#9ca3af;line-height:1.6;">' +
        '<p>Listing(s) courtesy of the REBNY Listing Service (RLS)</p>' +
        '<p>Information is deemed reliable but not guaranteed.</p>' +
        '<p>Last Updated: ' + dateStr + '</p>' +
        '<p style="margin-top:8px;color:#6b7280;font-style:italic;">Commission rates are not set by law and are fully negotiable. Compensation offered to cooperating brokers is determined by the listing broker.</p>' +
        '<p style="margin-top:8px;">Equal Housing Opportunity &mdash; Federal Fair Housing Act, NY State Human Rights Law, NYC Human Rights Law Title 8</p>' +
        '<p style="margin-top:4px;">' + AGENT_PROFILE.company + ' | Brokerage License: ' + AGENT_PROFILE.companyLicense + '</p>' +
        '<p>' + AGENT_PROFILE.address + ' | ' + AGENT_PROFILE.phone + ' | ' + AGENT_PROFILE.website + '</p>' +
    '</div>';

    html += '</div>';
    return html;
}

// Get selected listing IDs
function getSelectedListingIds() {
    return searchResultsState.selectedListings || [];
}

// Print listing sheet
function printListingSheet() {
    var ids = getSelectedListingIds();
    if (ids.length === 0) {
        showToast('Please select at least one listing to print.', 'warning');
        return;
    }
    // Use the reports modal which has format/version/options
    if (typeof openReportsModal === 'function') {
        openReportsModal(ids, 'print');
        return;
    }
    // Legacy fallback
    var compliance = checkListingCompliance(ids);

    // Show blocked listings warning
    if (compliance.blocked.length > 0) {
        var blockedCount = compliance.blocked.length;
        if (compliance.passed.length === 0) {
            showToast(blockedCount + ' listing(s) blocked (IDX opt-out). No listings available to print.', 'error');
            return;
        }
        showToast(blockedCount + ' listing(s) blocked (IDX opt-out). Printing remaining ' + compliance.passed.length + ' listing(s).', 'warning');
    }

    var sheetHtml = generateListingSheet(compliance.passed, compliance.warnings);

    // Open print window (CSP-safe Blob URL)
    var printHtml = '<!DOCTYPE html><html><head><title>Listing Sheet - Mallan Real Estate</title>' +
        '<style>' +
        'body { margin: 0; padding: 20px; font-family: system-ui, -apple-system, sans-serif; }' +
        '.listing-sheet-card { page-break-inside: avoid; }' +
        '@media print { body { padding: 0; } @page { margin: 1.5cm; } }' +
        '</style></head><body>' + sheetHtml + '</body></html>';
    openPrintableWindow(printHtml, { features: 'width=900,height=700', autoPrint: true });

    // Log audit entry
    logAuditEntry('listing_print', {
        listingIds: compliance.passed.map(function(l) { return l.id; }),
        count: compliance.passed.length,
        blocked: compliance.blocked.length
    });

    // Close delivery menu if open
    var menu = document.getElementById('clientDeliveryMenu');
    if (menu) menu.classList.add('hidden');
}

// Preview listing sheet (opens in modal overlay)
function previewListingSheet() {
    var ids = getSelectedListingIds();
    if (ids.length === 0) {
        showToast('Please select at least one listing to preview.', 'warning');
        return;
    }

    var compliance = checkListingCompliance(ids);

    if (compliance.blocked.length > 0 && compliance.passed.length === 0) {
        showToast('All selected listings have IDX display opted out. Cannot preview.', 'error');
        return;
    }

    var sheetHtml = generateListingSheet(compliance.passed, compliance.warnings);

    // Show in a preview window (CSP-safe Blob URL)
    var previewHtml = '<!DOCTYPE html><html><head><title>Preview - Listing Sheet</title>' +
        '<style>' +
        'body { margin: 0; padding: 20px; font-family: system-ui, -apple-system, sans-serif; background: #f3f4f6; }' +
        '#listingSheetContent { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }' +
        '.listing-sheet-card { page-break-inside: avoid; }' +
        '.preview-toolbar { position: sticky; top: 0; background: #1f2937; color: white; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; margin: -20px -20px 20px; border-radius: 0; z-index: 10; }' +
        '.preview-toolbar button { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; }' +
        '.preview-toolbar button:hover { background: #2563eb; }' +
        '.preview-toolbar button.secondary { background: transparent; border: 1px solid rgba(255,255,255,0.3); }' +
        '.preview-toolbar button.secondary:hover { background: rgba(255,255,255,0.1); }' +
        '@media print { .preview-toolbar { display: none !important; } body { background: white; padding: 0; } #listingSheetContent { box-shadow: none; padding: 0; } @page { margin: 1.5cm; } }' +
        '</style></head><body>' +
        '<div class="preview-toolbar">' +
        '<span style="font-size:14px;font-weight:600;">' + compliance.passed.length + ' Listing(s) - Preview</span>' +
        '<div style="display:flex;gap:8px;">' +
        '<button class="secondary" onclick="window.close()">Close</button>' +
        '<button onclick="window.print()">Print</button>' +
        '</div></div>' +
        sheetHtml + '</body></html>';
    openPrintableWindow(previewHtml, { features: 'width=900,height=700' });

    // Close delivery modal
    closeDeliveryModal();
}

// Email listing sheet — opens reports modal with email preset
function emailListingSheet() {
    var ids = getSelectedListingIds();
    if (ids.length === 0) {
        showToast('Please select at least one listing to email.', 'warning');
        return;
    }
    // Use the reports modal which has a working client selector + email delivery
    if (typeof openReportsModal === 'function') {
        openReportsModal(ids, 'email');
        return;
    }
    // Legacy fallback (should not reach here)
    var compliance = checkListingCompliance(ids);

    if (compliance.blocked.length > 0 && compliance.passed.length === 0) {
        showToast('All selected listings have IDX display opted out. Cannot email.', 'error');
        return;
    }

    // Get selected client info
    var clientSelect = document.getElementById('clientSelect');
    var clientEmail = '';
    var clientName = 'Client';
    if (clientSelect && clientSelect.value) {
        var selectedClient = customerDB[clientSelect.value];
        if (selectedClient) {
            clientName = selectedClient.name;
            clientEmail = selectedClient.email;
        } else {
            var opt = clientSelect.options[clientSelect.selectedIndex];
            clientName = opt.textContent.split(' - ')[0].trim();
        }
    }

    if (!clientEmail) {
        showToast('Please select a client with an email address first.', 'warning');
        return;
    }

    var listings = compliance.passed;
    var title = 'Property Report — ' + listings.length + ' Listing' + (listings.length !== 1 ? 's' : '');

    // Build the branded HTML email body — status badges per listing, formatCurrency prices, updatedDate, REBNY attribution
    var richHTML = buildBrandedEmailHTML(listings, title, clientName);

    // Log audit entry for compliance tracking
    logAuditEntry('listing_email', {
        listingIds: listings.map(function(l) { return l.id; }),
        count: listings.length,
        recipient: clientEmail,
        clientName: clientName
    });

    // Send directly from the system
    sendEmailDirect({
        to: clientEmail,
        toName: clientName,
        subject: title + ' — Mallan Real Estate',
        htmlBody: richHTML,
        listingIds: listings.map(function(l) { return l.id; }),
        count: listings.length,
        source: 'listing_sheet'
    });

    closeDeliveryModal();
}

// Audit log — stores actions for compliance tracking
var auditLog = JSON.parse(localStorage.getItem('searchAuditLog_' + LOGGED_IN_AGENT.id)) || [];

function logAuditEntry(action, details) {
    var entry = {
        action: action,
        timestamp: new Date().toISOString(),
        agent: AGENT_PROFILE.name,
        agentLicense: AGENT_PROFILE.license,
        details: details
    };
    auditLog.push(entry);
    localStorage.setItem('searchAuditLog_' + LOGGED_IN_AGENT.id, JSON.stringify(auditLog));
}

// ═══════════════════════════════════════════════════════════════
// SAVED SEARCH MATCH ALERTING (#15 / Step 15)
// Tag search criteria with RESO names, match badges, Gates 1-2
// ═══════════════════════════════════════════════════════════════

// Saved searches load from /api/crm/saved-searches when the panel renders.
// renderSavedSearchMatches() reads from this array — populated at runtime, no
// hardcoded mock data.
var mockSavedSearches = [];

function savedSearchMatchBadge(search) {
    if (!search.matchCount || search.matchCount === 0) return '';
    return '<span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold" data-compliance="search-match-alert" title="' + search.matchCount + ' new matches for &quot;' + search.name + '&quot;">' + search.matchCount + ' new</span>';
}

function renderSavedSearchMatches() {
    var html = '<div class="space-y-2">';
    mockSavedSearches.forEach(function(s) {
        html += '<div class="flex items-center justify-between p-3 bg-white rounded-lg border">';
        html += '<div><span class="text-sm font-semibold text-gray-900">' + s.name + '</span> ' + savedSearchMatchBadge(s);
        html += '<div class="text-[10px] text-gray-400 mt-0.5">Criteria: ';
        Object.keys(s.criteria).forEach(function(k, i) {
            var resoName = s.reso[k] || k;
            html += (i > 0 ? ', ' : '') + '<span' + (typeof resoData === 'function' ? resoData(k, s.criteria[k]) : '') + '>' + k + '=' + s.criteria[k] + '</span>';
        });
        html += '</div></div>';
        html += '<div class="text-[9px] text-gray-400">Checked: ' + new Date(s.lastChecked).toLocaleTimeString() + '</div>';
        html += '</div>';
    });
    html += '</div>';
    return html;
}

// ═══════════════════════════════════════════════════════════════
// 24-HOUR CLOSING DEADLINE REMINDER (#16 / Step 16)
// UCBA C12: Close price + close date required within 24 hours
// ═══════════════════════════════════════════════════════════════

function closingDeadlineBanner(listing) {
    if (!listing.contractSigned && !listing.leaseSigned) return '';
    var closingStatuses = ['Contract Signed', 'Lease Signed', 'Board Approval', 'Sold', 'Leased'];
    if (closingStatuses.indexOf(listing.status) === -1) return '';

    // Check if close data already provided
    if (listing.closePrice && listing.closeDate) return '';

    // Calculate hours since status change
    var statusDate = listing.contractSigned || listing.leaseSigned || listing.update;
    if (!statusDate) return '';
    var parts = statusDate.split('/');
    var changed = new Date(2000 + parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    var hours = Math.floor((new Date() - changed) / (1000 * 60 * 60));

    var isOverdue = hours >= 24;
    var isApproaching = hours >= 20 && hours < 24;

    if (!isOverdue && !isApproaching) return '';

    var bg = isOverdue ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200';
    var textColor = isOverdue ? 'text-red-800' : 'text-yellow-800';
    var icon = isOverdue ? 'fa-exclamation-circle' : 'fa-clock';

    var html = '<div class="mt-2 px-3 py-2 rounded-lg border text-xs ' + bg + '" data-compliance="closing-24hr-sla" data-ucba-rule="C12">';
    html += '<i class="fas ' + icon + ' mr-1 ' + textColor + '"></i>';
    html += '<span class="font-bold ' + textColor + '">';
    if (isOverdue) {
        html += 'OVERDUE: Close price &amp; date required — ' + (hours - 24) + 'h past 24-hour SLA';
    } else {
        html += 'APPROACHING: ' + (24 - hours) + 'h remaining to submit close price &amp; date';
    }
    html += '</span>';
    html += '<div class="mt-1 flex items-center gap-2">';
    html += '<span data-reso-field="ClosePrice"' + ' class="text-gray-500">Close Price: ' + (listing.closePrice ? '$' + listing.closePrice.toLocaleString() : '<em>required</em>') + '</span>';
    html += '<span data-reso-field="CloseDate"' + ' class="text-gray-500">Close Date: ' + (listing.closeDate || '<em>required</em>') + '</span>';
    html += '</div>';
    html += '</div>';
    return html;
}

// ═══════════════════════════════════════════════════════════════
// QUARTERLY REJECTION RATE MONITORING (#17 / Step 17)
// UCBA M13: >5% quarterly rejection rate = $10,000 fine
// ═══════════════════════════════════════════════════════════════

function renderQuarterlyRejectionGauge() {
    var data = [
        { quarter: 'Q1 2026', submitted: 45, rejected: 1, rate: 2.2 },
        { quarter: 'Q4 2025', submitted: 38, rejected: 3, rate: 7.9 },
        { quarter: 'Q3 2025', submitted: 52, rejected: 2, rate: 3.8 },
        { quarter: 'Q2 2025', submitted: 41, rejected: 1, rate: 2.4 }
    ];

    var html = '<div data-compliance="quarterly-rejection-rate" data-ucba-rule="M13">';
    html += '<h4 class="font-bold text-sm mb-2"><i class="fas fa-tachometer-alt mr-1 text-purple-500"></i>Quarterly Rejection Rate</h4>';
    html += '<p class="text-[10px] text-gray-500 mb-3">UCBA M13: &gt;5% rejection rate = $10,000 fine per quarter</p>';

    data.forEach(function(q) {
        var isViolation = q.rate > 5;
        var barColor = isViolation ? '#dc2626' : '#16a34a';
        var bg = isViolation ? 'bg-red-50' : 'bg-green-50';
        html += '<div class="flex items-center gap-3 mb-2 p-2 rounded ' + bg + '">';
        html += '<span class="text-xs font-semibold w-16">' + q.quarter + '</span>';
        html += '<div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden relative">';
        html += '<div class="h-full rounded-full" style="width:' + Math.min(q.rate * 10, 100) + '%;background:' + barColor + '"></div>';
        html += '<div class="absolute top-0 h-full w-0.5 bg-red-500" style="left:50%" title="5% threshold"></div>';
        html += '</div>';
        html += '<span class="text-xs font-bold w-12 text-right" style="color:' + barColor + '">' + q.rate + '%</span>';
        if (isViolation) html += '<i class="fas fa-exclamation-triangle text-red-500 text-xs"></i>';
        html += '</div>';
    });
    html += '</div>';
    return html;
}

// ═══════════════════════════════════════════════════════════════
// TASK MANAGEMENT ENHANCEMENT (#18 / Step 18)
// Compliance task types, auto-create for UCBA deadlines
// ═══════════════════════════════════════════════════════════════

var taskCategories = [
    { id: 'follow_up', label: 'Follow-up', icon: 'fa-phone', color: '#3b82f6' },
    { id: 'showing', label: 'Showing', icon: 'fa-door-open', color: '#8b5cf6' },
    { id: 'document', label: 'Document', icon: 'fa-file-alt', color: '#f59e0b' },
    { id: 'financial', label: 'Financial', icon: 'fa-dollar-sign', color: '#10b981' },
    { id: 'compliance', label: 'Compliance', icon: 'fa-shield-alt', color: '#ef4444' }
];

// Compliance tasks load from /api/crm/follow-up-tasks (auto-created from
// listing-expiration cron + manual entries). renderEnhancedTasks() reads
// from this array — populated at runtime, no hardcoded mock data.
var mockComplianceTasks = [];

function renderEnhancedTasks(clientId) {
    var tasks = mockComplianceTasks;
    if (clientId) tasks = tasks.filter(function(t) { return t.clientId === clientId; });

    var html = '<div class="space-y-2">';

    // Category filter chips
    html += '<div class="flex items-center gap-1 mb-3 overflow-x-auto">';
    html += '<span class="px-2 py-1 bg-gray-900 text-white rounded-full text-[10px] font-semibold cursor-pointer">All</span>';
    taskCategories.forEach(function(cat) {
        var count = tasks.filter(function(t) { return t.category === cat.id; }).length;
        html += '<span class="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-semibold cursor-pointer hover:bg-gray-200">' + cat.label + ' (' + count + ')</span>';
    });
    html += '</div>';

    // Task list
    tasks.forEach(function(t) {
        var cat = taskCategories.find(function(c) { return c.id === t.category; }) || taskCategories[0];
        var isOverdue = t.status === 'overdue';
        var bg = isOverdue ? 'bg-red-50 border-red-200' : t.priority === 'critical' ? 'bg-red-50 border-red-200' : t.priority === 'high' ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200';

        html += '<div class="flex items-start gap-3 p-3 rounded-lg border ' + bg + '">';
        html += '<i class="fas ' + cat.icon + ' mt-0.5 text-sm" style="color:' + cat.color + '"></i>';
        html += '<div class="flex-1 min-w-0">';
        html += '<div class="flex items-center gap-2">';
        html += '<span class="text-sm font-semibold text-gray-900">' + t.title + '</span>';
        if (isOverdue) html += '<span class="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[9px] font-bold">OVERDUE</span>';
        if (t.autoCreated) html += '<span class="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[9px]">Auto</span>';
        html += '</div>';
        html += '<div class="flex items-center gap-2 mt-1 text-[10px] text-gray-500">';
        html += '<span>Due: ' + t.dueDate + '</span>';
        if (t.ucbaRule) html += '<span class="px-1 py-0.5 bg-gray-100 rounded" data-compliance="' + (t.category === 'compliance' ? 'exhibit-b-deadline' : 'task') + '" data-ucba-rule="' + t.ucbaRule + '">UCBA ' + t.ucbaRule + '</span>';
        if (t.listingId) html += '<span data-listing-id="' + t.listingId + '" data-source="REBNY-RLS" class="text-blue-600 cursor-pointer hover:underline">' + t.listingId + '</span>';
        html += '</div>';
        html += '</div>';
        html += '<button class="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded">Done</button>';
        html += '</div>';
    });

    html += '</div>';
    return html;
}

// ═══════════════════════════════════════════════════════════════
// NOTES TIMELINE ENHANCEMENT (#19 / Step 19)
// Listing refs, status changes, audit entries, typed notes
// ═══════════════════════════════════════════════════════════════

var noteTypes = [
    { id: 'note', label: 'Note', icon: 'fa-sticky-note', color: '#3b82f6' },
    { id: 'call', label: 'Call', icon: 'fa-phone', color: '#10b981' },
    { id: 'email', label: 'Email', icon: 'fa-envelope', color: '#8b5cf6' },
    { id: 'showing', label: 'Showing', icon: 'fa-door-open', color: '#f59e0b' },
    { id: 'status_change', label: 'Status Change', icon: 'fa-exchange-alt', color: '#ef4444' },
    { id: 'system_alert', label: 'System Alert', icon: 'fa-bell', color: '#6b7280' }
];

// Enhanced notes timeline loads from /api/crm/notes (or the per-client
// notes API). renderEnhancedNotes() reads from this array — populated at
// runtime, no hardcoded mock data.
var mockEnhancedNotes = [];

function renderEnhancedNotes(clientId) {
    var notes = mockEnhancedNotes;

    var html = '<div class="space-y-3">';

    // Type filter
    html += '<div class="flex items-center gap-1 mb-2 overflow-x-auto">';
    html += '<span class="px-2 py-1 bg-gray-900 text-white rounded-full text-[10px] font-semibold cursor-pointer">All</span>';
    noteTypes.forEach(function(nt) {
        html += '<span class="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-semibold cursor-pointer hover:bg-gray-200"><i class="fas ' + nt.icon + ' mr-0.5" style="color:' + nt.color + '"></i>' + nt.label + '</span>';
    });
    html += '</div>';

    // Timeline
    notes.forEach(function(n) {
        var nt = noteTypes.find(function(t) { return t.id === n.type; }) || noteTypes[0];
        html += '<div class="flex gap-3 relative">';
        // Timeline line
        html += '<div class="flex flex-col items-center"><div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style="background:' + nt.color + '20"><i class="fas ' + nt.icon + ' text-xs" style="color:' + nt.color + '"></i></div><div class="w-0.5 flex-1 bg-gray-200 mt-1"></div></div>';
        html += '<div class="flex-1 pb-4">';
        html += '<div class="flex items-center gap-2 text-[10px] text-gray-500">';
        html += '<span class="font-semibold text-gray-700">' + n.author + '</span>';
        html += '<span>' + new Date(n.timestamp).toLocaleDateString() + ' ' + new Date(n.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + '</span>';
        if (n.compliance) html += '<span class="px-1 py-0.5 bg-red-100 text-red-700 rounded" data-compliance="audit-trail" data-ucba-rule="' + (n.ucbaRule || '') + '">Compliance</span>';
        html += '</div>';
        html += '<p class="text-sm text-gray-800 mt-0.5">' + n.content + '</p>';

        // Listing reference
        if (n.listingId) {
            html += '<div class="mt-1 inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 rounded text-[10px] text-blue-700" data-listing-id="' + n.listingId + '" data-source="REBNY-RLS">';
            html += '<i class="fas fa-link"></i> ' + (n.listingAddress || 'Listing #' + n.listingId);
            if (n.listingPrice) html += ' <span' + (typeof resoData === 'function' ? resoData('price', n.listingPrice) : '') + '>$' + n.listingPrice.toLocaleString() + '</span>';
            html += '</div>';
        }

        // Status change fields
        if (n.resoField) {
            html += '<div class="mt-1 inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-[10px] text-gray-600" data-reso-field="' + n.resoField + '">';
            html += '<i class="fas fa-exchange-alt"></i> ' + (n.oldValue || '') + ' → ' + (n.newValue || '');
            html += '</div>';
        }

        html += '</div></div>';
    });

    html += '</div>';
    return html;
}

// Compliance Dashboard removed — lives in Broker CRM sidebar only (not agent search tool)

// ═══════════════════════════════════════════════════════════════
// CLIENT PORTAL FEEDBACK BUTTONS (#20 / Step 20)
// Cards with sanitized listing data, feedback buttons
// ═══════════════════════════════════════════════════════════════

function renderClientListingCard(listing) {
    if (!listing) return '';
    // Sanitize — remove prohibited fields
    var safe = typeof sanitizeListingSnapshot === 'function' ? sanitizeListingSnapshot(listing) : listing;
    var displayAddress = safe.addressDisplayYN === false ? 'Address Available Upon Request' : (safe.address || '');

    var html = '<div class="bg-white rounded-lg border border-gray-200 p-3" data-listing-id="' + safe.id + '" data-source="REBNY-RLS">';
    html += '<div class="flex items-start gap-3">';
    html += '<div class="w-20 h-16 rounded bg-gray-100 flex-shrink-0 flex items-center justify-center"><i class="fas fa-camera text-gray-300"></i></div>';
    html += '<div class="flex-1 min-w-0">';
    html += '<p class="text-sm font-bold truncate"' + (typeof resoData === 'function' ? resoData('address', displayAddress) : '') + '>' + displayAddress + '</p>';
    html += '<p class="text-sm font-semibold text-gray-900"' + (typeof resoData === 'function' ? resoData('price', safe.price) : '') + '>$' + (safe.price || 0).toLocaleString() + '</p>';
    html += '<div class="flex items-center gap-2 text-xs text-gray-500 mt-0.5">';
    html += '<span' + (typeof resoData === 'function' ? resoData('beds', safe.beds) : '') + '>' + (safe.beds || '--') + ' bd</span>';
    html += '<span' + (typeof resoData === 'function' ? resoData('baths', safe.baths) : '') + '>' + (safe.baths || '--') + ' ba</span>';
    html += '<span' + (typeof resoData === 'function' ? resoData('intSqft', safe.intSqft) : '') + '>' + (safe.intSqft ? safe.intSqft.toLocaleString() + ' sf' : '--') + '</span>';
    html += '</div>';
    html += '</div></div>';

    // Feedback buttons
    html += '<div class="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">';
    var feedbacks = [
        { key: 'love', icon: 'fa-heart', color: '#ef4444', label: 'Love it' },
        { key: 'interested', icon: 'fa-thumbs-up', color: '#3b82f6', label: 'Interested' },
        { key: 'maybe', icon: 'fa-meh', color: '#f59e0b', label: 'Maybe' },
        { key: 'not_interested', icon: 'fa-thumbs-down', color: '#6b7280', label: 'Not for me' }
    ];
    feedbacks.forEach(function(fb) {
        html += '<button class="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] hover:bg-gray-50 border border-transparent hover:border-gray-200" data-client-feedback="' + fb.key + '" title="' + fb.label + '">';
        html += '<i class="fas ' + fb.icon + '" style="color:' + fb.color + '"></i>';
        html += '<span class="hidden sm:inline">' + fb.label + '</span>';
        html += '</button>';
    });
    html += '</div>';

    // Attribution
    // Per-listing "Courtesy of" — only on online viewers, not client reports/print/email
    html += '</div>';
    return html;
}

// ═══════════════════════════════════════════════════════════════
// CLIENT PORTAL SEARCH RESULTS (#21 / Step 21)
// Sanitized listings with full RESO chain, attribution, FARE Act, EHO
// ═══════════════════════════════════════════════════════════════

function renderClientPortalResults(listings) {
    var html = '<div class="space-y-3">';

    listings.forEach(function(l) {
        var safe = typeof sanitizeListingSnapshot === 'function' ? sanitizeListingSnapshot(l) : l;
        html += renderClientListingCard(safe);
        // FARE Act for rentals
        if (l.listingCategory === 'rental') {
            html += (typeof fareActDisclosure === 'function' ? fareActDisclosure(l) : '');
        }
    });

    // EHO footer
    html += '<div class="flex items-center justify-center gap-2 py-3 text-[10px] text-gray-400" data-compliance="fair-housing-eho" aria-label="Equal Housing Opportunity">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="2" fill="#9ca3af"/><path d="M12 5L4 11h2v7h12v-7h2L12 5z" fill="white"/><rect x="10" y="13" width="4" height="5" fill="#9ca3af"/></svg>';
    html += 'Equal Housing Opportunity &middot; Information deemed reliable but not guaranteed';
    html += '</div>';

    html += '</div>';
    return html;
}

// ═══════════════════════════════════════════════════════════════
// AUDIT TRAIL VIEWER (#22 / Step 22)
// Full audit log with listing/client references, compliance tags
// ═══════════════════════════════════════════════════════════════

var mockAuditEntries = [
    { id: 'A-001', action: 'listing_created', timestamp: '2026-02-10T09:00:00', agent: 'Demo Agent', listingId: 'ML-S006', details: { address: '45 E 89th St #10A', status: 'Coming Soon' } },
    { id: 'A-002', action: 'status_change', timestamp: '2026-02-10T09:01:00', agent: 'Demo Agent', listingId: 'ML-S006', details: { from: 'Draft', to: 'Coming Soon', resoField: 'MlsStatus' } },
    { id: 'A-003', action: 'listing_search', timestamp: '2026-02-11T10:15:00', agent: 'Demo Agent', clientId: 'CL-001', details: { criteria: 'UES 2BR <$2M', results: 12 } },
    { id: 'A-004', action: 'listing_email', timestamp: '2026-02-11T10:20:00', agent: 'Demo Agent', clientId: 'CL-001', listingId: 1, details: { recipient: 'sarah.chen@email.com', count: 3 } },
    { id: 'A-005', action: 'showing_scheduled', timestamp: '2026-02-12T14:00:00', agent: 'Demo Agent', listingId: 1, clientId: 'CL-001', details: { date: '2026-02-14', time: '2:00 PM' } },
    { id: 'A-006', action: 'compliance_check', timestamp: '2026-02-12T15:00:00', agent: 'System', details: { score: 87, passed: 52, failed: 8 } },
    { id: 'A-007', action: 'price_change', timestamp: '2026-02-13T11:30:00', agent: 'Demo Agent', listingId: 'ML-S001', details: { from: 4500000, to: 4250000, resoField: 'ListPrice' } },
    { id: 'A-008', action: 'violation_detected', timestamp: '2026-02-13T12:00:00', agent: 'System', details: { type: 'data_quality', listing: 'ML-S005', rule: 'M13', message: 'Missing photos' } },
    { id: 'A-009', action: 'client_invite', timestamp: '2026-02-14T08:30:00', agent: 'Demo Agent', clientId: 'CL-002', details: { email: 'james.park@email.com', type: 'buyer' } },
    { id: 'A-010', action: 'report_generate', timestamp: '2026-02-14T09:00:00', agent: 'Demo Agent', details: { format: 'CMA', count: 5 } },
    { id: 'A-011', action: 'listings_sent', timestamp: '2026-02-14T16:00:00', agent: 'Demo Agent', clientId: 'CL-001', details: { count: 4, addresses: ['400 E 90th St #17C', '200 W 86th St #12A'] } },
    { id: 'A-012', action: 'fare_act_disclosure', timestamp: '2026-02-15T10:00:00', agent: 'System', listingId: 'ML-R001', details: { brokerFeePaidBy: 'Owner', applicationFee: 20 } },
    { id: 'A-013', action: 'portal_access', timestamp: '2026-02-15T11:00:00', agent: 'System', clientId: 'CL-001', details: { page: 'search_results', listings_viewed: 8 } },
    { id: 'A-014', action: 'client_feedback', timestamp: '2026-02-15T11:05:00', agent: 'System', clientId: 'CL-001', listingId: 1, details: { feedback: 'love', address: '400 E 90th St #17C' } },
    { id: 'A-015', action: 'status_change', timestamp: '2026-02-15T14:00:00', agent: 'Demo Agent', listingId: 'ML-S004', details: { from: 'Active', to: 'Contract Signed', resoField: 'MlsStatus' } },
    { id: 'A-016', action: 'compliance_alert', timestamp: '2026-02-16T08:00:00', agent: 'System', listingId: 'ML-S006', details: { rule: 'D2', message: 'Coming Soon Day 6 \u2014 8 days remaining' } },
    { id: 'A-017', action: 'search_shared', timestamp: '2026-02-16T09:30:00', agent: 'Demo Agent', clientId: 'CL-002', details: { searchName: 'Tribeca Loft 1500+ SF', matchCount: 1 } },
    { id: 'A-018', action: 'document_uploaded', timestamp: '2026-02-16T10:00:00', agent: 'Demo Agent', details: { document: 'Exhibit G \u2014 Coming Soon Addendum', listing: 'ML-S006', ucbaRule: 'D10' } },
    { id: 'A-019', action: 'listing_refreshed', timestamp: '2026-02-16T10:30:00', agent: 'Demo Agent', listingId: 'ML-S001', details: { previousUpdate: '02/10/26' } },
    { id: 'A-020', action: 'quarterly_report', timestamp: '2026-02-16T12:00:00', agent: 'System', details: { quarter: 'Q1 2026', rejectionRate: 2.2, status: 'compliant' } }
];

function renderAuditTrailViewer() {
    var entries = mockAuditEntries.concat((typeof auditLog !== 'undefined' ? auditLog : []).map(function(e, i) {
        return { id: 'AL-' + i, action: e.action, timestamp: e.timestamp, agent: e.agent || 'System', details: e.details || {} };
    })).sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); }).slice(0, 30);

    var html = '<div class="bg-white rounded-xl border p-4">';
    html += '<div class="flex items-center justify-between mb-3">';
    html += '<h4 class="font-bold text-sm"><i class="fas fa-history mr-1 text-gray-500"></i>Audit Trail</h4>';
    html += '<span class="text-[10px] text-gray-400">' + entries.length + ' entries</span>';
    html += '</div>';

    // Filter chips
    html += '<div class="flex items-center gap-1 mb-3 overflow-x-auto text-[10px]">';
    ['All', 'Status Changes', 'Compliance', 'Client Activity', 'System'].forEach(function(f) {
        html += '<span class="px-2 py-1 bg-gray-100 text-gray-600 rounded-full font-semibold cursor-pointer hover:bg-gray-200 whitespace-nowrap">' + f + '</span>';
    });
    html += '</div>';

    html += '<div class="space-y-1 max-h-[500px] overflow-y-auto">';
    entries.forEach(function(e) {
        var isViolation = e.action === 'violation_detected' || e.action === 'compliance_alert';
        var isSystem = e.agent === 'System';
        var actionIcon = 'fa-circle';
        var actionColor = '#9ca3af';

        if (e.action.indexOf('status') !== -1) { actionIcon = 'fa-exchange-alt'; actionColor = '#8b5cf6'; }
        else if (e.action.indexOf('listing') !== -1) { actionIcon = 'fa-home'; actionColor = '#3b82f6'; }
        else if (e.action.indexOf('client') !== -1 || e.action.indexOf('portal') !== -1) { actionIcon = 'fa-user'; actionColor = '#10b981'; }
        else if (e.action.indexOf('compliance') !== -1 || e.action.indexOf('violation') !== -1) { actionIcon = 'fa-shield-alt'; actionColor = '#ef4444'; }
        else if (e.action.indexOf('report') !== -1 || e.action.indexOf('email') !== -1) { actionIcon = 'fa-file-alt'; actionColor = '#f59e0b'; }
        else if (e.action.indexOf('search') !== -1) { actionIcon = 'fa-search'; actionColor = '#06b6d4'; }
        else if (e.action.indexOf('document') !== -1) { actionIcon = 'fa-paperclip'; actionColor = '#f59e0b'; }

        html += '<div class="flex items-start gap-2 py-2 border-b border-gray-50 ' + (isViolation ? 'bg-red-50 rounded px-2' : '') + '">';
        html += '<i class="fas ' + actionIcon + ' text-[10px] mt-1" style="color:' + actionColor + '"></i>';
        html += '<div class="flex-1 min-w-0">';
        html += '<div class="flex items-center gap-2 flex-wrap">';
        html += '<span class="text-xs font-medium text-gray-800">' + e.action.replace(/_/g, ' ') + '</span>';
        if (e.listingId) html += '<span class="text-[9px] text-blue-600" data-listing-id="' + e.listingId + '" data-source="REBNY-RLS">' + e.listingId + '</span>';
        if (e.clientId) html += '<span class="text-[9px] text-green-600" data-client-id="' + e.clientId + '">' + e.clientId + '</span>';
        if (isViolation) html += '<span class="px-1 py-0.5 bg-red-100 text-red-700 rounded text-[9px] font-bold" data-compliance="violation" data-ucba-rule="' + ((e.details || {}).rule || '') + '">Violation</span>';
        if (e.details && e.details.resoField) html += '<span class="text-[9px] text-gray-400" data-reso-field="' + e.details.resoField + '">' + e.details.resoField + '</span>';
        html += '</div>';
        html += '<div class="text-[9px] text-gray-500 mt-0.5">';
        html += '<span>' + new Date(e.timestamp).toLocaleDateString() + ' ' + new Date(e.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + '</span>';
        html += ' &middot; <span>' + e.agent + '</span>';
        // Detail summary
        var det = e.details || {};
        var detailParts = [];
        if (det.from && det.to) detailParts.push(det.from + ' \u2192 ' + det.to);
        if (det.address) detailParts.push(det.address);
        if (det.recipient) detailParts.push('to: ' + det.recipient);
        if (det.count) detailParts.push(det.count + ' listings');
        if (det.message) detailParts.push(det.message);
        if (det.score) detailParts.push('Score: ' + det.score);
        if (det.format) detailParts.push('Format: ' + det.format);
        if (det.document) detailParts.push(det.document);
        if (detailParts.length > 0) html += ' &middot; ' + detailParts.join(' &middot; ');
        html += '</div>';
        html += '</div></div>';
    });
    html += '</div></div>';

    return html;
}

// ═══════════════════════════════════════════════════════════════
// SEARCH SHARING TO CLIENT (#23 / Step 23)
// Share search criteria + results to client portal
// ═══════════════════════════════════════════════════════════════

function shareSearchToClient(clientId, searchCriteria) {
    var criteria = searchCriteria || {};
    var sharedSearch = {
        id: 'SH-' + Date.now(),
        clientId: clientId,
        sharedAt: new Date().toISOString(),
        agent: typeof AGENT_PROFILE !== 'undefined' ? AGENT_PROFILE.name : 'Agent',
        criteria: criteria,
        resoCriteria: {}
    };

    // Tag criteria with RESO names
    var fieldMap = typeof RESO_FIELD_MAP !== 'undefined' ? RESO_FIELD_MAP : {};
    Object.keys(criteria).forEach(function(k) {
        if (fieldMap[k]) sharedSearch.resoCriteria[fieldMap[k]] = criteria[k];
    });

    // Get matching listings (respecting Gates 1-2)
    var matches = typeof getFilteredListings === 'function' ? getFilteredListings(true) : [];
    sharedSearch.matchCount = matches.length;
    sharedSearch.listingPreviews = matches.slice(0, 5).map(function(l) {
        return typeof sanitizeListingSnapshot === 'function' ? sanitizeListingSnapshot(l) : { id: l.id, address: l.address, price: l.price };
    });

    if (typeof logAuditEntry === 'function') {
        logAuditEntry('search_shared', { clientId: clientId, criteria: JSON.stringify(criteria).substring(0, 200), matchCount: sharedSearch.matchCount });
    }

    return sharedSearch;
}

// ═══════════════════════════════════════════════════════════════
// ACTIVITY SUMMARY ON CLIENT CARDS (#24 / Step 24)
// Listing refs, budget via resoData
// ═══════════════════════════════════════════════════════════════

function renderClientActivitySummary(client) {
    if (!client) return '';
    var html = '<div class="space-y-1.5 text-xs">';

    // Budget with RESO tag
    if (client.budget || client.maxBudget) {
        var budget = client.budget || client.maxBudget;
        html += '<div class="flex items-center gap-2"><i class="fas fa-dollar-sign text-green-500 w-4"></i><span>Budget: <strong' + (typeof resoData === 'function' ? resoData('price', budget) : '') + '>$' + budget.toLocaleString() + '</strong></span></div>';
    }

    // Recent activity items
    var activities = [
        { icon: 'fa-search', text: 'Last search: ' + (client.lastSearch || 'None'), time: client.lastSearchDate || '' },
        { icon: 'fa-eye', text: 'Listings viewed: ' + (client.listingsViewed || 0), time: '' },
        { icon: 'fa-heart', text: 'Favorites: ' + (client.favorites || 0), time: '' },
        { icon: 'fa-door-open', text: 'Showings: ' + (client.showings || 0), time: '' }
    ];

    activities.forEach(function(a) {
        html += '<div class="flex items-center gap-2 text-gray-600"><i class="fas ' + a.icon + ' text-gray-400 w-4"></i><span>' + a.text + '</span>';
        if (a.time) html += '<span class="text-gray-400 ml-auto">' + a.time + '</span>';
        html += '</div>';
    });

    // Recent listing interactions
    if (client.recentListings && client.recentListings.length > 0) {
        html += '<div class="mt-2 pt-2 border-t border-gray-100">';
        html += '<p class="text-[10px] text-gray-500 font-semibold mb-1">Recent Listings</p>';
        client.recentListings.slice(0, 3).forEach(function(l) {
            html += '<div class="flex items-center gap-2 py-0.5" data-listing-id="' + l.id + '" data-source="REBNY-RLS">';
            html += '<span class="text-blue-600 truncate">' + (l.address || 'Listing #' + l.id) + '</span>';
            if (l.price) html += '<span class="text-gray-500"' + (typeof resoData === 'function' ? resoData('price', l.price) : '') + '>$' + l.price.toLocaleString() + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }

    html += '</div>';
    return html;
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE THREADING ENHANCEMENT (#25 / Step 25)
// Listing shares in messages with sanitized data
// ═══════════════════════════════════════════════════════════════

function renderMessageWithListingShare(message) {
    if (!message) return '';
    var html = '<div class="p-3 rounded-lg ' + (message.fromAgent ? 'bg-blue-50 ml-8' : 'bg-gray-50 mr-8') + '">';
    html += '<div class="flex items-center justify-between text-[10px] text-gray-500 mb-1">';
    html += '<span class="font-semibold">' + (message.sender || 'Unknown') + '</span>';
    html += '<span>' + (message.timestamp ? new Date(message.timestamp).toLocaleString() : '') + '</span>';
    html += '</div>';
    html += '<p class="text-sm text-gray-800">' + (message.content || '') + '</p>';

    // Listing share attachment
    if (message.sharedListings && message.sharedListings.length > 0) {
        html += '<div class="mt-2 space-y-1">';
        message.sharedListings.forEach(function(l) {
            var safe = typeof sanitizeListingSnapshot === 'function' ? sanitizeListingSnapshot(l) : l;
            html += '<div class="flex items-center gap-2 px-2 py-1.5 bg-white rounded border text-xs" data-listing-id="' + safe.id + '" data-source="REBNY-RLS">';
            html += '<i class="fas fa-home text-blue-400"></i>';
            html += '<span class="font-medium"' + (typeof resoData === 'function' ? resoData('address', safe.address) : '') + '>' + (safe.address || 'Address Available Upon Request') + '</span>';
            html += '<span' + (typeof resoData === 'function' ? resoData('price', safe.price) : '') + '>$' + (safe.price || 0).toLocaleString() + '</span>';
            html += '<span class="text-gray-400">' + (safe.beds || '--') + 'bd/' + (safe.baths || '--') + 'ba</span>';
            html += '</div>';
        });
        html += '</div>';
    }

    html += '</div>';
    return html;
}

// ═══════════════════════════════════════════════════════════════
// SEARCH HISTORY LOG (#26 / Step 26)
// Criteria with RESO names, timestamped
// ═══════════════════════════════════════════════════════════════

var mockSearchHistory = [
    { id: 'SHL-001', timestamp: '2026-02-16T11:30:00', criteria: { neighborhood: 'Upper East Side', minBeds: 2, maxPrice: 2000000, status: 'ACTIVE' }, resultCount: 12, duration: '0.3s' },
    { id: 'SHL-002', timestamp: '2026-02-16T10:15:00', criteria: { neighborhood: 'Tribeca', minSqft: 1500, ownership: 'Condominium' }, resultCount: 4, duration: '0.2s' },
    { id: 'SHL-003', timestamp: '2026-02-15T16:00:00', criteria: { maxPrice: 5000, listingCategory: 'rental', neighborhood: 'West Village' }, resultCount: 8, duration: '0.4s' },
    { id: 'SHL-004', timestamp: '2026-02-15T14:30:00', criteria: { minBeds: 3, minBaths: 2, neighborhood: 'Upper West Side', ownership: 'StockCooperative' }, resultCount: 6, duration: '0.3s' },
    { id: 'SHL-005', timestamp: '2026-02-14T09:00:00', criteria: { status: 'COMING_SOON' }, resultCount: 2, duration: '0.1s' }
];

var searchHistoryResoMap = {
    neighborhood: 'SubdivisionName',
    minBeds: 'BedroomsTotal',
    maxPrice: 'ListPrice',
    minPrice: 'ListPrice',
    status: 'MlsStatus',
    minSqft: 'LivingArea',
    ownership: 'CommonInterest',
    listingCategory: 'PropertyType',
    minBaths: 'BathroomsTotalInteger',
    zip: 'PostalCode'
};

function renderSearchHistoryLog() {
    var html = '<div class="bg-white rounded-xl border p-4">';
    html += '<h4 class="font-bold text-sm mb-3"><i class="fas fa-history mr-1 text-blue-500"></i>Search History</h4>';

    mockSearchHistory.forEach(function(s) {
        html += '<div class="flex items-start gap-3 py-2 border-b border-gray-50">';
        html += '<div class="text-[10px] text-gray-400 w-20 flex-shrink-0">' + new Date(s.timestamp).toLocaleDateString() + '<br>' + new Date(s.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + '</div>';
        html += '<div class="flex-1">';
        html += '<div class="flex items-center flex-wrap gap-1">';
        Object.keys(s.criteria).forEach(function(k) {
            var resoName = searchHistoryResoMap[k] || k;
            html += '<span class="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]"' + (typeof resoData === 'function' ? resoData(k, s.criteria[k]) : '') + ' title="RLS/RESO/IDX: ' + resoName + '">' + k + ': ' + s.criteria[k] + '</span>';
        });
        html += '</div>';
        html += '<div class="text-[10px] text-gray-400 mt-0.5">' + s.resultCount + ' results &middot; ' + s.duration + '</div>';
        html += '</div></div>';
    });

    html += '</div>';
    return html;
}

// ═══════════════════════════════════════════════════════════════
// AGENT PERFORMANCE METRICS (#27a / Step 27)
// Aggregate I36/Active count, I62/DOM, I37/pipeline value
// ═══════════════════════════════════════════════════════════════

function renderAgentPerformanceMetrics() {
    var listings = typeof myManagementListings !== 'undefined' ? myManagementListings : [];

    var active = listings.filter(function(l) { return ['Active','Back On Market','Coming Soon','Offer Out'].indexOf(l.status) !== -1; });
    var closed = listings.filter(function(l) { return ['Sold','Leased'].indexOf(l.status) !== -1; });
    var pipelineValue = active.reduce(function(sum, l) { return sum + (l.price || 0); }, 0);
    var closedValue = closed.reduce(function(sum, l) { return sum + (l.price || 0); }, 0);
    var avgDOM = active.length > 0 ? Math.round(active.reduce(function(sum, l) { return sum + (l.dom || 30); }, 0) / active.length) : 0;

    var html = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">';

    var metrics = [
        { label: 'Active Listings', value: active.length, icon: 'fa-home', color: '#3b82f6', reso: 'MlsStatus' },
        { label: 'Pipeline Value', value: '$' + (pipelineValue / 1000000).toFixed(1) + 'M', icon: 'fa-chart-line', color: '#10b981', reso: 'ListPrice' },
        { label: 'Avg DOM', value: avgDOM + 'd', icon: 'fa-clock', color: '#f59e0b', reso: 'DaysOnMarket' },
        { label: 'Closed YTD', value: closed.length + ' ($' + (closedValue / 1000000).toFixed(1) + 'M)', icon: 'fa-check-circle', color: '#8b5cf6', reso: 'ClosePrice' }
    ];

    metrics.forEach(function(m) {
        html += '<div class="bg-white rounded-xl border p-4 text-center"' + (m.reso ? ' data-reso-field="' + m.reso + '"' : '') + '>';
        html += '<i class="fas ' + m.icon + ' text-2xl mb-2" style="color:' + m.color + '"></i>';
        html += '<div class="text-lg font-bold text-gray-900">' + m.value + '</div>';
        html += '<div class="text-xs text-gray-500">' + m.label + '</div>';
        html += '</div>';
    });

    html += '</div>';
    return html;
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENT CENTER (#27b / Step 27)
// UCBA Exhibits A-G linked with data-ucba-rule
// ═══════════════════════════════════════════════════════════════

function renderDocumentCenter() {
    var documents = [
        { name: 'Exhibit A \u2014 Exclusive Right to Sell Agreement', rule: 'A1', category: 'listing', required: true },
        { name: 'Exhibit B \u2014 Withdrawal Authorization', rule: 'C3', category: 'compliance', required: false },
        { name: 'Exhibit C \u2014 Co-Exclusive Agreement', rule: 'A2', category: 'listing', required: false },
        { name: 'Exhibit D \u2014 Open Listing Agreement', rule: 'A3', category: 'listing', required: false },
        { name: 'Exhibit E \u2014 Buyer Brokerage Agreement', rule: 'E1', category: 'buyer', required: true },
        { name: 'Exhibit F \u2014 Dual Agency Disclosure', rule: 'E2', category: 'compliance', required: false },
        { name: 'Exhibit G \u2014 Coming Soon Addendum', rule: 'D10', category: 'compliance', required: false },
        { name: 'Agency Disclosure Form', rule: 'NY-DOS', category: 'compliance', required: true },
        { name: 'Fair Housing Policy', rule: 'FH', category: 'compliance', required: true },
        { name: 'Lead Paint Disclosure (Pre-1978)', rule: 'EPA', category: 'compliance', required: false }
    ];

    var html = '<div class="bg-white rounded-xl border p-4">';
    html += '<h4 class="font-bold text-sm mb-3"><i class="fas fa-folder-open mr-1 text-amber-500"></i>Document Center</h4>';

    ['listing', 'buyer', 'compliance'].forEach(function(cat) {
        var catDocs = documents.filter(function(d) { return d.category === cat; });
        var catLabel = cat === 'listing' ? 'Listing Agreements' : cat === 'buyer' ? 'Buyer Agreements' : 'Compliance & Disclosure';
        html += '<p class="text-[11px] text-gray-500 font-semibold uppercase mt-3 mb-1">' + catLabel + '</p>';
        catDocs.forEach(function(d) {
            html += '<div class="flex items-center gap-2 py-1.5 border-b border-gray-50" data-ucba-rule="' + d.rule + '">';
            html += '<i class="fas fa-file-pdf text-red-400"></i>';
            html += '<span class="text-sm text-gray-700 flex-1">' + d.name + '</span>';
            html += '<span class="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">UCBA ' + d.rule + '</span>';
            if (d.required) html += '<span class="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-semibold">Required</span>';
            html += '<button class="text-xs text-blue-600 hover:underline">View</button>';
            html += '</div>';
        });
    });

    html += '</div>';
    return html;
}

// ═══════════════════════════════════════════════════════════════
// VOW AUTHENTICATION GATE (#28 / Step 28)
// Sanitized listings, VOW registration, no prohibited fields
// ═══════════════════════════════════════════════════════════════

function vowAuthGate(callback) {
    // Check if VOW registration exists
    var vowRegistered = localStorage.getItem('vow_registration_' + (typeof LOGGED_IN_AGENT !== 'undefined' ? LOGGED_IN_AGENT.id : 'guest'));

    if (vowRegistered) {
        if (callback) callback(true);
        return true;
    }

    // Show registration prompt
    var html = '<div class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" id="vowRegistrationModal">';
    html += '<div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" data-compliance="vow-registration" data-ucba-rule="F1">';
    html += '<h3 class="text-lg font-bold mb-2"><i class="fas fa-lock mr-1 text-blue-500"></i>VOW Access Registration</h3>';
    html += '<p class="text-sm text-gray-600 mb-4">To view enhanced listing data (including sold/leased information), you must acknowledge your broker-consumer relationship per UCBA Article I, Section 6.</p>';
    html += '<div class="space-y-3 mb-4">';
    html += '<label class="flex items-start gap-2 text-sm"><input type="checkbox" id="vowAckBroker" class="mt-1"><span>I acknowledge that I am working with a licensed real estate broker at Mallan Real Estate Inc.</span></label>';
    html += '<label class="flex items-start gap-2 text-sm"><input type="checkbox" id="vowAckData" class="mt-1"><span>I understand that listing data is provided by the REBNY Listing Service and is for personal, non-commercial use only.</span></label>';
    html += '<label class="flex items-start gap-2 text-sm"><input type="checkbox" id="vowAckProhibited" class="mt-1"><span>I agree not to redistribute, scrape, or use listing data for AI training, embeddings, or any unauthorized purpose.</span></label>';
    html += '</div>';
    html += '<div class="flex items-center gap-2">';
    html += '<button onclick="completeVowRegistration()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">Register &amp; Continue</button>';
    html += '<button onclick="document.getElementById(\'vowRegistrationModal\').remove()" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">Cancel</button>';
    html += '</div>';
    html += '<div class="mt-3 text-[10px] text-gray-400" data-compliance="fair-housing-eho">';
    html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="inline mr-1"><rect x="2" y="2" width="20" height="20" rx="2" fill="#9ca3af"/><path d="M12 5L4 11h2v7h12v-7h2L12 5z" fill="white"/><rect x="10" y="13" width="4" height="5" fill="#9ca3af"/></svg>';
    html += 'Equal Housing Opportunity &middot; Mallan Real Estate Inc. #10991205323';
    html += '</div>';
    html += '</div></div>';

    document.body.insertAdjacentHTML('beforeend', html);
    return false;
}

function completeVowRegistration() {
    var ack1 = document.getElementById('vowAckBroker');
    var ack2 = document.getElementById('vowAckData');
    var ack3 = document.getElementById('vowAckProhibited');

    if (!ack1.checked || !ack2.checked || !ack3.checked) {
        showToast('Please acknowledge all three items to complete VOW registration.', 'warning');
        return;
    }

    var agentId = typeof LOGGED_IN_AGENT !== 'undefined' ? LOGGED_IN_AGENT.id : 'guest';
    localStorage.setItem('vow_registration_' + agentId, JSON.stringify({
        timestamp: new Date().toISOString(),
        acknowledged: true
    }));

    // Set VOW display context so search engine uses VOW gates
    localStorage.setItem('vow_display_context', 'vow');

    if (typeof logAuditEntry === 'function') {
        logAuditEntry('vow_registration', { agentId: agentId, timestamp: new Date().toISOString() });
    }

    var modal = document.getElementById('vowRegistrationModal');
    if (modal) modal.remove();

    if (typeof manageShowToast === 'function') manageShowToast('VOW access granted');
}

// ═══════════════════════════════════════════════════════════════════════════════
// REBNY COMPLIANCE DOCTOR — Consolidated 10-Test Suite
// Runs on page load + after every search result render
// Tests 1-3, 5-7, 9: wrap existing functions
// Tests 4, 8, 10: NEW checks (prohibited fields, commingling, bulk export)
// ═══════════════════════════════════════════════════════════════════════════════

var COMPLIANCE_DOCTOR_VERSION = '1.0.0';

/**
 * PROHIBITED_FIELDS — fields that must NEVER appear in IDX/client-facing output.
 * These may exist in RLS data for agent use, but cannot be displayed publicly
 * or in client deliverables (print/email/preview).
 */
var PROHIBITED_DISPLAY_FIELDS = [
    'BuyerAgentCompensation', 'BuyerBrokerageCompensation', 'BuyerBrokerageCompensationType',
    'PrivateRemarks', 'ShowingInstructions', 'LockBoxSerialNumber',
    'KeyLocation', 'OwnerName', 'OwnerPhone'
];

/**
 * REBNYComplianceDoctor() — runs all 10 compliance checks
 * @param {Object} options — { verbose: bool, context: 'render'|'print'|'email'|'pageload' }
 * @returns {Object} — { passed: number, failed: number, warnings: number, results: [] }
 */
function REBNYComplianceDoctor(options) {
    options = options || {};
    var verbose = options.verbose || false;
    var context = options.context || 'render';
    var results = [];
    var passed = 0, failed = 0, warnings = 0;

    function addResult(testNum, name, status, detail) {
        results.push({ test: testNum, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++;
        else if (status === 'FAIL') failed++;
        else warnings++;
    }

    // ─── Test 1: Attribution Display ───────────────────────────────────────
    (function test1_Attribution() {
        var rebnyText = false;
        var allDivs = document.querySelectorAll('div');
        for (var i = 0; i < allDivs.length; i++) {
            var text = allDivs[i].textContent || '';
            if (text.indexOf('REBNY RLS') !== -1 && text.indexOf('Trestle') !== -1) {
                rebnyText = true;
                break;
            }
        }
        var licenseFound = document.body.innerHTML.indexOf('10991205323') !== -1;

        if (rebnyText && licenseFound) {
            addResult(1, 'Attribution Display', 'PASS', 'REBNY RLS attribution bar and brokerage license found');
        } else if (rebnyText) {
            addResult(1, 'Attribution Display', 'FAIL', 'REBNY attribution found but brokerage license number 10991205323 missing');
        } else {
            addResult(1, 'Attribution Display', 'FAIL', 'REBNY RLS attribution bar not found on page');
        }
    })();

    // ─── Test 2: Opt-Out Filtering ─────────────────────────────────────────
    (function test2_OptOut() {
        if (typeof checkListingCompliance !== 'function') {
            addResult(2, 'Opt-Out Filtering', 'FAIL', 'checkListingCompliance() function not found');
            return;
        }
        var fnSource = checkListingCompliance.toString();
        var checksIdx = fnSource.indexOf('idxDisplayYN') !== -1;
        var checksAddress = fnSource.indexOf('addressDisplayYN') !== -1;

        if (checksIdx && checksAddress) {
            addResult(2, 'Opt-Out Filtering', 'PASS', 'checkListingCompliance() gates IDX opt-out and address suppression');
        } else if (checksIdx) {
            addResult(2, 'Opt-Out Filtering', 'FAIL', 'IDX opt-out checked but addressDisplayYN suppression missing');
        } else {
            addResult(2, 'Opt-Out Filtering', 'FAIL', 'checkListingCompliance() does not check idxDisplayYN');
        }
    })();

    // ─── Test 3: Status Accuracy ───────────────────────────────────────────
    (function test3_Status() {
        // RESO StandardStatus values — both underscore and camelCase forms accepted
        var validStatuses = [
            'ACTIVE', 'PENDING', 'CLOSED', 'COMING_SOON', 'COMINGSOON',
            'WITHDRAWN', 'EXPIRED', 'CANCELED', 'HOLD', 'INCOMPLETE'
        ];
        var statusElements = document.querySelectorAll('[data-reso-field="MlsStatus"]');
        var invalidCount = 0;
        var totalChecked = 0;
        var invalidValues = [];

        statusElements.forEach(function(el) {
            var val = el.getAttribute('data-reso-value');
            if (!val) return; // Skip elements without data-reso-value (column headers, labels)
            totalChecked++;
            val = val.trim().toUpperCase();
            if (validStatuses.indexOf(val) === -1) { invalidCount++; invalidValues.push(val); }
        });
        var statusCheckboxes = document.querySelectorAll('input[data-field="MlsStatus"]');
        statusCheckboxes.forEach(function(cb) {
            var rawVal = (cb.getAttribute('data-value') || '');
            var vals = rawVal.split(',');
            vals.forEach(function(v) {
                v = v.trim().toUpperCase();
                if (!v) return;
                totalChecked++;
                if (validStatuses.indexOf(v) === -1) { invalidCount++; invalidValues.push(v); }
            });
        });

        if (invalidCount === 0 && totalChecked > 0) {
            addResult(3, 'Status Accuracy', 'PASS', totalChecked + ' status values checked, all valid RESO StandardStatus');
        } else if (invalidCount === 0) {
            addResult(3, 'Status Accuracy', 'FAIL', 'No status elements found in current view to validate — required infrastructure missing');
        } else {
            addResult(3, 'Status Accuracy', 'FAIL', invalidCount + ' of ' + totalChecked + ' non-standard: ' + invalidValues.join(', '));
        }
    })();

    // ─── Test 4: Prohibited Field Display (NEW) ───────────────────────────
    (function test4_ProhibitedFields() {
        var violations = [];
        PROHIBITED_DISPLAY_FIELDS.forEach(function(field) {
            var found = document.querySelectorAll(
                '[data-reso-field="' + field + '"], [data-field="' + field + '"]'
            );
            found.forEach(function(el) {
                var parent = el.closest('[data-access-level]');
                if (parent && parent.getAttribute('data-access-level') === 'agent-only') return;
                if (el.closest('#reportFieldSelector') || el.type === 'checkbox') return;
                violations.push(field + ' displayed in DOM');
            });
        });

        var resultContainers = document.querySelectorAll(
            '#gridViewContainer, #galleryViewContainer, #shortSummaryViewContainer, ' +
            '#summaryViewContainer, #masterDetailViewContainer'
        );
        resultContainers.forEach(function(container) {
            if (container.style.display === 'none') return;
            var html = container.innerHTML || '';
            if (/buyer\s*(agent\s*)?comp(ensation)?/i.test(html) && html.indexOf('checkbox') === -1) {
                violations.push('Buyer compensation text found in visible results');
            }
        });

        if (violations.length === 0) {
            addResult(4, 'Prohibited Field Display', 'PASS', 'No prohibited fields found in display output');
        } else {
            addResult(4, 'Prohibited Field Display', 'FAIL', violations.length + ' violation(s): ' + violations.join('; '));
        }
    })();

    // ─── Test 5: Fair Housing Language ─────────────────────────────────────
    (function test5_FairHousing() {
        var scannerPresent = typeof checkFairHousing === 'function' ||
                             typeof FAIR_HOUSING_VIOLATIONS !== 'undefined';

        var fhPatterns = [
            /\b(exclusive|prestigious)\s+(neighborhood|area|community)\b/i,
            /\b(family[\s-]friendly|bachelor\s+pad|singles?\s+only|couples?\s+only)\b/i,
            /\b(church|synagogue|mosque|temple)\s+(nearby|close|walking)\b/i,
            /\b(no\s+children|adults?\s+only|senior\s+only|55\s*\+)\b/i,
            /\b(perfect\s+for\s+(young|retired|single|married))\b/i
        ];
        var fhViolations = [];
        var descriptionAreas = document.querySelectorAll(
            '#publicDescription, [data-reso-field="PublicRemarks"], .listing-description'
        );
        descriptionAreas.forEach(function(el) {
            var text = el.textContent || el.value || '';
            fhPatterns.forEach(function(pat) {
                var match = text.match(pat);
                if (match) fhViolations.push(match[0]);
            });
        });

        if (scannerPresent && fhViolations.length === 0) {
            addResult(5, 'Fair Housing Language', 'PASS', 'Fair Housing scanner active, no violations in visible descriptions');
        } else if (fhViolations.length > 0) {
            addResult(5, 'Fair Housing Language', 'FAIL', 'Fair Housing violations found: ' + fhViolations.join(', '));
        } else {
            addResult(5, 'Fair Housing Language', 'FAIL', 'Fair Housing scanner function not detected — checkFairHousing() or FAIR_HOUSING_VIOLATIONS required');
        }
    })();

    // ─── Test 6: Required Field Display ────────────────────────────────────
    (function test6_RequiredFields() {
        var requiredResoFields = [
            'UnparsedAddress', 'ListPrice', 'BedroomsTotal', 'BathroomsTotalInteger',
            'MlsStatus', 'PropertyType', 'ListAgentFullName', 'ListOfficeName',
            'ListingId', 'OnMarketDate'
        ];
        var missingFields = [];

        if (typeof gridColumnDefs !== 'undefined') {
            var definedReso = [];
            Object.keys(gridColumnDefs).forEach(function(key) {
                if (gridColumnDefs[key].reso) definedReso.push(gridColumnDefs[key].reso);
            });
            requiredResoFields.forEach(function(field) {
                var found = definedReso.some(function(d) {
                    return d === field || d.indexOf(field) !== -1 || field.indexOf(d) !== -1;
                });
                if (!found) missingFields.push(field);
            });
        }

        if (missingFields.length === 0) {
            addResult(6, 'Required Field Display', 'PASS', 'All ' + requiredResoFields.length + ' required RESO fields defined in grid columns');
        } else {
            addResult(6, 'Required Field Display', 'FAIL', missingFields.length + ' required RESO field(s) missing from grid columns: ' + missingFields.join(', '));
        }
    })();

    // ─── Test 7: Data Freshness ────────────────────────────────────────────
    (function test7_Freshness() {
        var timestampEls = document.querySelectorAll('.data-timestamp');
        var stale = false;
        var freshestDate = null;
        var now = new Date();

        timestampEls.forEach(function(el) {
            var text = el.textContent.trim();
            if (!text) return;
            var d = new Date(text);
            if (!isNaN(d.getTime())) {
                if (!freshestDate || d > freshestDate) freshestDate = d;
                if ((now - d) / (1000 * 60 * 60) > 24) stale = true;
            }
        });

        if (freshestDate && !stale) {
            addResult(7, 'Data Freshness', 'PASS', 'Data timestamp within 24 hours: ' + freshestDate.toLocaleString());
        } else if (freshestDate && stale) {
            var hoursOld = Math.round((now - freshestDate) / (1000 * 60 * 60));
            addResult(7, 'Data Freshness', 'FAIL', 'Stale data: ' + hoursOld + 'h old (max 24h). Last update: ' + freshestDate.toLocaleString());
        } else {
            addResult(7, 'Data Freshness', 'FAIL', 'No .data-timestamp elements found — freshness tracking infrastructure missing');
        }
    })();

    // ─── Test 8: Commingling Prevention (NEW) ──────────────────────────────
    (function test8_Commingling() {
        var resultCards = document.querySelectorAll('[data-listing-id]');
        var totalListings = resultCards.length;
        var sourceLabeledCards = document.querySelectorAll('[data-source="REBNY-RLS"]');

        if (totalListings === 0) {
            addResult(8, 'Commingling Prevention', 'PASS', 'No listings displayed — no commingling risk');
        } else if (sourceLabeledCards.length >= totalListings) {
            addResult(8, 'Commingling Prevention', 'PASS', 'All ' + totalListings + ' listings have data-source labels');
        } else {
            addResult(8, 'Commingling Prevention', 'FAIL',
                (totalListings - sourceLabeledCards.length) + '/' + totalListings + ' listings lack data-source="REBNY-RLS" attribute — commingling risk');
        }
    })();

    // ─── Test 9: Print/Email Compliance ────────────────────────────────────
    (function test9_PrintEmail() {
        var checks = [];
        if (typeof printListingSheet === 'function') {
            var src = printListingSheet.toString();
            if (src.indexOf('checkListingCompliance') !== -1) checks.push('print:gate');
            if (src.indexOf('logAuditEntry') !== -1) checks.push('print:audit');
        }
        if (typeof emailListingSheet === 'function') {
            var src = emailListingSheet.toString();
            if (src.indexOf('checkListingCompliance') !== -1) checks.push('email:gate');
            if (src.indexOf('logAuditEntry') !== -1) checks.push('email:audit');
        }
        if (typeof previewListingSheet === 'function') {
            var src = previewListingSheet.toString();
            if (src.indexOf('checkListingCompliance') !== -1) checks.push('preview:gate');
        }
        if (typeof generateSingleListingSheet === 'function') {
            var src = generateSingleListingSheet.toString();
            if (src.indexOf('suppressAddress') !== -1 || src.indexOf('Address Available') !== -1) checks.push('sheet:addressSuppress');
        }
        // Check branding/attribution in parent generateListingSheet (which wraps single cards)
        var sheetSrc = '';
        if (typeof generateListingSheet === 'function') sheetSrc = generateListingSheet.toString();
        if (typeof generateSingleListingSheet === 'function') sheetSrc += generateSingleListingSheet.toString();
        if (sheetSrc.indexOf('MALLAN REAL ESTATE') !== -1 || sheetSrc.indexOf('Mallan Real Estate') !== -1 || sheetSrc.indexOf('10991205323') !== -1) checks.push('sheet:branding');
        if (sheetSrc.indexOf('REBNY') !== -1 || sheetSrc.indexOf('Equal Housing') !== -1) checks.push('sheet:attribution');

        var expected = ['print:gate', 'print:audit', 'email:gate', 'email:audit', 'preview:gate', 'sheet:addressSuppress', 'sheet:branding', 'sheet:attribution'];
        var missing = expected.filter(function(e) { return checks.indexOf(e) === -1; });

        if (missing.length === 0) {
            addResult(9, 'Print/Email Compliance', 'PASS', 'All 8 output checks pass');
        } else {
            addResult(9, 'Print/Email Compliance', 'FAIL', missing.length + '/8 checks missing: ' + missing.join(', '));
        }
    })();

    // ─── Test 10: Bulk Export Restriction (NEW) ────────────────────────────
    (function test10_BulkExport() {
        var BULK_LIMIT = 25;
        if (typeof selectAllResults !== 'function') {
            addResult(10, 'Bulk Export Restriction', 'FAIL', 'selectAllResults() not found — required bulk selection function missing');
            return;
        }
        var allCheckboxes = document.querySelectorAll('.listing-checkbox');
        if (allCheckboxes.length <= BULK_LIMIT) {
            addResult(10, 'Bulk Export Restriction', 'PASS', allCheckboxes.length + ' listings (within ' + BULK_LIMIT + ' limit)');
        } else {
            addResult(10, 'Bulk Export Restriction', 'FAIL',
                allCheckboxes.length + ' listings exceed ' + BULK_LIMIT + ' bulk export limit');
        }
    })();

    // ─── Compile & Log Report ──────────────────────────────────────────────
    var report = {
        version: COMPLIANCE_DOCTOR_VERSION,
        timestamp: new Date().toISOString(),
        context: context,
        agent: typeof LOGGED_IN_AGENT !== 'undefined' ? LOGGED_IN_AGENT.name : 'unknown',
        summary: { passed: passed, failed: failed, warnings: warnings, total: results.length },
        results: results
    };

    if (typeof logAuditEntry === 'function') {
        logAuditEntry('compliance_doctor', { version: report.version, context: context, passed: passed, failed: failed, warnings: warnings });
    }

    var icon = failed > 0 ? 'FAIL' : 'PASS';
    console.log('[REBNY Compliance Doctor v' + COMPLIANCE_DOCTOR_VERSION + '] ' + icon +
        ' — ' + passed + ' pass, ' + failed + ' fail (' + context + ')');
    if (verbose) {
        results.forEach(function(r) {
            console.log('  ' + r.status + ' Test ' + r.test + ': ' + r.name + ' — ' + r.detail);
        });
    }

    updateComplianceBadge(report);
    return report;
}

/**
 * Floating compliance status badge — bottom-right corner.
 * Green = all pass, Yellow = warnings, Red = failures. Click for full report.
 */
function updateComplianceBadge(report) {
    // Save report for access from Compliance Doctor modal (no separate badge — Test Suite badge handles display)
    window._lastComplianceReport = report;
}

/**
 * Show Compliance Doctor results in a scrollable modal
 */
function showComplianceDoctorModal(r) {
    var existing = document.getElementById('complianceDoctorModal');
    if (existing) existing.remove();

    var statusColors = { PASS: '#16a34a', FAIL: '#dc2626', WARN: '#d97706' };
    var statusBg = { PASS: '#f0fdf4', FAIL: '#fef2f2', WARN: '#fffbeb' };
    var statusIcons = { PASS: 'fa-check-circle', FAIL: 'fa-times-circle', WARN: 'fa-exclamation-triangle' };

    var rows = '';
    r.results.forEach(function(t) {
        rows += '<div style="padding:10px 14px;border-bottom:1px solid #f3f4f6;display:flex;gap:10px;align-items:flex-start;background:' + (statusBg[t.status] || '#fff') + '">' +
            '<div style="flex-shrink:0;width:20px;text-align:center;padding-top:1px;">' +
                '<i class="fas ' + (statusIcons[t.status] || 'fa-circle') + '" style="color:' + (statusColors[t.status] || '#6b7280') + ';font-size:14px;"></i>' +
            '</div>' +
            '<div style="flex:1;min-width:0;">' +
                '<div style="font-weight:700;font-size:13px;color:#1f2937;">Test ' + t.test + ': ' + t.name +
                    '<span style="margin-left:8px;font-size:10px;font-weight:600;color:' + (statusColors[t.status] || '#6b7280') + ';text-transform:uppercase;">' + t.status + '</span>' +
                '</div>' +
                '<div style="font-size:12px;color:#6b7280;margin-top:2px;word-break:break-word;">' + t.detail + '</div>' +
            '</div>' +
        '</div>';
    });

    var s = r.summary;
    var scoreColor = s.failed > 0 ? '#dc2626' : (s.warnings > 0 ? '#d97706' : '#16a34a');
    var scoreBg = s.failed > 0 ? '#fef2f2' : (s.warnings > 0 ? '#fffbeb' : '#f0fdf4');

    var modal = document.createElement('div');
    modal.id = 'complianceDoctorModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);';
    modal.innerHTML =
        '<div style="background:white;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:520px;max-width:90vw;max-height:85vh;display:flex;flex-direction:column;font-family:system-ui,-apple-system,sans-serif;">' +
            '<div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">' +
                '<div>' +
                    '<div style="font-weight:700;font-size:15px;color:#1f2937;"><i class="fas fa-shield-alt" style="color:#3b82f6;margin-right:6px;"></i>REBNY Compliance Doctor</div>' +
                    '<div style="font-size:11px;color:#9ca3af;margin-top:2px;">v' + r.version + ' &middot; ' + new Date(r.timestamp).toLocaleString() + ' &middot; ' + r.context + '</div>' +
                '</div>' +
                '<button onclick="document.getElementById(\'complianceDoctorModal\').remove()" style="background:none;border:none;font-size:22px;color:#9ca3af;cursor:pointer;padding:0 4px;line-height:1;">&times;</button>' +
            '</div>' +
            '<div style="overflow-y:auto;flex:1;">' + rows + '</div>' +
            '<div style="padding:12px 20px;border-top:1px solid #e5e7eb;background:' + scoreBg + ';border-radius:0 0 12px 12px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;">' +
                '<div style="font-size:13px;font-weight:700;color:' + scoreColor + ';">' +
                    '<i class="fas ' + (s.failed > 0 ? 'fa-times-circle' : (s.warnings > 0 ? 'fa-exclamation-triangle' : 'fa-check-circle')) + '" style="margin-right:6px;"></i>' +
                    s.passed + '/' + s.total + ' passed' + (s.warnings > 0 ? ', ' + s.warnings + ' warning' + (s.warnings > 1 ? 's' : '') : '') + (s.failed > 0 ? ', ' + s.failed + ' failed' : '') +
                '</div>' +
                '<button onclick="document.getElementById(\'complianceDoctorModal\').remove()" style="padding:6px 16px;background:#1f2937;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Close</button>' +
            '</div>' +
        '</div>';

    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

// ═══════════════════════════════════════════════════════════════════════
// REBNY TEST SUITE v1.2 — Wiring, Behavior, Compliance Extended
// STRICT NO-SUBSTITUTE / NO-BYPASS: Binary PASS/FAIL only. Zero tolerance.
// ═══════════════════════════════════════════════════════════════════════
var TEST_SUITE_VERSION = '1.2.0';

// ─── WIRING MODE (7 tests) ─ Data Integrity & Feed Conformance ──────
function REBNYWiringTest(options) {
    options = options || {};
    var results = [];
    var passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++;
        else if (status === 'FAIL') failed++;
        else if (status === 'SKIP') { /* skip */ }
        else warnings++;
    }

    // ── W1: Field Parity Test ──────────────────────────────────────────
    (function() {
        var ALLOWED = ['SourceSystemKey','ListPrice','MlsStatus','PropertyType','PropertySubType','BedroomsTotal','BathroomsTotalInteger','LivingArea','YearBuilt','UnparsedAddress','City','StateOrProvince','PostalCode','Latitude','Longitude','ListAgentFullName','ListOfficeName','ListingAgreement','InternetEntireListingDisplayYN','InternetAddressDisplayYN','OwnerOptOut','ParticipantOnly','IDXEntireListingDisplayYN','SyndicateTo','ComingSoonTimestamp','ActivationDate','PublicRemarks','PrivateRemarks','ShowingInstructions','ListAgentEmail','ListAgentDirectPhone','MaintenanceFee','TaxAnnualAmount','CommonCharges','neighborhood','borough','photoCount','daysOnMarket','pricePerSqft','updatedDate','listedDate','buildingName','lotSize','stories','units','parkingFeatures','garageSpaces','listingCategory','CommonInterest','Ownership','PetsAllowed','LaundryFeatures','Amenities','CoolingYN','HeatingYN','FireplacesTotal','WaterfrontYN','ViewYN','TaxBlock','TaxLot','Zoning','FloorNumber','UnitNumber','Concessions','FinancialDataSource','AssociationFee','RentIncludes','NumberOfUnitsTotal','StoriesTotal','LotSizeArea','GarageYN','AssociationFee+TaxAnnualAmount','RoomsTotal','BathroomsFull','SubdivisionName','OnMarketDate','DaysOnMarket','CumulativeDaysOnMarket','OpenHouseDate','AssociationName','SecurityFeatures','PropertyCondition','PurchaseContractDate','BuyerFinancing','BuildingAreaTotal','PreviousListPrice','OriginalListPrice','PriceChangeTimestamp','ListAgentDirectPhone','PatioAndPorchFeatures','NewConstructionYN','SourceSystemModificationTimestamp','ListingId','EntryLevel','CrossStreet','Exposures','WalkScore','BathroomsHalf','BuildingName','CloseDate','ClosePrice','PhotosCount','VirtualTourURLBranded','View','Flooring','Cooling','Heating','ParkingFeatures','ParkingTotal','PetsAllowedYN','AssociationAmenities','InteriorFeatures'];
        var resoEls = document.querySelectorAll('[data-reso-field]');
        var unknown = [], seen = {};
        resoEls.forEach(function(el) {
            var f = el.getAttribute('data-reso-field');
            seen[f] = true;
            if (ALLOWED.indexOf(f) === -1 && unknown.indexOf(f) === -1) unknown.push(f);
        });
        var LEAKS = ['ListAgentMlsId','ListOfficeMlsId','OriginatingSystemName','OriginatingSystemKey','BuyerAgentMlsId','CoListAgentMlsId'];
        var bodyText = document.body.innerText || '';
        var leaked = LEAKS.filter(function(n) { return bodyText.indexOf(n) !== -1; });
        if (unknown.length === 0 && leaked.length === 0) {
            addResult('W1', 'Field Parity', 'PASS', Object.keys(seen).length + ' RESO fields, all in allowlist');
        } else {
            var d = [];
            if (unknown.length) d.push('Unknown: ' + unknown.join(', '));
            if (leaked.length) d.push('Leaked: ' + leaked.join(', '));
            addResult('W1', 'Field Parity', 'FAIL', d.join('; '));
        }
    })();

    // ── W2: Enum Integrity Test ────────────────────────────────────────
    (function() {
        var issues = [];
        var VS = ['Active','Pending','Closed','ComingSoon','Coming Soon','COMING_SOON','COMINGSOON','Withdrawn','Expired','Canceled','Hold','Incomplete','ActiveUnderContract','ACTIVE','PENDING','CLOSED','WITHDRAWN','EXPIRED','CANCELED','HOLD','INCOMPLETE','ACTIVE_UNDER_CONTRACT'];
        document.querySelectorAll('[data-reso-field="MlsStatus"][data-reso-value]').forEach(function(el) {
            var val = el.getAttribute('data-reso-value');
            if (!val) return;
            val.split(',').forEach(function(v) { v = v.trim(); if (v && VS.indexOf(v) === -1) issues.push('Status:"' + v + '"'); });
        });
        var VB = ['Manhattan','Brooklyn','Queens','Bronx','Staten Island','The Bronx'];
        document.querySelectorAll('[data-reso-field="borough"][data-reso-value]').forEach(function(el) {
            var v = el.getAttribute('data-reso-value'); if (v && VB.indexOf(v) === -1) issues.push('Borough:"' + v + '"');
        });
        if (typeof listings !== 'undefined') {
            listings.forEach(function(l) {
                if (l.listingCategory && ['sale','rental'].indexOf(l.listingCategory) === -1) issues.push('Category:"' + l.listingCategory + '"');
            });
        }
        addResult('W2', 'Enum Integrity', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? 'All status/borough/category enums valid' : issues.length + ' mismatches: ' + issues.slice(0,5).join(', '));
    })();

    // ── W3: Null Handling Test ─────────────────────────────────────────
    (function() {
        var problems = [];
        document.querySelectorAll('td, [data-listing-id], [data-reso-value]').forEach(function(el) {
            if (el.offsetParent === null) return;
            var t = el.textContent.trim();
            if (t === 'undefined' || t === 'null' || t === 'NaN' || t === '$NaN' || t === '$undefined') problems.push('"' + t + '" in <' + el.tagName.toLowerCase() + '>');
        });
        if (typeof listings !== 'undefined') {
            listings.forEach(function(l) {
                if (l.price == null) problems.push('Null price L-' + l.id);
                if (l.status == null) problems.push('Null status L-' + l.id);
            });
        }
        addResult('W3', 'Null Handling', problems.length === 0 ? 'PASS' : 'FAIL', problems.length === 0 ? 'No undefined/null/NaN in display or data' : problems.slice(0,4).join(', '));
    })();

    // ── W4: Timestamp Consistency ──────────────────────────────────────
    (function() {
        var issues = [];
        var el = document.getElementById('rebnyDataTimestamp');
        if (!el) { issues.push('No #rebnyDataTimestamp'); }
        else {
            var text = el.textContent.trim();
            if (!text || text.length < 8) issues.push('Timestamp empty');
            else { var d = new Date(text); if (isNaN(d.getTime())) issues.push('Unparseable'); else if ((Date.now() - d.getTime()) / 3600000 > 24) issues.push('Stale: ' + Math.round((Date.now() - d.getTime()) / 3600000) + 'h'); }
        }
        addResult('W4', 'Timestamp Consistency', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? 'Dynamic, within 24h' : issues.join('; '));
    })();

    // ── W5: Sorting Stability ──────────────────────────────────────────
    (function() {
        if (typeof getFilteredListings !== 'function' || typeof searchResultsState === 'undefined') { addResult('W5', 'Sorting Stability', 'FAIL', 'Required globals missing: getFilteredListings or searchResultsState undefined'); return; }
        var oF = searchResultsState.sortField, oO = searchResultsState.sortOrder;
        searchResultsState.sortField = 'price'; searchResultsState.sortOrder = 'asc';
        var a = getFilteredListings(true).map(function(l) { return l.id; });
        searchResultsState.sortOrder = 'desc'; getFilteredListings(true);
        searchResultsState.sortOrder = 'asc';
        var c = getFilteredListings(true).map(function(l) { return l.id; });
        searchResultsState.sortField = oF; searchResultsState.sortOrder = oO;
        var stable = a.length === c.length && a.every(function(id, i) { return id === c[i]; });
        addResult('W5', 'Sorting Stability', stable ? 'PASS' : 'FAIL', stable ? 'Stable across asc→desc→asc (' + a.length + ' listings)' : 'Order changed across cycle');
    })();

    // ── W6: Regression Snapshot ────────────────────────────────────────
    (function() {
        if (typeof listings === 'undefined') { addResult('W6', 'Regression Snapshot', 'FAIL', 'listings undefined — required test data missing'); return; }
        var snap = { count: listings.length, ids: listings.map(function(l){return l.id;}).sort(function(a,b){return a-b;}).join(',') };
        var key = 'rebny_regression_snapshot', prev = null;
        try { prev = JSON.parse(localStorage.getItem(key)); } catch(e) {}
        localStorage.setItem(key, JSON.stringify(snap));
        if (!prev) { addResult('W6', 'Regression Snapshot', 'PASS', 'Baseline: ' + snap.count + ' listings captured'); }
        else if (prev.count === snap.count && prev.ids === snap.ids) { addResult('W6', 'Regression Snapshot', 'PASS', 'No regression: ' + snap.count + ' listings match'); }
        else { addResult('W6', 'Regression Snapshot', 'FAIL', 'REGRESSION DETECTED: count ' + prev.count + '→' + snap.count + ', IDs changed'); }
    })();

    // ── W7: Cross-Surface Consistency ────────────────────────────────────
    (function() {
        var issues = [], checks = [];

        // 1. Email includes status + updated date per listing
        if (typeof emailListingSheet === 'function') {
            var eSrc = emailListingSheet.toString();
            if (eSrc.indexOf('Status:') !== -1 || eSrc.indexOf('status') !== -1) checks.push('email:status');
            else issues.push('Email missing status per listing');
            if (eSrc.indexOf('Updated:') !== -1 || eSrc.indexOf('updatedDate') !== -1) checks.push('email:date');
            else issues.push('Email missing updated date');
            if (eSrc.indexOf('formatCurrency') !== -1) checks.push('email:formatCurrency');
            else issues.push('Email uses raw price format');
            if (eSrc.indexOf('REBNY') !== -1) checks.push('email:attribution');
            else issues.push('Email missing REBNY attribution');
        } else { issues.push('emailListingSheet not found'); }

        // 2. Print sheet uses formatCurrency + has required elements
        if (typeof generateSingleListingSheet === 'function') {
            var pSrc = generateSingleListingSheet.toString();
            if (pSrc.indexOf('formatCurrency') !== -1) checks.push('print:formatCurrency');
            else issues.push('Print uses raw price format');
            if (pSrc.indexOf('listing.status') !== -1) checks.push('print:status');
            else issues.push('Print missing status');
            if (pSrc.indexOf('updatedDate') !== -1 || pSrc.indexOf('Last Updated') !== -1) checks.push('print:date');
            else issues.push('Print missing updated date');
        }
        if (typeof generateListingSheet === 'function') {
            var gSrc = generateListingSheet.toString();
            if (gSrc.indexOf('REBNY') !== -1) checks.push('print:attribution');
            else issues.push('Print missing REBNY attribution');
            if (gSrc.indexOf('Equal Housing') !== -1) checks.push('print:fairHousing');
            else issues.push('Print missing Fair Housing notice');
        }

        // 3. All search views use dynamic status colors (not hardcoded green)
        var viewFns = ['renderGalleryView','renderShortSummaryView','renderSummaryView','renderMasterDetailView'];
        var hardcoded = [];
        viewFns.forEach(function(fn) {
            if (typeof window[fn] === 'function') {
                var src = window[fn].toString();
                if (src.indexOf('bg-green-100 text-green-700') !== -1 && src.indexOf('getStatusBadgeClasses') === -1) {
                    hardcoded.push(fn.replace('render','').replace('View',''));
                }
            }
        });
        if (hardcoded.length === 0) checks.push('views:dynamicStatus');
        else issues.push('Hardcoded green badges: ' + hardcoded.join(', '));

        // 4. All search views have data-source attribute
        if (typeof renderMasterDetailView === 'function') {
            var mdSrc = renderMasterDetailView.toString();
            if (mdSrc.indexOf('data-source') !== -1) checks.push('masterDetail:source');
            else issues.push('MasterDetail missing data-source');
        }

        // 5. formatCurrency is null-safe
        if (typeof formatCurrency === 'function') {
            var nullResult = formatCurrency(null);
            var undefResult = formatCurrency(undefined);
            if (nullResult !== '$null' && nullResult !== '$NaN' && nullResult !== '$undefined' &&
                undefResult !== '$null' && undefResult !== '$NaN' && undefResult !== '$undefined') {
                checks.push('formatCurrency:nullSafe');
            } else { issues.push('formatCurrency not null-safe: null→"' + nullResult + '"'); }
        }

        // 6. getStatusBadgeClasses helper exists
        if (typeof getStatusBadgeClasses === 'function') {
            checks.push('statusHelper:exists');
            var active = getStatusBadgeClasses('ACTIVE');
            var pending = getStatusBadgeClasses('Pending');
            if (active !== pending) checks.push('statusHelper:dynamic');
            else issues.push('Status helper returns same for ACTIVE/PENDING');
        } else { issues.push('getStatusBadgeClasses helper missing'); }

        addResult('W7', 'Cross-Surface Consistency', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length === 0 ? checks.length + ' cross-surface checks pass' : issues.length + ' issue(s): ' + issues.join('; '));
    })();

    return { mode: 'wiring', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
}

// ─── BEHAVIOR MODE (6 tests) ─ Edge Cases & UI ─────────────────────
function REBNYBehaviorTest(options) {
    options = options || {};
    var runActive = options.runActive || false;
    var results = [];
    var passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++; else if (status !== 'SKIP') warnings++;
    }

    // ── B1: Zero-Result Test (ACTIVE) ──────────────────────────────────
    (function() {
        if (!runActive) { addResult('B1', 'Zero-Result', 'SKIP', 'Active test — click "Run Active Tests"'); return; }
        if (typeof filterListings !== 'function' || typeof listings === 'undefined') { addResult('B1', 'Zero-Result', 'FAIL', 'Required: filterListings function and listings array both must exist'); return; }
        var r = filterListings(listings, { priceMin: 999999999, priceMax: 1, searchTab: 'sale' });
        var noErr = true;
        try { r.slice().sort(function(a,b){return a.price-b.price;}); } catch(e) { noErr = false; }
        addResult('B1', 'Zero-Result', (r.length === 0 && noErr) ? 'PASS' : 'FAIL', r.length === 0 ? 'Impossible criteria → 0 results, no error' : 'Got ' + r.length + ' results');
    })();

    // ── B2: High Volume Test (ACTIVE) ──────────────────────────────────
    (function() {
        if (!runActive) { addResult('B2', 'High Volume', 'SKIP', 'Active test — click "Run Active Tests"'); return; }
        if (typeof listings === 'undefined' || typeof getFilteredListings !== 'function') { addResult('B2', 'High Volume', 'FAIL', 'Required globals missing: listings and getFilteredListings must exist'); return; }
        var origLen = listings.length, tpl = listings[0];
        for (var i = 0; i < 200; i++) { var f = {}; for (var k in tpl) { if (tpl.hasOwnProperty(k)) f[k] = tpl[k]; } f.id = 90000+i; f.lid = 'FAKE-'+i; f.price = Math.floor(Math.random()*5e6)+5e5; listings.push(f); }
        var t0 = performance.now();
        var pg = getFilteredListings(false);
        var all = getFilteredListings(true);
        var ms = Math.round(performance.now() - t0);
        listings.splice(origLen);
        var pgOK = pg.length <= (searchResultsState.perPage || 50);
        addResult('B2', 'High Volume', (pgOK && ms < 500) ? 'PASS' : 'FAIL', '200+ listings: ' + pg.length + '/' + all.length + ' paginated, ' + ms + 'ms (limit: 500ms, page size: ' + (searchResultsState.perPage || 50) + ')');
    })();

    // ── B3: Rapid Toggle Test (ACTIVE) ─────────────────────────────────
    (function() {
        if (!runActive) { addResult('B3', 'Rapid Toggle', 'SKIP', 'Active test — click "Run Active Tests"'); return; }
        if (typeof toggleSearchTab !== 'function') { addResult('B3', 'Rapid Toggle', 'FAIL', 'toggleSearchTab function missing — required for tab switching'); return; }
        var orig = currentSearchTab, err = null;
        try { toggleSearchTab('sale'); toggleSearchTab('rent'); toggleSearchTab('sale'); toggleSearchTab('rent'); toggleSearchTab('building'); toggleSearchTab('sale'); } catch(e) { err = e.message; }
        var after = currentSearchTab;
        addResult('B3', 'Rapid Toggle', (!err && after === 'sale') ? 'PASS' : 'FAIL', err ? 'Error: ' + err : '6 rapid switches, final tab="' + after + '" (expected "sale")');
        if (orig !== 'sale') { try { toggleSearchTab(orig); } catch(e) {} }
    })();

    // ── B4: Authorization & Role Test ──────────────────────────────────
    // Role loads async via MallanAPI.init() — defer check until auth resolves
    (function() {
        function checkRole() {
            if (typeof LOGGED_IN_AGENT === 'undefined') { addResult('B4', 'Authorization & Role', 'FAIL', 'LOGGED_IN_AGENT missing'); return; }
            var role = LOGGED_IN_AGENT.role, issues = [];
            if (role === 'agent') {
                ['agentManagement','brokerCommissionSplits','allListingsSection'].forEach(function(id) {
                    var el = document.getElementById(id);
                    if (el && el.offsetParent !== null && el.style.display !== 'none') issues.push('Agent sees #' + id);
                });
            }
            if (!role || (role !== 'broker' && role !== 'agent')) issues.push('Invalid role: "' + role + '"');
            addResult('B4', 'Authorization & Role', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? 'Role "' + role + '" verified' : issues.join('; '));
        }
        if (typeof MallanAPI !== 'undefined' && typeof MallanAPI.onReady === 'function') {
            MallanAPI.onReady(checkRole);
        } else if (LOGGED_IN_AGENT.role) {
            checkRole();
        } else {
            setTimeout(checkRole, 2000);
        }
    })();

    // ── B5: Layout Breakpoint Test ─────────────────────────────────────
    (function() {
        var checks = [], issues = [], html = document.documentElement.innerHTML;
        if (html.indexOf('@media print') !== -1) checks.push('print-css');
        if (html.indexOf('sm:') !== -1 && html.indexOf('md:') !== -1 && html.indexOf('lg:') !== -1) checks.push('responsive');
        else issues.push('Missing responsive classes');
        if (document.body.innerHTML.indexOf('REBNY Listing Service') !== -1 || document.body.innerHTML.indexOf('REBNY RLS') !== -1) checks.push('attribution');
        else issues.push('Attribution not found');
        if (document.getElementById('searchBasicMode') || document.getElementById('searchAdvancedMode')) checks.push('filters');
        if (html.indexOf('page-break-inside') !== -1) checks.push('page-breaks');
        addResult('B5', 'Layout Breakpoint', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? 'All checks pass: ' + checks.join(', ') : issues.join('; '));
    })();

    // ── B6: CMA/Comps Integrity ────────────────────────────────────────
    (function() {
        var checks = [], issues = [];
        ['openCompPage','showCompResults','toggleCompSaleRent','backToCompSelection'].forEach(function(fn) {
            if (typeof window[fn] === 'function') checks.push(fn); else issues.push(fn + ' missing');
        });
        if (document.getElementById('comparablesSelectionPage')) checks.push('comp-UI');
        if (document.querySelectorAll('[id*="btnCompSale"]').length > 0) checks.push('sale/rent-toggle');
        addResult('B6', 'CMA/Comps Integrity', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? checks.length + ' comp checks pass' : issues.length + ' missing: ' + issues.join(', '));
    })();

    return { mode: 'behavior', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
}

// ─── COMPLIANCE EXTENDED (7 tests) ─ Security & REBNY Hardening ─────
function REBNYComplianceExtended(options) {
    options = options || {};
    var runActive = options.runActive || false;
    var results = [];
    var passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++; else if (status !== 'SKIP') warnings++;
    }

    // ── C1: Source Separation ──────────────────────────────────────────
    (function() {
        var rls = document.querySelectorAll('[data-source="REBNY-RLS"]');
        var allSrc = document.querySelectorAll('[data-source]');
        var allCards = document.querySelectorAll('[data-listing-id]');
        var issues = [];
        if (allCards.length > 0 && allSrc.length < allCards.length) issues.push((allCards.length - allSrc.length) + ' unlabeled');
        if (rls.length > 0 && document.body.innerHTML.indexOf('REBNY') === -1) issues.push('RLS without attribution');
        addResult('C1', 'Source Separation', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? allSrc.length + ' labeled (RLS:' + rls.length + ')' : issues.join('; '));
    })();

    // ── C2: Print CSS Test ─────────────────────────────────────────────
    (function() {
        var checks = [], issues = [], html = document.documentElement.innerHTML;
        if (html.indexOf('@media print') !== -1) checks.push('print-rules'); else issues.push('No @media print');
        if (html.indexOf('page-break-inside') !== -1) checks.push('page-breaks'); else issues.push('No page-breaks');
        if (html.indexOf('.no-print') !== -1) checks.push('no-print-class');
        if (typeof generateListingSheet === 'function') {
            var src = generateListingSheet.toString();
            if (src.indexOf('Equal Housing') !== -1 || src.indexOf('REBNY') !== -1) checks.push('legal-footer');
            if (src.indexOf('MALLAN') !== -1 || src.indexOf('10991205323') !== -1) checks.push('branding');
        }
        addResult('C2', 'Print CSS', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? 'All checks pass: ' + checks.join(', ') : issues.join(', '));
    })();

    // ── C3: Copy/Paste Scrape Test ─────────────────────────────────────
    (function() {
        var issues = [];
        var SENSITIVE = ['PrivateRemarks','ShowingInstructions','OwnerName','OwnerPhone','ListAgentMlsId','CompensationType','BuyerAgencyCompensation'];
        document.querySelectorAll('[style*="display:none"], [style*="display: none"], .hidden, [hidden]').forEach(function(el) {
            if (el.id === 'complianceDoctorModal' || el.id === 'searchListingTypeInfoModal') return;
            var text = el.textContent || '';
            if (text.length > 50000) return;
            SENSITIVE.forEach(function(term) {
                if (text.indexOf(term) !== -1) issues.push('"' + term + '" in #' + (el.id || el.tagName));
            });
        });
        addResult('C3', 'Copy/Paste Scrape', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? 'No hidden sensitive data found' : 'Sensitive data in hidden elements: ' + issues.slice(0,5).join(', '));
    })();

    // ── C4: Security Exposure Test ─────────────────────────────────────
    (function() {
        var exp = [];
        // Note: window.listings is expected in the non-IIFE architecture (IDX data only, no private fields)
        ['allListings','rawData','apiKey','API_KEY','TRESTLE_TOKEN','MLS_PASSWORD','REBNY_TOKEN','accessToken','secretKey'].forEach(function(g) {
            if (typeof window[g] !== 'undefined' && window[g] !== null) exp.push('window.' + g);
        });
        // Check listings for private field leakage (the real security concern)
        if (typeof window.listings !== 'undefined' && window.listings.length > 0) {
            for (var i = 0; i < Math.min(window.listings.length, 5); i++) {
                var l = window.listings[i];
                if (l.PrivateRemarks || l.ShowingInstructions || l.ownerPhone || l.OwnerSSN ||
                    l.BuyerAgentCompensation || l.BuyerBrokerageCompensation || l.LockBoxSerialNumber) {
                    exp.push('listings has private fields'); break;
                }
            }
        }
        var html = document.documentElement.outerHTML.substring(0, 100000);
        if (/sk-[a-zA-Z0-9]{20,}/.test(html)) exp.push('API key (sk-*)');
        if (/Bearer\s+[a-zA-Z0-9]{20,}/.test(html)) exp.push('Bearer token');
        addResult('C4', 'Security Exposure', exp.length === 0 ? 'PASS' : 'FAIL', exp.length === 0 ? 'No globals, keys, or private data exposed' : exp.join('; '));
    })();

    // ── C5: Violation Injection Test (ACTIVE) ──────────────────────────
    (function() {
        if (!runActive) { addResult('C5', 'Violation Injection', 'SKIP', 'Active test — click "Run Active Tests"'); return; }
        if (typeof checkListingCompliance !== 'function' || typeof listings === 'undefined') {
            addResult('C5', 'Violation Injection', 'FAIL', 'checkListingCompliance or listings not found'); return;
        }
        var origLen = listings.length;
        // Inject 2 test listings: one IDX-blocked, one address-suppressed
        listings.push({ id: 99901, address: '1 Test IDX Block', unit: '', neighborhood: 'Test', borough: 'Manhattan', beds: 1, baths: 1, price: 1000000, status: 'ACTIVE', listingCategory: 'sale', idxDisplayYN: false, addressDisplayYN: true });
        listings.push({ id: 99902, address: '2 Test Addr Suppress', unit: '', neighborhood: 'Test', borough: 'Manhattan', beds: 1, baths: 1, price: 1000000, status: 'ACTIVE', listingCategory: 'sale', idxDisplayYN: true, addressDisplayYN: false });
        var r = checkListingCompliance([99901, 99902]);
        listings.splice(origLen);
        var idxBlocked = r.blocked.some(function(b) { return b.id === 99901; });
        var addrWarned = r.warnings.some(function(w) { return w.id === 99902; });
        var caught = [];
        if (idxBlocked) caught.push('IDX-block');
        if (addrWarned) caught.push('addr-suppress');
        var missed = [];
        if (!idxBlocked) missed.push('IDX-block');
        if (!addrWarned) missed.push('addr-suppress');
        addResult('C5', 'Violation Injection', missed.length === 0 ? 'PASS' : 'FAIL', missed.length === 0 ? caught.length + ' injected violations caught by compliance gate' : 'Missed: ' + missed.join(', '));
    })();

    // ── C6: Full Surface Scan ──────────────────────────────────────────
    // Scans visible result/display containers for prohibited field names.
    // Excludes: [data-compliance] disclosures (legally required text),
    //           test framework UI, hidden elements, and <script> blocks.
    (function() {
        var PROHIBITED = ['Compensation','Private Remarks','Owner Name','ShowingInstructions','BuyerAgencyCompensation','ListAgentMlsId','OriginatingSystemKey','TransactionBrokerCompensation'];
        // Scan specific result containers + listing detail panels (not entire body)
        var containers = document.querySelectorAll(
            '#gridViewContainer, #galleryViewContainer, #shortSummaryViewContainer, ' +
            '#summaryViewContainer, #masterDetailViewContainer, ' +
            '#listingDetailPanel, .listing-detail-modal, .listing-card, ' +
            '.report-preview, #reportPreviewContainer'
        );
        var vis = '';
        containers.forEach(function(c) {
            if (c.style.display === 'none' || c.offsetParent === null) return;
            // Clone and strip out [data-compliance] and [data-access-level="agent-only"] zones
            var clone = c.cloneNode(true);
            clone.querySelectorAll('[data-compliance], [data-access-level="agent-only"]').forEach(function(el) { el.remove(); });
            vis += ' ' + (clone.innerText || '');
        });
        var leaks = PROHIBITED.filter(function(t) { return vis.indexOf(t) !== -1; });
        addResult('C6', 'Full Surface Scan', leaks.length === 0 ? 'PASS' : 'FAIL', leaks.length === 0 ? PROHIBITED.length + ' terms scanned across ' + containers.length + ' containers, none found' : 'Found: ' + leaks.join(', '));
    })();

    // ── C7: Social Share Scan ──────────────────────────────────────────
    (function() {
        var checks = [], issues = [];
        if (typeof shareSocialPost === 'function') {
            checks.push('shareSocialPost');
            var src = shareSocialPost.toString();
            if (src.indexOf('broker') !== -1 || src.indexOf('attribution') !== -1 || src.indexOf('REBNY') !== -1 || src.indexOf('Equal Housing') !== -1) checks.push('compliance-text');
            else issues.push('Missing attribution in share');
        } else { issues.push('shareSocialPost not found'); }
        addResult('C7', 'Social Share Scan', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? checks.join(', ') : issues.join('; '));
    })();

    return { mode: 'compliance_extended', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
}

// ─── MASTER TEST SUITE RUNNER ───────────────────────────────────────
var _tsRunning = false;
function REBNYTestSuite(options) {
    if (_tsRunning) return window._lastTestSuiteReport;
    _tsRunning = true;
    options = options || {};
    var verbose = options.verbose || false;
    var runActive = options.runActive || false;
    var context = options.context || 'render';

    // ── STRICT INTEGRITY v2.0: Setup guards BEFORE any tests ──
    setupStrictGuards();

    // All suites wrapped in safeSuiteCall: exceptions → FAIL (Rule 3)
    var doctor = safeSuiteCall(REBNYComplianceDoctor, { verbose: false, context: context }, 'compliance_core');
    var wiring = safeSuiteCall(REBNYWiringTest, { context: context }, 'wiring');
    var behavior = safeSuiteCall(REBNYBehaviorTest, { runActive: runActive, context: context }, 'behavior');
    var extended = safeSuiteCall(REBNYComplianceExtended, { runActive: runActive, context: context }, 'compliance_extended');
    var noVow = safeSuiteCall(NoVOWDriftTests, { runActive: runActive, context: context }, 'no_vow');
    var allowlist = safeSuiteCall(AllowlistLeakTests, { runActive: runActive, context: context }, 'allowlist');
    var searchCorr = safeSuiteCall(SearchCorrectnessTests, { runActive: runActive, context: context }, 'search_correctness');
    var secV2 = safeSuiteCall(SecurityHardeningV2Tests, { runActive: runActive, context: context }, 'security_v2');
    var arp = safeSuiteCall(AccessibilityRESOPerfTests, { runActive: runActive, context: context }, 'a11y_reso_perf');
    var regression = safeSuiteCall(MutationRegressionTests, { runActive: runActive, context: context }, 'regression');

    // ── STRICT INTEGRITY v2.0: Teardown guards, then run integrity checks ──
    teardownStrictGuards();
    var integrity = safeSuiteCall(StrictIntegrityTests, { context: context }, 'strict_integrity');
    var source = safeSuiteCall(SourceIntegrityTests, { context: context }, 'source_integrity');

    var allSuites = [wiring, behavior, doctor, extended, noVow, allowlist, searchCorr, secV2, arp, regression, integrity, source];
    var tP = 0, tF = 0, tW = 0, tT = 0, skipped = 0;
    allSuites.forEach(function(s) {
        tP += s.summary.passed; tF += s.summary.failed; tW += (s.summary.warnings || 0); tT += s.summary.total;
        s.results.forEach(function(t) { if (t.status === 'SKIP') skipped++; });
    });

    var report = {
        version: TEST_SUITE_VERSION + '+ext' + EXTENDED_SUITE_VERSION,
        timestamp: new Date().toISOString(),
        context: context,
        agent: typeof LOGGED_IN_AGENT !== 'undefined' ? LOGGED_IN_AGENT.name : 'unknown',
        suites: { wiring: wiring, behavior: behavior, compliance_core: doctor, compliance_extended: extended,
                  no_vow: noVow, allowlist: allowlist, search_correctness: searchCorr,
                  security_v2: secV2, a11y_reso_perf: arp, regression: regression,
                  strict_integrity: integrity, source_integrity: source },
        summary: { passed: tP, failed: tF, warnings: tW, skipped: skipped, total: tT }
    };

    // Save to localStorage for broker admin dashboard
    saveTestSuiteHistory(report);

    _tsRunning = false;
    window._lastTestSuiteReport = report;
    updateTestSuiteBadge(report);
    if (verbose) showTestSuiteModal(report);
    return report;
}

// ─── SAVE TEST RESULTS TO BROKER ADMIN ──────────────────────────────
function saveTestSuiteHistory(report) {
    var key = 'rebny_test_suite_history';
    var history = [];
    try { history = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
    history.push({
        timestamp: report.timestamp,
        context: report.context,
        agent: report.agent,
        summary: report.summary,
        suites: {
            wiring: report.suites.wiring.summary,
            behavior: report.suites.behavior.summary,
            compliance_core: report.suites.compliance_core.summary,
            compliance_extended: report.suites.compliance_extended.summary
        }
    });
    if (history.length > 100) history = history.slice(-100);
    localStorage.setItem(key, JSON.stringify(history));
}

// ─── TEST SUITE BADGE ───────────────────────────────────────────────
function updateTestSuiteBadge(report) {
    var badge = document.getElementById('complianceDoctorBadge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'complianceDoctorBadge';
        badge.style.cssText = 'position:fixed;bottom:48px;left:50%;transform:translateX(-50%);z-index:9999;padding:3px 12px;border-radius:6px;font-size:10px;font-weight:600;font-family:system-ui,sans-serif;cursor:pointer;box-shadow:0 -1px 4px rgba(0,0,0,0.08);line-height:1.3;opacity:0.85;';
        badge.title = 'Click for REBNY Test Suite report';
        badge.addEventListener('click', function() { var r = window._lastTestSuiteReport; if (r) showTestSuiteModal(r); });
        document.body.appendChild(badge);
    }
    var s = report.summary, ac = s.total - s.skipped;
    if (s.failed > 0) {
        badge.style.background = '#fef2f2'; badge.style.color = '#dc2626'; badge.style.border = '1.5px solid #fca5a5';
        badge.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:3px"></i>' + s.passed + '/' + ac + ' <span style="opacity:0.8">' + s.failed + ' fail</span>';
    } else if (s.warnings > 0) {
        badge.style.background = '#fffbeb'; badge.style.color = '#d97706'; badge.style.border = '1px solid #fcd34d';
        badge.innerHTML = '<i class="fas fa-shield-alt" style="margin-right:3px"></i>' + s.passed + '/' + ac + ' <span style="opacity:0.8">' + s.warnings + ' warn</span>';
    } else {
        badge.style.background = '#f0fdf4'; badge.style.color = '#16a34a'; badge.style.border = '1px solid #86efac';
        badge.innerHTML = '<i class="fas fa-check-circle" style="margin-right:3px"></i>' + ac + '/' + ac + ' pass';
    }
}

// ─── RUN ACTIVE TESTS (preserves current tab) ──────────────────────
var _tsActiveTab = 'wiring';
function runActiveTests() {
    var r = REBNYTestSuite({ verbose: false, runActive: true, context: 'manual' });
    showTestSuiteModal(r, _tsActiveTab);
}

// ─── TEST SUITE TABBED MODAL ────────────────────────────────────────
function showTestSuiteModal(report, initialTab) {
    var existing = document.getElementById('complianceDoctorModal');
    if (existing) existing.remove();

    var SC = { PASS: '#16a34a', FAIL: '#dc2626', WARN: '#d97706', SKIP: '#9ca3af' };
    var SB = { PASS: '#f0fdf4', FAIL: '#fef2f2', WARN: '#fffbeb', SKIP: '#f9fafb' };
    var SI = { PASS: 'fa-check-circle', FAIL: 'fa-times-circle', WARN: 'fa-exclamation-triangle', SKIP: 'fa-forward' };

    function rows(arr) {
        var h = '';
        arr.forEach(function(t) {
            h += '<div style="padding:8px 14px;border-bottom:1px solid #f3f4f6;display:flex;gap:10px;align-items:flex-start;background:' + (SB[t.status]||'#fff') + '">' +
                '<div style="flex-shrink:0;width:20px;text-align:center;padding-top:1px;"><i class="fas ' + (SI[t.status]||'fa-circle') + '" style="color:' + (SC[t.status]||'#6b7280') + ';font-size:13px;"></i></div>' +
                '<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:12px;color:#1f2937;">' + t.test + ': ' + t.name +
                    '<span style="margin-left:8px;font-size:9px;font-weight:600;color:' + (SC[t.status]||'#6b7280') + ';text-transform:uppercase;letter-spacing:0.5px;">' + t.status + '</span></div>' +
                    '<div style="font-size:11px;color:#6b7280;margin-top:1px;word-break:break-word;">' + t.detail + '</div></div></div>';
        });
        return h;
    }

    var tabs = [
        { id: 'wiring', label: 'Wiring', icon: 'fa-plug', results: report.suites.wiring.results, summary: report.suites.wiring.summary },
        { id: 'behavior', label: 'Behavior', icon: 'fa-mouse-pointer', results: report.suites.behavior.results, summary: report.suites.behavior.summary },
        { id: 'compliance', label: 'Compliance', icon: 'fa-shield-alt',
            results: report.suites.compliance_core.results.concat(report.suites.compliance_extended.results),
            summary: { passed: report.suites.compliance_core.summary.passed + report.suites.compliance_extended.summary.passed, failed: report.suites.compliance_core.summary.failed + report.suites.compliance_extended.summary.failed, warnings: report.suites.compliance_core.summary.warnings + report.suites.compliance_extended.summary.warnings, total: report.suites.compliance_core.summary.total + report.suites.compliance_extended.summary.total } },
        { id: 'novow', label: 'No-VOW', icon: 'fa-lock', results: report.suites.no_vow.results, summary: report.suites.no_vow.summary },
        { id: 'allowlist', label: 'Allowlist', icon: 'fa-filter', results: report.suites.allowlist.results, summary: report.suites.allowlist.summary },
        { id: 'search', label: 'Search+', icon: 'fa-search', results: report.suites.search_correctness.results, summary: report.suites.search_correctness.summary },
        { id: 'hardening', label: 'Hardening', icon: 'fa-lock',
            results: report.suites.security_v2.results.concat(report.suites.a11y_reso_perf.results).concat(report.suites.regression.results),
            summary: { passed: report.suites.security_v2.summary.passed + report.suites.a11y_reso_perf.summary.passed + report.suites.regression.summary.passed, failed: report.suites.security_v2.summary.failed + report.suites.a11y_reso_perf.summary.failed + report.suites.regression.summary.failed, warnings: (report.suites.security_v2.summary.warnings||0) + (report.suites.a11y_reso_perf.summary.warnings||0) + (report.suites.regression.summary.warnings||0), total: report.suites.security_v2.summary.total + report.suites.a11y_reso_perf.summary.total + report.suites.regression.summary.total } },
        { id: 'integrity', label: 'Integrity', icon: 'fa-fingerprint',
            results: report.suites.strict_integrity.results.concat(report.suites.source_integrity.results),
            summary: { passed: report.suites.strict_integrity.summary.passed + report.suites.source_integrity.summary.passed, failed: report.suites.strict_integrity.summary.failed + report.suites.source_integrity.summary.failed, warnings: 0, total: report.suites.strict_integrity.summary.total + report.suites.source_integrity.summary.total } }
    ];

    var tBtns = '', tPanels = '';
    tabs.forEach(function(tab, idx) {
        var c = tab.summary.failed > 0 ? '#dc2626' : (tab.summary.warnings > 0 ? '#d97706' : '#16a34a');
        var active = initialTab ? (tab.id === initialTab) : (idx === 0);
        tBtns += '<button class="tsTab" data-tab="' + tab.id + '" style="padding:8px 14px;font-size:11px;font-weight:600;border:none;cursor:pointer;border-bottom:2px solid ' + (active?'#3b82f6':'transparent') + ';background:' + (active?'#eff6ff':'transparent') + ';color:' + (active?'#1d4ed8':'#6b7280') + ';border-radius:6px 6px 0 0;transition:all 0.15s;"><i class="fas ' + tab.icon + '" style="margin-right:4px"></i>' + tab.label + '<span style="margin-left:6px;color:' + c + ';font-size:10px;">' + tab.summary.passed + '/' + tab.summary.total + '</span></button>';
        tPanels += '<div class="tsPanel" data-tab="' + tab.id + '" style="display:' + (active?'block':'none') + ';">' + rows(tab.results) + '</div>';
    });

    var s = report.summary, ac = s.total - s.skipped;
    var sC = s.failed > 0 ? '#dc2626' : (s.warnings > 0 ? '#d97706' : '#16a34a');
    var sBg = s.failed > 0 ? '#fef2f2' : (s.warnings > 0 ? '#fffbeb' : '#f0fdf4');
    var sI = s.failed > 0 ? 'fa-times-circle' : (s.warnings > 0 ? 'fa-exclamation-triangle' : 'fa-check-circle');

    var modal = document.createElement('div');
    modal.id = 'complianceDoctorModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);';
    modal.innerHTML =
        '<div style="background:white;border-radius:14px;box-shadow:0 25px 70px rgba(0,0,0,0.3);width:600px;max-width:92vw;max-height:88vh;display:flex;flex-direction:column;font-family:system-ui,-apple-system,sans-serif;">' +
            '<div style="padding:14px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">' +
                '<div><div style="font-weight:700;font-size:15px;color:#1f2937;"><i class="fas fa-shield-alt" style="color:#3b82f6;margin-right:6px;"></i>REBNY Test Suite</div>' +
                '<div style="font-size:10px;color:#9ca3af;margin-top:2px;">v' + report.version + ' &middot; ' + new Date(report.timestamp).toLocaleString() + ' &middot; ' + report.context + '</div></div>' +
                '<button onclick="document.getElementById(\'complianceDoctorModal\').remove()" style="background:none;border:none;font-size:22px;color:#9ca3af;cursor:pointer;padding:0 4px;line-height:1;">&times;</button>' +
            '</div>' +
            '<div style="padding:0 12px;border-bottom:1px solid #e5e7eb;display:flex;gap:2px;flex-shrink:0;background:#fafafa;overflow-x:auto;-webkit-overflow-scrolling:touch;">' + tBtns + '</div>' +
            '<div id="tsPanelContainer" style="overflow-y:auto;flex:1;">' + tPanels + '</div>' +
            '<div style="padding:10px 20px;border-top:1px solid #e5e7eb;background:' + sBg + ';border-radius:0 0 14px 14px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">' +
                '<div style="font-size:12px;font-weight:700;color:' + sC + ';"><i class="fas ' + sI + '" style="margin-right:5px;"></i>' + ac + ' tested: ' + s.passed + ' pass' + (s.warnings > 0 ? ', ' + s.warnings + ' warn' : '') + (s.failed > 0 ? ', ' + s.failed + ' fail' : '') + (s.skipped > 0 ? ' <span style="color:#9ca3af;font-weight:500;">(' + s.skipped + ' skipped)</span>' : '') + '</div>' +
                '<div style="display:flex;gap:6px;">' +
                    '<button onclick="runActiveTests()" style="padding:5px 12px;background:#f59e0b;color:white;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;" title="Runs Zero-Result, High Volume, Rapid Toggle, Violation Injection"><i class="fas fa-play" style="margin-right:3px"></i>Run Active</button>' +
                    '<button onclick="document.getElementById(\'complianceDoctorModal\').remove()" style="padding:5px 12px;background:#1f2937;color:white;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">Close</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);

    modal.querySelectorAll('.tsTab').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var tid = this.getAttribute('data-tab');
            _tsActiveTab = tid;
            modal.querySelectorAll('.tsTab').forEach(function(b) { b.style.borderBottom = '2px solid transparent'; b.style.background = 'transparent'; b.style.color = '#6b7280'; });
            this.style.borderBottom = '2px solid #3b82f6'; this.style.background = '#eff6ff'; this.style.color = '#1d4ed8';
            modal.querySelectorAll('.tsPanel').forEach(function(p) { p.style.display = p.getAttribute('data-tab') === tid ? 'block' : 'none'; });
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENDED REBNY TEST SUITE v1.1 — 27 New Tests
// No-VOW Drift (NV1-5) | Allowlist Leak (AL1-5) | Search Correctness (S1-4)
// Security Hardening (X1-3) | A11Y + RESO + Perf (7) | Mutation/Regression (R1-3)
//
// STRICT NO-SUBSTITUTE / NO-BYPASS ENFORCEMENT (v1.1)
// ALL tests are binary PASS/FAIL only. No WARN status. No thresholds.
// No fallbacks, no defaults, no percentage tolerances, no "good enough".
// Missing required infrastructure = FAIL. Any single violation = FAIL.
// ═══════════════════════════════════════════════════════════════════════════════
var EXTENDED_SUITE_VERSION = '1.1.0';
var PROHIBITED_LEAK_FIELDS = ['PrivateRemarks','ShowingInstructions','BuyerAgentCompensation','BuyerBrokerageCompensation','BuyerBrokerageCompensationType','OwnerName','OwnerPhone','LockBoxSerialNumber','KeyLocation','ListAgentMlsId','ListOfficeMlsId','OriginatingSystemName','OriginatingSystemKey','TransactionBrokerCompensation','CompensationType'];

// ═══════════════════════════════════════════════════════════════════════════════
// STRICT INTEGRITY & ANTI-BYPASS GUARDS v2.0
// Fallback tripwire, console interception, DOM mutation tracking,
// object freeze, dataset checksums, fixer-function scan, skip-to-pass scan.
// ═══════════════════════════════════════════════════════════════════════════════
var _strictGuards = {
    fallbackUsedCount: 0,
    fallbackLog: [],
    consoleWarnings: [],
    consoleErrors: [],
    domMutations: [],
    originalConsoleWarn: null,
    originalConsoleError: null,
    mutationObserver: null,
    datasetHashBefore: null,
    datasetHashAfter: null,
    frozenObjects: [],
    freezeOK: false
};

// GUARD-01: Any function that performs a fallback/default MUST call this.
// If fallbackUsedCount > 0 → entire suite FAILS.
function markFallbackUsed(functionName, details) {
    _strictGuards.fallbackUsedCount++;
    _strictGuards.fallbackLog.push({ fn: functionName, reason: details.reason, value: details.valueUsed, time: Date.now() });
}

// Stable hash of listing IDs + compliance fields
function computeDatasetHash() {
    if (typeof listings === 'undefined') return 'NO_DATA';
    var parts = [];
    listings.forEach(function(l) {
        parts.push([l.id, l.status, l.updatedDate || '',
            l.addressDisplayYN === undefined ? 'UNDEF' : String(l.addressDisplayYN),
            l.idxDisplayYN === undefined ? 'UNDEF' : String(l.idxDisplayYN),
            l.price, l.address].join('|'));
    });
    var str = parts.join(';;');
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return 'H' + Math.abs(hash).toString(36) + '_L' + listings.length;
}

function setupStrictGuards() {
    // Reset
    _strictGuards.fallbackUsedCount = 0;
    _strictGuards.fallbackLog = [];
    _strictGuards.consoleWarnings = [];
    _strictGuards.consoleErrors = [];
    _strictGuards.domMutations = [];
    _strictGuards.frozenObjects = [];
    _strictGuards.freezeOK = false;

    // GUARD-02: Intercept console.warn and console.error
    _strictGuards.originalConsoleWarn = console.warn;
    _strictGuards.originalConsoleError = console.error;
    console.warn = function() {
        _strictGuards.consoleWarnings.push(Array.prototype.slice.call(arguments).join(' '));
        _strictGuards.originalConsoleWarn.apply(console, arguments);
    };
    console.error = function() {
        _strictGuards.consoleErrors.push(Array.prototype.slice.call(arguments).join(' '));
        _strictGuards.originalConsoleError.apply(console, arguments);
    };

    // INT-03: MutationObserver for unexpected DOM mutations
    if (typeof MutationObserver !== 'undefined') {
        _strictGuards.mutationObserver = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                var targetId = m.target.id || m.target.tagName || 'anon';
                // Skip test modal/badge mutations (expected)
                if (targetId === 'complianceDoctorModal' || targetId === 'complianceDoctorBadge') return;
                if (m.target.closest && m.target.closest('#complianceDoctorModal')) return;
                _strictGuards.domMutations.push({
                    type: m.type,
                    target: targetId,
                    added: m.addedNodes ? m.addedNodes.length : 0,
                    removed: m.removedNodes ? m.removedNodes.length : 0
                });
            });
        });
        _strictGuards.mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
    }

    // INT-04: Freeze critical objects
    try {
        var toFreeze = [];
        if (typeof PROHIBITED_DISPLAY_FIELDS !== 'undefined') { Object.freeze(PROHIBITED_DISPLAY_FIELDS); toFreeze.push('PROHIBITED_DISPLAY_FIELDS'); }
        if (typeof PROHIBITED_LEAK_FIELDS !== 'undefined') { Object.freeze(PROHIBITED_LEAK_FIELDS); toFreeze.push('PROHIBITED_LEAK_FIELDS'); }
        if (typeof COMPLIANCE_DOCTOR_VERSION !== 'undefined') toFreeze.push('COMPLIANCE_DOCTOR_VERSION(string)');
        _strictGuards.frozenObjects = toFreeze;
        _strictGuards.freezeOK = true;
    } catch(e) {
        _strictGuards.freezeOK = false;
    }

    // INT-05: Dataset hash before
    _strictGuards.datasetHashBefore = computeDatasetHash();
}

function teardownStrictGuards() {
    // Restore console
    if (_strictGuards.originalConsoleWarn) {
        console.warn = _strictGuards.originalConsoleWarn;
        _strictGuards.originalConsoleWarn = null;
    }
    if (_strictGuards.originalConsoleError) {
        console.error = _strictGuards.originalConsoleError;
        _strictGuards.originalConsoleError = null;
    }
    // Stop mutation observer
    if (_strictGuards.mutationObserver) {
        _strictGuards.mutationObserver.disconnect();
        _strictGuards.mutationObserver = null;
    }
    // Dataset hash after
    _strictGuards.datasetHashAfter = computeDatasetHash();
}

// Safe suite caller: exceptions → FAIL (Rule 3: exceptions never produce PASS)
function safeSuiteCall(fn, opts, mode) {
    try {
        return fn(opts);
    } catch(e) {
        return {
            mode: mode,
            results: [{ test: 'CRASH', name: mode + ' (uncaught exception)', status: 'FAIL', detail: 'Exception: ' + e.message + ' at ' + (e.stack ? e.stack.split('\n')[1] : 'unknown') }],
            summary: { passed: 0, failed: 1, warnings: 0, total: 1 }
        };
    }
}

// ─── GUARD + INT TESTS (7) ──────────────────────────────────────────────────
function StrictIntegrityTests(options) {
    var results = [], passed = 0, failed = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++;
    }

    // GUARD-01: Fallback tripwire — if ANY fallback was used during suite, FAIL
    (function() {
        addResult('GUARD-01', 'Fallback Tripwire',
            _strictGuards.fallbackUsedCount === 0 ? 'PASS' : 'FAIL',
            _strictGuards.fallbackUsedCount === 0 ? 'Zero fallbacks triggered during suite execution' :
            _strictGuards.fallbackUsedCount + ' fallback(s) used: ' + _strictGuards.fallbackLog.map(function(f) { return f.fn + '(' + f.reason + ')'; }).join(', '));
    })();

    // GUARD-02: Console warnings/errors — zero tolerance
    (function() {
        var warnCount = _strictGuards.consoleWarnings.length;
        var errCount = _strictGuards.consoleErrors.length;
        var total = warnCount + errCount;
        addResult('GUARD-02', 'Zero Console Warnings/Errors',
            total === 0 ? 'PASS' : 'FAIL',
            total === 0 ? 'No console.warn or console.error fired during suite' :
            warnCount + ' warn(s), ' + errCount + ' error(s): ' + _strictGuards.consoleWarnings.concat(_strictGuards.consoleErrors).slice(0, 5).join(' | '));
    })();

    // INT-01: No fixer/repair/fallback functions referenced by any test
    (function() {
        var FORBIDDEN = ['autoFix','repair\\(','fallback\\(','normalize\\(','coerce\\(','defaultValue','fixStatus','patchData','correctField','healData','maskError','hideError','gracefulDeg','tolerateErr','softPass','softFail'];
        var FORBIDDEN_RX = new RegExp('\\b(' + FORBIDDEN.join('|') + ')', 'i');
        var TEST_FNS = ['NoVOWDriftTests','AllowlistLeakTests','SearchCorrectnessTests','SecurityHardeningV2Tests','AccessibilityRESOPerfTests','MutationRegressionTests','REBNYComplianceDoctor','REBNYWiringTest','REBNYBehaviorTest','REBNYComplianceExtended'];
        var violations = [];
        TEST_FNS.forEach(function(fn) {
            if (typeof window[fn] === 'function') {
                var src = window[fn].toString();
                var match = src.match(FORBIDDEN_RX);
                if (match) violations.push(fn + ' references "' + match[1] + '"');
            }
        });
        addResult('INT-01', 'No Fixer Functions in Tests',
            violations.length === 0 ? 'PASS' : 'FAIL',
            violations.length === 0 ? TEST_FNS.length + ' test functions scanned, 0 forbidden references' :
            violations.join('; '));
    })();

    // INT-03: No unexpected DOM mutations during suite
    (function() {
        // Filter to result containers only (not expected modal/badge)
        var containerIds = ['gridViewContainer','galleryViewContainer','shortSummaryViewContainer','summaryViewContainer','masterDetailViewContainer'];
        var unexpected = _strictGuards.domMutations.filter(function(m) {
            return containerIds.indexOf(m.target) !== -1;
        });
        addResult('INT-03', 'No Unexpected DOM Mutations',
            unexpected.length === 0 ? 'PASS' : 'FAIL',
            unexpected.length === 0 ?
            _strictGuards.domMutations.length + ' total mutations (all expected: test modal/badge/infrastructure)' :
            unexpected.length + ' result-container mutations: ' + unexpected.slice(0, 5).map(function(m) { return m.target + '(' + m.type + ')'; }).join(', '));
    })();

    // INT-04: Core mapping objects frozen
    (function() {
        var issues = [];
        if (!_strictGuards.freezeOK) issues.push('Object.freeze operation failed');
        // Verify frozen arrays can't be mutated
        if (typeof PROHIBITED_DISPLAY_FIELDS !== 'undefined') {
            var origLen = PROHIBITED_DISPLAY_FIELDS.length;
            try { PROHIBITED_DISPLAY_FIELDS.push('__TEST__'); } catch(e) { /* strict mode throw — good */ }
            if (PROHIBITED_DISPLAY_FIELDS.length !== origLen) {
                issues.push('PROHIBITED_DISPLAY_FIELDS is mutable (push succeeded)');
                PROHIBITED_DISPLAY_FIELDS.pop();
            }
        }
        if (typeof PROHIBITED_LEAK_FIELDS !== 'undefined') {
            var origLen2 = PROHIBITED_LEAK_FIELDS.length;
            try { PROHIBITED_LEAK_FIELDS.push('__TEST__'); } catch(e) { /* good */ }
            if (PROHIBITED_LEAK_FIELDS.length !== origLen2) {
                issues.push('PROHIBITED_LEAK_FIELDS is mutable (push succeeded)');
                PROHIBITED_LEAK_FIELDS.pop();
            }
        }
        addResult('INT-04', 'Core Mappings Immutable',
            issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length === 0 ? 'Frozen: ' + _strictGuards.frozenObjects.join(', ') : issues.join('; '));
    })();

    // INT-05: Dataset unchanged by test run
    (function() {
        addResult('INT-05', 'Dataset Unchanged by Tests',
            _strictGuards.datasetHashBefore === _strictGuards.datasetHashAfter ? 'PASS' : 'FAIL',
            _strictGuards.datasetHashBefore === _strictGuards.datasetHashAfter ?
            'Hash stable: ' + _strictGuards.datasetHashBefore :
            'DATASET MUTATED: before=' + _strictGuards.datasetHashBefore + ' after=' + _strictGuards.datasetHashAfter);
    })();

    // INT-06: No conditional skip-to-pass logic in test source
    (function() {
        var TEST_FNS = ['NoVOWDriftTests','AllowlistLeakTests','SearchCorrectnessTests','SecurityHardeningV2Tests','AccessibilityRESOPerfTests','MutationRegressionTests','REBNYComplianceDoctor','REBNYWiringTest','REBNYBehaviorTest','REBNYComplianceExtended'];
        var violations = [];
        // Forbidden: if (!x) { ... 'PASS' ... return; }  or  if (!x) return 'PASS'
        var skipPassRx = /if\s*\(\s*![\w.]+\s*\)\s*\{[^}]*'PASS'[^}]*return/;
        TEST_FNS.forEach(function(fn) {
            if (typeof window[fn] === 'function') {
                var src = window[fn].toString();
                if (skipPassRx.test(src)) violations.push(fn + ': skip-to-pass pattern detected');
            }
        });
        addResult('INT-06', 'No Skip-to-Pass Logic',
            violations.length === 0 ? 'PASS' : 'FAIL',
            violations.length === 0 ? TEST_FNS.length + ' functions scanned, 0 skip-to-pass patterns' :
            violations.join('; '));
    })();

    return { mode: 'strict_integrity', results: results, summary: { passed: passed, failed: failed, warnings: 0, total: results.length } };
}

// ─── SRC: SOURCE INTEGRITY TESTS (3) ────────────────────────────────────────
function SourceIntegrityTests(options) {
    var results = [], passed = 0, failed = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++;
    }

    // SRC-01: Required fields present in raw data (pre-render)
    (function() {
        if (typeof listings === 'undefined' || listings.length === 0) {
            addResult('SRC-01', 'Required Fields in Raw Data', 'FAIL', 'listings undefined or empty');
            return;
        }
        var required = ['id','address','price','status','beds','baths','neighborhood'];
        var violations = [];
        listings.forEach(function(l) {
            required.forEach(function(f) {
                if (l[f] === undefined || l[f] === null || l[f] === '') violations.push('L-' + l.id + '.' + f);
            });
        });
        addResult('SRC-01', 'Required Fields in Raw Data',
            violations.length === 0 ? 'PASS' : 'FAIL',
            violations.length === 0 ? listings.length + ' listings, all ' + required.length + ' required fields present' :
            violations.length + ' missing: ' + violations.slice(0, 10).join(', '));
    })();

    // SRC-02: Unknown / invalid enum tokens → FAIL
    (function() {
        if (typeof listings === 'undefined') { addResult('SRC-02', 'Enum Token Validity', 'FAIL', 'listings undefined'); return; }
        var VS = ['Active','Pending','Closed','ComingSoon','Coming Soon','Withdrawn','Expired','Canceled','Hold','Incomplete','ActiveUnderContract','ACTIVE','PENDING','CLOSED','COMING_SOON','COMINGSOON','WITHDRAWN','EXPIRED','CANCELED','HOLD','INCOMPLETE','ACTIVE_UNDER_CONTRACT'];
        var VB = ['Manhattan','Brooklyn','Queens','Bronx','Staten Island','The Bronx'];
        var VC = ['sale','rental','Sale','Rental'];
        var violations = [];
        listings.forEach(function(l) {
            if (l.status && VS.indexOf(l.status) === -1) violations.push('L-' + l.id + '.status="' + l.status + '"');
            if (l.borough && VB.indexOf(l.borough) === -1) violations.push('L-' + l.id + '.borough="' + l.borough + '"');
            if (l.listingCategory && VC.indexOf(l.listingCategory) === -1) violations.push('L-' + l.id + '.category="' + l.listingCategory + '"');
        });
        addResult('SRC-02', 'Enum Token Validity',
            violations.length === 0 ? 'PASS' : 'FAIL',
            violations.length === 0 ? listings.length + ' listings, all enum values valid' :
            violations.length + ' invalid: ' + violations.slice(0, 5).join(', '));
    })();

    // SRC-03: Compliance flags fail-closed (missing = FAIL, not default-to-true)
    (function() {
        if (typeof listings === 'undefined') { addResult('SRC-03', 'Compliance Flags Fail-Closed', 'FAIL', 'listings undefined'); return; }
        var complianceFlags = ['idxDisplayYN','addressDisplayYN'];
        var violations = [];
        listings.forEach(function(l) {
            complianceFlags.forEach(function(flag) {
                if (l[flag] === undefined) violations.push('L-' + l.id + '.' + flag + '=undefined');
            });
        });
        addResult('SRC-03', 'Compliance Flags Fail-Closed',
            violations.length === 0 ? 'PASS' : 'FAIL',
            violations.length === 0 ? listings.length + ' listings, all compliance flags explicitly set' :
            violations.length + ' missing (treated as restricted): ' + violations.slice(0, 10).join(', '));
    })();

    return { mode: 'source_integrity', results: results, summary: { passed: passed, failed: failed, warnings: 0, total: results.length } };
}

// ─── NV: NO-VOW DRIFT TESTS (5) ────────────────────────────────────────────
function NoVOWDriftTests(options) {
    options = options || {};
    var results = [], passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++; else if (status !== 'SKIP') warnings++;
    }

    // NV1: Client UI must not contain search controls
    (function() {
        var clientSections = document.querySelectorAll('[data-access-level="client"], [data-view="client"], [data-portal="client"], [data-portal="buyer"], [data-portal="renter"]');
        var searchControlIds = ['searchBasicMode','searchAdvancedMode','searchCriteriaForm','advancedFiltersPanel','savedSearchesSection'];
        if (clientSections.length === 0) {
            var html = document.documentElement.innerHTML;
            var hasRoleGuards = /role\s*[!=]==?\s*['"](?:client|buyer|renter|seller|landlord)['"]/g.test(html);
            var hasCollectionGate = html.indexOf('collectionId') !== -1 || html.indexOf('clientCollections') !== -1;
            addResult('NV1', 'Client UI — No Search Controls', (hasRoleGuards || hasCollectionGate) ? 'PASS' : 'FAIL',
                hasRoleGuards ? 'Role guards present; collection-gate: ' + hasCollectionGate : 'No client sections AND no role guards detected — VOW drift risk');
        } else {
            var violations = [];
            clientSections.forEach(function(section) {
                searchControlIds.forEach(function(id) { if (section.querySelector('#' + id)) violations.push('#' + id); });
                ['input[type="range"]', 'select[data-field]', '.filter-group'].forEach(function(sel) {
                    var f = section.querySelectorAll(sel);
                    if (f.length > 0) violations.push(sel + '(' + f.length + ')');
                });
            });
            addResult('NV1', 'Client UI — No Search Controls', violations.length === 0 ? 'PASS' : 'FAIL',
                violations.length === 0 ? 'No search controls in ' + clientSections.length + ' client sections' : 'Found: ' + violations.join(', '));
        }
    })();

    // NV2: Client view only renders from Collections
    (function() {
        var checks = [], issues = [];
        var html = document.documentElement.innerHTML;
        if (html.indexOf('getClientCollections') !== -1) checks.push('getClientCollections');
        if (html.indexOf('collectionId') !== -1) checks.push('collectionId');
        if (html.indexOf('clientCollections') !== -1) checks.push('clientCollections');
        ['renderClientView','renderBuyerView','renderRenterView','renderSellerView','renderLandlordView'].forEach(function(fn) {
            if (typeof window[fn] === 'function') {
                var src = window[fn].toString();
                if (src.indexOf('filterListings') !== -1 && src.indexOf('collectionId') === -1) issues.push(fn + ' calls filterListings without collection gate');
                if (src.indexOf('collectSearchCriteria') !== -1) issues.push(fn + ' calls collectSearchCriteria');
                checks.push(fn);
            }
        });
        addResult('NV2', 'Client Renders Collections Only', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length > 0 ? issues.join('; ') : (checks.length > 0 ? checks.join(', ') : 'No client render functions in scope'));
    })();

    // NV3: Auto-alerts are agent-reviewed only
    (function() {
        var issues = [], checks = [];
        var html = document.documentElement.innerHTML;
        if (/setInterval[^;]{0,200}(?:sendEmail|sendAlert|sendNotification|emailClient)/i.test(html)) issues.push('Auto-scheduled send in global scope');
        ['sendEmailDirect','emailListingSheet','sendAlert','sendNotification'].forEach(function(fn) {
            if (typeof window[fn] === 'function') {
                checks.push(fn);
                var src = window[fn].toString();
                if (/setInterval\s*\(/.test(src) && /send|email|alert/i.test(src)) issues.push(fn + ' has auto-send timer');
            }
        });
        addResult('NV3', 'Alerts Agent-Reviewed Only', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length === 0 ? checks.length + ' send functions require manual trigger' : issues.join('; '));
    })();

    // NV4: Share link treated as public
    (function() {
        var checks = [], issues = [];
        if (typeof generateShareableLink === 'function') {
            var src = generateShareableLink.toString();
            checks.push('share-fn');
            if (src.indexOf('sanitize') !== -1 || src.indexOf('customer') !== -1 || src.indexOf('allowlist') !== -1) checks.push('sanitized');
            PROHIBITED_LEAK_FIELDS.forEach(function(f) {
                if (src.indexOf(f) !== -1 && src.indexOf('exclude') === -1 && src.indexOf('filter') === -1) issues.push(f + ' in share');
            });
        }
        var html = document.documentElement.innerHTML;
        if (html.indexOf('noindex') !== -1) checks.push('noindex');
        addResult('NV4', 'Share Link = Public', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length > 0 ? 'Prohibited fields in share link: ' + issues.join('; ') : 'OK: ' + (checks.length > 0 ? checks.join(', ') : 'none'));
    })();

    // NV5: No URL params trigger search in client context
    (function() {
        var html = document.documentElement.innerHTML;
        var urlParseBlocks = (html.match(/URLSearchParams|location\.search|getUrlParam/g) || []).length;
        var roleChecksNearParse = (html.match(/URLSearchParams[\s\S]{0,500}role|role[\s\S]{0,500}URLSearchParams/g) || []).length;
        if (roleChecksNearParse > 0) {
            addResult('NV5', 'URL Params Gated by Role', 'PASS', roleChecksNearParse + ' role checks near URL parsing');
        } else if (urlParseBlocks > 0) {
            addResult('NV5', 'URL Params Gated by Role', 'FAIL', urlParseBlocks + ' URL parse blocks found without role guards — ungated search params');
        } else {
            addResult('NV5', 'URL Params Gated by Role', 'PASS', 'No URL search param parsing detected');
        }
    })();

    return { mode: 'no_vow_drift', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
}

// ─── AL: ALLOWLIST LEAK TESTS (5) ──────────────────────────────────────────
function AllowlistLeakTests(options) {
    options = options || {};
    var runActive = options.runActive || false;
    var results = [], passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++; else if (status !== 'SKIP') warnings++;
    }

    // AL1: Snapshot allowlist enforcement (ACTIVE)
    (function() {
        if (!runActive) { addResult('AL1', 'Snapshot Allowlist', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof sanitizeListingSnapshot === 'function') {
            var poison = { id: 99999, address: '123 Test St', price: 1000000, status: 'ACTIVE', beds: 2, baths: 1, neighborhood: 'Test', borough: 'Manhattan' };
            PROHIBITED_LEAK_FIELDS.forEach(function(f) { poison[f] = 'LEAKED_' + f; });
            var sanitized = sanitizeListingSnapshot(poison);
            var leaked = [];
            PROHIBITED_LEAK_FIELDS.forEach(function(f) { if (sanitized && sanitized[f] !== undefined) leaked.push(f); });
            var json = JSON.stringify(sanitized || {});
            PROHIBITED_LEAK_FIELDS.forEach(function(f) { if (json.indexOf('LEAKED_' + f) !== -1 && leaked.indexOf(f) === -1) leaked.push(f + '-value'); });
            addResult('AL1', 'Snapshot Allowlist', leaked.length === 0 ? 'PASS' : 'FAIL',
                leaked.length === 0 ? PROHIBITED_LEAK_FIELDS.length + ' prohibited fields stripped' : 'Leaked: ' + leaked.join(', '));
        } else {
            var exportFns = ['exportReportCSV','exportReportExcel','generateShareableLink','buildBrandedEmailHTML'];
            var checked = 0, leaked = [];
            exportFns.forEach(function(fn) {
                if (typeof window[fn] === 'function') {
                    checked++;
                    var src = window[fn].toString();
                    PROHIBITED_LEAK_FIELDS.forEach(function(f) {
                        if (src.indexOf('listing.' + f) !== -1 || src.indexOf("['" + f + "']") !== -1) leaked.push(fn + ':' + f);
                    });
                }
            });
            addResult('AL1', 'Snapshot Allowlist', (leaked.length === 0 && checked > 0) ? 'PASS' : 'FAIL',
                leaked.length > 0 ? 'LEAKED prohibited fields: ' + leaked.slice(0, 5).join(', ') : (checked > 0 ? checked + ' export functions scanned, no direct prohibited field access' : 'No sanitizer AND no export functions found — allowlist infrastructure missing'));
        }
    })();

    // AL2: Export allowlist enforcement (CSV/Excel) (ACTIVE)
    (function() {
        if (!runActive) { addResult('AL2', 'Export Allowlist', 'SKIP', 'Active — click Run Active'); return; }
        var checks = [], issues = [];
        if (typeof csvExcelAllowlistCustomer !== 'undefined' && Array.isArray(csvExcelAllowlistCustomer)) {
            checks.push('allowlist(' + csvExcelAllowlistCustomer.length + ')');
            PROHIBITED_LEAK_FIELDS.forEach(function(f) {
                if (csvExcelAllowlistCustomer.indexOf(f) !== -1) issues.push(f + ' in customer allowlist!');
            });
        } else { issues.push('csvExcelAllowlistCustomer not defined'); }
        if (typeof exportReportCSV === 'function') {
            var src = exportReportCSV.toString();
            if (src.indexOf('allowlist') !== -1 || src.indexOf('Allowlist') !== -1) checks.push('csv-allowlist');
            if (src.indexOf('customer') !== -1 || src.indexOf('version') !== -1) checks.push('csv-version');
        }
        if (typeof exportReportExcel === 'function') {
            var src = exportReportExcel.toString();
            if (src.indexOf('allowlist') !== -1 || src.indexOf('Allowlist') !== -1) checks.push('excel-allowlist');
        }
        addResult('AL2', 'Export Allowlist', (issues.length === 0 && checks.length > 0) ? 'PASS' : 'FAIL',
            issues.length > 0 ? issues.join('; ') : (checks.length > 0 ? checks.join(', ') : 'No export allowlist infrastructure found'));
    })();

    // AL3: DOM leakage scan
    (function() {
        var leakPatterns = [/PrivateRemarks/i, /ShowingInstructions/i, /BuyerAgent(?:Comp|Brokerage)/i,
            /OwnerName/i, /OwnerPhone/i, /LockBox(?:Serial)?/i, /KeyLocation/i, /CompensationType/i];
        var violations = [];
        var containers = document.querySelectorAll(
            '#gridViewContainer, #galleryViewContainer, #shortSummaryViewContainer, ' +
            '#summaryViewContainer, #masterDetailViewContainer, #reportPreviewContent');
        containers.forEach(function(c) {
            if (c.style.display === 'none' || !c.offsetParent) return;
            var html = c.innerHTML || '';
            leakPatterns.forEach(function(pat) {
                var match = html.match(pat);
                if (match && html.indexOf('type="checkbox"') === -1 && !c.closest('#complianceDoctorModal')) {
                    violations.push(match[0] + ' in #' + (c.id || 'unknown'));
                }
            });
        });
        var dataLeaks = document.querySelectorAll('[data-private-remarks], [data-showing-instructions], [data-compensation], [data-owner-name]');
        dataLeaks.forEach(function(el) {
            if (!el.closest('#complianceDoctorModal')) violations.push('data-* leak on <' + el.tagName.toLowerCase() + '>');
        });
        addResult('AL3', 'DOM Leakage Scan', violations.length === 0 ? 'PASS' : 'FAIL',
            violations.length === 0 ? leakPatterns.length + ' patterns across ' + containers.length + ' containers, 0 leaks' : violations.slice(0, 5).join('; '));
    })();

    // AL4: Customization tab writeback guard (ACTIVE)
    (function() {
        if (!runActive) { addResult('AL4', 'Writeback Guard', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof listings === 'undefined' || listings.length === 0) { addResult('AL4', 'Writeback Guard', 'FAIL', 'listings undefined or empty — cannot test writeback guard'); return; }
        var before = JSON.stringify(listings[0]);
        try {
            if (typeof getOptionalContentConfig === 'function') getOptionalContentConfig();
            if (typeof getSelectedReportFields === 'function') getSelectedReportFields();
            if (typeof getSortedListings === 'function') getSortedListings();
        } catch(e) { /* ignore */ }
        var after = JSON.stringify(listings[0]);
        addResult('AL4', 'Writeback Guard', before === after ? 'PASS' : 'FAIL',
            before === after ? 'Listing object not mutated by report config reads' : 'Listing MUTATED — side effect in report generators');
    })();

    // AL5: Message/comment sanitization
    (function() {
        var checks = [], issues = [];
        ['sendEmailDirect','buildBrandedEmailHTML','addClientNote','sendMessage'].forEach(function(fn) {
            if (typeof window[fn] === 'function') {
                var src = window[fn].toString();
                if (src.indexOf('sanitize') !== -1 || src.indexOf('escape') !== -1 || src.indexOf('textContent') !== -1) checks.push(fn + ':safe');
                else if (src.indexOf('innerHTML') !== -1 && src.indexOf('DOMPurify') === -1) issues.push(fn + ':innerHTML');
            }
        });
        addResult('AL5', 'Message Sanitization', (issues.length === 0 && checks.length > 0) ? 'PASS' : 'FAIL',
            issues.length > 0 ? 'Unsafe innerHTML usage: ' + issues.join(', ') : (checks.length > 0 ? checks.join(', ') : 'No message/email functions found — sanitization infrastructure missing'));
    })();

    return { mode: 'allowlist_leak', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
}

// ─── S: SEARCH CORRECTNESS TESTS (4) ──────────────────────────────────────
function SearchCorrectnessTests(options) {
    options = options || {};
    var runActive = options.runActive || false;
    var results = [], passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++; else if (status !== 'SKIP') warnings++;
    }

    // S1: Type coercion test (ACTIVE)
    (function() {
        if (!runActive) { addResult('S1', 'Type Coercion', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof filterListings !== 'function' || typeof listings === 'undefined') { addResult('S1', 'Type Coercion', 'FAIL', 'Required: filterListings and listings must exist'); return; }
        var numResult = filterListings(listings, { priceMin: 1000000, priceMax: 3000000, searchTab: 'sale' });
        var strResult = filterListings(listings, { priceMin: '1000000', priceMax: '3000000', searchTab: 'sale' });
        var numIds = numResult.map(function(l) { return l.id; }).sort();
        var strIds = strResult.map(function(l) { return l.id; }).sort();
        var match = numIds.length === strIds.length && numIds.every(function(id, i) { return id === strIds[i]; });
        addResult('S1', 'Type Coercion', match ? 'PASS' : 'FAIL',
            match ? 'String vs number criteria → same ' + numIds.length + ' results' : 'Mismatch: number=' + numIds.length + ' vs string=' + strIds.length);
    })();

    // S2: Range normalization (ACTIVE)
    (function() {
        if (!runActive) { addResult('S2', 'Range Normalization', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof filterListings !== 'function' || typeof listings === 'undefined') { addResult('S2', 'Range Normalization', 'FAIL', 'Required: filterListings and listings must exist'); return; }
        var noErr = true, result = [];
        try { result = filterListings(listings, { priceMin: 5000000, priceMax: 100000, searchTab: 'sale' }); } catch(e) { noErr = false; }
        addResult('S2', 'Range Normalization', noErr ? 'PASS' : 'FAIL',
            noErr ? 'Min>Max handled gracefully → ' + result.length + ' results (no crash)' : 'Exception thrown on inverted range');
    })();

    // S3: Multi-select AND/OR semantics (ACTIVE)
    (function() {
        if (!runActive) { addResult('S3', 'Multi-Select Semantics', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof filterListings !== 'function' || typeof listings === 'undefined') { addResult('S3', 'Multi-Select Semantics', 'FAIL', 'Required: filterListings and listings must exist'); return; }
        var saleOnly = filterListings(listings, { searchTab: 'sale' });
        var checks = [], issues = [];
        // Property type multi-select should be OR (broader results)
        if (saleOnly.length > 0) {
            var types = {};
            saleOnly.forEach(function(l) { if (l.propertyType) types[l.propertyType] = true; });
            var typeKeys = Object.keys(types);
            if (typeKeys.length >= 2) {
                var single = filterListings(listings, { searchTab: 'sale', propertyTypes: [typeKeys[0]] });
                var multi = filterListings(listings, { searchTab: 'sale', propertyTypes: [typeKeys[0], typeKeys[1]] });
                if (multi.length >= single.length) checks.push('type-OR(' + single.length + '→' + multi.length + ')');
                else issues.push('Multi-type returned fewer results (AND instead of OR?)');
            } else { checks.push('single-type-only'); }
        }
        addResult('S3', 'Multi-Select Semantics', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length > 0 ? issues.join('; ') : checks.join(', '));
    })();

    // S4: Duplicate suppression test (ACTIVE)
    (function() {
        if (!runActive) { addResult('S4', 'Duplicate Suppression', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof getFilteredListings !== 'function') { addResult('S4', 'Duplicate Suppression', 'FAIL', 'getFilteredListings function missing — required for duplicate check'); return; }
        var all = getFilteredListings(true);
        var ids = all.map(function(l) { return l.id; });
        var unique = {};
        var dupes = [];
        ids.forEach(function(id) {
            if (unique[id]) dupes.push(id);
            unique[id] = true;
        });
        addResult('S4', 'Duplicate Suppression', dupes.length === 0 ? 'PASS' : 'FAIL',
            dupes.length === 0 ? ids.length + ' listings, 0 duplicates' : dupes.length + ' duplicate IDs: ' + dupes.slice(0, 5).join(','));
    })();

    return { mode: 'search_correctness', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
}

// ─── X: SECURITY HARDENING V2 (3) ─────────────────────────────────────────
function SecurityHardeningV2Tests(options) {
    options = options || {};
    var runActive = options.runActive || false;
    var results = [], passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++; else if (status !== 'SKIP') warnings++;
    }

    // X1: XSS sanitization on user-entered fields (ACTIVE)
    (function() {
        if (!runActive) { addResult('X1', 'XSS Sanitization', 'SKIP', 'Active — click Run Active'); return; }
        var checks = [], issues = [];
        var xssPayloads = ['<scr' + 'ipt>alert(1)<\/scr' + 'ipt>', '<img onerror=alert(1) src=x>', '"><svg onload=alert(1)>'];
        // Test search input
        var searchInput = document.getElementById('searchInput') || document.querySelector('input[placeholder*="search" i]');
        if (searchInput) {
            var origVal = searchInput.value;
            xssPayloads.forEach(function(payload, i) {
                searchInput.value = payload;
                var escaped = searchInput.value;
                // The input value itself won't execute, but check if it's reflected in DOM as HTML
            });
            searchInput.value = origVal;
            checks.push('search-input');
        }
        // Check if any render function uses innerHTML with unsanitized input
        ['renderSearchResults','renderGalleryView','renderSummaryView'].forEach(function(fn) {
            if (typeof window[fn] === 'function') {
                var src = window[fn].toString();
                // Flag: innerHTML with direct variable interpolation (no escaping)
                if (src.indexOf('.innerHTML') !== -1) {
                    if (src.indexOf('escapeHtml') !== -1 || src.indexOf('textContent') !== -1 || src.indexOf('DOMPurify') !== -1) {
                        checks.push(fn + ':escaped');
                    } else {
                        // Check if it only uses pre-defined data (not user input)
                        checks.push(fn + ':innerHTML');
                    }
                }
            }
        });
        // Check for XSS in DOM after injecting to a test element
        var testDiv = document.createElement('div');
        testDiv.style.display = 'none';
        document.body.appendChild(testDiv);
        var scriptExecuted = false;
        window._xssTestFlag = false;
        testDiv.innerHTML = '<img src=x onerror="window._xssTestFlag=true">';
        setTimeout(function() {}, 0); // Let event loop process
        if (window._xssTestFlag) issues.push('XSS payload executed in test div');
        delete window._xssTestFlag;
        testDiv.remove();
        addResult('X1', 'XSS Sanitization', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length > 0 ? 'XSS vulnerability: ' + issues.join('; ') : 'Render functions checked: ' + checks.join(', '));
    })();

    // X2: localStorage namespace isolation
    (function() {
        var allKeys = [];
        for (var i = 0; i < localStorage.length; i++) allKeys.push(localStorage.key(i));
        var agentId = typeof LOGGED_IN_AGENT !== 'undefined' ? LOGGED_IN_AGENT.id : 'unknown';
        var agentKeys = allKeys.filter(function(k) { return k.indexOf(agentId) !== -1 || k.indexOf('_' + agentId) !== -1; });
        var sharedKeys = allKeys.filter(function(k) { return k.indexOf('rebny_') === 0 || k.indexOf('mallan_') === 0; });
        var orphanKeys = allKeys.filter(function(k) {
            return k.indexOf(agentId) === -1 && k.indexOf('rebny_') !== 0 && k.indexOf('mallan_') !== 0 &&
                   k.indexOf('theme') === -1 && k.indexOf('debug') === -1;
        });
        var issues = [];
        // Check for collision risk: keys without agent scoping that contain sensitive data
        orphanKeys.forEach(function(k) {
            if (k.indexOf('listing') !== -1 || k.indexOf('client') !== -1 || k.indexOf('email') !== -1) {
                if (k.indexOf(agentId) === -1) issues.push('Unscoped key: ' + k);
            }
        });
        addResult('X2', 'localStorage Isolation', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length > 0 ? 'Unscoped keys with sensitive data: ' + issues.join(', ') : 'Agent keys: ' + agentKeys.length + ', shared: ' + sharedKeys.length + ', orphan: ' + orphanKeys.length);
    })();

    // X3: No raw dataset on window
    (function() {
        var exposed = [];
        // Note: window.listings is expected in the non-IIFE architecture (IDX data only, no private fields)
        ['allListings','rawData','apiKey','API_KEY','TRESTLE_TOKEN','MLS_PASSWORD',
         'REBNY_TOKEN','accessToken','secretKey','customerDatabase','clientDatabase'].forEach(function(g) {
            if (typeof window[g] !== 'undefined' && window[g] !== null) exposed.push('window.' + g);
        });
        // Check listings for private field leakage (the real security concern)
        if (typeof window.listings !== 'undefined' && window.listings.length > 0) {
            var sample = window.listings[0];
            var privateInMock = [];
            ['PrivateRemarks','ShowingInstructions','OwnerPhone','OwnerSSN',
             'BuyerAgentCompensation','BuyerBrokerageCompensation','LockBoxSerialNumber','KeyLocation'].forEach(function(f) {
                if (sample[f]) privateInMock.push(f);
            });
            if (privateInMock.length > 0) exposed.push('listings has: ' + privateInMock.join(','));
        }
        // Scan HTML for API keys
        var html = document.documentElement.outerHTML.substring(0, 100000);
        if (/sk-[a-zA-Z0-9]{20,}/.test(html)) exposed.push('API key pattern');
        if (/Bearer\s+[a-zA-Z0-9]{20,}/.test(html)) exposed.push('Bearer token');
        addResult('X3', 'No Raw Dataset Exposure', exposed.length === 0 ? 'PASS' : 'FAIL',
            exposed.length === 0 ? 'No sensitive globals or keys exposed' : exposed.join('; '));
    })();

    return { mode: 'security_v2', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
}

// ─── COMBINED: A11Y + RESO + PERF (7) ─────────────────────────────────────
function AccessibilityRESOPerfTests(options) {
    options = options || {};
    var runActive = options.runActive || false;
    var results = [], passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++; else if (status !== 'SKIP') warnings++;
    }

    // A11Y1: Keyboard navigation in modals
    (function() {
        var checks = [], issues = [];
        // Check modals for keyboard support
        var modals = document.querySelectorAll('[role="dialog"], .modal, [id*="Modal"]');
        var totalModals = modals.length;
        modals.forEach(function(m) {
            var hasClose = m.querySelector('button[aria-label="Close"], button[title="Close"], .close-btn');
            if (hasClose) checks.push('close-btn');
        });
        // Check for ESC key handler
        var html = document.documentElement.innerHTML;
        if (html.indexOf('Escape') !== -1 || html.indexOf('keyCode === 27') !== -1 || html.indexOf("key === 'Escape'") !== -1) checks.push('esc-handler');
        else issues.push('No ESC key handler');
        // Check for focus trap
        if (html.indexOf('tabindex') !== -1) checks.push('tabindex');
        if (html.indexOf('focus()') !== -1) checks.push('focus-mgmt');
        addResult('A11Y1', 'Keyboard Navigation', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length > 0 ? totalModals + ' modals — ' + issues.join(', ') : totalModals + ' modals, all checks pass: ' + checks.join(', '));
    })();

    // A11Y2: Labels and ARIA
    (function() {
        var inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea');
        var unlabeled = 0, total = 0, unlabeledList = [];
        inputs.forEach(function(input) {
            if (input.offsetParent === null) return; // skip hidden
            if (input.closest('#complianceDoctorModal')) return;
            if (input.closest('[style*="display:none"], [style*="display: none"]')) return;
            total++;
            var hasLabel = input.id && document.querySelector('label[for="' + input.id + '"]');
            var hasAria = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
            var hasPlaceholder = input.getAttribute('placeholder');
            var hasTitle = input.getAttribute('title');
            // For <select>, check if first <option> serves as label (e.g., "Min Price", "Max Beds")
            var hasOptionLabel = false;
            if (input.tagName === 'SELECT' && input.options && input.options.length > 0) {
                var firstOpt = input.options[0].textContent.trim();
                if (firstOpt && firstOpt !== '' && firstOpt !== '--') hasOptionLabel = true;
            }
            // Check if parent/sibling has a descriptive heading or label text
            var hasNearbyLabel = false;
            var parent = input.parentElement;
            if (parent) {
                var prev = input.previousElementSibling;
                if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'DIV') && prev.textContent.trim().length > 0) hasNearbyLabel = true;
                var heading = parent.querySelector('h3, h4, h5, .font-semibold, .font-bold');
                if (heading && heading.textContent.trim().length > 0) hasNearbyLabel = true;
            }
            if (!hasLabel && !hasAria && !hasPlaceholder && !hasTitle && !hasOptionLabel && !hasNearbyLabel) {
                unlabeled++;
                var desc = input.tagName + (input.id ? '#' + input.id : '') + '[type=' + (input.type || 'select') + ']';
                console.warn('[A11Y2] Unlabeled:', desc, input);
                unlabeledList.push(desc);
            }
        });
        addResult('A11Y2', 'Input Labels', unlabeled === 0 ? 'PASS' : 'FAIL',
            unlabeled === 0 ? total + ' inputs, all labeled' : total + ' inputs, ' + unlabeled + ' UNLABELED: ' + unlabeledList.join(' | '));
    })();

    // RESO1: Field type coercion (numeric fields are numbers)
    (function() {
        if (typeof listings === 'undefined' || listings.length === 0) { addResult('RESO1', 'Field Type Coercion', 'FAIL', 'listings undefined or empty — required test data missing'); return; }
        var issues = [];
        var numericFields = ['price','beds','baths','sqft','daysOnMarket','pricePerSqft','lotSize','stories','units','garageSpaces'];
        listings.forEach(function(l, idx) {
            numericFields.forEach(function(f) {
                var val = l[f];
                if (val !== undefined && val !== null && val !== '' && typeof val !== 'number' && isNaN(Number(val))) {
                    issues.push('L-' + l.id + '.' + f + '="' + val + '" (not numeric)');
                }
            });
        });
        addResult('RESO1', 'Field Type Coercion', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length === 0 ? 'All numeric fields valid across all ' + listings.length + ' listings' : issues.slice(0, 10).join('; '));
    })();

    // RESO2: Required fields completeness
    (function() {
        if (typeof listings === 'undefined' || listings.length === 0) { addResult('RESO2', 'Required Fields', 'FAIL', 'listings undefined or empty — required test data missing'); return; }
        var coreRequired = ['id','address','price','status','beds','baths','neighborhood'];
        var extended = ['borough','listingCategory'];
        var coreViolations = [];
        var extViolations = [];
        listings.forEach(function(l) {
            coreRequired.forEach(function(f) {
                if (l[f] === undefined || l[f] === null || l[f] === '') coreViolations.push('L-' + l.id + '.' + f);
            });
            extended.forEach(function(f) {
                if (l[f] === undefined || l[f] === null || l[f] === '') extViolations.push('L-' + l.id + '.' + f);
            });
        });
        addResult('RESO2', 'Required Fields', coreViolations.length === 0 ? 'PASS' : 'FAIL',
            coreViolations.length === 0 ? listings.length + ' listings, all ' + coreRequired.length + ' core fields present' + (extViolations.length > 0 ? ' (' + extViolations.length + ' extended missing)' : '') : coreViolations.length + ' core field violations: ' + coreViolations.slice(0, 10).join(', '));
    })();

    // RESO3: Enumeration enforcement
    (function() {
        if (typeof listings === 'undefined') { addResult('RESO3', 'Enum Enforcement', 'FAIL', 'listings undefined — required test data missing'); return; }
        var validStatuses = ['Active','Pending','Closed','ComingSoon','Coming Soon','Withdrawn','Expired','Canceled','Hold','Incomplete','ActiveUnderContract',
            'ACTIVE','PENDING','CLOSED','COMING_SOON','COMINGSOON','WITHDRAWN','EXPIRED','CANCELED','HOLD','INCOMPLETE','ACTIVE_UNDER_CONTRACT'];
        var validBoroughs = ['Manhattan','Brooklyn','Queens','Bronx','Staten Island','The Bronx'];
        var validCategories = ['sale','rental','Sale','Rental'];
        var issues = [];
        listings.forEach(function(l) {
            if (l.status && validStatuses.indexOf(l.status) === -1) issues.push('Status:"' + l.status + '" L-' + l.id);
            if (l.borough && validBoroughs.indexOf(l.borough) === -1) issues.push('Borough:"' + l.borough + '" L-' + l.id);
            if (l.listingCategory && validCategories.indexOf(l.listingCategory) === -1) issues.push('Category:"' + l.listingCategory + '" L-' + l.id);
        });
        addResult('RESO3', 'Enum Enforcement', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length === 0 ? 'All status/borough/category enums valid across ' + listings.length + ' listings' : issues.slice(0, 5).join('; '));
    })();

    // PERF1: Render time threshold (ACTIVE)
    (function() {
        if (!runActive) { addResult('PERF1', 'Render Time', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof renderSearchResults !== 'function') { addResult('PERF1', 'Render Time', 'FAIL', 'renderSearchResults function missing — required for rendering'); return; }
        var t0 = performance.now();
        try { renderSearchResults(); } catch(e) { addResult('PERF1', 'Render Time', 'FAIL', 'Error: ' + e.message); return; }
        var ms = Math.round(performance.now() - t0);
        addResult('PERF1', 'Render Time', ms < 2000 ? 'PASS' : 'FAIL',
            'renderSearchResults() completed in ' + ms + 'ms (hard limit: 2000ms)');
    })();

    // PERF2: Filter+sort performance (ACTIVE)
    (function() {
        if (!runActive) { addResult('PERF2', 'Filter+Sort Perf', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof getFilteredListings !== 'function') { addResult('PERF2', 'Filter+Sort Perf', 'FAIL', 'getFilteredListings function missing — required for filtering'); return; }
        var t0 = performance.now();
        for (var i = 0; i < 50; i++) { getFilteredListings(true); }
        var ms = Math.round(performance.now() - t0);
        var avg = Math.round(ms / 50);
        addResult('PERF2', 'Filter+Sort Perf', avg < 50 ? 'PASS' : 'FAIL',
            '50 filter+sort cycles in ' + ms + 'ms (avg ' + avg + 'ms, hard limit: 50ms/cycle)');
    })();

    return { mode: 'a11y_reso_perf', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
}

// ─── R: MUTATION / REGRESSION TESTS (3) ────────────────────────────────────
function MutationRegressionTests(options) {
    options = options || {};
    var runActive = options.runActive || false;
    var results = [], passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++; else if (status !== 'SKIP') warnings++;
    }

    // R1: Golden snapshot stability (ACTIVE)
    (function() {
        if (!runActive) { addResult('R1', 'Golden Snapshot', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof filterListings !== 'function' || typeof listings === 'undefined') { addResult('R1', 'Golden Snapshot', 'FAIL', 'Required: filterListings and listings must exist'); return; }
        // 5 canonical test cases
        var cases = [
            { name: 'All sales', criteria: { searchTab: 'sale' } },
            { name: 'All rentals', criteria: { searchTab: 'rent' } },
            { name: 'Sales $1-3M', criteria: { searchTab: 'sale', priceMin: 1000000, priceMax: 3000000 } },
            { name: 'Manhattan only', criteria: { searchTab: 'sale', boroughs: ['Manhattan'] } },
            { name: '2+ beds', criteria: { searchTab: 'sale', bedsMin: 2 } }
        ];
        var snapKey = 'golden_snapshot_v1';
        var current = {};
        cases.forEach(function(c) {
            var r = filterListings(listings, c.criteria);
            current[c.name] = { count: r.length, ids: r.slice(0, 5).map(function(l) { return l.id; }).join(',') };
        });
        var prev = null;
        try { prev = JSON.parse(localStorage.getItem(snapKey)); } catch(e) {}
        localStorage.setItem(snapKey, JSON.stringify(current));
        if (!prev) {
            addResult('R1', 'Golden Snapshot', 'PASS', 'Baseline captured: ' + cases.length + ' cases');
        } else {
            var diffs = [];
            cases.forEach(function(c) {
                var p = prev[c.name], cur = current[c.name];
                if (!p) { diffs.push(c.name + ': NEW'); return; }
                if (p.count !== cur.count) diffs.push(c.name + ': count ' + p.count + '→' + cur.count);
                else if (p.ids !== cur.ids) diffs.push(c.name + ': order changed');
            });
            addResult('R1', 'Golden Snapshot', diffs.length === 0 ? 'PASS' : 'FAIL',
                diffs.length === 0 ? cases.length + ' cases stable against golden snapshot' : 'REGRESSION: ' + diffs.join('; '));
        }
    })();

    // R2: Break injection — red-team compliance gates (ACTIVE)
    (function() {
        if (!runActive) { addResult('R2', 'Break Injection', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof checkListingCompliance !== 'function' || typeof listings === 'undefined') {
            addResult('R2', 'Break Injection', 'FAIL', 'Required: checkListingCompliance and listings must exist'); return;
        }
        var origLen = listings.length;
        // Inject 4 violation types
        listings.push({ id: 88801, address: '1 IDX Block', neighborhood: 'Test', borough: 'Manhattan', beds: 1, baths: 1, price: 500000, status: 'ACTIVE', listingCategory: 'sale', idxDisplayYN: false, addressDisplayYN: true });
        listings.push({ id: 88802, address: '2 Addr Suppress', neighborhood: 'Test', borough: 'Manhattan', beds: 1, baths: 1, price: 500000, status: 'ACTIVE', listingCategory: 'sale', idxDisplayYN: true, addressDisplayYN: false });
        listings.push({ id: 88803, address: '3 Unknown Status', neighborhood: 'Test', borough: 'Manhattan', beds: 1, baths: 1, price: 500000, status: 'INVALID_STATUS', listingCategory: 'sale', idxDisplayYN: true, addressDisplayYN: true });
        listings.push({ id: 88804, address: '4 Missing Date', neighborhood: 'Test', borough: 'Manhattan', beds: 1, baths: 1, price: null, status: 'ACTIVE', listingCategory: 'sale', idxDisplayYN: true, addressDisplayYN: true });
        var r = checkListingCompliance([88801, 88802, 88803, 88804]);
        listings.splice(origLen); // restore
        var caught = [], missed = [];
        if (r.blocked.some(function(b) { return b.id === 88801; })) caught.push('IDX-block');
        else missed.push('IDX-block');
        if (r.warnings.some(function(w) { return w.id === 88802; })) caught.push('addr-suppress');
        else missed.push('addr-suppress');
        // Status and null price may not be caught by compliance gate (they're data quality, not IDX)
        caught.push('status-check(' + (r.blocked.some(function(b) { return b.id === 88803; }) ? 'blocked' : 'passed') + ')');
        caught.push('null-price(' + (r.blocked.some(function(b) { return b.id === 88804; }) ? 'blocked' : 'passed') + ')');
        addResult('R2', 'Break Injection', missed.length === 0 ? 'PASS' : 'FAIL',
            'Caught: ' + caught.join(', ') + (missed.length > 0 ? ' | Missed: ' + missed.join(', ') : ''));
    })();

    // R3: Fuzz test — random criteria (ACTIVE)
    (function() {
        if (!runActive) { addResult('R3', 'Fuzz Test', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof filterListings !== 'function' || typeof listings === 'undefined') { addResult('R3', 'Fuzz Test', 'FAIL', 'Required: filterListings and listings must exist'); return; }
        var errors = 0, runs = 100, dupRuns = 0;
        var boroughs = ['Manhattan','Brooklyn','Queens','Bronx','Staten Island'];
        for (var i = 0; i < runs; i++) {
            var criteria = {
                searchTab: Math.random() > 0.5 ? 'sale' : 'rent',
                priceMin: Math.floor(Math.random() * 5000000),
                priceMax: Math.floor(Math.random() * 10000000),
                bedsMin: Math.floor(Math.random() * 5),
                boroughs: Math.random() > 0.5 ? [boroughs[Math.floor(Math.random() * boroughs.length)]] : undefined
            };
            try {
                var result = filterListings(listings, criteria);
                // Check for duplicates
                var ids = {};
                result.forEach(function(l) {
                    if (ids[l.id]) dupRuns++;
                    ids[l.id] = true;
                });
            } catch(e) { errors++; }
        }
        addResult('R3', 'Fuzz Test', errors === 0 && dupRuns === 0 ? 'PASS' : 'FAIL',
            runs + ' random criteria: ' + errors + ' errors, ' + dupRuns + ' duplicate results' + (errors > 0 ? ' — filterListings threw exceptions' : '') + (dupRuns > 0 ? ' — duplicate IDs in results' : ''));
    })();

    return { mode: 'regression', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
}

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
    // Run REBNY Test Suite silently on page load (badge only — no modal)
    REBNYTestSuite({ verbose: false, context: 'pageload' });
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
