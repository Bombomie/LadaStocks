// utils/csv.js
// Secure RFC 4180 CSV serializer with formula-injection neutralization.

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return '';
  let str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Prevent Excel/Sheets formula injection when opened by users or admins
  if (FORMULA_PREFIX.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv(headers, rows) {
  const headerLine = headers.map((h) => sanitizeCsvCell(h.label)).join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => sanitizeCsvCell(typeof h.value === 'function' ? h.value(row) : row?.[h.key])).join(',')
  );
  // Prepend UTF-8 BOM for clean Excel compatibility
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n') + '\r\n';
}

export function sendSecureCsv(res, filename, headers, rows) {
  const safeName = String(filename || 'export.csv')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.csv$/i, '') + '.csv';
  const csvBody = buildCsv(headers, rows);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  return res.status(200).send(csvBody);
}
