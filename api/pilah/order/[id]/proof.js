/**
 * POST /api/pilah/order/:id/proof
 *
 * Submit proof of payment for an order.
 * Accepts: { filename, mimeType, sizeBytes, base64? }
 *
 * Validates file type (JPG/PNG/WebP), size (≤5MB), path traversal.
 * Transitions order: MENUNGGU_PEMBAYARAN → MENUNGGU_VERIFIKASI
 * Notifies n8n webhook for external storage/processing.
 *
 * ⚠️ SERVERLESS CONSTRAINT:
 * Cannot write files to disk on Vercel.
 * Accepts base64 data which is forwarded to n8n for storage.
 * No files are saved in the repo or publicly accessible path.
 */
const { validateProof } = require('../../lib/validate');
const { submitProof, getOrder } = require('../../lib/store');
const { notifyN8n } = require('../../lib/n8n');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Extract order ID from route
  const urlParts = (req.url || '').split('/');
  // URL: /api/pilah/order/:id/proof
  const orderIdIdx = urlParts.indexOf('order') + 1;
  const orderId = urlParts[orderIdIdx];

  if (!orderId || orderId === 'proof' || orderId === 'status') {
    return res.status(400).json({ success: false, error: 'Order ID tidak valid' });
  }

  // Validate order exists
  const existing = getOrder(orderId);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Order tidak ditemukan' });
  }

  // Validate proof data
  const validation = validateProof(req.body, orderId);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      errors: validation.errors,
    });
  }

  // Submit proof
  const result = submitProof(orderId, validation.data);
  if (result.error) {
    const status = result.error.includes('sudah terupload') ? 409 : 400;
    return res.status(status).json({ success: false, error: result.error });
  }

  const order = result.order;

  // Fire n8n webhook with proof metadata + optional base64 (async)
  notifyN8n('PROOF_SUBMITTED', {
    order_id: order.order_id,
    nama_lengkap: order.nama_lengkap,
    whatsapp: order.whatsapp,
    email: order.email,
    sku: order.sku,
    harga: order.harga,
    status: order.status,
    bukti_bayar: {
      filename: validation.data.filename,
      mimeType: validation.data.mimeType,
      sizeBytes: validation.data.sizeBytes,
      // base64 forwarded here for n8n to store externally
      base64: validation.data.base64 || null,
    },
    bukti_bayar_uploaded_at: order.bukti_bayar_uploaded_at,
  }).catch(() => {});

  return res.status(200).json({
    success: true,
    data: {
      order_id: order.order_id,
      status: order.status,
      bukti_bayar_uploaded_at: order.bukti_bayar_uploaded_at,
      message: 'Bukti bayar diterima. Menunggu verifikasi (target 6 jam).',
    },
  });
};
