/**
 * Protected Periods — UCBA A6/A7/A8
 * Internal compliance: expired listing agreements, 6 protected buyer names, 90-day window.
 * NOT sent to RLS/Trestle — stored for audit readiness.
 */

var _ppData = [];
var _ppCurrentId = null;

function initProtectedPeriods() {
    loadProtectedPeriods();
}

function loadProtectedPeriods() {
    var statusFilter = document.getElementById('ppStatusFilter');
    var status = statusFilter ? statusFilter.value : '';
    var url = '/api/crm/protected-periods' + (status ? '?status=' + status : '');

    fetch(url, { credentials: 'same-origin' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (Array.isArray(data)) {
                _ppData = data;
                renderPPTable(data);
            } else {
                document.getElementById('ppTableBody').innerHTML =
                    '<tr><td colspan="9" class="text-center py-8 text-red-400">Failed to load</td></tr>';
            }
        })
        .catch(function() {
            document.getElementById('ppTableBody').innerHTML =
                '<tr><td colspan="9" class="text-center py-8 text-red-400">Error loading protected periods</td></tr>';
        });
}

function renderPPTable(periods) {
    var tbody = document.getElementById('ppTableBody');
    if (!periods.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-gray-400">No protected periods found</td></tr>';
        return;
    }

    tbody.innerHTML = periods.map(function(p) {
        var addr = formatPPAddress(p.listing ? p.listing.address : {});
        var agentName = p.agent ? p.agent.full_name : 'Unknown';
        var buyerCount = p.protected_buyers ? p.protected_buyers.length : 0;
        var hasNotice = p.notice_uploaded_at ? true : false;
        var statusBadge = ppStatusBadge(p.status);
        var daysToDeadline = Math.ceil((new Date(p.names_deadline) - new Date()) / 86400000);
        var daysTo90 = Math.ceil((new Date(p.protection_ends_at) - new Date()) / 86400000);

        return '<tr class="border-b hover:bg-gray-50 cursor-pointer" onclick="showPPDetail(\'' + p.id + '\')">' +
            '<td class="px-3 py-2 font-medium">' + escPP(addr) + '</td>' +
            '<td class="px-3 py-2">' + escPP(agentName) + '</td>' +
            '<td class="px-3 py-2">' + formatPPDate(p.agreement_expired_at) + '</td>' +
            '<td class="px-3 py-2">' + formatPPDate(p.names_deadline) +
                (p.status === 'pending_names' && daysToDeadline > 0 ? ' <span class="text-xs text-amber-600">(' + daysToDeadline + 'd)</span>' : '') +
            '</td>' +
            '<td class="px-3 py-2">' + formatPPDate(p.protection_ends_at) +
                (p.status === 'active' && daysTo90 > 0 ? ' <span class="text-xs text-blue-600">(' + daysTo90 + 'd)</span>' : '') +
            '</td>' +
            '<td class="text-center px-3 py-2"><span class="font-semibold">' + buyerCount + '</span>/6</td>' +
            '<td class="text-center px-3 py-2">' + (hasNotice ? '<i class="fas fa-check-circle text-green-500"></i>' : '<i class="fas fa-times-circle text-gray-300"></i>') + '</td>' +
            '<td class="text-center px-3 py-2">' + statusBadge + '</td>' +
            '<td class="text-center px-3 py-2"><button class="text-indigo-600 hover:text-indigo-800 text-xs font-medium">View</button></td>' +
        '</tr>';
    }).join('');
}

function ppStatusBadge(status) {
    var colors = {
        'pending_names': 'bg-amber-100 text-amber-800',
        'active': 'bg-blue-100 text-blue-800',
        'converted': 'bg-green-100 text-green-800',
        'expired': 'bg-gray-100 text-gray-600',
        'missed_deadline': 'bg-red-100 text-red-800'
    };
    var labels = {
        'pending_names': 'Pending Names',
        'active': 'Active (90-day)',
        'converted': 'Converted',
        'expired': 'Expired',
        'missed_deadline': 'Missed Deadline'
    };
    var cls = colors[status] || 'bg-gray-100 text-gray-600';
    var label = labels[status] || status;
    return '<span class="px-2 py-0.5 rounded-full text-xs font-medium ' + cls + '">' + label + '</span>';
}

