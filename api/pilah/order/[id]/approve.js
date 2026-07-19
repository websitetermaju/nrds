/**
 * POST /api/pilah/order/:id/approve
 *
 * Owner approval endpoint.
 * Transitions: MENUNGGU_VERIFIKASI → MENUNGGU_DELIVERY → DISETUJUI (approval)
 *              MENUNGGU_VERIFIKASI → DITOLAK (rejection)
 *
 * Auth: PILAH_OWNER_TOKEN env var only. Timing-safe compare.
 *       Buyer access_token is NEVER accepted.
 *       Production fail-closed if env missing.
 *       NODE_ENV=test allows PILAH_TEST_OWNER_TOKEN.
 *
 * Delivery state machine:
 *   1. prepareApproval → MENUNGGU_DELIVERY (transient)
 *   2. notifyN8n
 *   3. On success: commitApproval → DISETUJUI
 *   4. On failure: rollbackApproval → MENUNGGU_VERIFIKASI, return 503
 *
 * Idempotency:
 *   - Already DISETUJUI → 200, skip notifyN8n
 *   - Already DITOLAK → 200, skip notifyN8n
 *
 * Sends ORDER_STATUS_CHANGED to n8n webhook.
 * Fail-closed: n8n failure = 503 (no silent drop in production).
 */
const { getFullOrder, prepareApproval, commitApproval, rollbackApproval,
        rejectOrder } = require('../../../lib/store');
const n8nLib = require('../../../lib/n8n');
const crypto = require('crypto');
const { checkRateLimit } = require('../../../lib/rateLimit');
const { setCorsAndSecHeaders } = require('../../../lib/cors');

function ip(req) {
  const f = req.headers['x-forwarded-for'];
  return f ? f.split(',')[0].trim() : (req.headers['x-real-ip'] || '127.0.0.1');
}

/**
 * Owner token validation — PILAH_OWNER_TOKEN env only.
 * Timing-safe compare. Fail-closed in production.
 * In NODE_ENV=test, falls back to PILAH_TEST_OWNER_TOKEN.
 */
function getOwnerToken() {
  const token = process.env.PILAH_OWNER_TOKEN;
  if (token) return token;
  if (process.env.NODE_ENV === 'test') {
    return process.env.PILAH_TEST_OWNER_TOKEN || null;
  }
  return null; // fail-closed in production
}

function ownerTokenOk(supplied) {
  const expected = getOwnerToken();
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
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

  // Owner token auth — buyer access_token NOT accepted
  const supplied = req.query?.token || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!ownerTokenOk(supplied)) return res.status(403).json({ success: false, error: 'Akses tidak valid' });

  // Validate body
  const { action, alasan_penolakan } = req.body || {};
  if (action !== 'DISETUJUI' && action !== 'DITOLAK') {
    return res.status(400).json({ success: false, error: 'Action harus DISETUJUI atau DITOLAK' });
  }

  if (action === 'DITOLAK' && !alasan_penolakan) {
    return res.status(400).json({ success: false, error: 'Alasan penolakan harus diisi' });
  }

  // ─── Approval flow with delivery state machine ────────
  if (action === 'DISETUJUI') {
    const prepared = prepareApproval(orderId);
    if (prepared.error) {
      return res.status(409).json({ success: false, error: prepared.error });
    }

    // Idempotent: already DISETUJUI — skip n8n, return 200
    if (prepared.alreadyApproved) {
      const updated = getFullOrder(orderId);
      return res.status(200).json({
        success: true,
        data: {
          order_id: updated.order_id,
          status: updated.status,
          previous_status: prepared.previousStatus,
          verified_at: updated.verified_at,
        },
      });
    }

    // Hash buyer identifiers before forwarding to n8n/Meta CAPI.
    const sha256 = (value) => crypto.createHash('sha256')
      .update(String(value || '').trim().toLowerCase()).digest('hex');
    const phoneDigits = String(prepared.order.whatsapp || '').replace(/\D/g, '');

    // Notify n8n BEFORE committing DISETUJUI
    try {
      await n8nLib.notifyN8n('ORDER_STATUS_CHANGED', {
        order_id: prepared.order.order_id,
        sku: prepared.order.sku,
        harga: prepared.order.harga,
        value: prepared.order.harga,
        email: prepared.order.email,
        whatsapp: prepared.order.whatsapp,
        nama_lengkap: prepared.order.nama_lengkap,
        name: prepared.order.nama_lengkap,
        status: 'DISETUJUI',
        access_token: prepared.order.access_token,
        email_hash: sha256(prepared.order.email),
        phone_hash: phoneDigits ? sha256(phoneDigits) : null,
        previous_status: prepared.previousStatus,
        verified_at: prepared.order.verified_at,
        alasan_penolakan: prepared.order.alasan_penolakan || null,
      }, prepared.previousStatus);
    } catch {
      rollbackApproval(orderId);
      return res.status(503).json({ success: false, error: 'Gagal mencatat perubahan status. Coba lagi.' });
    }

    // n8n success — commit DISETUJUI
    commitApproval(orderId);
    const updated = getFullOrder(orderId);
    return res.status(200).json({
      success: true,
      data: {
        order_id: updated.order_id,
        status: updated.status,
        previous_status: prepared.previousStatus,
        verified_at: updated.verified_at,
      },
    });
  }

  // ─── Rejection flow ───────────────────────────────────
  const result = rejectOrder(orderId, alasan_penolakan);

  if (result.error) {
    return res.status(409).json({ success: false, error: result.error });
  }

  // Idempotent: already DITOLAK — skip n8n, return 200
  if (result.alreadyRejected) {
    const updated = getFullOrder(orderId);
    return res.status(200).json({
      success: true,
      data: {
        order_id: updated.order_id,
        status: updated.status,
        previous_status: result.previousStatus,
        verified_at: updated.verified_at,
      },
    });
  }

  // Notify n8n
  const updated = getFullOrder(orderId);
  try {
    await n8nLib.notifyN8n('ORDER_STATUS_CHANGED', {
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
