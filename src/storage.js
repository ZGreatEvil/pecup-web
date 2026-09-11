// File storage via Vercel Blob. Two separate Blob stores stand in for
// Supabase Storage's two buckets:
//   - "products" (public store)  -> product photos, shown to every visitor
//   - "proofs"   (private store) -> payment-proof uploads, admin-only
// A private Blob store needs its own read/write token, so each store gets
// its own environment variable (see .env.example / DEPLOY.txt).
const { put, issueSignedToken, presignUrl } = require('@vercel/blob');

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
  });
  return presignedUrl;
}

module.exports = { uploadProductImage, uploadProofFile, signedProofUrl };
