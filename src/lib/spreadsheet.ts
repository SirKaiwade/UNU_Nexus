import type { Cell, SheetTable } from './recordsImport';
import ExcelJS from 'exceljs';

export function isSpreadsheetFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.csv') ||
    file.type === 'text/csv' ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

function parseCsv(text: string): Cell[][] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell === '' ? null : cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell === '' ? null : cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell === '' ? null : cell);
    rows.push(row);
  }
  return rows;
}

function excelCell(value: ExcelJS.CellValue): Cell {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return excelCell(value.result as ExcelJS.CellValue);
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((t) => t.text).join('');
    }
    if ('hyperlink' in value && 'text' in value) return String(value.text ?? '');
  }
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  return String(value);
}

export async function readSpreadsheet(file: File): Promise<SheetTable[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls') && !name.endsWith('.xlsx')) {
    throw new Error('Legacy .xls is not supported. Save as .xlsx or CSV.');
  }
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    return [{ name: 'Sheet1', rows: parseCsv(await file.text()) }];
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const tables: SheetTable[] = [];
  wb.eachSheet((sheet) => {
    const rows: Cell[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(values.map((v) => excelCell(v as ExcelJS.CellValue)));
    });
    tables.push({ name: sheet.name, rows });
  });
  return tables;
}

function cellToText(c: Cell): string {
  if (c == null) return '';
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).replace(/\s+/g, ' ').trim();
}

/** Renders a workbook as readable pipe-delimited text so spreadsheets can be
 * attached in chat and searched by the model like any other document. */
export function sheetsToText(tables: SheetTable[]): string {
  const parts: string[] = [];
  for (const table of tables) {
    const rows = table.rows
      .map((row) => row.map(cellToText))
      .filter((row) => row.some((c) => c.length > 0));
    if (rows.length === 0) continue;
    const body = rows.map((row) => {
      let end = row.length;
      while (end > 0 && row[end - 1] === '') end--;
      return row.slice(0, end).join(' | ');
    });
    parts.push(`== Sheet: ${table.name} ==\n${body.join('\n')}`);
  }
  return parts.join('\n\n');
}
