// ═══════════════════════════════════════════════════════════════════════════════

// LOGGED_IN_AGENT + AGENT_PROFILE defined at top of first <script> block

// Compliance gate — check each listing before output
function checkListingCompliance(listingIds) {
    var result = { passed: [], blocked: [], warnings: [] };
    listingIds.forEach(function(id) {
        var listing = listings.find(function(l) { return l.id === id; });
        if (!listing) return;

        var perm = listing.permissions || {};

        // Gate 1: Owner Opt-Out — NEVER display (UCBA Art. I Sec. 4(A))
        if (perm.ownerOptOut === true) {
            result.blocked.push({ id: id, address: listing.address, reason: 'Owner opted out of all display — listing cannot be shown or distributed (UCBA Art. I Sec. 4(A))' });
            return;
        }

        // Gate 2: Participant Only — not for IDX/public display
        if (perm.participantOnly === true) {
            result.blocked.push({ id: id, address: listing.address, reason: 'Participant Only — listing is restricted to RLS participants only, not for IDX/public display' });
            return;
        }

        // Gate 3a: Internet Entire Listing Display — master gate (InternetEntireListingDisplayYN)
        if (listing.internetDisplayYN === false) {
            result.blocked.push({ id: id, address: listing.address, reason: 'Internet display opted out (InternetEntireListingDisplayYN=false) — listing cannot be displayed on any internet channel' });
            return;
        }

        // Gate 3b: IDX Display opt-out — not shown on IDX websites (IDXEntireListingDisplayYN)
        if (listing.idxDisplayYN === false || perm.idxDisplay === false) {
            result.blocked.push({ id: id, address: listing.address, reason: 'IDX Display opted out — listing cannot be displayed on IDX websites' });
            return;
        }

        // Gate 5: Coming Soon — show but with restrictions
        if (listing.status === 'COMING_SOON') {
            result.warnings.push({ id: id, address: listing.address, reason: 'Coming Soon — No showings or open house permitted until ' + (listing.comingSoonDate || 'active date') + ' (UCBA Art. I Sec. 5(C))' });
        }

        // Gate 6: Closed Status — suppress after 24 hours
        if (listing.status === 'CLOSED' && listing.closedDate) {
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
        case 'ACTIVE': statusClass = 'background:#2563eb;color:white;'; break;
        case 'PENDING': statusClass = 'background:#f59e0b;color:white;'; break;
        case 'CLOSED': statusClass = 'background:#16a34a;color:white;'; break;
        case 'COMING_SOON': statusClass = 'background:#8b5cf6;color:white;'; break;
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
        alert('Please select at least one listing to print.');
        return;
    }

    var compliance = checkListingCompliance(ids);

    // Show blocked listings warning
    if (compliance.blocked.length > 0) {
        var blockedMsg = 'The following listings cannot be printed (IDX opt-out):\n';
        compliance.blocked.forEach(function(b) { blockedMsg += '- ' + b.address + ': ' + b.reason + '\n'; });
        if (compliance.passed.length === 0) {
            alert(blockedMsg + '\nNo listings available to print.');
            return;
        }
        alert(blockedMsg + '\nThe remaining ' + compliance.passed.length + ' listing(s) will be printed.');
    }

    var sheetHtml = generateListingSheet(compliance.passed, compliance.warnings);

    // Open print window
    var printWin = window.open('', '_blank', 'width=900,height=700');
    printWin.document.write('<!DOCTYPE html><html><head><title>Listing Sheet - Mallan Real Estate</title>');
    printWin.document.write('<style>');
    printWin.document.write('body { margin: 0; padding: 20px; font-family: system-ui, -apple-system, sans-serif; }');
    printWin.document.write('.listing-sheet-card { page-break-inside: avoid; }');
    printWin.document.write('@media print { body { padding: 0; } @page { margin: 1.5cm; } }');
    printWin.document.write('</style></head><body>');
    printWin.document.write(sheetHtml);
    printWin.document.write('</body></html>');
    printWin.document.close();

    // Auto-print after load
    printWin.onload = function() { printWin.print(); };

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
        alert('Please select at least one listing to preview.');
        return;
    }

    var compliance = checkListingCompliance(ids);

    if (compliance.blocked.length > 0 && compliance.passed.length === 0) {
        alert('All selected listings have IDX display opted out. Cannot preview.');
        return;
    }

    var sheetHtml = generateListingSheet(compliance.passed, compliance.warnings);

    // Show in a preview window
    var previewWin = window.open('', '_blank', 'width=900,height=700');
    previewWin.document.write('<!DOCTYPE html><html><head><title>Preview - Listing Sheet</title>');
    previewWin.document.write('<style>');
    previewWin.document.write('body { margin: 0; padding: 20px; font-family: system-ui, -apple-system, sans-serif; background: #f3f4f6; }');
    previewWin.document.write('#listingSheetContent { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }');
    previewWin.document.write('.listing-sheet-card { page-break-inside: avoid; }');
    previewWin.document.write('.preview-toolbar { position: sticky; top: 0; background: #1f2937; color: white; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; margin: -20px -20px 20px; border-radius: 0; z-index: 10; }');
    previewWin.document.write('.preview-toolbar button { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; }');
    previewWin.document.write('.preview-toolbar button:hover { background: #2563eb; }');
    previewWin.document.write('.preview-toolbar button.secondary { background: transparent; border: 1px solid rgba(255,255,255,0.3); }');
    previewWin.document.write('.preview-toolbar button.secondary:hover { background: rgba(255,255,255,0.1); }');
    previewWin.document.write('@media print { .preview-toolbar { display: none !important; } body { background: white; padding: 0; } #listingSheetContent { box-shadow: none; padding: 0; } @page { margin: 1.5cm; } }');
    previewWin.document.write('</style></head><body>');
    previewWin.document.write('<div class="preview-toolbar">');
    previewWin.document.write('<span style="font-size:14px;font-weight:600;">' + compliance.passed.length + ' Listing(s) - Preview</span>');
    previewWin.document.write('<div style="display:flex;gap:8px;">');
    previewWin.document.write('<button class="secondary" onclick="window.close()">Close</button>');
    previewWin.document.write('<button onclick="window.print()">Print</button>');
    previewWin.document.write('</div></div>');
    previewWin.document.write(sheetHtml);
    previewWin.document.write('</body></html>');
    previewWin.document.close();

    // Close delivery modal
    closeDeliveryModal();
}

// Email listing sheet — sends branded HTML email directly to client with status, formatCurrency, updatedDate, REBNY attribution
function emailListingSheet() {
    var ids = getSelectedListingIds();
    if (ids.length === 0) {
        alert('Please select at least one listing to email.');
        return;
    }

    var compliance = checkListingCompliance(ids);

    if (compliance.blocked.length > 0 && compliance.passed.length === 0) {
        alert('All selected listings have IDX display opted out. Cannot email.');
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
        alert('Please select a client with an email address first.');
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

// ═══════════════════════════════════════════════════════════════════════════════
// REBNY COMPLIANCE DOCTOR — Consolidated 10-Test Suite
// Runs on page load + after every search result render
// Tests 1-3, 5-7, 9: wrap existing functions
// Tests 4, 8, 10: NEW checks (prohibited fields, commingling, bulk export)
