// api/lib/cors.js
// Standalone CORS + security headers util, zero dependency for Pilah

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://nrds.web.id';
const SECURITY_HEADERS = {
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
};

function setCorsAndSecHeaders(res, opts = {}) {
  const origin = opts.origin || ALLOWED_ORIGIN;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', opts.methods || 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', opts.allowedHeaders || 'Content-Type,Authorization');
  // Strict security headers
  Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
}

module.exports = { setCorsAndSecHeaders, ALLOWED_ORIGIN };
