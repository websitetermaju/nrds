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

let passed = 0;
let failed = 0;
const failures = [];
let currentGroup = '';

function group(name) {
  currentGroup = name;
  console.log(`\n[${name}]`);
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ group: currentGroup, name, error: e.message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
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
// Summary
// ═══════════════════════════════════════════════════════════
console.log(`\n=== Pilah API Tests: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  ✗ [${f.group}] ${f.name}: ${f.error}`));
  process.exit(1);
}
console.log('All tests passed.\n');