function showPPDetail(id) {
    _ppCurrentId = id;
    var modal = document.getElementById('ppDetailModal');
    var content = document.getElementById('ppDetailContent');
    modal.classList.remove('hidden');
    content.innerHTML = '<div class="text-center py-8 text-gray-400">Loading...</div>';

    fetch('/api/crm/protected-periods/' + id, { credentials: 'same-origin' })
        .then(function(r) { return r.json(); })
        .then(function(p) {
            if (p.error) {
                content.innerHTML = '<div class="text-red-500">' + escPP(p.error) + '</div>';
                return;
            }
            renderPPDetail(p);
        })
        .catch(function() {
            content.innerHTML = '<div class="text-red-500">Error loading details</div>';
        });
}

function renderPPDetail(p) {
    var content = document.getElementById('ppDetailContent');
    var addr = formatPPAddress(p.listing ? p.listing.address : {});
    var agentName = p.agent ? p.agent.full_name : 'Unknown';
    var buyers = p.protected_buyers || [];
    var canAddBuyers = (p.status === 'pending_names' || p.status === 'active') && buyers.length < 6;
    var deadlinePassed = new Date() > new Date(p.names_deadline);

    var html = '';

    // Listing info
    html += '<div class="bg-gray-50 rounded-lg p-4 mb-4">';
    html += '<div class="grid grid-cols-2 gap-3 text-sm">';
    html += '<div><span class="text-gray-500">Listing:</span> <strong>' + escPP(addr) + '</strong></div>';
    html += '<div><span class="text-gray-500">Agent:</span> ' + escPP(agentName) + '</div>';
    html += '<div><span class="text-gray-500">Agreement Expired:</span> ' + formatPPDate(p.agreement_expired_at) + '</div>';
    html += '<div><span class="text-gray-500">Status:</span> ' + ppStatusBadge(p.status) + '</div>';
    html += '<div><span class="text-gray-500">Names Deadline:</span> ' + formatPPDate(p.names_deadline) + (deadlinePassed ? ' <span class="text-xs text-red-600">(passed)</span>' : '') + '</div>';
    html += '<div><span class="text-gray-500">90-Day Protection Ends:</span> ' + formatPPDate(p.protection_ends_at) + '</div>';
    html += '</div></div>';

    // Notice upload section
    html += '<div class="mb-4">';
    html += '<h4 class="font-semibold text-sm text-gray-700 mb-2"><i class="fas fa-file-upload mr-1"></i>Notice of Expired Listing (Internal Audit)</h4>';
    if (p.notice_uploaded_at) {
        html += '<div class="text-sm text-green-700 bg-green-50 rounded p-2"><i class="fas fa-check-circle mr-1"></i>Uploaded on ' + formatPPDate(p.notice_uploaded_at) + '</div>';
    } else {
        html += '<div class="text-sm text-amber-700 bg-amber-50 rounded p-2"><i class="fas fa-exclamation-triangle mr-1"></i>Not yet uploaded. Upload via Document Vault and link here.</div>';
    }
    html += '</div>';

    // Protected buyers list
    html += '<div class="mb-4">';
    html += '<h4 class="font-semibold text-sm text-gray-700 mb-2"><i class="fas fa-users mr-1"></i>Protected Buyers (' + buyers.length + '/6)</h4>';

    if (buyers.length > 0) {
        html += '<div class="space-y-2">';
        buyers.forEach(function(b) {
            html += '<div class="flex items-center justify-between bg-white border rounded-lg p-3">';
            html += '<div>';
            html += '<div class="font-medium text-sm">' + escPP(b.buyer_name) + '</div>';
            if (b.buyer_email) html += '<div class="text-xs text-gray-500">' + escPP(b.buyer_email) + '</div>';
            if (b.buyer_phone) html += '<div class="text-xs text-gray-500">' + escPP(b.buyer_phone) + '</div>';
            if (b.notes) html += '<div class="text-xs text-gray-400 mt-1">' + escPP(b.notes) + '</div>';
            html += '</div>';
            html += '<div class="flex items-center gap-2">';
            if (b.deal_executed) {
                html += '<span class="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Deal Executed</span>';
                if (b.deal_price) html += '<span class="text-xs text-gray-500">$' + Number(b.deal_price).toLocaleString() + '</span>';
            }
            if (!deadlinePassed && !b.deal_executed && (p.status === 'pending_names' || p.status === 'active')) {
                html += '<button onclick="removePPBuyer(\'' + p.id + '\',\'' + b.id + '\')" class="text-red-400 hover:text-red-600 text-xs"><i class="fas fa-trash-alt"></i></button>';
            }
            html += '</div></div>';
        });
        html += '</div>';
    } else {
        html += '<div class="text-sm text-gray-400 py-2">No buyers submitted yet.</div>';
    }

    // Add buyer form
    if (canAddBuyers && !deadlinePassed) {
        html += '<div class="mt-3 bg-indigo-50 rounded-lg p-3">';
        html += '<h5 class="text-xs font-semibold text-indigo-700 mb-2">Add Protected Buyer</h5>';
        html += '<div class="grid grid-cols-2 gap-2">';
        html += '<input id="ppBuyerName" type="text" placeholder="Full Name *" class="text-sm border rounded px-2 py-1.5 col-span-2">';
        html += '<input id="ppBuyerEmail" type="email" placeholder="Email" class="text-sm border rounded px-2 py-1.5">';
        html += '<input id="ppBuyerPhone" type="tel" placeholder="Phone" class="text-sm border rounded px-2 py-1.5">';
        html += '<input id="ppBuyerNotes" type="text" placeholder="Notes (optional)" class="text-sm border rounded px-2 py-1.5 col-span-2">';
        html += '</div>';
        html += '<button onclick="addPPBuyer(\'' + p.id + '\')" class="mt-2 bg-indigo-600 text-white text-sm px-4 py-1.5 rounded hover:bg-indigo-700"><i class="fas fa-plus mr-1"></i>Add Buyer</button>';
        html += '</div>';
    } else if (deadlinePassed && p.status === 'pending_names') {
        html += '<div class="mt-2 text-xs text-red-600"><i class="fas fa-ban mr-1"></i>Deadline passed — no further names can be added.</div>';
    }

    html += '</div>';

    content.innerHTML = html;
}

