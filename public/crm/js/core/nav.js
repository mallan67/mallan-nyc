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

    // Update hash for section navigation (skip main — handled by performSearch/backToSearch)
    if (!window._suppressHashUpdate && section !== 'main') {
        history.pushState(null, '', '#' + section);
    }
}
