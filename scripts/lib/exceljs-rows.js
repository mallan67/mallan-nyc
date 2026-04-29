const ExcelJS = require('exceljs');

function cellValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;
  if ('result' in value) return value.result;
  if ('text' in value) return value.text;
  if ('richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text || '').join('');
  }
  if ('hyperlink' in value && 'text' in value) return value.text;
  return String(value);
}

function normalizeHeader(value) {
  return String(cellValue(value) ?? '').trim();
}

async function readWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
}

function worksheetToObjects(worksheet) {
  if (!worksheet) return [];

  const headerRow = worksheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeHeader(cell.value);
    if (header) headers[colNumber] = header;
  });

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const out = {};
    let hasValue = false;
    for (let colNumber = 1; colNumber < headers.length; colNumber++) {
      const header = headers[colNumber];
      if (!header) continue;
      const value = cellValue(row.getCell(colNumber).value);
      if (value !== null && value !== undefined && value !== '') hasValue = true;
      out[header] = value;
    }
    if (hasValue) rows.push(out);
  });

  return rows;
}

async function readWorksheetObjects(filePath, sheetName) {
  const workbook = await readWorkbook(filePath);
  return worksheetToObjects(workbook.getWorksheet(sheetName));
}

module.exports = {
  readWorkbook,
  readWorksheetObjects,
  worksheetToObjects,
};
