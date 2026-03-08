/**
 * Clean mock/fake data from CRM file lines ~21900-22400
 * Replaces fake names, dates, stats with empty states + IDs
 * Preserves all HTML structure, CSS classes, buttons, headers
 */
const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, '..', 'public', 'crm', 'MALLAN-NYC-CRM-FINAL2.html');
let content = fs.readFileSync(filepath, 'utf-8');
const original = content;
let edits = 0;

function replace(label, oldStr, newStr) {
  if (content.includes(oldStr)) {
    content = content.replace(oldStr, newStr);
    edits++;
    console.log(`EDIT ${edits}: ${label} - DONE`);
  } else {
    console.log(`SKIP: ${label} - pattern not found`);
  }
}

// ============================================================
// EDIT 1: Upcoming Deadlines - 3 fake entries → empty state + ID
// ============================================================
replace(
  'Upcoming Deadlines (Jane Doe license, E&O insurance, Michael Smith CE)',
  `                    <div class="divide-y">
                        <div class="p-4 flex items-center justify-between hover:bg-gray-50">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 bg-red-100 rounded flex items-center justify-center">
                                    <i class="fas fa-id-card text-red-600 text-xs"></i>
                                </div>
                                <div>
                                    <p class="text-sm font-semibold">Jane Doe &mdash; License Renewal</p>
                                    <p class="text-xs text-gray-500">RE Salesperson License #10401234567</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <p class="text-sm font-bold text-red-600">Mar 15, 2026</p>
                                <p class="text-[10px] text-red-500">30 days remaining</p>
                            </div>
                        </div>
                        <div class="p-4 flex items-center justify-between hover:bg-gray-50">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 bg-orange-100 rounded flex items-center justify-center">
                                    <i class="fas fa-shield-alt text-orange-600 text-xs"></i>
                                </div>
                                <div>
                                    <p class="text-sm font-semibold">Company E&amp;O Insurance Renewal</p>
                                    <p class="text-xs text-gray-500">Mallan Real Estate Inc. &mdash; Current policy expires</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <p class="text-sm font-bold text-orange-600">Apr 01, 2026</p>
                                <p class="text-[10px] text-orange-500">47 days remaining</p>
                            </div>
                        </div>
                        <div class="p-4 flex items-center justify-between hover:bg-gray-50">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                                    <i class="fas fa-graduation-cap text-blue-600 text-xs"></i>
                                </div>
                                <div>
                                    <p class="text-sm font-semibold">Michael Smith &mdash; CE Hours Due</p>
                                    <p class="text-xs text-gray-500">22.5 hours required &middot; 15 completed &middot; 7.5 remaining</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <p class="text-sm font-bold text-blue-600">Jun 30, 2026</p>
                                <p class="text-[10px] text-blue-500">137 days remaining</p>
                            </div>
                        </div>
                    </div>`,
  `                    <div id="compliance-deadlines-list" class="divide-y">
                        <div class="p-6 text-center text-gray-400">
                            <i class="fas fa-calendar-alt text-2xl mb-2"></i>
                            <p class="text-sm">No upcoming deadlines</p>
                            <p class="text-xs mt-1">License renewals, CE hours, and insurance deadlines will appear here</p>
                        </div>
                    </div>`
);

