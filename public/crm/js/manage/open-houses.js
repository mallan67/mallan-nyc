// ============================================
// OPEN HOUSES OVERVIEW PANEL
// ============================================
var ohOverviewOpen = false;
var ohOverviewFormOpen = false;
var ohOverviewEditId = null;

function toggleOHOverview() {
    ohOverviewOpen = !ohOverviewOpen;
    var panel = document.getElementById('ohOverviewPanel');
    var btn = document.getElementById('manageOHToggleBtn');
    if (ohOverviewOpen) {
        panel.style.display = 'block';
        document.body.style.overflow = 'hidden';
        btn.classList.add('bg-gray-100', 'border-gray-400');
        renderOHOverview();
    } else {
        panel.style.display = 'none';
        document.body.style.overflow = '';
        btn.classList.remove('bg-gray-100', 'border-gray-400');
        ohOverviewFormOpen = false;
        document.getElementById('ohOverviewForm').style.display = 'none';
    }
}

function toggleOHOverviewForm() {
    ohOverviewFormOpen = !ohOverviewFormOpen;
    var form = document.getElementById('ohOverviewForm');
    if (ohOverviewFormOpen) {
        ohOverviewEditId = null;
        populateOHOverviewListing();
        document.getElementById('ohOverviewDate').value = '';
        document.getElementById('ohOverviewStart').value = '';
        document.getElementById('ohOverviewEnd').value = '';
        document.getElementById('ohOverviewRepeat').selectedIndex = 0;
        document.getElementById('ohOverviewType-public').checked = false;
        document.getElementById('ohOverviewType-appt').checked = false;
        document.getElementById('ohOverviewType-broker').checked = false;
        document.getElementById('ohOverviewType-virtual').checked = false;
        document.getElementById('ohOverviewLinkWrap').style.display = 'none';
        if (document.getElementById('ohOverviewLink')) document.getElementById('ohOverviewLink').value = '';
        form.style.display = 'block';
    } else {
        form.style.display = 'none';
        ohOverviewEditId = null;
    }
}

function populateOHOverviewListing() {
    var modeListings = myManagementListings.filter(function(l) { return l.category === currentManageMode; });
    var closedStatuses = ['Sold', 'Leased', 'Expired', 'Perm Off Market'];
    var eligible = modeListings.filter(function(l) { return closedStatuses.indexOf(l.status) === -1; });
    var sel = document.getElementById('ohOverviewListing');
    sel.innerHTML = '<option value="">\u2014 Select listing \u2014</option>';
    eligible.forEach(function(l) {
        sel.innerHTML += '<option value="' + l.id + '">' + l.address + ' ' + l.unit + ' (' + l.status + ')</option>';
    });
}

function renderOHOverview() {
    var modeListings = myManagementListings.filter(function(l) { return l.category === currentManageMode; });
    var listingIds = modeListings.map(function(l) { return l.id; });
    var ohs = myOpenHouses.filter(function(oh) { return listingIds.indexOf(oh.listingId) !== -1; });
    ohs.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

    var today = new Date().toISOString().split('T')[0];
    var upcoming = ohs.filter(function(oh) { return oh.date >= today; });
    var past = ohs.filter(function(oh) { return oh.date < today; });

    // Update badge
    var badge = document.getElementById('manageOHBadge');
    if (upcoming.length > 0) {
        badge.textContent = upcoming.length;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }

    // Update count label
    var countEl = document.getElementById('ohOverviewCount');
    countEl.textContent = upcoming.length + ' upcoming' + (past.length > 0 ? ', ' + past.length + ' past' : '');

    var listEl = document.getElementById('ohOverviewList');
    var emptyEl = document.getElementById('ohOverviewEmpty');

    if (ohs.length === 0) {
        listEl.innerHTML = '';
        emptyEl.style.display = 'block';
        return;
    }
    emptyEl.style.display = 'none';

    var html = '';

    // Upcoming section
    if (upcoming.length > 0) {
        html += '<div class="px-5 py-2.5 bg-gray-50/80 border-b border-gray-100"><p class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Upcoming (' + upcoming.length + ')</p></div>';
        upcoming.forEach(function(oh, idx) {
            html += renderOHOverviewRow(oh, false);
            if (idx < upcoming.length - 1) html += '<div class="mx-5 border-b border-gray-100"></div>';
        });
    }

    // Past section (collapsed by default, show only count + toggle)
    if (past.length > 0) {
        html += '<div class="px-5 py-2.5 bg-gray-50/80 border-y border-gray-100 flex items-center justify-between cursor-pointer" onclick="document.getElementById(\'ohPastRows\').style.display=document.getElementById(\'ohPastRows\').style.display===\'none\'?\'block\':\'none\'">';
        html += '<p class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Past (' + past.length + ')</p>';
        html += '<i class="fas fa-chevron-down text-gray-400 text-[10px]"></i>';
        html += '</div>';
        html += '<div id="ohPastRows" style="display:none">';
        past.forEach(function(oh, idx) {
            html += renderOHOverviewRow(oh, true);
            if (idx < past.length - 1) html += '<div class="mx-5 border-b border-gray-100"></div>';
        });
        html += '</div>';
    }

    listEl.innerHTML = html;
}

