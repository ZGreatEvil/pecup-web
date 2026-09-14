// Turns an uploaded file (as parsed by src/body.js) into a stored Vercel
// Blob object, returning whatever value the database should keep.
const crypto = require('crypto');
const {
  uploadProductImage,
  uploadProofFile,
  deleteProofFile,
  signedProofUrl,
  presignProductVideoUpload,
  productBlobInfo,
} = require('./storage');

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

function randomName(prefix, file) {
  const ext = EXT_BY_MIME[file.mimetype] || '.bin';
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
}

// Product photos go in the PUBLIC store — the full public URL is what gets
// stored on the product row (see src/views/productIcon.js).
async function saveProductImage(file) {
  const objectPath = randomName('produk', file);
  return uploadProductImage(objectPath, file.buffer, file.mimetype);
}

// Payment-proof uploads go in the PRIVATE store — only the object path is
// stored (orders.proof_filename); the actual URL is resolved on demand, per
// admin view, as a short-lived signed URL (see signedProofUrl in storage.js).
async function saveProofFile(file) {
  const objectPath = randomName('bukti', file);
  return uploadProofFile(objectPath, file.buffer, file.mimetype);
}

// Videos aren't uploaded here at all — they go straight from the admin's
// browser to the public store (see src/media.js for why). These two are the
// server's half of that: handing out the address, and checking afterwards
// that what came back really is a blob of ours.
module.exports = {
  saveProductImage,
  saveProofFile,
  // Used when an order fails AFTER its proof was uploaded — see the checkout
  // route. Without it the file would be stranded in the private store.
  deleteProofFile,
  signedProofUrl,
  presignProductVideoUpload,
  productBlobInfo,
};