// ============================================================
// EDIT 2: Data Quality Monitor - fake stats (47, 1, 2.1%)
// ============================================================
replace(
  'Data Quality Monitor stats (47 / 1 / 2.1%)',
  `                            <div class="border rounded-lg p-4 text-center">
                                <p class="text-xs text-gray-500 font-semibold mb-1">Submissions This Quarter</p>
                                <p class="text-2xl font-bold text-gray-900">47</p>
                            </div>
                            <div class="border rounded-lg p-4 text-center">
                                <p class="text-xs text-gray-500 font-semibold mb-1">Rejected</p>
                                <p class="text-2xl font-bold text-red-600">1</p>
                            </div>
                            <div class="border border-green-200 bg-green-50 rounded-lg p-4 text-center">
                                <p class="text-xs text-green-600 font-semibold mb-1">Rejection Rate</p>
                                <p class="text-2xl font-bold text-green-700">2.1%</p>
                                <p class="text-[10px] text-green-600">Well below 5% threshold</p>
                            </div>`,
  `                            <div class="border rounded-lg p-4 text-center">
                                <p class="text-xs text-gray-500 font-semibold mb-1">Submissions This Quarter</p>
                                <p id="dq-submissions-count" class="text-2xl font-bold text-gray-900">&ndash;</p>
                            </div>
                            <div class="border rounded-lg p-4 text-center">
                                <p class="text-xs text-gray-500 font-semibold mb-1">Rejected</p>
                                <p id="dq-rejected-count" class="text-2xl font-bold text-red-600">&ndash;</p>
                            </div>
                            <div class="border border-green-200 bg-green-50 rounded-lg p-4 text-center">
                                <p class="text-xs text-green-600 font-semibold mb-1">Rejection Rate</p>
                                <p id="dq-rejection-rate" class="text-2xl font-bold text-green-700">&ndash;</p>
                                <p class="text-[10px] text-green-600">&nbsp;</p>
                            </div>`
);

// ============================================================
// EDIT 3: Fair Housing Scanner - fake scan date/counts
// ============================================================
replace(
  'Fair Housing Scanner results (fake date + counts)',
  `                                <p class="text-xs text-green-600">Last full scan: 02/13/2026 9:45 AM &middot; Scanned 42 active listing descriptions, 15 email templates, and 8 marketing campaigns</p>`,
  `                                <p id="fh-scan-result" class="text-xs text-green-600">No scan results yet. Click "Run Scan" to check all listings.</p>`
);

// ============================================================
// EDIT 4: Distribution Gate Matrix - 6 fake listing rows → empty state
// ============================================================
replace(
  'Distribution Gate Matrix (6 fake listing rows)',
  `                            <tbody class="divide-y">
                                <tr class="hover:bg-gray-50">
                                    <td class="px-3 py-2 font-medium">450 W 42nd St #28B</td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-gray-300"><i class="fas fa-minus"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-gray-300"><i class="fas fa-minus"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="px-2 py-0.5 bg-green-100 text-green-700 rounded font-bold">VISIBLE</span></td>
                                </tr>
                                <tr class="hover:bg-gray-50">
                                    <td class="px-3 py-2 font-medium">225 W 83rd St #4F</td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-gray-300"><i class="fas fa-minus"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-gray-300"><i class="fas fa-minus"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="px-2 py-0.5 bg-green-100 text-green-700 rounded font-bold">VISIBLE</span></td>
                                </tr>
                                <tr class="hover:bg-gray-50 bg-yellow-50">
                                    <td class="px-3 py-2 font-medium">350 E 62nd St #2B</td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-yellow-600"><i class="fas fa-exclamation-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-yellow-600"><i class="fas fa-exclamation-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-gray-300"><i class="fas fa-minus"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-gray-300"><i class="fas fa-minus"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded font-bold">RLS ONLY</span></td>
                                </tr>
                                <tr class="hover:bg-gray-50">
                                    <td class="px-3 py-2 font-medium">15 Hudson Yards #31D</td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-gray-400"><i class="fas fa-ban"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-yellow-600"><i class="fas fa-clock"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-gray-300"><i class="fas fa-minus"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded font-bold">CS ONLY</span></td>
                                </tr>
                                <tr class="hover:bg-gray-50">
                                    <td class="px-3 py-2 font-medium">111 Murray St #30F</td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-gray-300"><i class="fas fa-minus"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-gray-300"><i class="fas fa-minus"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="px-2 py-0.5 bg-green-100 text-green-700 rounded font-bold">VISIBLE</span></td>
                                </tr>
                                <tr class="hover:bg-gray-50 bg-gray-100">
                                    <td class="px-3 py-2 font-medium text-gray-500">One57 #72B</td>
                                    <td class="text-center px-2 py-2"><span class="text-gray-300"><i class="fas fa-minus"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-gray-300"><i class="fas fa-minus"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-gray-300"><i class="fas fa-minus"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-gray-300"><i class="fas fa-minus"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-gray-300"><i class="fas fa-minus"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="text-green-600"><i class="fas fa-check-circle"></i></span></td>
                                    <td class="text-center px-2 py-2"><span class="px-2 py-0.5 bg-gray-200 text-gray-600 rounded font-bold">CLOSED</span></td>
                                </tr>
                            </tbody>`,
  `                            <tbody id="distribution-gate-tbody" class="divide-y">
                                <tr>
                                    <td colspan="8" class="px-3 py-6 text-center text-gray-400">
                                        <i class="fas fa-shield-alt text-2xl mb-2"></i>
                                        <p class="text-sm">No active listings to display</p>
                                        <p class="text-xs mt-1">Distribution gate status for your listings will appear here</p>
                                    </td>
                                </tr>
                            </tbody>`
);