function renderOHOverviewRow(oh, isPast) {
    var listing = manageFindListing(oh.listingId);
    var addr = listing ? listing.address + ' ' + listing.unit : 'Unknown';
    var typeLabels = (oh.types || []).map(function(t) {
        if (t === 'Public') return 'Open House';
        if (t === 'By Appointment') return 'Open House By Appointment Only';
        if (t === 'Broker Only') return 'Broker Open House';
        return t;
    });
    if (oh.virtualTour) typeLabels.push('Virtual Tour');

    var html = '<div class="px-5 py-3.5 flex items-center gap-3 ' + (isPast ? 'opacity-40' : 'hover:bg-gray-50') + ' transition-colors">';

    // Date column
    var d = new Date(oh.date + 'T00:00:00');
    var dayNum = d.getDate();
    var monthName = d.toLocaleDateString('en-US', { month: 'short' });
    html += '<div class="w-12 h-12 rounded-xl bg-gray-100 border border-gray-200 flex flex-col items-center justify-center flex-shrink-0">';
    html += '<span class="text-[10px] text-gray-600 font-bold uppercase leading-none">' + monthName + '</span>';
    html += '<span class="text-base text-gray-800 font-bold leading-tight">' + dayNum + '</span>';
    html += '</div>';

    // Details
    html += '<div class="flex-1 min-w-0">';
    html += '<p class="text-sm font-semibold text-gray-900 truncate">' + addr + '</p>';
    html += '<p class="text-xs font-bold text-gray-700 mt-0.5">' + formatOHTime(oh.start) + ' \u2013 ' + formatOHTime(oh.end);
    if (oh.repeat && oh.repeat !== 'none') html += ' &middot; <span class="text-gray-600 font-medium">' + (oh.repeat === 'weekly' ? 'Weekly' : 'Bi-weekly') + '</span>';
    html += '</p>';
    html += '<div class="flex flex-wrap gap-1 mt-1">';
    typeLabels.forEach(function(label) {
        html += '<span class="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-[10px] font-semibold rounded">' + label + '</span>';
    });
    html += '</div>';
    html += '</div>';

    // Actions
    if (!isPast) {
        html += '<div class="flex items-center gap-1 flex-shrink-0">';
        html += '<button onclick="ohOverviewEdit(\'' + oh.id + '\')" class="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600" title="Edit"><i class="fas fa-pen text-[11px]"></i></button>';
        html += '<button onclick="ohOverviewDelete(\'' + oh.id + '\')" class="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500" title="Cancel"><i class="fas fa-trash text-[11px]"></i></button>';
        html += '</div>';
    }

    html += '</div>';
    return html;
}

