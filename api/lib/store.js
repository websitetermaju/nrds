/**
 * Pilah MVP — Order store
 *
 * JSON file-based store for order persistence.
 *
 * ⚠️  SERVERLESS CONSTRAINT (Vercel):
 * Vercel serverless functions have a READ-ONLY filesystem.
 * This store works in local dev and self-hosted Node.js.
 * On Vercel, it falls back to /tmp (ephemeral) + in-memory Map.
 *
 * For production, replace with:
 *  - Vercel KV / Postgres via @vercel/postgres
 *  - Supabase (free tier)
 *  - Forward all writes to n8n webhook for external persistence
 *
 * The n8n webhook caller (api/lib/n8n.js) ensures data is forwarded
 * to n8n for durable storage even if local store is ephemeral.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Storage paths ──────────────────────────────────────
const DATA_DIR = process.env.PILAH_DATA_DIR || '/tmp/pilah-data';
const ORDERS_FILE = path.join(DATA_DIR, 'pilah-orders.json');
const AUDIT_FILE = path.join(DATA_DIR, 'pilah-audit.json');

// ─── In-memory fallback ─────────────────────────────────
const orders = new Map();     // orderId -> order object
const auditLog = [];          // append-only audit entries
const idempotencyMap = new Map(); // idempotencyKey -> orderId

let _initialized = false;

// ─── Helpers ────────────────────────────────────────────

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {
    // Vercel: can't create dir, rely on in-memory
  }
}

function loadFromFile() {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
      for (const [id, order] of Object.entries(data)) {
        orders.set(id, order);
        if (order.idempotency_key) {
          idempotencyMap.set(order.idempotency_key, id);
        }
      }
    }
    if (fs.existsSync(AUDIT_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
      auditLog.push(...data);
    }
  } catch {
    // Start fresh
  }
}

function saveToFile() {
  try {
    ensureDataDir();
    const obj = Object.fromEntries(orders);
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(obj, null, 2), 'utf8');
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(auditLog, null, 2), 'utf8');
  } catch {
    // Vercel: write fails, data only in memory (forwarded via n8n)
  }
}

function init() {
  if (_initialized) return;
  ensureDataDir();
  loadFromFile();
  _initialized = true;
}

// ─── Public API ─────────────────────────────────────────

/**
 * Generate a short order ID: PLH-YYYYMMDD-XXXX
 */
function generateOrderId() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(orders.size + 1).padStart(4, '0');
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `PLH-${datePart}-${seq}${random}`;
}

/**
 * Generate idempotency key: SHA256(email + sku + date)
 */
function generateIdempotencyKey(email, sku) {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return crypto.createHash('sha256')
    .update(`${email.toLowerCase()}:${sku.toUpperCase()}:${date}`)
    .digest('hex');
}

/**
 * Get order by ID.
 */
function getOrder(orderId) {
  init();
  return orders.get(orderId) || null;
}

/**
 * Find existing order by idempotency key.
 */
function findByIdempotencyKey(key) {
  init();
  const orderId = idempotencyMap.get(key);
  if (orderId) return orders.get(orderId) || null;
  return null;
}

/**
 * Check if email has an active order (MENUNGGU_PEMBAYARAN or MENUNGGU_VERIFIKASI).
 */
function hasActiveOrder(email) {
  init();
  for (const order of orders.values()) {
    if (order.email === email.toLowerCase() &&
        ['MENUNGGU_PEMBAYARAN', 'MENUNGGU_VERIFIKASI'].includes(order.status)) {
      return order;
    }
  }
  return null;
}

/**
 * Create a new order.
 * @param {object} data - { nama_lengkap, whatsapp, email, sku, harga }
 * @returns {{ order, idempotent }}
 */
function createOrder(data) {
  init();

  // Idempotency check
  const idempotencyKey = generateIdempotencyKey(data.email, data.sku);
  const existing = idempotencyMap.get(idempotencyKey);
  if (existing && orders.has(existing)) {
    return { order: orders.get(existing), idempotent: true };
  }

  // Active order check for email
  const active = hasActiveOrder(data.email);
  if (active) {
    return { error: 'Email ini sudah digunakan untuk order baru-baru ini', activeOrderId: active.order_id };
  }

  const orderId = generateOrderId();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const order = {
    order_id: orderId,
    access_token: require('crypto').randomBytes(32).toString('hex'),
    nama_lengkap: data.nama_lengkap,
    whatsapp: data.whatsapp,
    email: data.email,
    sku: data.sku,
    harga: data.harga,
    status: 'MENUNGGU_PEMBAYARAN',
    bukti_bayar_filename: null,
    bukti_bayar_mime: null,
    bukti_bayar_size: 0,
    bukti_bayar_base64: null, // forwarded to n8n, not persisted here long-term
    bukti_bayar_uploaded_at: null,
    verified_at: null,
    delivered_at: null,
    alasan_penolakan: null,
    link_gdrive: null,
    idempotency_key: idempotencyKey,
    created_at: now,
    updated_at: now,
    expires_at: expiresAt,
  };

  orders.set(orderId, order);
  idempotencyMap.set(idempotencyKey, orderId);

  // Audit log
  addAuditEntry(orderId, 'ORDER_CREATED', 'buyer', {
    nama_lengkap: data.nama_lengkap,
    sku: data.sku,
    harga: data.harga,
  });

  saveToFile();
  return { order, idempotent: false };
}

/**
 * Submit proof of payment for an order.
 * Transitions: MENUNGGU_PEMBAYARAN → MENUNGGU_VERIFIKASI
 */