// ============================================================
// EDIT 5: Recent Compliance Events - 6 fake audit entries → empty state
// ============================================================
replace(
  'Recent Compliance Events (6 fake audit log entries with Jane Doe)',
  `                    <div class="divide-y">
                        <div class="p-3 flex items-center gap-3 hover:bg-gray-50">
                            <span class="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></span>
                            <span class="text-xs text-gray-500 w-32 flex-shrink-0">02/13 9:45 AM</span>
                            <span class="text-sm">Fair Housing scan completed &mdash; 0 violations found</span>
                            <span class="text-xs text-gray-400 ml-auto">System</span>
                        </div>
                        <div class="p-3 flex items-center gap-3 hover:bg-gray-50">
                            <span class="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></span>
                            <span class="text-xs text-gray-500 w-32 flex-shrink-0">02/12 4:30 PM</span>
                            <span class="text-sm">Listing 15 Hudson Yards #31D &mdash; Coming Soon badge added</span>
                            <span class="text-xs text-gray-400 ml-auto showing-agent">--</span>
                        </div>
                        <div class="p-3 flex items-center gap-3 hover:bg-gray-50">
                            <span class="w-2 h-2 bg-yellow-500 rounded-full flex-shrink-0"></span>
                            <span class="text-xs text-gray-500 w-32 flex-shrink-0">02/11 2:15 PM</span>
                            <span class="text-sm">IDX opt-in flag warning &mdash; 2 listings missing IDXEntireListingDisplayYN</span>
                            <span class="text-xs text-gray-400 ml-auto">System</span>
                        </div>
                        <div class="p-3 flex items-center gap-3 hover:bg-gray-50">
                            <span class="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></span>
                            <span class="text-xs text-gray-500 w-32 flex-shrink-0">02/10 11:00 AM</span>
                            <span class="text-sm">Listing 200 E 66th St #A1506 &mdash; Status changed Active &rarr; Pending</span>
                            <span class="text-xs text-gray-400 ml-auto">Jane Doe</span>
                        </div>
                        <div class="p-3 flex items-center gap-3 hover:bg-gray-50">
                            <span class="w-2 h-2 bg-red-500 rounded-full flex-shrink-0"></span>
                            <span class="text-xs text-gray-500 w-32 flex-shrink-0">02/09 3:45 PM</span>
                            <span class="text-sm">Data quality rejection &mdash; Listing missing required photos (resolved)</span>
                            <span class="text-xs text-gray-400 ml-auto">System</span>
                        </div>
                        <div class="p-3 flex items-center gap-3 hover:bg-gray-50">
                            <span class="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></span>
                            <span class="text-xs text-gray-500 w-32 flex-shrink-0">02/08 10:30 AM</span>
                            <span class="text-sm">Jane Doe &mdash; CE hours updated: 15/22.5 completed</span>
                            <span class="text-xs text-gray-400 ml-auto showing-agent">--</span>
                        </div>
                    </div>`,
  `                    <div id="compliance-events-list" class="divide-y">
                        <div class="p-6 text-center text-gray-400">
                            <i class="fas fa-history text-2xl mb-2"></i>
                            <p class="text-sm">No compliance events recorded</p>
                            <p class="text-xs mt-1">Audit trail entries will appear here as actions are taken</p>
                        </div>
                    </div>`
);

