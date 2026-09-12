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
  // Sized as a share of the box rather than in pixels, so the same icon
  // works in a 44px admin row thumb and a 420px product page.
  return `<svg width="62%" height="62%" style="max-width:${size}px;max-height:${size}px;" viewBox="0 0 120 120">
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

// Every photo for a product, in display order. `image` is the primary and
// always comes first; `images` may repeat it, so duplicates are dropped.
function productPhotos(product) {
  const list = [];
  if (product.image) list.push(product.image);
  for (const url of product.images || []) {
    if (url && !list.includes(url)) list.push(url);
  }
  return list;
}

const ARROW_LEFT =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
const ARROW_RIGHT =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

// Renders a square product thumbnail: the uploaded photo(s) if present,
// otherwise the pastel fruit-cup placeholder icon. Out-of-stock products get
// a greyed-out image with a centered "Stok Habis" banner. With more than one
// photo it becomes a carousel — arrows and dots everywhere it appears, but
// only auto-advancing where `autoplay` is set (the product page).
function productThumb(product, { size = 88, radius = 16, autoplay = false } = {}) {
  const [tint, tintSoft] = tintFor(product.id);
  const soldOut = Number(product.stock) <= 0;
  const dim = soldOut ? 'filter:grayscale(1);opacity:0.6;' : '';
  const photos = productPhotos(product);

  let inner;
  if (photos.length === 0) {
    inner = `<div class="thumb-fill" style="display:flex;align-items:center;justify-content:center;${dim}">${placeholderSvg(
      tint,
      size
    )}</div>`;
  } else if (photos.length === 1) {
    inner = `<img src="${escapeAttr(photos[0])}" alt="${escapeAttr(product.name)}" class="thumb-fill" style="${dim}">`;
  } else {
    // Each photo sits in its own clipping box (.carousel-slide) rather than
    // being a flex item itself — the card's hover zoom scales the image, and
    // without a clip that overflow spills into the neighbouring photo.
    const slides = photos
      .map(
        (url, i) => `<div class="carousel-slide"><img src="${escapeAttr(url)}" alt="${escapeAttr(
          product.name
        )} foto ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}" style="${dim}"></div>`
      )
      .join('');
    const dots = photos
      .map(
        (_, i) =>
          `<button type="button" class="carousel-dot${i === 0 ? ' is-active' : ''}" data-index="${i}" aria-label="Foto ${i + 1}"></button>`
      )
      .join('');

    inner = `<div class="carousel" data-count="${photos.length}"${autoplay ? ' data-autoplay="2000"' : ''}>
      <div class="carousel-track">${slides}</div>
      <button type="button" class="carousel-arrow carousel-prev" aria-label="Foto sebelumnya">${ARROW_LEFT}</button>
      <button type="button" class="carousel-arrow carousel-next" aria-label="Foto berikutnya">${ARROW_RIGHT}</button>
      <div class="carousel-dots">${dots}</div>
    </div>`;
  }

  // The box makes its own square via aspect-ratio and everything inside is
  // absolutely positioned to fill it. That's what keeps photos of wildly
  // different dimensions from changing the card's shape: the container's
  // size never depends on the image's, only the crop does.
  return `<div class="thumb-box" style="border-radius:${radius}px;background:${tintSoft};">
    <div class="thumb-inner">${inner}</div>
    ${soldOut ? soldOutBanner() : ''}
  </div>`;
}

module.exports = { productThumb, productPhotos, tintFor, placeholderSvg };
