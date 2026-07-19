/**
 * GET /api/pilah/access/:id
 *
 * Buyer access endpoint — timing-safe token validation.
 * Only DISETUJUI orders get 302 redirect to Drive folder.
 * All other statuses → 403. Unknown order → 404.
 *
 * Never exposes raw Drive URL in response body.
 *
 * Token-in-URL tradeoff:
 *   Tokens appear in the URL query string for email click-through UX.
 *   This leaks via Referer header and browser history.
 *   Mitigations applied:
 *     - Cache-Control: no-store (prevents proxy/CDN caching of token URL)
 *     - Pragma: no-cache (HTTP/1.0 compatibility)
 *     - Referrer-Policy: no-referrer (prevents Referer leakage)
 *   Tokens are never logged or included in response bodies.
 */
const { getOrder } = require('../../lib/store');
const { getDeliveryUrl } = require('../../lib/delivery');
const crypto = require('crypto');
const { checkRateLimit } = require('../../lib/rateLimit');
const { setCorsAndSecHeaders } = require('../../lib/cors');

function ip(req) {
  const f = req.headers['x-forwarded-for'];
  return f ? f.split(',')[0].trim() : (req.headers['x-real-ip'] || '127.0.0.1');
}

function tokenOk(order, supplied) {
  if (!order || !order.access_token || !supplied) return false;
  const a = Buffer.from(order.access_token);
  const b = Buffer.from(String(supplied));
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  setCorsAndSecHeaders(res, { methods: 'GET,OPTIONS', allowedHeaders: 'Content-Type,Authorization' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  // Token-in-URL mitigation headers
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');

  // Rate limit
  const rl = checkRateLimit(`access:${ip(req)}`, 30);
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  if (!rl.allowed) return res.status(429).json({ success: false, error: 'Terlalu banyak request' });

  // Validate order ID format
  const orderId = String(req.query?.id || '');
  if (!/^[A-Za-z0-9-]{8,80}$/.test(orderId)) {
    return res.status(400).json({ success: false, error: 'Order ID tidak valid' });
  }

  // Find order
  const order = getOrder(orderId);
  if (!order) {
    return res.status(404).json({ success: false, error: 'Order tidak ditemukan' });
  }

  // Validate token (timing-safe)
  const supplied = req.query?.token || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!tokenOk(order, supplied)) {
    return res.status(403).json({ success: false, error: 'Akses tidak valid' });
  }

  // Status check — only DISETUJUI gets redirect
  if (order.status !== 'DISETUJUI') {
    const statusMessages = {
      'MENUNGGU_PEMBAYARAN': 'Pesanan Anda belum selesai dibayar.',
      'MENUNGGU_VERIFIKASI': 'Pesanan Anda sedang dalam proses verifikasi.',
      'MENUNGGU_DELIVERY': 'Pesanan Anda sedang diproses.',
      'DITOLAK': 'Pesanan Anda ditolak.',
    };
    return res.status(403).json({
      success: false,
      error: statusMessages[order.status] || 'Pesanan belum dapat diakses.',
      status: order.status,
    });
  }

  // DISETUJUI → redirect to Drive folder
  const driveUrl = getDeliveryUrl(order.sku);
  if (!driveUrl) {
    return res.status(404).json({ success: false, error: 'Produk tidak ditemukan' });
  }

  return res.redirect(driveUrl);
};