function submitProof(orderId, proofData) {
  init();
  const order = orders.get(orderId);
  if (!order) return { error: 'Order tidak ditemukan' };

  if (order.status !== 'MENUNGGU_PEMBAYARAN') {
    if (order.status === 'MENUNGGU_VERIFIKASI') {
      return { error: 'Bukti bayar sudah terupload' };
    }
    return { error: `Tidak bisa upload bukti bayar untuk order dengan status ${order.status}` };
  }

  const now = new Date().toISOString();
  order.bukti_bayar_filename = proofData.filename;
  order.bukti_bayar_mime = proofData.mimeType;
  order.bukti_bayar_size = proofData.sizeBytes || 0;
  order.bukti_bayar_base64 = proofData.base64 ? '(base64 forwarded to n8n)' : null;
  order.bukti_bayar_uploaded_at = now;
  order.status = 'MENUNGGU_VERIFIKASI';
  order.updated_at = now;

  addAuditEntry(orderId, 'PROOF_SUBMITTED', 'buyer', {
    filename: proofData.filename,
    mimeType: proofData.mimeType,
    sizeBytes: proofData.sizeBytes,
  });

  saveToFile();
  return { order };
}

/**
 * Approve an order (owner action).
 * Transitions: MENUNGGU_VERIFIKASI → DISETUJUI
 * Idempotent: if already DISETUJUI, returns existing result.
 * Sets link_gdrive from delivery mapping.
 */
function approveOrder(orderId) {
  init();
  const order = orders.get(orderId);
  if (!order) return { error: 'Order tidak ditemukan' };

  // Idempotent: already approved
  if (order.status === 'DISETUJUI') {
    return { order, previousStatus: order.status };
  }

  if (order.status !== 'MENUNGGU_VERIFIKASI') {
    return { error: `Order harus dalam status MENUNGGU_VERIFIKASI, bukan ${order.status}` };
  }

  const previousStatus = order.status;
  const now = new Date().toISOString();
  const { getDeliveryUrl } = require('./delivery');
  const driveUrl = getDeliveryUrl(order.sku);

  order.status = 'DISETUJUI';
  order.verified_at = now;
  order.link_gdrive = driveUrl;
  order.delivered_at = now;
  order.updated_at = now;

  addAuditEntry(orderId, 'ORDER_APPROVED', 'owner', {
    sku: order.sku,
    harga: order.harga,
  });

  saveToFile();
  return { order, previousStatus };
}

/**
 * Reject an order (owner action).
 * Transitions: MENUNGGU_VERIFIKASI → DITOLAK
 * Idempotent: if already DITOLAK, preserves original alasan.
 */
function rejectOrder(orderId, alasanPenolakan) {
  init();
  const order = orders.get(orderId);
  if (!order) return { error: 'Order tidak ditemukan' };

  // Idempotent: already rejected
  if (order.status === 'DITOLAK') {
    return { order, previousStatus: order.status };
  }

  if (order.status !== 'MENUNGGU_VERIFIKASI') {
    return { error: `Order harus dalam status MENUNGGU_VERIFIKASI, bukan ${order.status}` };
  }

  const previousStatus = order.status;
  const now = new Date().toISOString();

  order.status = 'DITOLAK';
  order.verified_at = now;
  order.alasan_penolakan = alasanPenolakan || null;
  order.updated_at = now;

  addAuditEntry(orderId, 'ORDER_REJECTED', 'owner', {
    alasan_penolakan: alasanPenolakan || null,
  });

  saveToFile();
  return { order, previousStatus };
}

/**
 * Get order status summary (safe for buyer-facing response).
 * ⚠️  Does NOT expose link_gdrive (raw Drive URL).
 */
function getOrderStatus(orderId) {
  init();
  const order = orders.get(orderId);
  if (!order) return null;

  return {
    order_id: order.order_id,
    status: order.status,
    sku: order.sku,
    harga: order.harga,
    created_at: order.created_at,
    expires_at: order.expires_at,
    bukti_bayar_uploaded_at: order.bukti_bayar_uploaded_at,
    verified_at: order.verified_at,
    delivered_at: order.delivered_at,
    alasan_penolakan: order.alasan_penolakan,
  };
}

/**
 * Get full order (internal use).
 */
function getFullOrder(orderId) {
  init();
  return orders.get(orderId) || null;
}

/**
 * Add audit log entry.
 */
function addAuditEntry(orderId, action, actor, details = {}) {
  const entry = {
    log_id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
    order_id: orderId,
    action,
    actor,
    timestamp: new Date().toISOString(),
    details,
  };
  auditLog.push(entry);
}

/**
 * Get audit log for an order.
 */
function getAuditLog(orderId) {
  init();
  return auditLog.filter(e => e.order_id === orderId);
}

/**
 * List all orders (admin use).
 */
function listOrders(filter = {}) {
  init();
  let result = Array.from(orders.values());
  if (filter.status) {
    result = result.filter(o => o.status === filter.status);
  }
  return result;
}

/**
 * Reset for testing only.
 */
function _resetForTesting() {
  orders.clear();
  auditLog.length = 0;
  idempotencyMap.clear();
  _initialized = false;
}

const exported = {
  generateOrderId,
  generateIdempotencyKey,
  getOrder,
  getFullOrder,
  getOrderStatus,
  findByIdempotencyKey,
  hasActiveOrder,
  createOrder,
  submitProof,
   approveOrder,
   rejectOrder,
  addAuditEntry,
  getAuditLog,
  listOrders,
};
if (process.env.NODE_ENV === 'test') exported._resetForTesting = _resetForTesting;
module.exports = exported;
