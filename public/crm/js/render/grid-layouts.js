        // ═══════════════════════════════════════════════════════════════════════════════
        // GRID LAYOUTS MODAL FUNCTIONS
        // ═══════════════════════════════════════════════════════════════════════════════

        function openGridLayoutsModal() {
            document.getElementById('gridLayoutsModal').classList.remove('hidden');
            populateFieldSelectionGrid();
            populateSavedLayoutsList();
        }

        function closeGridLayoutsModal() {
            document.getElementById('gridLayoutsModal').classList.add('hidden');
        }

        // ESC key to close grid layouts modal
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                var gm = document.getElementById('gridLayoutsModal');
                if (gm && !gm.classList.contains('hidden')) { closeGridLayoutsModal(); return; }
            }
        });

        function populateFieldSelectionGrid() {
            var container = document.getElementById('fieldSelectionGrid');
            if (!container) return;
            var html = '';

            // ── Section 1: Default (Locked) Fields ──
            var lockedFields = availableFields.filter(function(f) { return f.locked; });
            html += '<div class="mb-4">';
            html += '<div class="flex items-center justify-between mb-2"><h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider"><i class="fas fa-lock text-gray-400 mr-1.5"></i>Default Columns (always shown)</h4><span class="text-xs text-gray-400">' + lockedFields.length + ' fields</span></div>';
            html += '<div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">';
            lockedFields.forEach(function(field) {
                var isSelected = searchResultsState.visibleColumns.includes(field.id);
                html += '<label class="flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-all ' + (isSelected ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100 hover:border-gray-200') + '" data-field-label="' + field.id + '">';
                html += '<span class="w-5 h-5 bg-blue-500 text-white rounded text-[10px] flex items-center justify-center flex-shrink-0 font-bold">' + field.priority + '</span>';
                html += '<input type="checkbox" class="w-3.5 h-3.5 rounded flex-shrink-0" data-field="' + field.id + '" ' + (isSelected ? 'checked' : '') + ' onchange="toggleFieldSelection(\'' + field.id + '\', this)">';
                html += '<span class="text-xs font-medium text-gray-700 leading-tight">' + field.label + '</span>';
                html += '</label>';
            });
            html += '</div></div>';

            // ── Section 2: Optional Fields by Category ──
            html += '<div class="border-t pt-3">';
            html += '<div class="flex items-center justify-between mb-3"><h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider"><i class="fas fa-plus-circle text-gray-400 mr-1.5"></i>Additional Columns</h4></div>';

            var categoryOrder = ['financial', 'property', 'agent', 'location', 'history', 'activity', 'ids'];
            categoryOrder.forEach(function(catKey) {
                var cat = fieldCategories[catKey];
                var catFields = availableFields.filter(function(f) { return !f.locked && f.category === catKey; });
                if (catFields.length === 0) return;

                var selectedInCat = catFields.filter(function(f) { return searchResultsState.visibleColumns.includes(f.id); }).length;
                html += '<div class="mb-3">';
                html += '<button type="button" class="flex items-center gap-2 w-full text-left mb-1.5 group" onclick="toggleCategoryCollapse(this)">';
                html += '<i class="fas fa-chevron-down text-[10px] text-gray-400 transition-transform group-open:-rotate-90"></i>';
                html += '<i class="fas ' + cat.icon + ' ' + cat.color + ' text-xs"></i>';
                html += '<span class="text-xs font-semibold text-gray-700">' + cat.label + '</span>';
                html += '<span class="text-[10px] text-gray-400 ml-auto">' + (selectedInCat > 0 ? '<span class="text-blue-600 font-semibold">' + selectedInCat + '</span>/' : '') + catFields.length + '</span>';
                html += '</button>';
                html += '<div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 category-fields">';
                catFields.forEach(function(field) {
                    var isSelected = searchResultsState.visibleColumns.includes(field.id);
                    html += '<label class="flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-all ' + (isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:border-gray-200') + '" data-field-label="' + field.id + '">';
                    html += '<input type="checkbox" class="w-3.5 h-3.5 rounded flex-shrink-0" data-field="' + field.id + '" ' + (isSelected ? 'checked' : '') + ' onchange="toggleFieldSelection(\'' + field.id + '\', this)">';
                    html += '<span class="text-xs text-gray-600 leading-tight">' + field.label + '</span>';
                    html += '</label>';
                });
                html += '</div></div>';
            });
            html += '</div>';

            container.innerHTML = html;
            updateSelectedFieldCount();
        }

        function toggleCategoryCollapse(btn) {
            var fields = btn.nextElementSibling;
            var chevron = btn.querySelector('.fa-chevron-down');
            if (fields && fields.classList.contains('category-fields')) {
                var isHidden = fields.style.display === 'none';
                fields.style.display = isHidden ? '' : 'none';
                if (chevron) chevron.style.transform = isHidden ? '' : 'rotate(-90deg)';
            }
        }

        function toggleFieldSelection(fieldId, checkbox) {
            var index = searchResultsState.visibleColumns.indexOf(fieldId);
            if (index > -1) {
                searchResultsState.visibleColumns.splice(index, 1);
            } else {
                searchResultsState.visibleColumns.push(fieldId);
            }
            // Immediate visual feedback on the label
            if (checkbox) {
                var label = checkbox.closest('label');
                if (label) {
                    if (searchResultsState.visibleColumns.includes(fieldId)) {
                        label.classList.remove('bg-white', 'bg-gray-50', 'border-gray-100');
                        label.classList.add('bg-blue-50', 'border-blue-200');
                    } else {
                        label.classList.remove('bg-blue-50', 'border-blue-200');
                        label.classList.add(label.closest('.border-t') ? 'bg-white' : 'bg-gray-50', 'border-gray-100');
                    }
                }
            }
            updateSelectedFieldCount();
        }

        function updateSelectedFieldCount() {
            var el = document.getElementById('selectedFieldCount');
            if (el) el.textContent = searchResultsState.visibleColumns.length;
            // Update Select All checkbox state
            var selectAll = document.getElementById('selectAllFields');
            if (selectAll) {
                selectAll.checked = searchResultsState.visibleColumns.length === availableFields.length;
                selectAll.indeterminate = searchResultsState.visibleColumns.length > 0 && searchResultsState.visibleColumns.length < availableFields.length;
            }
        }

        function toggleAllFields() {
            var checkbox = document.getElementById('selectAllFields');
            if (checkbox.checked) {
                searchResultsState.visibleColumns = availableFields.map(function(f) { return f.id; });
            } else {
                searchResultsState.visibleColumns = [];
            }
            populateFieldSelectionGrid();
        }

        // Default columns for reset
        var defaultVisibleColumns = ['address', 'unit', 'price', 'totalMonthly', 'rooms', 'beds', 'baths', 'reTaxes', 'maintCC', 'intSqft', 'status', 'ownership'];

        function resetGridLayoutDefaults() {
            searchResultsState.visibleColumns = defaultVisibleColumns.slice();
            populateFieldSelectionGrid();
        }

        function applyGridLayout() {
            localStorage.setItem('visibleColumns', JSON.stringify(searchResultsState.visibleColumns));
            closeGridLayoutsModal();
            // Auto-switch to grid view so user can see the column changes
            setViewMode('grid');
        }

        function populateSavedLayoutsList() {
            var container = document.getElementById('savedLayoutsList');
            if (!container) return;

            // Load saved layouts from localStorage
            var savedLayouts = JSON.parse(localStorage.getItem('gridLayouts') || '[]');
            var html = '';

            // Always show Default layout first
            html += '<div class="p-3 border rounded-lg flex items-center justify-between bg-white hover:bg-gray-50 cursor-pointer" onclick="loadSavedLayout(\'default\')">';
            html += '<div><div class="text-sm font-medium">Default</div>';
            html += '<span class="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-medium">' + defaultVisibleColumns.length + ' columns</span></div>';
            html += '<button class="text-gray-400" aria-label="More options"><i class="fas fa-ellipsis-v"></i></button>';
            html += '</div>';

            savedLayouts.forEach(function(layout, i) {
                html += '<div class="p-3 border rounded-lg flex items-center justify-between bg-white hover:bg-gray-50 cursor-pointer" onclick="loadSavedLayout(' + i + ')">';
                html += '<div><div class="text-sm font-medium">' + escapeHtml(layout.name) + '</div>';
                html += '<span class="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded">' + layout.columns.length + ' columns</span></div>';
                html += '<button class="text-gray-400 hover:text-red-500" onclick="event.stopPropagation(); deleteSavedLayout(' + i + ')" title="Delete"><i class="fas fa-trash-alt text-xs"></i></button>';
                html += '</div>';
            });

            container.innerHTML = html;
        }

        function loadSavedLayout(index) {
            if (index === 'default') {
                searchResultsState.visibleColumns = defaultVisibleColumns.slice();
            } else {
                var savedLayouts = JSON.parse(localStorage.getItem('gridLayouts') || '[]');
                if (savedLayouts[index]) {
                    searchResultsState.visibleColumns = savedLayouts[index].columns.slice();
                }
            }
            populateFieldSelectionGrid();
        }

        function createNewLayout() {
            var name = prompt('Enter layout name:');
            if (name && name.trim()) {
                var savedLayouts = JSON.parse(localStorage.getItem('gridLayouts') || '[]');
                savedLayouts.push({ name: name.trim(), columns: searchResultsState.visibleColumns.slice() });
                localStorage.setItem('gridLayouts', JSON.stringify(savedLayouts));
                populateSavedLayoutsList();
            }
        }

        function deleteSavedLayout(index) {
            var savedLayouts = JSON.parse(localStorage.getItem('gridLayouts') || '[]');
            if (savedLayouts[index] && confirm('Delete layout "' + savedLayouts[index].name + '"?')) {
                savedLayouts.splice(index, 1);
                localStorage.setItem('gridLayouts', JSON.stringify(savedLayouts));
                populateSavedLayoutsList();
            }
        }