function ohOverviewSave() {
    var listingId = document.getElementById('ohOverviewListing').value;
    var date = document.getElementById('ohOverviewDate').value;
    var start = document.getElementById('ohOverviewStart').value;
    var end = document.getElementById('ohOverviewEnd').value;
    var repeat = document.getElementById('ohOverviewRepeat').value;
    if (!listingId) { showToast('Please select a listing.', 'warning'); return; }
    if (!date || !start || !end) { showToast('Please fill in date, start, and end times.', 'warning'); return; }
    var types = [];
    if (document.getElementById('ohOverviewType-public').checked) types.push('Public');
    if (document.getElementById('ohOverviewType-appt').checked) types.push('By Appointment');
    if (document.getElementById('ohOverviewType-broker').checked) types.push('Broker Only');
    var virtualTour = document.getElementById('ohOverviewType-virtual').checked;
    var link = virtualTour ? (document.getElementById('ohOverviewLink').value || '') : '';
    if (types.length === 0 && !virtualTour) { showToast('Please select at least one showing type.', 'warning'); return; }

    if (ohOverviewEditId) {
        // Update existing
        var oh = myOpenHouses.find(function(o) { return o.id === ohOverviewEditId; });
        if (oh) {
            oh.listingId = listingId; oh.types = types; oh.virtualTour = virtualTour;
            oh.date = date; oh.start = start; oh.end = end; oh.repeat = repeat; oh.link = link;
        }
        manageShowToast('Open house updated');
        ohOverviewEditId = null;
    } else {
        // Create new
        myOpenHouses.push({ id: 'OH-' + ohNextId++, listingId: listingId, types: types, virtualTour: virtualTour, date: date, start: start, end: end, repeat: repeat, link: link, notes: '' });
        var displayTypes = types.map(function(t) { if (t === 'Public') return 'Open House'; if (t === 'By Appointment') return 'Open House By Appointment Only'; if (t === 'Broker Only') return 'Broker Open House'; return t; });
        if (virtualTour) displayTypes.push('Virtual Tour');
        manageShowToast(displayTypes.join(', ') + ' scheduled');
    }

    // Reset form but keep it open for batch adding
    document.getElementById('ohOverviewDate').value = '';
    document.getElementById('ohOverviewStart').value = '';
    document.getElementById('ohOverviewEnd').value = '';
    // Keep listing + type selection for quick batch adds

    renderOHOverview();
    renderManageSection(currentManageMode);
}

function ohOverviewEdit(ohId) {
    var oh = myOpenHouses.find(function(o) { return o.id === ohId; });
    if (!oh) return;
    ohOverviewEditId = ohId;
    ohOverviewFormOpen = true;
    var form = document.getElementById('ohOverviewForm');
    form.style.display = 'block';
    populateOHOverviewListing();
    document.getElementById('ohOverviewListing').value = oh.listingId;
    document.getElementById('ohOverviewDate').value = oh.date;
    document.getElementById('ohOverviewStart').value = oh.start;
    document.getElementById('ohOverviewEnd').value = oh.end;
    document.getElementById('ohOverviewRepeat').value = oh.repeat || 'none';
    document.getElementById('ohOverviewType-public').checked = (oh.types || []).indexOf('Public') !== -1;
    document.getElementById('ohOverviewType-appt').checked = (oh.types || []).indexOf('By Appointment') !== -1;
    document.getElementById('ohOverviewType-broker').checked = (oh.types || []).indexOf('Broker Only') !== -1;
    document.getElementById('ohOverviewType-virtual').checked = !!oh.virtualTour;
    document.getElementById('ohOverviewLinkWrap').style.display = oh.virtualTour ? 'block' : 'none';
    if (document.getElementById('ohOverviewLink')) document.getElementById('ohOverviewLink').value = oh.link || '';
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function ohOverviewDelete(ohId) {
    myOpenHouses = myOpenHouses.filter(function(o) { return o.id !== ohId; });
    manageShowToast('Open house cancelled');
    renderOHOverview();
    renderManageSection(currentManageMode);
}

// Update OH badge whenever manage section renders
function updateOHBadge() {
    var modeListings = myManagementListings.filter(function(l) { return l.category === currentManageMode; });
    var listingIds = modeListings.map(function(l) { return l.id; });
    var today = new Date().toISOString().split('T')[0];
    var upcoming = myOpenHouses.filter(function(oh) { return listingIds.indexOf(oh.listingId) !== -1 && oh.date >= today; });
    var badge = document.getElementById('manageOHBadge');
    if (badge) {
        if (upcoming.length > 0) {
            badge.textContent = upcoming.length;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Toast
function manageShowToast(msg) {
    var toast = document.getElementById('manageToast');
    document.getElementById('manageToastMsg').textContent = msg;
    toast.style.display = 'flex';
    toast.style.opacity = '0';
    requestAnimationFrame(function() { toast.style.opacity = '1'; });
    clearTimeout(window._manageToastTimer);
    window._manageToastTimer = setTimeout(function() {
        toast.style.opacity = '0';
        setTimeout(function() { toast.style.display = 'none'; }, 300);
    }, 3000);
}