// ============================================================
// EDIT 6: Agent Pending Submissions - fake "Johnson" doc + count
// ============================================================
replace(
  'Agent Pending Submissions (fake Johnson doc + "2 awaiting")',
  `                        <span class="text-xs text-amber-600">2 awaiting review</span>
                    </div>
                    <div class="divide-y">
                        <div class="px-5 py-3 flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <i class="fas fa-file-pdf text-red-400"></i>
                                <div>
                                    <p class="text-sm font-medium">Buyer Agency Agreement - Johnson</p>
                                    <p class="text-xs text-gray-500">Agreements — Buyer &middot; Submitted 02/03/26</p>
                                </div>
                            </div>
                            <span class="px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">Pending Review</span>
                        </div>
                        <!-- 1 additional pending submission trimmed -->
                    </div>`,
  `                        <span id="pending-submissions-count" class="text-xs text-amber-600">0 awaiting review</span>
                    </div>
                    <div id="pending-submissions-list" class="divide-y">
                        <div class="px-5 py-4 text-center text-gray-400">
                            <p class="text-sm">No pending submissions</p>
                        </div>
                    </div>`
);

// ============================================================
// EDIT 7: Admin Agent Upload Approvals - fake "Johnson" / "Jane Doe" + count
// ============================================================
replace(
  'Admin Upload Approvals (fake Johnson/Jane Doe doc + "3 Pending")',
  `                        <span class="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">3 Pending</span>
                    </div>
                    <div class="divide-y">
                        <div class="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div class="flex items-center gap-3">
                                <i class="fas fa-file-pdf text-red-400"></i>
                                <div>
                                    <p class="text-sm font-medium">Buyer Agency Agreement - Johnson</p>
                                    <p class="text-xs text-gray-500">Submitted by <strong>Jane Doe</strong> &middot; Agreements — Buyer &middot; 02/03/26</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <button class="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700">Preview</button>
                                <button class="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700">Approve</button>
                                <button class="px-3 py-1.5 bg-red-600 text-white rounded text-xs font-semibold hover:bg-red-700">Reject</button>
                            </div>
                        </div>
                        <!-- 2 additional approval items trimmed -->
                    </div>`,
  `                        <span id="upload-approvals-count" class="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">0 Pending</span>
                    </div>
                    <div id="upload-approvals-list" class="divide-y">
                        <div class="px-5 py-4 text-center text-gray-400">
                            <p class="text-sm">No documents awaiting approval</p>
                        </div>
                    </div>`
);

// ============================================================
// EDIT 8: Compliance Checklist - fake "Last checked: Today" timestamps
// ============================================================
const todayCount = (content.match(/Last checked: Today/g) || []).length;
content = content.replace(/Last checked: Today/g, 'Last checked: --');
edits++;
console.log(`EDIT ${edits}: Compliance Checklist timestamps ("Last checked: Today" x${todayCount}) - DONE`);

// ============================================================
// EDIT 9: Compliance alert - fake "1 listing" count
// ============================================================
replace(
  'Compliance alert fake count ("1 listing was closed")',
  `1 listing was closed but not marked as Closed/Sold in RLS within the required 24-hour window.`,
  `No listings currently flagged. Listings closed but not marked as Closed/Sold in RLS within the required 24-hour window will appear here.`
);

// ============================================================
// EDIT 10: Document section fake counts ("12 documents", "15 documents")
// ============================================================
replace(
  'Buyer Agreements fake count (12 documents)',
  `<p class="text-xs text-gray-500">12 documents</p>`,
  `<p id="doc-buyer-agreements-count" class="text-xs text-gray-500">&ndash; documents</p>`
);

replace(
  'Seller Agreements fake count (15 documents)',
  `<p class="text-xs text-gray-500">15 documents</p>`,
  `<p id="doc-seller-agreements-count" class="text-xs text-gray-500">&ndash; documents</p>`
);

// Write back
fs.writeFileSync(filepath, content, 'utf-8');

const linesDiff = content.split('\n').length - original.split('\n').length;
console.log(`\nDone. ${edits} edits applied. Line count change: ${linesDiff > 0 ? '+' : ''}${linesDiff}`);
