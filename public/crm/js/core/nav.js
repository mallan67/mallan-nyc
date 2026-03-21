// ============================================
// GLOBAL HTML ESCAPE — XSS prevention
// ============================================
function escapeHtml(str) {
    if (str == null) return '';
    var s = String(str);
    return s.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
}

// ============================================
// GLOBAL TOAST NOTIFICATION
// ============================================
function showToast(message, type) {
    var colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-blue-600', warning: 'bg-amber-600' };
    var icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    var existing = document.getElementById('globalToast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'globalToast';
    toast.className = 'fixed bottom-20 lg:bottom-6 right-6 ' + (colors[type] || 'bg-gray-800') + ' text-white px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 text-sm transition-opacity';
    toast.innerHTML = '<i class="fas ' + (icons[type] || 'fa-info-circle') + '"></i> ' + escapeHtml(message);
    toast.style.opacity = '0';
    document.body.appendChild(toast);
    requestAnimationFrame(function() { toast.style.opacity = '1'; });
    setTimeout(function() {
        toast.style.opacity = '0';
        setTimeout(function() { toast.remove(); }, 300);
    }, 4000);
}

// ============================================
// TAB NAVIGATION
// ============================================
function showSearchSection(section) {
    // Hide all sections
    ['main','my','last','manage'].forEach(function(s) {
        var el = document.getElementById('section-' + s);
        if (el) el.style.display = 'none';
    });
    document.getElementById('section-' + section).style.display = 'block';
    // Ensure general nav is shown when switching general tabs
    document.getElementById('generalNavBar').style.display = '';
    // Update active state on the nav buttons
    ['main','manage'].forEach(function(s) {
        var btn = document.getElementById('searchNav-' + s);
        if (!btn) return;
        if (s === section) {
            btn.classList.add('bg-white/15');
            btn.classList.remove('bg-white/10', 'text-gray-300', 'hover:bg-white/10');
            btn.classList.add('text-white');
        } else {
            btn.classList.remove('bg-white/15', 'bg-white/10');
            btn.classList.add('text-gray-300', 'hover:bg-white/10');
            btn.classList.remove('text-white');
        }
    });
    if (section === 'manage') renderManageSection(currentManageMode);
    if (section === 'my' && typeof populateSavedSearchesSection === 'function') populateSavedSearchesSection();

    // Update hash for section navigation (skip main — handled by performSearch/backToSearch)
    if (!window._suppressHashUpdate && section !== 'main') {
        history.pushState(null, '', '#' + section);
    }
}
