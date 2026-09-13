const { escapeAttr } = require('../utils');
const { isVideoUrl, productMedia, productPhotos } = require('../media');

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

const PLAY_BADGE =
  `<span class="media-play" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.6v12.8c0 .8.9 1.3 1.6.9l10-6.4a1 1 0 000-1.8l-10-6.4A1 1 0 008 5.6z"/></svg></span>`;

// One slot of the gallery: a photo, or a video shown the same size and shape.
//
// Two quite different jobs, hence `interactive`. On a product *card* the whole
// tile is a link, so the video must not swallow the tap — it renders as a
// muted, silent first frame with a play badge, and the click goes through to
// the product page. On the product page itself it gets real controls.
//
// `#t=0.1` asks the browser for a frame a hair into the clip: without it
// Safari and older Chrome show a black box until you press play.
function mediaElement(url, { alt, dim = '', interactive = false, eager = true, autoplay = false }) {
  if (!isVideoUrl(url)) {
    return `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" class="thumb-fill"${
      eager ? '' : ' loading="lazy"'
    } style="${dim}">`;
  }
  // No `loop`: the carousel waits for the clip's "ended" event before moving
  // on, and a looping video never ends.
  //
  // `autoplay` is set as a real attribute on the clip that leads the gallery,
  // not left to a scripted play() alone. Phones honour the attribute far more
  // readily — a script calling play() at page load is the case browsers are
  // most suspicious of. `muted` and `playsinline` are what make it permitted
  // at all, and both have to be on the element before it loads.
  // preload="auto" only for that one clip: it is about to play, so waiting for
  // metadata first just delays it.
  const common =
    `class="thumb-fill" muted playsinline ${autoplay ? 'autoplay preload="auto"' : 'preload="metadata"'} ` +
    `disablepictureinpicture aria-label="${escapeAttr(alt)}"`;
  if (interactive) {
    return `<video src="${escapeAttr(url)}#t=0.1" ${common} controls controlslist="nodownload noplaybackrate" style="${dim}"></video>`;
  }
  // pointer-events:none keeps the card's own link in charge of the tap.
  return `<video src="${escapeAttr(url)}#t=0.1" ${common} style="${dim}pointer-events:none;"></video>${PLAY_BADGE}`;
}

const ARROW_LEFT =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
const ARROW_RIGHT =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

// Renders a square product thumbnail: the uploaded photo(s) and video(s) if
// present, otherwise the pastel fruit-cup placeholder icon. Out-of-stock
// products get a greyed-out image with a centered "Stok Habis" banner. With
// more than one item it becomes a carousel — arrows and dots everywhere it
// appears, but only auto-advancing where `autoplay` is set (the product page).
function productThumb(product, { size = 88, radius = 16, autoplay = false } = {}) {
  const [tint, tintSoft] = tintFor(product.id);
  const soldOut = Number(product.stock) <= 0;
  const dim = soldOut ? 'filter:grayscale(1);opacity:0.6;' : '';
  const media = productMedia(product);
  // A clip is only playable where it isn't standing inside a link — that's
  // the product page, which is also the only place that autoplays.
  const interactive = autoplay;

  let inner;
  if (media.length === 0) {
    inner = `<div class="thumb-fill" style="display:flex;align-items:center;justify-content:center;${dim}">${placeholderSvg(
      tint,
      size
    )}</div>`;
  } else if (media.length === 1) {
    inner = mediaElement(media[0], { alt: product.name, dim, interactive, autoplay });
  } else {
    // Each item sits in its own clipping box (.carousel-slide) rather than
    // being a flex item itself — the card's hover zoom scales the image, and
    // without a clip that overflow spills into the neighbouring photo.
    const slides = media
      .map(
        (url, i) =>
          `<div class="carousel-slide">${mediaElement(url, {
            alt: `${product.name} ${isVideoUrl(url) ? 'video' : 'foto'} ${i + 1}`,
            dim,
            interactive,
            eager: i === 0,
            // Only the slide the gallery opens on — the rest must not all
            // start playing at once behind the scenes.
            autoplay: autoplay && i === 0,
          })}</div>`
      )
      .join('');
    const dots = media
      .map(
        (url, i) =>
          `<button type="button" class="carousel-dot${i === 0 ? ' is-active' : ''}" data-index="${i}" aria-label="${
            isVideoUrl(url) ? 'Video' : 'Foto'
          } ${i + 1}"></button>`
      )
      .join('');

    // Auto-advance still applies with a video in the gallery — it's the clip
    // that sets the pace there: the timer stands down while a video plays and
    // the carousel moves on when the clip ends (see the carousel script in
    // layout.js).
    inner = `<div class="carousel" data-count="${media.length}"${autoplay ? ' data-autoplay="2000"' : ''}>
      <div class="carousel-track">${slides}</div>
      <button type="button" class="carousel-arrow carousel-prev" aria-label="Sebelumnya">${ARROW_LEFT}</button>
      <button type="button" class="carousel-arrow carousel-next" aria-label="Berikutnya">${ARROW_RIGHT}</button>
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

module.exports = { productThumb, productMedia, productPhotos, mediaElement, tintFor, placeholderSvg };
