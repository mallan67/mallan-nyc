// Compare JSON deals against Excel to find wrong Trestle matches
const path = require('path');
const XLSX = require('xlsx');

const data = require(path.join(__dirname, '..', 'data', 'maya-past-deals.json'));
const excelPath = path.join('C:', 'Users', 'MayaAllan', 'Desktop', 'Closed Deals Real Estate', 'Closed Deals MAllan', 'Total Deals.xlsx');
const wb = XLSX.readFile(excelPath);

function parseExcelDate(serial) {
  if (!serial) return null;
  if (typeof serial === 'string') return serial;
  return new Date((serial - 25569) * 86400000).toISOString().split('T')[0];
}

// Build Excel lookup
const salesRows = XLSX.utils.sheet_to_json(wb.Sheets['Total Sales']);
const rentalRows = XLSX.utils.sheet_to_json(wb.Sheets['Total Rentals']);

console.log('=== SALES TAB VALIDATION ===');
console.log('Excel has', salesRows.length, 'sales | JSON has', data.pastSales.length, 'sales\n');

for (let i = 0; i < data.pastSales.length; i++) {
  const d = data.pastSales[i];
  if (d.source !== 'trestle') continue;

  // Check if the Trestle listing agent is Maya
  const isMaya = !d.listOfficeName || d.listOfficeName === 'MAllan Real Estate Inc';
  const flag = d.listAgentFullName && d.listAgentFullName !== 'Maya Allan' ? ' *** NOT MAYA ***' : '';

  console.log(`${i+1}. ${d.street} ${d.unit || ''} | $${(d.price || 0).toLocaleString()} | ${d.type} | ${d.date || 'N/A'} | Office: ${d.listOfficeName || 'MAllan'} | Agent: ${d.listAgentFullName || 'N/A'}${flag}`);
}

console.log('\n=== RENTALS TAB VALIDATION ===');
console.log('Excel has', rentalRows.length, 'rentals | JSON has', data.pastRentals.length, 'rentals\n');

for (let i = 0; i < data.pastRentals.length; i++) {
  const d = data.pastRentals[i];
  if (d.source !== 'trestle') continue;

  const flag = d.listAgentFullName && d.listAgentFullName !== 'Maya Allan' ? ' *** NOT MAYA ***' : '';

  console.log(`${i+1}. ${d.street} ${d.unit || ''} | $${(d.price || 0).toLocaleString()} | ${d.type} | ${d.date || 'N/A'} | Office: ${d.listOfficeName || 'MAllan'} | Agent: ${d.listAgentFullName || 'N/A'}${flag}`);
}
