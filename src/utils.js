function formatRupiah(amount) {
  const n = Math.round(Number(amount) || 0);
  return 'Rp ' + n.toLocaleString('id-ID');
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escapes text for use inside an HTML attribute value that is itself
// wrapped in double quotes (alias kept separate for readability at call sites).
const escapeAttr = escapeHtml;

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function generateOrderNumber(id, date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `PC-${y}${m}${d}-${String(id).padStart(4, '0')}`;
}

function formatDateID(dateInput) {
  // Treat a bare 'YYYY-MM-DD' as a local calendar date (not UTC midnight),
  // so the weekday/day shown always matches the date key it was built from.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateInput) ? new Date(dateInput + 'T00:00:00') : new Date(dateInput);
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTimeID(dateInput) {
  const d = new Date(dateInput);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

// yyyy-mm-dd in local time (used for grouping/filtering orders by day)
function toDateKey(dateInput) {
  const d = new Date(dateInput);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

module.exports = {
  formatRupiah,
  escapeHtml,
  escapeAttr,
  csvEscape,
  generateOrderNumber,
  formatDateID,
  formatTimeID,
  toDateKey,
  slugify,
};
