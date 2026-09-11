const querystring = require('querystring');

// Vercel's Node.js Serverless Functions cap the request body around ~4.5MB,
// so this stays comfortably under that (the local/Node-only version can
// afford a much bigger cap — this one can't).
const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4MB safety cap (images + PDF proof)

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Parses `application/x-www-form-urlencoded` bodies.
function parseUrlEncoded(buffer) {
  const parsed = querystring.parse(buffer.toString('utf8'));
  const fields = {};
  for (const key of Object.keys(parsed)) fields[key] = String(parsed[key]);
  return { fields, files: {} };
}

// Minimal multipart/form-data parser (no external deps).
// Returns { fields: {name: value}, files: {name: {filename, mimetype, buffer}} }
function parseMultipart(buffer, boundary) {
  const fields = {};
  const files = {};
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts = splitBuffer(buffer, boundaryBuf);

  for (const part of parts) {
    if (part.length === 0) continue;
    // Each part starts with \r\n after the boundary line (already stripped by splitBuffer),
    // and headers are separated from the body by \r\n\r\n.
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const rawHeaders = part.slice(0, headerEnd).toString('utf8');
    let body = part.slice(headerEnd + 4);
    // Strip trailing \r\n that precedes the next boundary marker.
    if (body.slice(-2).toString() === '\r\n') body = body.slice(0, -2);

    const dispositionMatch = /Content-Disposition:\s*form-data;\s*name="([^"]*)"(?:;\s*filename="([^"]*)")?/i.exec(
      rawHeaders
    );
    if (!dispositionMatch) continue;
    const name = dispositionMatch[1];
    const filename = dispositionMatch[2];

    if (filename !== undefined) {
      const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(rawHeaders);
      const mimetype = typeMatch ? typeMatch[1].trim() : 'application/octet-stream';
      if (filename) {
        files[name] = { filename, mimetype, buffer: body };
      }
    } else {
      fields[name] = body.toString('utf8');
    }
  }

  return { fields, files };
}

// Splits `buffer` on occurrences of `boundaryBuf`, returning the content
// between consecutive boundaries (trimmed of the leading \r\n and excluding
// the terminal `--` marker part).
function splitBuffer(buffer, boundaryBuf) {
  const pieces = [];
  let start = buffer.indexOf(boundaryBuf);
  if (start === -1) return pieces;
  start += boundaryBuf.length;

  while (true) {
    const next = buffer.indexOf(boundaryBuf, start);
    if (next === -1) break;
    let piece = buffer.slice(start, next);
    // Drop the leading \r\n right after the boundary marker.
    if (piece.slice(0, 2).toString() === '\r\n') piece = piece.slice(2);
    // Stop once we hit the terminal boundary ("--" right after boundary).
    const afterBoundary = buffer.slice(next + boundaryBuf.length, next + boundaryBuf.length + 2).toString();
    pieces.push(piece);
    if (afterBoundary === '--') break;
    start = next + boundaryBuf.length;
  }
  return pieces;
}

async function parseBody(req) {
  const contentType = req.headers['content-type'] || '';
  const buffer = await readRawBody(req);

  if (contentType.startsWith('multipart/form-data')) {
    const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
    const boundary = boundaryMatch ? boundaryMatch[1] || boundaryMatch[2] : null;
    if (!boundary) return { fields: {}, files: {} };
    return parseMultipart(buffer, boundary.trim());
  }

  if (contentType.startsWith('application/x-www-form-urlencoded')) {
    return parseUrlEncoded(buffer);
  }

  return { fields: {}, files: {} };
}

module.exports = { parseBody, readRawBody, MAX_BODY_BYTES };
