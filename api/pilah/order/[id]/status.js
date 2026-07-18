/**
 * GET /api/pilah/order/:id/status
 *
 * Read order status (buyer-facing safe subset).
 * Returns: order_id, status, sku, harga, timestamps, rejection reason if any.
 *
 * Does NOT expose: internal idempotency key, base64 data, full buyer info.
 */
const { getOrderStatus } = require('../../lib/store');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Extract order ID from route
  const urlParts = (req.url || '').split('/');
  // URL: /api/pilah/order/:id/status
  const orderIdIdx = urlParts.indexOf('order') + 1;
  const orderId = urlParts[orderIdIdx];

  if (!orderId || orderId === 'status' || orderId === 'proof') {
    return res.status(400).json({ success: false, error: 'Order ID tidak valid' });
  }

  const status = getOrderStatus(orderId);
  if (!status) {
    return res.status(404).json({ success: false, error: 'Order tidak ditemukan' });
  }

  return res.status(200).json({
    success: true,
    data: status,
  });
};
