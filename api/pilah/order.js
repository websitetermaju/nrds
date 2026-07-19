/**
 * POST /api/pilah/order
 *
 * Create a new Pilah order.
 * Accepts: { nama_lengkap, whatsapp, email, sku }
 * Optional: { idempotency_key } (client-generated, for dedup)
 *
 * Validates input, checks idempotency, saves order, notifies n8n.
 * Returns order data with payment info.
 *
 * Rate limited: 10 requests/minute per IP.
 */
const { validateCheckout } = require('../lib/validate');
const { getSkuData } = require('../lib/sku');
const { createOrder, findByIdempotencyKey } = require('../lib/store');
const { checkRateLimit } = require('../lib/rateLimit');
const { notifyN8n } = require('../lib/n8n');

// Payment info constants (not secrets — public payment destination)
const PAYMENT = {
  qris_image: '/assets/pilah/qris-kios-adelin-checkout.png',
  qris_instructions: 'Scan QR ini dan bayar sesuai harga produk yang dipilih. Nominal harus persis.',
  dana_number: '085770702292',
  dana_name: 'Nurwanda Romadhon',
};

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || '127.0.0.1';
}

module.exports = async function handler(req, res) {
  const { setCorsAndSecHeaders } = require('../lib/cors');

    setCorsAndSecHeaders(res, { methods: 'POST,OPTIONS' });

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Rate limit
  const ip = getClientIp(req);
  const rl = checkRateLimit(ip);
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(rl.resetInMs / 1000)));

  if (!rl.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Terlalu banyak request. Coba lagi dalam 1 menit.',
    });
  }

  const bodySize = Number(req.headers['content-length'] || 0);
  if (bodySize > 32768) {
    return res.status(413).json({ success: false, error: 'Body terlalu besar' });
  }

  // Validate input
  const validation = validateCheckout(req.body);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      errors: validation.errors,
    });
  }

  const { nama_lengkap, whatsapp, email, sku, harga } = validation.data;

  // Client-supplied idempotency key (optional, supplement server-side)
  let clientKey = req.body.idempotency_key;
  if (clientKey) {
    const existing = findByIdempotencyKey(clientKey);
    if (existing) {
      return res.status(200).json({
        success: true,
        idempotent: true,
        data: buildResponse(existing),
      });
    }
  }

  // Create order
  const result = createOrder({ nama_lengkap, whatsapp, email, sku, harga });

  if (result.error) {
    return res.status(409).json({
      success: false,
      error: result.error,
      active_order_id: result.activeOrderId,
    });
  }

  const { order, idempotent } = result;

  try {
    await notifyN8n('ORDER_CREATED', {
      order_id: order.order_id,
      nama_lengkap: order.nama_lengkap,
      whatsapp: order.whatsapp,
      email: order.email,
      sku: order.sku,
      harga: order.harga,
      status: order.status,
      created_at: order.created_at,
      expires_at: order.expires_at,
    });
  } catch {
    return res.status(503).json({ success: false, error: 'Sistem pencatatan order sedang bermasalah. Coba lagi.' });
  }

  const statusCode = idempotent ? 200 : 201;
  return res.status(statusCode).json({
    success: true,
    idempotent: idempotent || false,
    data: buildResponse(order),
  });
};

function buildResponse(order) {
  const skuData = getSkuData(order.sku);
  const dana_instructions = `Transfer Rp${order.harga.toLocaleString('id-ID')} ke nomor DANA. Catatan: ${order.nama_lengkap} - ${skuData ? skuData.name : order.sku}`;

  return {
    order_id: order.order_id,
    status: order.status,
    nama_lengkap: order.nama_lengkap,
    whatsapp: order.whatsapp,
    email: order.email,
    sku: order.sku,
    harga: order.harga,
    created_at: order.created_at,
    expires_at: order.expires_at,
    payment: {
      qris_image: PAYMENT.qris_image,
      qris_instructions: PAYMENT.qris_instructions,
      dana_number: PAYMENT.dana_number,
      dana_name: PAYMENT.dana_name,
      dana_instructions,
    },
        upload_url: `/api/pilah/order/${order.order_id}/proof?token=${order.access_token}`,
        status_url: `/api/pilah/order/${order.order_id}/status?token=${order.access_token}`,
  };
}
