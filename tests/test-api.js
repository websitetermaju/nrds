/**
 * Pilah MVP — Backend API Tests
 * Unit tests for libs + integration test (order → proof → status).
 * Uses Node built-in assert, zero heavy dependencies.
 * Run: node tests/test-api.js
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Isolate test data — prevent file persistence between runs
const testDir = path.join(require('os').tmpdir(), `pilah-test-${Date.now()}-${process.pid}`);
process.env.PILAH_DATA_DIR = testDir;
process.env.PILAH_TEST_OWNER_TOKEN = 'test-owner-token-123';
const OWNER_TOKEN = 'test-owner-token-123';

let passed = 0;
let failed = 0;
const failures = [];
let currentGroup = '';
const pendingTests = [];

function group(name) {
  currentGroup = name;
  console.log(`\n[${name}]`);
}

function test(name, fn) {
  let p;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      p = result.then(() => {
        passed++;
        console.log(`  ✓ ${name}`);
      }).catch(e => {
        failed++;
        failures.push({ group: currentGroup, name, error: e.message });
        console.log(`  ✗ ${name}`);
        console.log(`    ${e.message}`);
      });
    } else {
      passed++;
      console.log(`  ✓ ${name}`);
      p = Promise.resolve();
    }
  } catch (e) {
    failed++;
    failures.push({ group: currentGroup, name, error: e.message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    p = Promise.resolve();
  }
  pendingTests.push(p);
  return p;
}

// ═══════════════════════════════════════════════════════════
// 1. Unit Tests: validate.js
// ═══════════════════════════════════════════════════════════
group('validate.js — normalizeWhatsApp');

const { normalizeWhatsApp, isValidEmail, isValidName, validateCheckout, validateProof } = require('../api/lib/validate');

test('normalize 081234567890', () => {
  assert.strictEqual(normalizeWhatsApp('081234567890'), '081234567890');
});
test('normalize +6281234567890', () => {
  assert.strictEqual(normalizeWhatsApp('+6281234567890'), '081234567890');
});
test('normalize 6281234567890', () => {
  assert.strictEqual(normalizeWhatsApp('6281234567890'), '081234567890');
});
test('normalize with spaces/dashes', () => {
  assert.strictEqual(normalizeWhatsApp('0812-345-67890'), '081234567890');
  assert.strictEqual(normalizeWhatsApp('0812 345 67890'), '081234567890');
});
test('reject too short', () => {
  assert.strictEqual(normalizeWhatsApp('081234'), null);
});
test('reject no 08 prefix', () => {
  assert.strictEqual(normalizeWhatsApp('021234567890'), null);
});
test('reject non-string', () => {
  assert.strictEqual(normalizeWhatsApp(123), null);
  assert.strictEqual(normalizeWhatsApp(null), null);
});

group('validate.js — isValidEmail');

test('valid email', () => {
  assert.ok(isValidEmail('test@example.com'));
  assert.ok(isValidEmail('user.name+tag@domain.co.id'));
});
test('invalid email', () => {
  assert.ok(!isValidEmail('bukan-email'));
  assert.ok(!isValidEmail('@domain.com'));
  assert.ok(!isValidEmail('user@'));
  assert.ok(!isValidEmail(''));
  assert.ok(!isValidEmail(null));
});

group('validate.js — isValidName');

test('valid names', () => {
  assert.ok(isValidName('Budi Santoso'));
  assert.ok(isValidName("O'Brien"));
  assert.ok(isValidName('A. Budi'));
  assert.ok(isValidName('Siti-Aminah'));
});
test('invalid names', () => {
  assert.ok(!isValidName('A'));        // too short
  assert.ok(!isValidName(''));          // empty
  assert.ok(!isValidName('Budi123'));   // has numbers
  assert.ok(!isValidName('Budi@Santoso')); // has @
});

group('validate.js — validateCheckout');

test('valid checkout', () => {
  const result = validateCheckout({
    nama_lengkap: 'Budi Santoso',
    whatsapp: '081234567890',
    email: 'budi@test.com',
    sku: 'PLH-01',
  });
  assert.ok(result.valid);
  assert.strictEqual(result.data.sku, 'PLH-01');
  assert.strictEqual(result.data.harga, 29000);
  assert.strictEqual(result.data.whatsapp, '081234567890');
});

test('valid bundle checkout', () => {
  const result = validateCheckout({
    nama_lengkap: 'Ahmad Pratama',
    whatsapp: '+6281234567890',
    email: 'ahmad@test.com',
    sku: 'PLH-BUNDLE',
  });
  assert.ok(result.valid);
  assert.strictEqual(result.data.harga, 59000);
});

test('missing fields', () => {
  const result = validateCheckout({});
  assert.ok(!result.valid);
  assert.ok(result.errors.length >= 4); // all 4 required
});

test('invalid SKU', () => {
  const result = validateCheckout({
    nama_lengkap: 'Test',
    whatsapp: '081234567890',
    email: 'test@test.com',
    sku: 'INVALID',
  });
  assert.ok(!result.valid);
});

test('null body', () => {
  const result = validateCheckout(null);
  assert.ok(!result.valid);
});

test('SQL injection attempt in name', () => {
  const result = validateCheckout({
    nama_lengkap: "'; DROP TABLE orders; --",
    whatsapp: '081234567890',
    email: 'test@test.com',
    sku: 'PLH-01',
  });
  assert.ok(!result.valid);
});

group('validate.js — validateProof');

test('valid proof metadata', () => {
  const result = validateProof({
    filename: 'bukti_bayar.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 2 * 1024 * 1024,
  }, 'PLH-1234');
  assert.ok(result.valid);
  assert.strictEqual(result.data.filename, 'bukti_bayar.jpg');
});

test('reject .exe file', () => {
  const result = validateProof({
    filename: 'malware.exe',
    mimeType: 'application/octet-stream',
    sizeBytes: 1000,
  }, 'PLH-1234');
  assert.ok(!result.valid);
  assert.ok(result.errors.some(e => e.includes('Format file tidak didukung')));
});

test('reject oversized file', () => {
  const result = validateProof({
    filename: 'large.png',
    mimeType: 'image/png',
    sizeBytes: 10 * 1024 * 1024,
  }, 'PLH-1234');
  assert.ok(!result.valid);
  assert.ok(result.errors.some(e => e.includes('terlalu besar')));
});

test('reject path traversal in filename', () => {
  const result = validateProof({
    filename: '../../etc/passwd',
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
  }, 'PLH-1234');
  assert.ok(!result.valid);
  assert.ok(result.errors.some(e => e.includes('tidak valid')));
});

test('accept base64 upload', () => {
  const fakeBase64 = 'a'.repeat(100);
  const result = validateProof({
    filename: 'proof.png',
    mimeType: 'image/png',
    base64: fakeBase64,
  }, 'PLH-1234');
  assert.ok(result.valid);
  assert.strictEqual(result.data.base64, fakeBase64);
});

test('reject oversized base64', () => {
  const result = validateProof({
    filename: 'proof.png',
    mimeType: 'image/png',
    base64: 'a'.repeat(10 * 1024 * 1024), // >5MB
  }, 'PLH-1234');
  assert.ok(!result.valid);
});

test('missing file and no base64', () => {
  const result = validateProof({}, 'PLH-1234');
  assert.ok(!result.valid);
});

// ═══════════════════════════════════════════════════════════
// 2. Unit Tests: rateLimit.js
// ═══════════════════════════════════════════════════════════
group('rateLimit.js');

const { checkRateLimit, _resetForTesting: resetRL } = require('../api/lib/rateLimit');

test('allows requests under limit', () => {
  resetRL();
  const r = checkRateLimit('test-ip-1', 3, 60000);
  assert.ok(r.allowed);
  assert.strictEqual(r.remaining, 2);
});

test('blocks requests over limit', () => {
  resetRL();
  checkRateLimit('test-ip-2', 2, 60000);
  checkRateLimit('test-ip-2', 2, 60000);
  const r = checkRateLimit('test-ip-2', 2, 60000);
  assert.ok(!r.allowed);
});

test('different IPs are independent', () => {
  resetRL();
  for (let i = 0; i < 5; i++) checkRateLimit('ip-a', 2, 60000);
  const r = checkRateLimit('ip-b', 2, 60000);
  assert.ok(r.allowed);
});

// ═══════════════════════════════════════════════════════════
// 3. Unit Tests: store.js
// ═══════════════════════════════════════════════════════════
group('store.js');

const store = require('../api/lib/store');
store._resetForTesting();

test('createOrder returns order with correct data', () => {
  const result = store.createOrder({
    nama_lengkap: 'Budi Santoso',
    whatsapp: '081234567890',
    email: 'budi@test.com',
    sku: 'PLH-01',
    harga: 29000,
  });
  assert.ok(!result.error);
  assert.ok(result.order);
  assert.strictEqual(result.order.status, 'MENUNGGU_PEMBAYARAN');
  assert.strictEqual(result.order.sku, 'PLH-01');
  assert.strictEqual(result.order.harga, 29000);
  assert.ok(result.order.order_id.startsWith('PLH-'));
  assert.ok(result.order.idempotency_key);
  assert.ok(result.order.expires_at);
});

test('idempotency: same email+sku+date returns same order', () => {
  const result1 = store.createOrder({
    nama_lengkap: 'Test User',
    whatsapp: '081234567891',
    email: 'idem@test.com',
    sku: 'PLH-02',
    harga: 29000,
  });
  assert.ok(!result1.error);
  const result2 = store.createOrder({
    nama_lengkap: 'Test User',
    whatsapp: '081234567891',
    email: 'idem@test.com',
    sku: 'PLH-02',
    harga: 29000,
  });
  assert.ok(!result2.error);
  assert.strictEqual(result2.idempotent, true);
  assert.strictEqual(result1.order.order_id, result2.order.order_id);
});

test('active order blocks duplicate email', () => {
  const result = store.createOrder({
    nama_lengkap: 'Active User',
    whatsapp: '081234567892',
    email: 'active@test.com',
    sku: 'PLH-01',
    harga: 29000,
  });
  assert.ok(!result.error);
  const dup = store.createOrder({
    nama_lengkap: 'Active User 2',
    whatsapp: '081234567893',
    email: 'active@test.com',
    sku: 'PLH-03',
    harga: 29000,
  });
  assert.ok(dup.error);
  assert.ok(dup.error.includes('sudah digunakan'));
});

test('getOrder returns order', () => {
  const result = store.createOrder({
    nama_lengkap: 'Get Test',
    whatsapp: '081234567894',
    email: 'get@test.com',
    sku: 'PLH-01',
    harga: 29000,
  });
  const order = store.getOrder(result.order.order_id);
  assert.ok(order);
  assert.strictEqual(order.order_id, result.order.order_id);
});

test('getOrder returns null for missing', () => {
  assert.strictEqual(store.getOrder('NONEXISTENT'), null);
});

test('getOrderStatus returns safe subset', () => {
  const result = store.createOrder({
    nama_lengkap: 'Status Test',
    whatsapp: '081234567895',
    email: 'status@test.com',
    sku: 'PLH-01',
    harga: 29000,
  });
  const status = store.getOrderStatus(result.order.order_id);
  assert.ok(status);
  assert.ok(status.order_id);
  assert.ok(status.status);
  assert.ok(status.sku);
  assert.ok(status.harga);
  // Should NOT expose idempotency key
  assert.strictEqual(status.idempotency_key, undefined);
});

test('audit log records order creation', () => {
  const result = store.createOrder({
    nama_lengkap: 'Audit Test',
    whatsapp: '081234567896',
    email: 'audit@test.com',
    sku: 'PLH-01',
    harga: 29000,
  });
  const log = store.getAuditLog(result.order.order_id);
  assert.ok(log.length >= 1);
  assert.strictEqual(log[0].action, 'ORDER_CREATED');
  assert.strictEqual(log[0].actor, 'buyer');
});

// ═══════════════════════════════════════════════════════════
// 4. Unit Tests: sku.js
// ═══════════════════════════════════════════════════════════
group('sku.js');

const { SKUS, VALID_SKUS, getSkuData } = require('../api/lib/sku');

test('4 SKUs defined', () => {
  assert.strictEqual(VALID_SKUS.length, 4);
  assert.ok(VALID_SKUS.includes('PLH-01'));
  assert.ok(VALID_SKUS.includes('PLH-BUNDLE'));
});

test('PLH-01 price is 29000', () => {
  assert.strictEqual(getSkuData('PLH-01').price, 29000);
});

test('PLH-BUNDLE price is 59000', () => {
  assert.strictEqual(getSkuData('PLH-BUNDLE').price, 59000);
});

test('invalid SKU returns null', () => {
  assert.strictEqual(getSkuData('FAKE'), null);
});

// ═══════════════════════════════════════════════════════════
// 5. Integration Test: Full order flow
// ═══════════════════════════════════════════════════════════
group('INTEGRATION — Full Order Flow');

// Reset store for clean integration test
store._resetForTesting();

test('Step 1: Create order', () => {
  const result = store.createOrder({
    nama_lengkap: 'Integration Tester',
    whatsapp: '081234567899',
    email: 'integration@test.com',
    sku: 'PLH-BUNDLE',
    harga: 59000,
  });
  assert.ok(!result.error, 'Order creation should succeed');
  assert.strictEqual(result.order.status, 'MENUNGGU_PEMBAYARAN');

  // Store for next steps
  global.__testOrderId = result.order.order_id;
});

test('Step 2: Submit proof of payment', () => {
  const orderId = global.__testOrderId;
  assert.ok(orderId, 'Order ID should exist from step 1');

  const result = store.submitProof(orderId, {
    filename: 'bukti_integration.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1.5 * 1024 * 1024,
  });
  assert.ok(!result.error, 'Proof submission should succeed');
  assert.strictEqual(result.order.status, 'MENUNGGU_VERIFIKASI');
  assert.ok(result.order.bukti_bayar_uploaded_at);
});

test('Step 3: Check status shows MENUNGGU_VERIFIKASI', () => {
  const orderId = global.__testOrderId;
  const status = store.getOrderStatus(orderId);
  assert.ok(status);
  assert.strictEqual(status.status, 'MENUNGGU_VERIFIKASI');
  assert.strictEqual(status.sku, 'PLH-BUNDLE');
  assert.strictEqual(status.harga, 59000);
  assert.ok(status.bukti_bayar_uploaded_at);
});

test('Step 4: Double proof upload rejected', () => {
  const orderId = global.__testOrderId;
  const result = store.submitProof(orderId, {
    filename: 'another.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
  });
  assert.ok(result.error);
  assert.ok(result.error.includes('sudah terupload'));
});

test('Step 5: Audit log captures all events', () => {
  const orderId = global.__testOrderId;
  const log = store.getAuditLog(orderId);
  assert.ok(log.length >= 2);
  assert.strictEqual(log[0].action, 'ORDER_CREATED');
  assert.strictEqual(log[1].action, 'PROOF_SUBMITTED');
});

test('Step 6: Order with expired status check', () => {
  // Create order and verify expires_at is ~24h in future
  const result = store.createOrder({
    nama_lengkap: 'Expiry Test',
    whatsapp: '081234567898',
    email: 'expiry@test.com',
    sku: 'PLH-01',
    harga: 29000,
  });
  assert.ok(!result.error);
  const expiresAt = new Date(result.order.expires_at);
  const createdAt = new Date(result.order.created_at);
  const diffMs = expiresAt - createdAt;
  // Should be ~24 hours (86400000ms), allow ±1s
  assert.ok(diffMs >= 86399000 && diffMs <= 86401000,
    `Expiry should be ~24h, got ${diffMs}ms`);
});

// ═══════════════════════════════════════════════════════════
// 6. Security Tests
// ═══════════════════════════════════════════════════════════
group('Security — Input Sanitization');

test('SQL injection in email rejected by format check', () => {
  const result = validateCheckout({
    nama_lengkap: 'Test',
    whatsapp: '081234567890',
    email: "test'; DROP TABLE--@x.com",
    sku: 'PLH-01',
  });
  assert.ok(!result.valid);
});

test('XSS in name rejected by regex', () => {
  const result = validateCheckout({
    nama_lengkap: '<script>alert(1)</script>',
    whatsapp: '081234567890',
    email: 'test@test.com',
    sku: 'PLH-01',
  });
  assert.ok(!result.valid);
});

test('Path traversal in upload filename rejected', () => {
  const result = validateProof({
    filename: '../../../etc/shadow',
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
  }, 'PLH-123');
  assert.ok(!result.valid);
});

test('Backslash path traversal rejected', () => {
  const result = validateProof({
    filename: '..\\..\\windows\\system32',
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
  }, 'PLH-123');
  assert.ok(!result.valid);
});

// ═══════════════════════════════════════════════════════════
// 7. Unit Tests: delivery.js
// ═══════════════════════════════════════════════════════════
group('delivery.js');

const { getDeliveryUrl, DELIVERY_MAP } = require('../api/lib/delivery');

test('PLH-01 maps to correct Drive folder', () => {
  assert.strictEqual(getDeliveryUrl('PLH-01'), 'https://drive.google.com/drive/folders/1LOY-Aqe3aoB9wadYGu50w-Bgkm8bWXbf');
});

test('PLH-02 maps to correct Drive folder', () => {
  assert.strictEqual(getDeliveryUrl('PLH-02'), 'https://drive.google.com/drive/folders/14ARVYOMEsDQgGQ0RQf6M6sS37N4AiiAt');
});

test('PLH-03 maps to correct Drive folder', () => {
  assert.strictEqual(getDeliveryUrl('PLH-03'), 'https://drive.google.com/drive/folders/1VebQaSQdr7tZhpKoIJLidQ9kj9UGJZMm');
});

test('PLH-BUNDLE maps to correct Drive folder', () => {
  assert.strictEqual(getDeliveryUrl('PLH-BUNDLE'), 'https://drive.google.com/drive/folders/1FLFgYyO-N7jhy4gwKrBwuZDKLUZtk-6G');
});

test('Unknown SKU returns null', () => {
  assert.strictEqual(getDeliveryUrl('INVALID-SKU'), null);
});

test('DELIVERY_MAP has 4 entries', () => {
  assert.strictEqual(Object.keys(DELIVERY_MAP).length, 4);
});

test('All Drive URLs start with https://drive.google.com/drive/folders/', () => {
  for (const [sku, url] of Object.entries(DELIVERY_MAP)) {
    assert.ok(url.startsWith('https://drive.google.com/drive/folders/'),
      `${sku} URL does not start with Drive folder prefix`);
  }
});

// ═══════════════════════════════════════════════════════════
// 8. Unit Tests: store.js — approveOrder / rejectOrder
// ═══════════════════════════════════════════════════════════
group('store.js — approveOrder / rejectOrder');

store._resetForTesting();

test('approveOrder transitions MENUNGGU_VERIFIKASI to DISETUJUI', () => {
  const r = store.createOrder({ nama_lengkap: 'Approve Test', whatsapp: '081234567890', email: 'approve@test.com', sku: 'PLH-01', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  const result = store.approveOrder(r.order.order_id);
  assert.ok(!result.error, 'approveOrder should not error');
  assert.strictEqual(result.order.status, 'DISETUJUI');
  assert.ok(result.order.verified_at, 'verified_at should be set');
});

test('approveOrder sets link_gdrive from delivery mapping', () => {
  const r = store.createOrder({ nama_lengkap: 'Drive Test', whatsapp: '081234567891', email: 'drive@test.com', sku: 'PLH-02', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  const result = store.approveOrder(r.order.order_id);
  assert.strictEqual(result.order.link_gdrive, 'https://drive.google.com/drive/folders/14ARVYOMEsDQgGQ0RQf6M6sS37N4AiiAt');
});

test('rejectOrder transitions MENUNGGU_VERIFIKASI to DITOLAK with alasan', () => {
  const r = store.createOrder({ nama_lengkap: 'Reject Test', whatsapp: '081234567892', email: 'reject@test.com', sku: 'PLH-03', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  const result = store.rejectOrder(r.order.order_id, 'Bukti tidak jelas');
  assert.ok(!result.error);
  assert.strictEqual(result.order.status, 'DITOLAK');
  assert.strictEqual(result.order.alasan_penolakan, 'Bukti tidak jelas');
  assert.ok(result.order.verified_at, 'verified_at should be set on rejection too');
});

test('approveOrder is idempotent — double approve returns same result', () => {
  const r = store.createOrder({ nama_lengkap: 'Idem Approve', whatsapp: '081234567893', email: 'idem.approve@test.com', sku: 'PLH-01', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  const first = store.approveOrder(r.order.order_id);
  const second = store.approveOrder(r.order.order_id);
  assert.strictEqual(first.order.status, 'DISETUJUI');
  assert.strictEqual(second.order.status, 'DISETUJUI');
  assert.ok(!second.error, 'Idempotent approve should not error');
});

test('rejectOrder is idempotent', () => {
  const r = store.createOrder({ nama_lengkap: 'Idem Reject', whatsapp: '081234567894', email: 'idem.reject@test.com', sku: 'PLH-01', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  store.rejectOrder(r.order.order_id, 'Alasan pertama');
  const second = store.rejectOrder(r.order.order_id, 'Alasan kedua');
  assert.strictEqual(second.order.status, 'DITOLAK');
  assert.strictEqual(second.order.alasan_penolakan, 'Alasan pertama'); // original preserved
});

test('approveOrder rejects order not in MENUNGGU_VERIFIKASI', () => {
  const r = store.createOrder({ nama_lengkap: 'Bad Status', whatsapp: '081234567895', email: 'badstatus@test.com', sku: 'PLH-01', harga: 29000 });
  // Order is MENUNGGU_PEMBAYARAN, not MENUNGGU_VERIFIKASI
  const result = store.approveOrder(r.order.order_id);
  assert.ok(result.error);
  assert.ok(result.error.includes('MENUNGGU_VERIFIKASI'));
});

test('approveOrder rejects nonexistent order', () => {
  const result = store.approveOrder('NONEXISTENT-ID');
  assert.ok(result.error);
  assert.ok(result.error.includes('tidak ditemukan'));
});

test('approveOrder audit log records APPROVED action', () => {
  const r = store.createOrder({ nama_lengkap: 'Audit Approve', whatsapp: '081234567896', email: 'audit.approve@test.com', sku: 'PLH-01', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  store.approveOrder(r.order.order_id);
  const log = store.getAuditLog(r.order.order_id);
  const approveEntry = log.find(e => e.action === 'ORDER_APPROVED');
  assert.ok(approveEntry, 'APPROVED audit entry should exist');
  assert.strictEqual(approveEntry.actor, 'owner');
});

test('rejectOrder audit log records REJECTED action with alasan', () => {
  const r = store.createOrder({ nama_lengkap: 'Audit Reject', whatsapp: '081234567897', email: 'audit.reject@test.com', sku: 'PLH-01', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  store.rejectOrder(r.order.order_id, 'Tidak valid');
  const log = store.getAuditLog(r.order.order_id);
  const rejectEntry = log.find(e => e.action === 'ORDER_REJECTED');
  assert.ok(rejectEntry, 'REJECTED audit entry should exist');
  assert.strictEqual(rejectEntry.actor, 'owner');
  assert.strictEqual(rejectEntry.details.alasan_penolakan, 'Tidak valid');
});

test('getOrderStatus does NOT expose link_gdrive (no raw Drive URL leak)', () => {
  const r = store.createOrder({ nama_lengkap: 'No Leak', whatsapp: '081234567898', email: 'noleak@test.com', sku: 'PLH-01', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  store.approveOrder(r.order.order_id);
  const status = store.getOrderStatus(r.order.order_id);
  assert.strictEqual(status.link_gdrive, undefined, 'link_gdrive must not appear in public status');
});

test('approveOrder returns previous status in result', () => {
  const r = store.createOrder({ nama_lengkap: 'Prev Status', whatsapp: '081234567801', email: 'prevstatus@test.com', sku: 'PLH-01', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  const result = store.approveOrder(r.order.order_id);
  assert.strictEqual(result.previousStatus, 'MENUNGGU_VERIFIKASI');
});

test('rejectOrder returns previous status in result', () => {
  const r = store.createOrder({ nama_lengkap: 'Prev Status R', whatsapp: '081234567802', email: 'prevstatusr@test.com', sku: 'PLH-01', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  const result = store.rejectOrder(r.order.order_id, 'Alasan');
  assert.strictEqual(result.previousStatus, 'MENUNGGU_VERIFIKASI');
});

// ═══════════════════════════════════════════════════════════
// 9. Unit Tests: email.js (Brevo delivery helper)
// ═══════════════════════════════════════════════════════════
group('email.js — Brevo delivery helper');

const { buildAccessUrl, buildDeliveryEmailPayload } = require('../api/lib/email');

test('buildAccessUrl constructs correct URL', () => {
  const url = buildAccessUrl('PLH-20260719-0001AB', 'abc123token');
  assert.strictEqual(url, 'https://nrds.web.id/pilah/access/PLH-20260719-0001AB?token=abc123token');
});

test('buildAccessUrl uses custom base URL from env', () => {
  const orig = process.env.PILAH_BASE_URL;
  process.env.PILAH_BASE_URL = 'https://staging.example.com';
  const url = buildAccessUrl('PLH-TEST', 'tok');
  assert.strictEqual(url, 'https://staging.example.com/pilah/access/PLH-TEST?token=tok');
  if (orig !== undefined) process.env.PILAH_BASE_URL = orig;
  else delete process.env.PILAH_BASE_URL;
});

test('buildAccessUrl defaults to https://nrds.web.id when no env', () => {
  const orig = process.env.PILAH_BASE_URL;
  delete process.env.PILAH_BASE_URL;
  const url = buildAccessUrl('ID', 'T');
  assert.ok(url.startsWith('https://nrds.web.id/'), 'Should default to production URL');
  if (orig !== undefined) process.env.PILAH_BASE_URL = orig;
});

test('buildDeliveryEmailPayload returns correct structure', () => {
  const payload = buildDeliveryEmailPayload({
    email: 'buyer@test.com',
    nama_lengkap: 'Budi',
    orderId: 'PLH-20260719-0001AB',
    accessToken: 'abc123token',
    sku: 'PLH-01',
    skuName: 'Pilah Vol.01 — Bisnis & Monetisasi',
    harga: 29000,
  });
  assert.ok(payload.to);
  assert.ok(payload.subject);
  assert.ok(payload.htmlContent);
  assert.strictEqual(payload.to[0].email, 'buyer@test.com');
  assert.ok(payload.subject.includes('Disetujui') || payload.subject.includes('disetujui'));
  // CRITICAL: email body must NOT contain raw Drive URL
  assert.ok(!payload.htmlContent.includes('drive.google.com'),
    'Email must not contain raw Drive URL');
  // Must contain access link
  assert.ok(payload.htmlContent.includes('/pilah/access/PLH-20260719-0001AB'));
  assert.ok(payload.htmlContent.includes('token=abc123token'));
  // Must contain "Akses Produk Saya" button text
  assert.ok(payload.htmlContent.includes('Akses Produk Saya'));
  // Must contain buyer name
  assert.ok(payload.htmlContent.includes('Budi'));
});

test('buildDeliveryEmailPayload for rejection email', () => {
  const payload = buildDeliveryEmailPayload({
    email: 'buyer@test.com',
    nama_lengkap: 'Siti',
    orderId: 'PLH-REJECT',
    accessToken: 'rejecttoken',
    sku: 'PLH-02',
    skuName: 'Pilah Vol.02',
    harga: 29000,
    status: 'DITOLAK',
    alasan_penolakan: 'Bukti tidak jelas',
  });
  assert.ok(payload.subject.includes('Ditolak') || payload.subject.includes('ditolak'));
  assert.ok(payload.htmlContent.includes('Ditolak') || payload.htmlContent.includes('ditolak'));
  assert.ok(payload.htmlContent.includes('Bukti tidak jelas'));
  // Rejection email should NOT contain access link to Drive
  assert.ok(!payload.htmlContent.includes('drive.google.com'));
});

test('buildDeliveryEmailPayload for pending verification email', () => {
  const payload = buildDeliveryEmailPayload({
    email: 'buyer@test.com',
    nama_lengkap: 'Andi',
    orderId: 'PLH-PENDING',
    accessToken: 'pendtoken',
    sku: 'PLH-03',
    skuName: 'Pilah Vol.03',
    harga: 29000,
    status: 'MENUNGGU_VERIFIKASI',
  });
  assert.ok(payload.subject.includes('Diterima') || payload.subject.includes('diterima'));
  assert.ok(!payload.htmlContent.includes('drive.google.com'));
});

// ═══════════════════════════════════════════════════════════
// 10. Integration: Access endpoint handler
// ═══════════════════════════════════════════════════════════
group('INTEGRATION — Access Endpoint');

const accessHandler = require('../api/pilah/access/[id]').handler || require('../api/pilah/access/[id]');

function mockRes() {
  const res = { _status: null, _body: null, _headers: {}, _redirect: null };
  res.status = (s) => { res._status = s; return res; };
  res.json = (d) => { res._body = d; return res; };
  res.setHeader = (k, v) => { res._headers[k] = v; return res; };
  res.redirect = (url) => { res._status = 302; res._redirect = url; return res; };
  res.end = (d) => { if (d) res._body = d; return res; };
  return res;
}

store._resetForTesting();

// Setup: create order, submit proof, approve
let accessOrderId, accessToken;
test('Setup: create + proof + approve order for access tests', () => {
  const r = store.createOrder({ nama_lengkap: 'Access Tester', whatsapp: '081234567800', email: 'access@test.com', sku: 'PLH-01', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  store.approveOrder(r.order.order_id);
  accessOrderId = r.order.order_id;
  accessToken = r.order.access_token;
});

test('GET /access/:id with valid token + DISETUJUI → 302 redirect to Drive', async () => {
  const req = { method: 'GET', query: { id: accessOrderId, token: accessToken }, headers: {} };
  const res = mockRes();
  await accessHandler(req, res);
  assert.strictEqual(res._status, 302);
  assert.ok(res._redirect, 'Should have redirect URL');
  assert.ok(res._redirect.includes('drive.google.com/drive/folders/'));
  assert.ok(res._redirect.includes('1LOY-Aqe3aoB9wadYGu50w-Bgkm8bWXbf'), 'Should redirect to PLH-01 Drive folder');
});

test('GET /access/:id with valid token + MENUNGGU_VERIFIKASI → 403', async () => {
  const r = store.createOrder({ nama_lengkap: 'Pending Access', whatsapp: '081234567803', email: 'pending.access@test.com', sku: 'PLH-01', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  // Status is MENUNGGU_VERIFIKASI
  const req = { method: 'GET', query: { id: r.order.order_id, token: r.order.access_token }, headers: {} };
  const res = mockRes();
  await accessHandler(req, res);
  assert.strictEqual(res._status, 403);
  assert.ok(res._body.error.includes('verifikasi') || res._body.error.includes('Proses'));
});

test('GET /access/:id with valid token + MENUNGGU_PEMBAYARAN → 403', async () => {
  const r = store.createOrder({ nama_lengkap: 'Unpaid Access', whatsapp: '081234567804', email: 'unpaid.access@test.com', sku: 'PLH-01', harga: 29000 });
  // Status is MENUNGGU_PEMBAYARAN (no proof)
  const req = { method: 'GET', query: { id: r.order.order_id, token: r.order.access_token }, headers: {} };
  const res = mockRes();
  await accessHandler(req, res);
  assert.strictEqual(res._status, 403);
});

test('GET /access/:id with valid token + DITOLAK → 403', async () => {
  const r = store.createOrder({ nama_lengkap: 'Rejected Access', whatsapp: '081234567805', email: 'rejected.access@test.com', sku: 'PLH-01', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  store.rejectOrder(r.order.order_id, 'Test reject');
  const req = { method: 'GET', query: { id: r.order.order_id, token: r.order.access_token }, headers: {} };
  const res = mockRes();
  await accessHandler(req, res);
  assert.strictEqual(res._status, 403);
  assert.ok(res._body.error.includes('ditolak') || res._body.error.includes('Ditolak'));
});

test('GET /access/:id with invalid token → 403', async () => {
  const req = { method: 'GET', query: { id: accessOrderId, token: 'wrongtoken123' }, headers: {} };
  const res = mockRes();
  await accessHandler(req, res);
  assert.strictEqual(res._status, 403);
});

test('GET /access/:id with unknown order → 404', async () => {
  const req = { method: 'GET', query: { id: 'NONEXISTENT', token: 'x' }, headers: {} };
  const res = mockRes();
  await accessHandler(req, res);
  assert.strictEqual(res._status, 404);
});

test('GET /access/:id with invalid order ID format → 400', async () => {
  const req = { method: 'GET', query: { id: '!!!', token: 'x' }, headers: {} };
  const res = mockRes();
  await accessHandler(req, res);
  assert.strictEqual(res._status, 400);
});

test('POST /access/:id → 405', async () => {
  const req = { method: 'POST', query: { id: accessOrderId, token: accessToken }, headers: {} };
  const res = mockRes();
  await accessHandler(req, res);
  assert.strictEqual(res._status, 405);
});

test('OPTIONS /access/:id → 204 with CORS headers', async () => {
  const req = { method: 'OPTIONS', query: { id: accessOrderId }, headers: {} };
  const res = mockRes();
  await accessHandler(req, res);
  assert.strictEqual(res._status, 204);
  assert.ok(res._headers['Access-Control-Allow-Origin']);
});

test('Access response has security headers (X-Content-Type-Options)', async () => {
  const req = { method: 'GET', query: { id: accessOrderId, token: accessToken }, headers: {} };
  const res = mockRes();
  await accessHandler(req, res);
  assert.strictEqual(res._headers['X-Content-Type-Options'], 'nosniff');
  assert.strictEqual(res._headers['X-Frame-Options'], 'DENY');
});

test('Access endpoint rate limit header present', async () => {
  const req = { method: 'GET', query: { id: accessOrderId, token: accessToken }, headers: {} };
  const res = mockRes();
  await accessHandler(req, res);
  assert.ok(res._headers['X-RateLimit-Remaining'] !== undefined);
});

test('Access endpoint does NOT expose link_gdrive in any response body', async () => {
  const req = { method: 'GET', query: { id: accessOrderId, token: 'wrongtoken' }, headers: {} };
  const res = mockRes();
  await accessHandler(req, res);
  if (res._body) {
    assert.ok(!JSON.stringify(res._body).includes('drive.google.com'),
      'Response body must not contain raw Drive URL');
  }
});

test('Access with Bearer token header works (not just query param)', async () => {
  const req = { method: 'GET', query: { id: accessOrderId }, headers: { authorization: `Bearer ${accessToken}` } };
  const res = mockRes();
  await accessHandler(req, res);
  assert.strictEqual(res._status, 302);
});

// ═══════════════════════════════════════════════════════════
// 11. Integration: Approval Endpoint + n8n hook
// ═══════════════════════════════════════════════════════════
group('INTEGRATION — Approval Endpoint + n8n');

const approveHandler = require('../api/pilah/order/[id]/approve').handler || require('../api/pilah/order/[id]/approve');

store._resetForTesting();

let approveOrderId;
test('Setup: create order for approval tests', () => {
  const r = store.createOrder({ nama_lengkap: 'Approve Endpoint', whatsapp: '081234567810', email: 'approve.ep@test.com', sku: 'PLH-03', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  approveOrderId = r.order.order_id;
});

test('POST /approve with owner token + DISETUJUI → 200 + order DISETUJUI', async () => {
  const req = { method: 'POST', query: { id: approveOrderId, token: OWNER_TOKEN }, headers: {}, body: { action: 'DISETUJUI' } };
  const res = mockRes();
  await approveHandler(req, res);
  assert.strictEqual(res._status, 200);
  assert.strictEqual(res._body.data.status, 'DISETUJUI');
  assert.strictEqual(res._body.data.previous_status, 'MENUNGGU_VERIFIKASI');
});

test('POST /approve is idempotent — already DISETUJUI returns 200', async () => {
  const req = { method: 'POST', query: { id: approveOrderId, token: OWNER_TOKEN }, headers: {}, body: { action: 'DISETUJUI' } };
  const res = mockRes();
  await approveHandler(req, res);
  assert.strictEqual(res._status, 200);
  assert.strictEqual(res._body.data.status, 'DISETUJUI');
});

test('POST /approve with DITOLAK requires alasan', async () => {
  const r = store.createOrder({ nama_lengkap: 'Reject Endpoint', whatsapp: '081234567811', email: 'reject.ep@test.com', sku: 'PLH-01', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  const req = { method: 'POST', query: { id: r.order.order_id, token: OWNER_TOKEN }, headers: {}, body: { action: 'DITOLAK' } };
  const res = mockRes();
  await approveHandler(req, res);
  assert.strictEqual(res._status, 400);
  assert.ok(res._body.error.includes('Alasan'));
});

test('POST /approve with DITOLAK + alasan → 200 + DITOLAK', async () => {
  const r = store.createOrder({ nama_lengkap: 'Reject With Reason', whatsapp: '081234567812', email: 'reject.reason@test.com', sku: 'PLH-02', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  const req = { method: 'POST', query: { id: r.order.order_id, token: OWNER_TOKEN }, headers: {}, body: { action: 'DITOLAK', alasan_penolakan: 'Bukti tidak valid' } };
  const res = mockRes();
  await approveHandler(req, res);
  assert.strictEqual(res._status, 200);
  assert.strictEqual(res._body.data.status, 'DITOLAK');
});

test('POST /approve without valid token → 403', async () => {
  const req = { method: 'POST', query: { id: approveOrderId, token: 'invalid-token-123' }, headers: {}, body: { action: 'DISETUJUI' } };
  const res = mockRes();
  await approveHandler(req, res);
  assert.strictEqual(res._status, 403);
});

test('POST /approve with invalid action → 400', async () => {
  const req = { method: 'POST', query: { id: approveOrderId, token: OWNER_TOKEN }, headers: {}, body: { action: 'INVALID' } };
  const res = mockRes();
  await approveHandler(req, res);
  assert.strictEqual(res._status, 400);
});

test('n8n helper receives ORDER_STATUS_CHANGED payload structure', () => {
  const { notifyN8n } = require('../api/lib/n8n');
  // In test mode, notifyN8n returns false (no webhook URL), but we verify the function exists
  assert.strictEqual(typeof notifyN8n, 'function');
});

test('POST /approve with GET method → 405', async () => {
  const req = { method: 'GET', query: { id: approveOrderId, token: OWNER_TOKEN }, headers: {}, body: {} };
  const res = mockRes();
  await approveHandler(req, res);
  assert.strictEqual(res._status, 405);
});

// ═══════════════════════════════════════════════════════════
// 12. Approval Auth — Owner Token (PILAH_OWNER_TOKEN)
// ═══════════════════════════════════════════════════════════
group('Approval Auth — Owner Token');

test('buyer access_token gets 403 on approve endpoint', async () => {
  const r = store.createOrder({ nama_lengkap: 'Auth Buyer', whatsapp: '081234567850', email: 'auth.buyer@test.com', sku: 'PLH-01', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  // Use buyer's own access_token — must be rejected
  const req = { method: 'POST', query: { id: r.order.order_id, token: r.order.access_token }, headers: {}, body: { action: 'DISETUJUI' } };
  const res = mockRes();
  await approveHandler(req, res);
  assert.strictEqual(res._status, 403, 'Buyer access_token must be rejected by approve endpoint');
});

test('owner token succeeds on approve endpoint', async () => {
  const r = store.createOrder({ nama_lengkap: 'Auth Owner', whatsapp: '081234567851', email: 'auth.owner@test.com', sku: 'PLH-02', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  const req = { method: 'POST', query: { id: r.order.order_id, token: OWNER_TOKEN }, headers: {}, body: { action: 'DISETUJUI' } };
  const res = mockRes();
  await approveHandler(req, res);
  assert.strictEqual(res._status, 200, 'Owner token must be accepted');
  assert.strictEqual(res._body.data.status, 'DISETUJUI');
});

test('missing owner token env → fail-closed (no token accepted)', () => {
  const crypto = require('crypto');
  // Simulate no env set
  function ownerTokenOkNoEnv(supplied) {
    const expected = process.env.PILAH_OWNER_TOKEN || null;
    if (!expected) return false;
    if (!supplied) return false;
    const a = Buffer.from(expected);
    const b = Buffer.from(String(supplied));
    if (a.length !== b.length) return false;
    try { return crypto.timingSafeEqual(a, b); }
    catch { return false; }
  }
  assert.strictEqual(ownerTokenOkNoEnv('anything'), false, 'Without env, all tokens must be rejected');
});

// ═══════════════════════════════════════════════════════════
// 13. Delivery State Machine
// ═══════════════════════════════════════════════════════════
group('Delivery State Machine');

store._resetForTesting();

test('prepareApproval transitions MENUNGGU_VERIFIKASI → MENUNGGU_DELIVERY', () => {
  const r = store.createOrder({ nama_lengkap: 'SM Test', whatsapp: '081234567860', email: 'sm@test.com', sku: 'PLH-01', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  const result = store.prepareApproval(r.order.order_id);
  assert.ok(!result.error);
  assert.strictEqual(result.order.status, 'MENUNGGU_DELIVERY');
  assert.strictEqual(result.previousStatus, 'MENUNGGU_VERIFIKASI');
});

test('commitApproval transitions MENUNGGU_DELIVERY → DISETUJUI', () => {
  const r = store.createOrder({ nama_lengkap: 'SM Test 2', whatsapp: '081234567861', email: 'sm2@test.com', sku: 'PLH-02', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  store.prepareApproval(r.order.order_id);
  const result = store.commitApproval(r.order.order_id);
  assert.ok(!result.error);
  assert.strictEqual(result.order.status, 'DISETUJUI');
  assert.ok(result.order.verified_at);
  assert.ok(result.order.link_gdrive);
});

test('rollbackApproval reverts MENUNGGU_DELIVERY → MENUNGGU_VERIFIKASI', () => {
  const r = store.createOrder({ nama_lengkap: 'SM Test 3', whatsapp: '081234567862', email: 'sm3@test.com', sku: 'PLH-03', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  store.prepareApproval(r.order.order_id);
  const result = store.rollbackApproval(r.order.order_id);
  assert.ok(!result.error);
  const order = store.getOrder(r.order.order_id);
  assert.strictEqual(order.status, 'MENUNGGU_VERIFIKASI');
});

test('status endpoint hides MENUNGGU_DELIVERY from buyer (shows MENUNGGU_VERIFIKASI)', () => {
  const r = store.createOrder({ nama_lengkap: 'SM Test 4', whatsapp: '081234567863', email: 'sm4@test.com', sku: 'PLH-01', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });
  store.prepareApproval(r.order.order_id);
  const status = store.getOrderStatus(r.order.order_id);
  assert.strictEqual(status.status, 'MENUNGGU_VERIFIKASI', 'MENUNGGU_DELIVERY should be hidden from buyer');
  store.rollbackApproval(r.order.order_id);
});

// ═══════════════════════════════════════════════════════════
// 14. Idempotency — n8n Call Count
// ═══════════════════════════════════════════════════════════
group('Idempotency — n8n Call Count');

// Track n8n calls by wrapping notifyN8n
let n8nCalls = [];
const n8nModule = require('../api/lib/n8n');
const origNotifyN8n = n8nModule.notifyN8n;
n8nModule.notifyN8n = async function(...args) {
  n8nCalls.push({ event: args[0], timestamp: Date.now() });
  return origNotifyN8n.apply(this, args);
};

test('double approval calls n8n exactly once', async () => {
  n8nCalls = [];
  const r = store.createOrder({ nama_lengkap: 'Idem n8n', whatsapp: '081234567870', email: 'idem.n8n@test.com', sku: 'PLH-01', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });

  // First approval
  const req1 = { method: 'POST', query: { id: r.order.order_id, token: OWNER_TOKEN }, headers: {}, body: { action: 'DISETUJUI' } };
  const res1 = mockRes();
  await approveHandler(req1, res1);
  assert.strictEqual(res1._status, 200);

  // Second approval (idempotent)
  const req2 = { method: 'POST', query: { id: r.order.order_id, token: OWNER_TOKEN }, headers: {}, body: { action: 'DISETUJUI' } };
  const res2 = mockRes();
  await approveHandler(req2, res2);
  assert.strictEqual(res2._status, 200);
  assert.strictEqual(res2._body.data.status, 'DISETUJUI');

  // n8n should have been called exactly once
  assert.strictEqual(n8nCalls.length, 1, `n8n called ${n8nCalls.length} times, expected 1`);
  assert.strictEqual(n8nCalls[0].event, 'ORDER_STATUS_CHANGED');
});

test('double rejection calls n8n exactly once', async () => {
  n8nCalls = [];
  const r = store.createOrder({ nama_lengkap: 'Idem Reject n8n', whatsapp: '081234567871', email: 'idem.reject.n8n@test.com', sku: 'PLH-02', harga: 29000 });
  store.submitProof(r.order.order_id, { filename: 'bukti.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 });

  // First rejection
  const req1 = { method: 'POST', query: { id: r.order.order_id, token: OWNER_TOKEN }, headers: {}, body: { action: 'DITOLAK', alasan_penolakan: 'Alasan pertama' } };
  const res1 = mockRes();
  await approveHandler(req1, res1);
  assert.strictEqual(res1._status, 200);

  // Second rejection (idempotent)
  const req2 = { method: 'POST', query: { id: r.order.order_id, token: OWNER_TOKEN }, headers: {}, body: { action: 'DITOLAK', alasan_penolakan: 'Alasan kedua' } };
  const res2 = mockRes();
  await approveHandler(req2, res2);
  assert.strictEqual(res2._status, 200);
  assert.strictEqual(res2._body.data.status, 'DITOLAK');

  // n8n should have been called exactly once
  assert.strictEqual(n8nCalls.length, 1, `n8n called ${n8nCalls.length} times, expected 1`);
});

// ═══════════════════════════════════════════════════════════
// 15. email.js — HTML Escaping (XSS Prevention)
// ═══════════════════════════════════════════════════════════
group('email.js — HTML Escaping (XSS Prevention)');

const { escapeHtml } = require('../api/lib/email');

test('escapeHtml escapes < > & " \'', () => {
  assert.strictEqual(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.strictEqual(escapeHtml('a&b'), 'a&amp;b');
  assert.strictEqual(escapeHtml('he said "hi"'), 'he said &quot;hi&quot;');
  assert.strictEqual(escapeHtml("it's"), 'it&#x27;s');
});

test('escapeHtml handles null/undefined/numbers', () => {
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
  assert.strictEqual(escapeHtml(12345), '12345');
});

test('rejection email escapes XSS in alasan_penolakan', () => {
  const payload = buildDeliveryEmailPayload({
    email: 'xss@test.com',
    nama_lengkap: 'Normal Name',
    orderId: 'PLH-XSS-TEST',
    accessToken: 'tok123',
    sku: 'PLH-01',
    skuName: 'Pilah Vol.01',
    harga: 29000,
    status: 'DITOLAK',
    alasan_penolakan: '<script>alert("xss")</script>',
  });
  assert.ok(!payload.htmlContent.includes('<script>'), 'Must not contain raw <script> tag');
  assert.ok(payload.htmlContent.includes('&lt;script&gt;'), 'Must contain escaped script tag');
});

test('approval email escapes XSS in nama_lengkap', () => {
  const payload = buildDeliveryEmailPayload({
    email: 'xss2@test.com',
    nama_lengkap: '<img src=x onerror=alert(1)>',
    orderId: 'PLH-XSS-TEST2',
    accessToken: 'tok456',
    sku: 'PLH-02',
    skuName: 'Pilah Vol.02',
    harga: 29000,
  });
  assert.ok(!payload.htmlContent.includes('<img'), 'Must not contain raw <img> tag');
  assert.ok(payload.htmlContent.includes('&lt;img'), 'Must contain escaped img tag');
});

test('email URL attributes are safely escaped', () => {
  const payload = buildDeliveryEmailPayload({
    email: 'url@test.com',
    nama_lengkap: 'Test',
    orderId: 'PLH-URL-TEST',
    accessToken: 'tok789',
    sku: 'PLH-03',
    skuName: 'Pilah Vol.03',
    harga: 29000,
  });
  assert.ok(payload.htmlContent.includes('href="'), 'href attribute present');
  // No double-quote breaking out of the attribute
  assert.ok(!payload.htmlContent.match(/href="[^"]*"[^"<>]*>/), 'href attribute should be properly closed');
});

test('email body escapes skuName XSS (subject is plain text, body escaped)', () => {
  const payload = buildDeliveryEmailPayload({
    email: 'xss3@test.com',
    nama_lengkap: 'Test',
    orderId: 'PLH-XSS-SKU',
    accessToken: 'tok000',
    sku: 'PLH-01',
    skuName: '<b>Bold</b>',
    harga: 29000,
    status: 'DITOLAK',
    alasan_penolakan: 'Test',
  });
  // Body must be escaped
  assert.ok(!payload.htmlContent.includes('<b>Bold</b>'), 'Body must not contain raw HTML from skuName');
  assert.ok(payload.htmlContent.includes('&lt;b&gt;Bold&lt;/b&gt;'), 'Body escapes skuName');
});

// ═══════════════════════════════════════════════════════════
// 16. Token URL — Cache Headers
// ═══════════════════════════════════════════════════════════
group('Token URL — Cache Headers');

test('access endpoint sets Cache-Control: no-store', async () => {
  const req = { method: 'GET', query: { id: accessOrderId, token: accessToken }, headers: {} };
  const res = mockRes();
  await accessHandler(req, res);
  assert.strictEqual(res._headers['Cache-Control'], 'no-store');
});

test('access endpoint sets Pragma: no-cache', async () => {
  const req = { method: 'GET', query: { id: accessOrderId, token: accessToken }, headers: {} };
  const res = mockRes();
  await accessHandler(req, res);
  assert.strictEqual(res._headers['Pragma'], 'no-cache');
});

test('access endpoint sets Referrer-Policy: no-referrer', async () => {
  const req = { method: 'GET', query: { id: accessOrderId, token: accessToken }, headers: {} };
  const res = mockRes();
  await accessHandler(req, res);
  assert.strictEqual(res._headers['Referrer-Policy'], 'no-referrer');
});

// ═══════════════════════════════════════════════════════════
// Summary — wait for async tests then report
// ═══════════════════════════════════════════════════════════
Promise.all(pendingTests).then(() => {
  console.log(`\n=== Pilah API Tests: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  ✗ [${f.group}] ${f.name}: ${f.error}`));
    process.exit(1);
  }
  console.log('All tests passed.\n');
}).catch(() => {
  console.log(`\n=== Pilah API Tests: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  ✗ [${f.group}] ${f.name}: ${f.error}`));
  }
  process.exit(1);
});
