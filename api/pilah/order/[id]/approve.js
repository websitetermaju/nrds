/**
 * POST /api/pilah/order/:id/approve
 *
 * Owner approval endpoint.
 * Transitions: MENUNGGU_VERIFIKASI → DISETUJUI or DITOLAK
 * Sends ORDER_STATUS_CHANGED to n8n webhook.
 * Fail-closed: n8n failure = 503 (no silent drop in production).
 */
const { getFullOrder, approveOrder, rejectOrder } = require('../../../lib/store');
const { notifyN8n } = require('../../../lib/n8n');
const crypto = require('crypto');
const { checkRateLimit } = require('../../../lib/rateLimit');
const { setCorsAndSecHeaders } = require('../../../lib/cors');

function ip(req) {
  const f = req.headers['x-forwarded-for'];
  return f ? f.split(',')[0].trim() : (req.headers['x-real-ip'] || '127.0.0.1');
}

function tokenOk(order, supplied) {
  if (!order || !order.access_token || !supplied) return false;
  const a = Buffer.from(order.access_token);
  const b = Buffer.from(String(supplied));
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); }
  catch { return false; }
}

module.exports = async function handler(req, res) {
  setCorsAndSecHeaders(res, { methods: 'POST,OPTIONS', allowedHeaders: 'Content-Type,Authorization' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  // Rate limit
  const rl = checkRateLimit(`approve:${ip(req)}`, 20);
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  if (!rl.allowed) return res.status(429).json({ success: false, error: 'Terlalu banyak request' });

  // Validate order ID
  const orderId = String(req.query?.id || '');
  if (!/^[A-Za-z0-9-]{8,80}$/.test(orderId)) {
    return res.status(400).json({ success: false, error: 'Order ID tidak valid' });
  }

  // Validate token
  const order = getFullOrder(orderId);
  if (!order) return res.status(404).json({ success: false, error: 'Order tidak ditemukan' });
  const supplied = req.query?.token || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!tokenOk(order, supplied)) return res.status(403).json({ success: false, error: 'Akses tidak valid' });

  // Validate body
  const { action, alasan_penolakan } = req.body || {};
  if (action !== 'DISETUJUI' && action !== 'DITOLAK') {
    return res.status(400).json({ success: false, error: 'Action harus DISETUJUI atau DITOLAK' });
  }

  if (action === 'DITOLAK' && !alasan_penolakan) {
    return res.status(400).json({ success: false, error: 'Alasan penolakan harus diisi' });
  }

  // Perform transition
  let result;
  if (action === 'DISETUJUI') {
    result = approveOrder(orderId);
  } else {
    result = rejectOrder(orderId, alasan_penolakan);
  }

  if (result.error) {
    return res.status(409).json({ success: false, error: result.error });
  }

  const updated = getFullOrder(orderId);

  // Send ORDER_STATUS_CHANGED to n8n (fail-closed in production)
  try {
    await notifyN8n('ORDER_STATUS_CHANGED', {
      order_id: updated.order_id,
      sku: updated.sku,
      harga: updated.harga,
      value: updated.harga,
      email: updated.email,
      whatsapp: updated.whatsapp,
      nama_lengkap: updated.nama_lengkap,
      name: updated.nama_lengkap,
      status: updated.status,
      previous_status: result.previousStatus,
      verified_at: updated.verified_at,
      alasan_penolakan: updated.alasan_penolakan || null,
    }, result.previousStatus);
  } catch {
    return res.status(503).json({ success: false, error: 'Gagal mencatat perubahan status. Coba lagi.' });
  }

  return res.status(200).json({
    success: true,
    data: {
      order_id: updated.order_id,
      status: updated.status,
      previous_status: result.previousStatus,
      verified_at: updated.verified_at,
    },
  });
};
