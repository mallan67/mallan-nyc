        function toggleSidebarSection(header) {
            var body = header.nextElementSibling;
            if (!body) return;
            header.classList.toggle('collapsed');
            if (body.classList.contains('collapsed')) {
                body.classList.remove('collapsed');
                body.style.maxHeight = body.scrollHeight + 'px';
            } else {
                body.style.maxHeight = '0';
                body.classList.add('collapsed');
            }
        }

        /**
         * Expand/collapse child items under a parent sidebar group
         */
        function toggleSidebarParent(btn) {
            var children = btn.nextElementSibling;
            if (!children) return;
            btn.classList.toggle('expanded');
            children.classList.toggle('expanded');
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // AGENT ROSTER - Expand/Collapse & Listing Filters
        // ═══════════════════════════════════════════════════════════════════════════════

        /** Toggle an agent card's expanded panel open/closed */
        function toggleAgentCard(header) {
            var card = header.closest('.agent-roster-card');
            var panel = card.querySelector('.agent-expanded-panel');
            var chevron = header.querySelector('.agent-chevron');
            if (panel.style.display === 'none') {
                panel.style.display = 'block';
                if (chevron) chevron.style.transform = 'rotate(180deg)';
            } else {
                panel.style.display = 'none';
                if (chevron) chevron.style.transform = 'rotate(0deg)';
            }
        }

        /** Filter listings inside an agent's expanded panel by status */
        function filterAgentListings(btn, status) {
            var panel = btn.closest('.agent-expanded-panel');
            // Update active filter button
            panel.querySelectorAll('.agent-filter-btn').forEach(b => {
                b.className = b.className.replace(/bg-blue-600 text-white/g, 'bg-gray-100 text-gray-600');
            });
            btn.className = btn.className.replace(/bg-gray-100 text-gray-600/g, 'bg-blue-600 text-white');
            // Show/hide listing rows
            panel.querySelectorAll('.agent-listing').forEach(row => {
                if (status === 'all' || row.dataset.status === status) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // SEARCH NAVIGATION - Show/Hide Search Form vs Results
        // ═══════════════════════════════════════════════════════════════════════════════

        // Perform search - hide search form, show results
        // Active search criteria (populated by performSearch)
        var activeSearchCriteria = {};

