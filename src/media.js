// Product media — photos and videos in one ordered list.
//
// There is no separate videos table and no new column: `products.images` is
// the ordered list of media URLs and `products.image` stays what it always
// was, the primary *photo* (used by og:image, JSON-LD and anything that can
// only deal with a still). Photo or video is decided by the file extension,
// which is safe here because we mint every filename ourselves in
// src/uploads.js — none of it comes from the uploader.
//
// Videos never travel through the serverless function: Vercel caps a request
// body at ~4.5MB and a phone clip is far bigger than that. The browser uploads
// straight to the Blob store with a short-lived presigned PUT, and only the
// resulting URL is posted with the form (see /admin/media/video/presign).

const crypto = require('crypto');

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;

// What an admin may upload, and the extension each type is stored under.
const PRODUCT_VIDEO_TYPES = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

// Big enough for a real clip off a phone, small enough that a mis-picked
// 4-minute recording is refused before it starts uploading. Overridable with
// PRODUCT_VIDEO_MAX_MB for a shop that wants a tighter or looser ceiling.
const MAX_VIDEO_BYTES = (() => {
  const mb = Number(process.env.PRODUCT_VIDEO_MAX_MB);
  return Number.isFinite(mb) && mb > 0 && mb <= 500 ? Math.round(mb * 1024 * 1024) : 50 * 1024 * 1024;
})();

// Every product video is stored under this prefix, which is half of how a URL
// coming back from the browser is checked before it's saved (see
// isProductVideoUrl); the other half is a HEAD against our own store.
const VIDEO_PREFIX = 'produk-video-';

function isVideoUrl(url) {
  return VIDEO_EXT.test(String(url == null ? '' : url));
}

/**
 * Every piece of media for a product, in display order.
 *
 * `images` is authoritative — it is written whole on every save, and always
 * contains `image` when it is non-empty. `image` alone is the fallback for
 * rows that predate the gallery.
 */
function productMedia(product) {
  const list = [];
  for (const url of (product && product.images) || []) {
    if (url && !list.includes(url)) list.push(url);
  }
  if (!list.length && product && product.image) list.push(product.image);
  return list;
}

/** Only the stills — for og:image, structured data, and anywhere a video can't stand in. */
function productPhotos(product) {
  return productMedia(product).filter((url) => !isVideoUrl(url));
}

/** The pathname a newly uploaded video will be stored under. */
function videoPathname(contentType) {
  const ext = PRODUCT_VIDEO_TYPES[contentType] || '.mp4';
  return `${VIDEO_PREFIX}${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
}

/**
 * Shape check for a video URL posted back by the browser after a direct
 * upload. This is not the whole check — the caller also does a HEAD against
 * the products store, which is what actually proves the blob is ours — but it
 * rejects anything off-shape before we spend a round-trip on it.
 */
function isProductVideoUrl(url) {
  const raw = String(url == null ? '' : url);
  if (raw.length > 400) return false;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (err) {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (!/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/i.test(parsed.hostname)) return false;
  if (parsed.search || parsed.hash) return false;
  const pathname = parsed.pathname.replace(/^\//, '');
  if (!pathname.startsWith(VIDEO_PREFIX)) return false;
  return /^produk-video-\d+-[0-9a-f]{8}\.(mp4|webm|mov)$/.test(pathname);
}

/** The blob pathname for one of our own URLs (what `head`/`del` want). */
function blobPathname(url) {
  try {
    return new URL(String(url)).pathname.replace(/^\//, '');
  } catch (err) {
    return '';
  }
}

/**
 * Reads the first few bytes of an uploaded clip and checks it really is one.
 *
 * The browser declares the content type when it asks for an upload address,
 * so the type alone proves nothing — this looks at the file itself. An MP4 or
 * MOV carries an `ftyp` box at offset 4; a WEBM (Matroska) opens with the
 * EBML magic number. A Range request keeps it to a handful of bytes.
 */
async function looksLikeVideo(url) {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-63' } });
    if (!res.ok && res.status !== 206) return false;
    if (!res.body) return false;
    // Read off the stream and stop at 64 bytes. If the store ignored the
    // Range header and began sending the whole file, this cancels it rather
    // than pulling 50MB into a serverless function.
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    while (total < 64) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      total += value.length;
    }
    try { await reader.cancel(); } catch (err) {}
    const head = Buffer.concat(chunks).subarray(0, 64);
    if (head.length < 12) return false;
    if (head.subarray(4, 8).toString('latin1') === 'ftyp') return true; // mp4 / mov / m4v
    if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return true; // webm
    return false;
  } catch (err) {
    return false;
  }
}

module.exports = {
  PRODUCT_VIDEO_TYPES,
  looksLikeVideo,
  MAX_VIDEO_BYTES,
  isVideoUrl,
  productMedia,
  productPhotos,
  videoPathname,
  isProductVideoUrl,
  blobPathname,
};
