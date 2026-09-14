// File storage via Vercel Blob. Two separate Blob stores stand in for
// Supabase Storage's two buckets:
//   - "products" (public store)  -> product photos, shown to every visitor
//   - "proofs"   (private store) -> payment-proof uploads, admin-only
// A private Blob store needs its own read/write token, so each store gets
// its own environment variable (see .env.example / DEPLOY.txt).
const { put, head, del, issueSignedToken, presignUrl } = require('@vercel/blob');

function productsToken() {
  const t = process.env.PRODUCTS_BLOB_READ_WRITE_TOKEN;
  if (!t) throw new Error('PRODUCTS_BLOB_READ_WRITE_TOKEN belum diatur di environment variables.');
  return t;
}

function proofsToken() {
  const t = process.env.PROOFS_BLOB_READ_WRITE_TOKEN;
  if (!t) throw new Error('PROOFS_BLOB_READ_WRITE_TOKEN belum diatur di environment variables.');
  return t;
}

/** Uploads a product photo to the PUBLIC store. Returns its full public URL — that's what gets stored on the product row. */
async function uploadProductImage(objectPath, buffer, contentType) {
  const blob = await put(objectPath, buffer, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    token: productsToken(),
  });
  return blob.url;
}

/** Uploads a payment-proof file to the PRIVATE store. Returns its object path (not a URL) — the path is what gets stored (orders.proof_filename); the actual URL is minted on demand, per admin view, via signedProofUrl below. */
async function uploadProofFile(objectPath, buffer, contentType) {
  await put(objectPath, buffer, {
    access: 'private',
    contentType,
    addRandomSuffix: false,
    token: proofsToken(),
  });
  return objectPath;
}

/**
 * Deletes a proof file from the PRIVATE store.
 *
 * The upload happens before the order is inserted (the file is needed either
 * way, and the insert can still fail — the last cup sold a moment earlier, a
 * voucher that just ran out). Without this the file would sit in the store
 * with nothing pointing at it and nothing that would ever find it: the nightly
 * sweep only deletes proofs belonging to orders old enough to expire, so an
 * orphan that never had an order is invisible to it. Never throws — a failed
 * cleanup must not turn into the customer's error message.
 */
async function deleteProofFile(objectPath) {
  if (!objectPath) return false;
  try {
    await del(objectPath, { token: proofsToken() });
    return true;
  } catch (err) {
    console.error('Gagal menghapus bukti transfer yatim:', err.message);
    return false;
  }
}

/** Short-lived signed URL for a proof file in the PRIVATE store — safe to embed directly as an <img src>, the browser fetches it straight from Vercel's CDN. */
async function signedProofUrl(objectPath, expiresInSeconds = 3600) {
  const validUntil = Date.now() + expiresInSeconds * 1000;
  const token = await issueSignedToken({
    pathname: objectPath,
    operations: ['get'],
    validUntil,
    token: proofsToken(),
  });
  const { presignedUrl } = await presignUrl(token, {
    pathname: objectPath,
    operation: 'get',
    validUntil,
    access: 'private',
  });
  return presignedUrl;
}

/**
 * A short-lived URL the BROWSER can PUT a product video to, straight into the
 * public store. This is the only way a video can be uploaded at all: Vercel
 * caps a serverless request body at ~4.5MB, so a clip can never be routed
 * through our own function.
 *
 * The delegation is narrow — one exact pathname, `put` only, and minutes to
 * live. Those parts the store really does hold: the address works for that one
 * pathname and, because overwriting is not allowed, it cannot even be replayed
 * to replace the file it created.
 *
 * `allowedContentTypes` and `maximumSizeInBytes` are a different matter.
 * Measured against the live store, neither is enforced on a presigned PUT — a
 * file well over the ceiling, and a file declaring a type the address never
 * allowed, are both accepted. They are still passed here in case that changes,
 * but nothing may depend on them: the type and the size are checked for real
 * when the product is saved, from the blob's own metadata and its first bytes
 * (see productBlobInfo and media.looksLikeVideo).
 */
async function presignProductVideoUpload({ pathname, contentType, maximumSizeInBytes, expiresInSeconds = 900 }) {
  const validUntil = Date.now() + expiresInSeconds * 1000;
  const token = await issueSignedToken({
    pathname,
    operations: ['put'],
    validUntil,
    allowedContentTypes: [contentType],
    maximumSizeInBytes,
    token: productsToken(),
  });
  const { presignedUrl } = await presignUrl(token, {
    operation: 'put',
    pathname,
    access: 'public',
    allowedContentTypes: [contentType],
    maximumSizeInBytes,
    addRandomSuffix: false,
    validUntil,
  });
  return presignedUrl;
}

/**
 * What the products store itself says about a pathname: whether it is there at
 * all, and how big it actually turned out to be.
 *
 * The token scopes the lookup to our one store, which is what makes this a
 * real check on a URL handed back by a browser rather than a guess at its
 * shape. The size comes from the store rather than from the page, which is the
 * only number worth trusting.
 */
async function productBlobInfo(pathname) {
  try {
    const meta = await head(pathname, { token: productsToken() });
    if (!meta || !meta.url) return { exists: false };
    return { exists: true, size: Number(meta.size) || 0, contentType: meta.contentType || '' };
  } catch (err) {
    return { exists: false };
  }
}

module.exports = {
  uploadProductImage,
  uploadProofFile,
  deleteProofFile,
  signedProofUrl,
  presignProductVideoUpload,
  productBlobInfo,
};
