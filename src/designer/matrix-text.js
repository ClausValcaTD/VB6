/** Lossless quoted TSV editing for grid/chart drafts. Textarea newline
 * normalization must not rewrite untouched scalar types or embedded CRLFs. */
import {validateCollection} from './collections.js';
const normalized = text => String(text).replace(/\r\n?/g, '\n');
const scalar = value => value == null ? '' : String(value);
export function matrixText(rows) {
  return rows.map(row => row.map(value => {
    const text = scalar(value);
    return /[\t\r\n"]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }).join('\t')).join('\n');
}
export function parseMatrixText(text) {
  text = normalized(text);
  if (text.length > 16000000) throw new Error('Grid text exceeds 16,000,000 characters.');
  if (!text) return [];
  const rows = []; let row = [], field = '', quoted = false, closed = false, start = true, cells = 0;
  const push = () => {row.push(field); if (row.length > 10000 || ++cells > 1000000) throw new Error('Grid cell limit exceeded.'); field = ''; closed = false; start = true;};
  const endRow = () => {push(); rows.push(row); if (rows.length > 10000) throw new Error('Grid row limit exceeded.'); row = [];};
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {if (c === '"') {if (text[i + 1] === '"') {field += '"'; i++;} else {quoted = false; closed = true;}} else field += c; continue;}
    if (c === '\t') {push(); continue;}
    if (c === '\n') {endRow(); continue;}
    if (closed) throw new Error('Unexpected text after a quoted grid field.');
    if (c === '"') {if (!start) throw new Error('Quotes inside a grid field must be escaped.'); quoted = true; start = false;}
    else {field += c; start = false;}
  }
  if (quoted) throw new Error('Unterminated quoted grid field.');
  endRow(); return rows;
}
export function matrixFromText(control, text, original = []) {
  // Preserve ragged rows, nulls, numeric cells and multiline bytes on OK.
  if (normalized(text) === normalized(matrixText(original))) return validateCollection(control, 'GridData', original);
  const rows = parseMatrixText(text).map((row, r) => row.map((value, c) => {
    if (c < (original[r]?.length ?? 0) && value === normalized(scalar(original[r][c]))) return original[r][c];
    if (control.type !== 'MSChart') return value;
    const number = Number(value); if (!Number.isFinite(number)) throw new Error('Chart values must be finite numbers.'); return number;
  }));
  return validateCollection(control, 'GridData', rows);
}
