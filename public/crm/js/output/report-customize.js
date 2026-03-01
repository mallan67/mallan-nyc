        // ═══════════════════════════════════════════════════════════════════════════════
        // REPORTS CUSTOMIZE TAB FUNCTIONS
        // ═══════════════════════════════════════════════════════════════════════════════

        var currentReportFieldType = 'sale';

        function setReportFieldType(type) {
            currentReportFieldType = type;

            // Update type buttons
            document.getElementById('reportTypeSale').classList.remove('bg-blue-600', 'text-white');
            document.getElementById('reportTypeSale').classList.add('bg-gray-200', 'text-gray-700');
            document.getElementById('reportTypeRental').classList.remove('bg-blue-600', 'text-white');
            document.getElementById('reportTypeRental').classList.add('bg-gray-200', 'text-gray-700');
            document.getElementById('reportTypeBuilding').classList.remove('bg-blue-600', 'text-white');
            document.getElementById('reportTypeBuilding').classList.add('bg-gray-200', 'text-gray-700');

            var btn = document.getElementById('reportType' + type.charAt(0).toUpperCase() + type.slice(1));
            btn.classList.remove('bg-gray-200', 'text-gray-700');
            btn.classList.add('bg-blue-600', 'text-white');

            // Show/hide field sections
            document.getElementById('reportSalesFields').classList.add('hidden');
            document.getElementById('reportRentalFields').classList.add('hidden');
            document.getElementById('reportBuildingFields').classList.add('hidden');

            if (type === 'sale') {
                document.getElementById('reportSalesFields').classList.remove('hidden');
            } else if (type === 'rental') {
                document.getElementById('reportRentalFields').classList.remove('hidden');
            } else if (type === 'building') {
                document.getElementById('reportBuildingFields').classList.remove('hidden');
            }

            updateSelectedFieldsCount();
        }

        function selectAllReportFields() {
            var container = currentReportFieldType === 'sale' ? 'reportSalesFields' :
                             currentReportFieldType === 'rental' ? 'reportRentalFields' : 'reportBuildingFields';
            document.querySelectorAll(`#${container} .report-field`).forEach(cb => cb.checked = true);
            updateSelectedFieldsCount();
        }

        function deselectAllReportFields() {
            var container = currentReportFieldType === 'sale' ? 'reportSalesFields' :
                             currentReportFieldType === 'rental' ? 'reportRentalFields' : 'reportBuildingFields';
            document.querySelectorAll(`#${container} .report-field`).forEach(cb => cb.checked = false);
            updateSelectedFieldsCount();
        }

        function updateSelectedFieldsCount() {
            var count = document.querySelectorAll('.report-field:checked').length;
            var el = document.getElementById('selectedFieldsCount');
            if (el) el.textContent = count;
        }

        function saveFieldSelection() {
            var selectedFields = [];
            document.querySelectorAll('.report-field:checked').forEach(cb => {
                selectedFields.push(cb.dataset.field);
            });
            localStorage.setItem('reportSelectedFields_' + currentReportFieldType, JSON.stringify(selectedFields));
            showToast('Saved ' + selectedFields.length + ' fields for ' + currentReportFieldType + ' reports', 'success');
        }

        // Initialize report field checkbox listeners
        document.addEventListener('DOMContentLoaded', function() {
            document.querySelectorAll('.report-field').forEach(cb => {
                cb.addEventListener('change', updateSelectedFieldsCount);
            });
        });

        // ═══════════════════════════════════════════════════════════════════════════════
        // FAVORITE REPORTS (Step 14) — Save/Load report configurations
        // ═══════════════════════════════════════════════════════════════════════════════

        function saveReportFavorite() {
            syncUIToReportState();
            var name = prompt('Save report configuration as:', 'My ' + reportState.format.charAt(0).toUpperCase() + reportState.format.slice(1) + ' Report');
            if (!name) return;
            var config = {
                name: name,
                format: reportState.format,
                version: reportState.version,
                output: reportState.output,
                optionalContent: Object.assign({}, reportState.options),
                customFields: getSelectedReportFields(),
                sortOrder: reportState.sort.key,
                title: reportState.title,
                preparedFor: reportState.preparedFor,
                savedAt: new Date().toISOString()
            };
            var agentId = typeof LOGGED_IN_AGENT !== 'undefined' ? LOGGED_IN_AGENT.id : 'default';
            var favorites = JSON.parse(localStorage.getItem('reportFavorites_' + agentId) || '[]');
            favorites.push(config);
            localStorage.setItem('reportFavorites_' + agentId, JSON.stringify(favorites));
            showReportToast('Report configuration "' + name + '" saved');
        }

        function loadReportFavorites() {
            var agentId = typeof LOGGED_IN_AGENT !== 'undefined' ? LOGGED_IN_AGENT.id : 'default';
            return JSON.parse(localStorage.getItem('reportFavorites_' + agentId) || '[]');
        }

        function applyReportFavorite(config) {
            // Restore all state from saved config
            if (config.format) reportState.format = config.format;
            if (config.version) reportState.version = config.version;
            if (config.output) reportState.output = config.output;
            if (config.optionalContent) {
                Object.keys(config.optionalContent).forEach(function(key) {
                    if (reportState.options.hasOwnProperty(key)) {
                        reportState.options[key] = config.optionalContent[key];
                    }
                });
            }
            if (config.sortOrder) reportState.sort.key = config.sortOrder;
            if (config.title) reportState.title = config.title;
            if (config.preparedFor) reportState.preparedFor = config.preparedFor;
            // Re-render UI from state
            renderReportSelections();
            showReportToast('Loaded favorite: ' + config.name);
        }

        function showFavoriteReportsDropdown() {
            var favorites = loadReportFavorites();
            if (favorites.length === 0) {
                showToast('No saved report favorites. Use "Save as Favorite" to save your current report configuration.', 'info');
                return;
            }
            // Build dropdown
            var existing = document.getElementById('favReportsDropdown');
            if (existing) { existing.remove(); return; } // toggle off

            var dd = document.createElement('div');
            dd.id = 'favReportsDropdown';
            dd.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:70;background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:400px;max-height:500px;overflow:hidden';
            var header = '<div style="padding:16px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">' +
                '<h3 style="font-weight:700;font-size:16px;margin:0">Favorite Reports</h3>' +
                '<button onclick="document.getElementById(\'favReportsDropdown\').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:#6b7280"><i class="fas fa-times"></i></button></div>';
            var list = '<div style="max-height:380px;overflow-y:auto;padding:8px">';
            favorites.forEach(function(fav, i) {
                var date = new Date(fav.savedAt).toLocaleDateString();
                list += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#fff\'">' +
                    '<div onclick="applyReportFavorite(loadReportFavorites()[' + i + ']);document.getElementById(\'favReportsDropdown\').remove()" style="flex:1;cursor:pointer">' +
                    '<p style="font-weight:600;font-size:14px;margin:0">' + fav.name + '</p>' +
                    '<p style="font-size:12px;color:#6b7280;margin:2px 0 0">' + fav.format + ' | ' + fav.version + ' | ' + date + '</p></div>' +
                    '<button onclick="event.stopPropagation();deleteReportFavorite(' + i + ')" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:14px;padding:4px 8px" title="Delete"><i class="fas fa-trash"></i></button></div>';
            });
            list += '</div>';
            dd.innerHTML = header + list;
            document.body.appendChild(dd);
        }

        function deleteReportFavorite(index) {
            var agentId = typeof LOGGED_IN_AGENT !== 'undefined' ? LOGGED_IN_AGENT.id : 'default';
            var favorites = JSON.parse(localStorage.getItem('reportFavorites_' + agentId) || '[]');
            var name = favorites[index] ? favorites[index].name : '';
            favorites.splice(index, 1);
            localStorage.setItem('reportFavorites_' + agentId, JSON.stringify(favorites));
            // Re-render dropdown
            var dd = document.getElementById('favReportsDropdown');
            if (dd) dd.remove();
            if (favorites.length > 0) showFavoriteReportsDropdown();
            showReportToast('Deleted favorite: ' + name);
        }