function addPPBuyer(periodId) {
    var name = document.getElementById('ppBuyerName').value.trim();
    var email = document.getElementById('ppBuyerEmail').value.trim();
    var phone = document.getElementById('ppBuyerPhone').value.trim();
    var notes = document.getElementById('ppBuyerNotes').value.trim();

    if (!name) {
        showToast('Buyer name is required', 'error');
        return;
    }

    fetch('/api/crm/protected-periods/' + periodId + '/buyers', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            buyer_name: name,
            buyer_email: email || null,
            buyer_phone: phone || null,
            notes: notes || null
        })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.error) {
            showToast(data.error, 'error');
            return;
        }
        showToast('Protected buyer added: ' + name, 'success');
        showPPDetail(periodId); // Refresh detail
        loadProtectedPeriods(); // Refresh table
    })
    .catch(function() {
        showToast('Failed to add buyer', 'error');
    });
}

function removePPBuyer(periodId, buyerId) {
    if (!confirm('Remove this protected buyer?')) return;

    fetch('/api/crm/protected-periods/' + periodId + '/buyers?buyer_id=' + buyerId, {
        method: 'DELETE',
        credentials: 'same-origin'
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.error) {
            showToast(data.error, 'error');
            return;
        }
        showToast('Buyer removed', 'success');
        showPPDetail(periodId);
        loadProtectedPeriods();
    })
    .catch(function() {
        showToast('Failed to remove buyer', 'error');
    });
}

function closePPModal() {
    document.getElementById('ppDetailModal').classList.add('hidden');
    _ppCurrentId = null;
}

// --- Helpers ---
function formatPPAddress(addr) {
    if (!addr || typeof addr !== 'object') return 'Unknown';
    var parts = [addr.StreetNumber, addr.StreetName, addr.UnitNumber ? '#' + addr.UnitNumber : ''].filter(Boolean);
    return parts.join(' ') || addr.full || addr.unparsed || 'Unknown';
}

function formatPPDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escPP(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
}
