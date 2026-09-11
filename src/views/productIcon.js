const { escapeAttr } = require('../utils');

// Deterministic pastel tint per product so the placeholder icon (used until
// a real photo is uploaded) stays visually distinct across the catalog.
const TINTS = [
  ['#e88a3a', '#fbe7d3'],
  ['#d1618a', '#f9dde7'],
  ['#8bbf4f', '#e7f2d9'],
  ['#e0a23c', '#faedd3'],
  ['#e0c93c', '#faf5d3'],
  ['#c94f4f', '#f6dcdc'],
  ['#b8437a', '#f2dbe8'],
];

function tintFor(id) {
  return TINTS[Number(id) % TINTS.length];
}

function placeholderSvg(tint, size = 88) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 120 120">
    <ellipse cx="60" cy="40" rx="30" ry="8" fill="#fff" stroke="#00000018" stroke-width="2"/>
    <path d="M30 41 L90 41 L81 100 L39 100 Z" fill="#fff" fill-opacity="0.95" stroke="#00000018" stroke-width="2"/>
    <circle cx="49" cy="56" r="7.5" fill="${tint}"/>
    <rect x="61" y="51" width="12" height="12" rx="3" fill="#e0b23c"/>
    <circle cx="69" cy="72" r="6.5" fill="#58a05c"/>
    <rect x="46" y="74" width="9.5" height="9.5" rx="2.5" fill="${tint}"/>
  </svg>`;
}

function soldOutBanner() {
  return `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;">
    <span style="background:#c94f4f;color:#fff;font-size:12px;font-weight:800;letter-spacing:0.4px;padding:6px 16px;border-radius:8px;transform:rotate(-8deg);box-shadow:0 4px 12px rgba(0,0,0,0.28);white-space:nowrap;">STOK HABIS</span>
  </div>`;
}

// Renders a square product thumbnail: the uploaded photo if present,
// otherwise the pastel fruit-cup placeholder icon. Out-of-stock products get
// a greyed-out image with a centered "Stok Habis" banner.
function productThumb(product, { size = 88, radius = 16 } = {}) {
  const [tint, tintSoft] = tintFor(product.id);
  const soldOut = Number(product.stock) <= 0;
  const dim = soldOut ? 'filter:grayscale(1);opacity:0.6;' : '';

  const inner = product.image
    ? // `product.image` is the full public Vercel Blob URL (stored as-is
      // at upload time), not a local path.
      `<img src="${escapeAttr(product.image)}" alt="${escapeAttr(product.name)}" style="width:100%;height:100%;object-fit:cover;display:block;${dim}">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;${dim}">${placeholderSvg(tint, size)}</div>`;

  return `<div style="width:100%;height:100%;border-radius:${radius}px;overflow:hidden;background:${tintSoft};position:relative;">
    ${inner}
    ${soldOut ? soldOutBanner() : ''}
  </div>`;
}

module.exports = { productThumb, tintFor, placeholderSvg };
