// Postgres access for Neon, via the serverless HTTP driver
// (@neondatabase/serverless). Every query goes out as a single HTTPS
// request — no persistent connection to open, pool, or accidentally leave
// hanging between invocations, which fits a Vercel serverless function
// (frozen between requests) perfectly. This is Neon's own recommended
// driver for exactly this kind of deployment.
const { neon } = require('@neondatabase/serverless');

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL belum diatur di environment variables.');
  return neon(url);
}

/** Runs a parameterized query ($1, $2, ...) and returns the rows array. */
function query(text, params = []) {
  return sql().query(text, params);
}

module.exports = { query };
