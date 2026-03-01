        function addQuickSearchAddressRow(btn) {
            var row = btn.closest('.flex.items-center');
            var container = row.parentElement;
            var newRow = document.createElement('div');
            newRow.className = 'flex items-center gap-1.5';
            newRow.innerHTML = `
                <input type="text" placeholder="Address or Building Name" class="flex-1 border rounded px-2 py-1.5 text-xs">
                <input type="text" placeholder="Unit" class="w-14 border rounded px-2 py-1.5 text-xs text-center">
                <button type="button" onclick="removeQuickSearchAddressRow(this)" class="w-6 h-6 bg-red-500 text-white rounded hover:bg-red-600 flex items-center justify-center text-xs flex-shrink-0" title="Remove this address"><i class="fas fa-minus" style="font-size:9px"></i></button>
            `;
            container.appendChild(newRow);
            newRow.querySelector('input[type="text"]').focus();
        }

        // Add another row in Advanced Search (Listing ID / Zip / Address)
        function addAdvancedSearchRow() {
            var container = document.getElementById('advancedSearchExtraRows');
            var newRow = document.createElement('div');
            newRow.className = 'flex items-end gap-3';
            newRow.innerHTML = `
                <div class="flex-1">
                    <input type="text" placeholder="Address or Building Name" class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm">
                </div>
                <div class="w-[100px]">
                    <input type="text" placeholder="Unit #" class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm">
                </div>
                <div>
                    <button type="button" onclick="this.parentElement.parentElement.remove()" class="w-9 h-[42px] bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center justify-center text-xs flex-shrink-0" title="Remove this row"><i class="fas fa-minus"></i></button>
                </div>
            `;
            container.appendChild(newRow);
            newRow.querySelector('input[type="text"]').focus();
        }

        // Remove an added Address + Unit row
        function removeQuickSearchAddressRow(btn) {
            var row = btn.closest('.flex.items-center');
            row.remove();
        }

        // Collapsible form sections
        function toggleFormSection(header) {
            var body = header.nextElementSibling;
            var chevron = header.querySelector('.fa-chevron-down, .fa-chevron-right');
            if (!body || !body.classList.contains('form-section-body')) return;
            if (body.style.display === 'none') {
                body.style.display = '';
                if (chevron) { chevron.classList.remove('fa-chevron-right'); chevron.classList.add('fa-chevron-down'); }
                var hint = header.querySelector('.text-xs.text-gray-400');
                if (hint) hint.textContent = '(Click to collapse)';
            } else {
                body.style.display = 'none';
                if (chevron) { chevron.classList.remove('fa-chevron-down'); chevron.classList.add('fa-chevron-right'); }
                var hint = header.querySelector('.text-xs.text-gray-400');
                if (hint) hint.textContent = '(Click to expand)';
            }
        }
