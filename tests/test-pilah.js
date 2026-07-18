/**
 * Pilah Landing Page — Node Tests
 * Zero heavy dependencies. Uses Node built-in assert.
 * Run: npm test
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function readFile(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function fileExists(rel) {
  return fs.existsSync(path.join(root, rel));
}

console.log('\n=== Pilah Landing Page Tests ===\n');

// ── 1. Page existence ──
console.log('[Page existence]');
test('pilah/index.html exists', () => {
  assert.ok(fileExists('pilah/index.html'), 'pilah/index.html not found');
});
test('pilah/vol-01/index.html exists', () => {
  assert.ok(fileExists('pilah/vol-01/index.html'), 'pilah/vol-01/index.html not found');
});
test('pilah/vol-02/index.html exists', () => {
  assert.ok(fileExists('pilah/vol-02/index.html'), 'pilah/vol-02/index.html not found');
});
test('pilah/vol-03/index.html exists', () => {
  assert.ok(fileExists('pilah/vol-03/index.html'), 'pilah/vol-03/index.html not found');
});
test('pilah/bundle/index.html exists', () => {
  assert.ok(fileExists('pilah/bundle/index.html'), 'pilah/bundle/index.html not found');
});
test('pilah/checkout/index.html exists', () => {
  assert.ok(fileExists('pilah/checkout/index.html'), 'pilah/checkout/index.html not found');
});
test('pilah/thank-you/index.html exists', () => {
  assert.ok(fileExists('pilah/thank-you/index.html'), 'pilah/thank-you/index.html not found');
});

// ── 2. Pricing correctness ──
console.log('\nPricing');
const checkoutHtml = readFile('pilah/checkout/index.html');
const landingHtml = readFile('pilah/index.html');
const bundleHtml = readFile('pilah/bundle/index.html');

test('Volume price Rp29.000 in landing', () => {
  assert.ok(landingHtml.includes('Rp29.000'), 'Missing Rp29.000 in landing');
});
test('Volume normal price Rp49.000 shown as strikethrough in landing', () => {
  assert.ok(landingHtml.includes('Rp49.000'), 'Missing Rp49.000 in landing');
});
test('Bundle price Rp59.000 in landing', () => {
  assert.ok(landingHtml.includes('Rp59.000'), 'Missing Rp59.000 in landing');
});
test('Bundle normal price Rp99.000 in landing', () => {
  assert.ok(landingHtml.includes('Rp99.000'), 'Missing Rp99.000 in landing');
});
test('Bundle launch label "Harga Peluncuran Awal" in landing', () => {
  assert.ok(landingHtml.includes('Harga Peluncuran Awal'), 'Missing launch label in landing');
});
test('Checkout has 4 SKU options', () => {
  const skuCount = (checkoutHtml.match(/name="sku"/g) || []).length;
  assert.strictEqual(skuCount, 4, `Expected 4 SKU radios, found ${skuCount}`);
});
test('Checkout has PLH-01 price Rp29.000', () => {
  assert.ok(checkoutHtml.includes('PLH-01') && checkoutHtml.includes('Rp29.000'));
});
test('Checkout has PLH-BUNDLE price Rp59.000', () => {
  assert.ok(checkoutHtml.includes('PLH-BUNDLE') && checkoutHtml.includes('Rp59.000'));
});

// ── 3. No secrets in Pilah pages ──
console.log('\nNo secrets');
const allPilahHtml = [
  'pilah/index.html', 'pilah/vol-01/index.html', 'pilah/vol-02/index.html',
  'pilah/vol-03/index.html', 'pilah/bundle/index.html',
  'pilah/checkout/index.html', 'pilah/thank-you/index.html'
];

allPilahHtml.forEach(f => {
  const html = readFile(f);
  test(`No DANA number exposed in ${f} via plain text (085770702292 in checkout/thank-you is intentional)`, () => {
    // DANA number is allowed in checkout and thank-you (private pages), but NOT in public landing/volume pages
    const isPrivatePage = f.includes('checkout') || f.includes('thank-you');
    if (!isPrivatePage) {
      assert.ok(!html.includes('085770702292'), `${f} exposes DANA number publicly`);
    }
  });
  test(`No API keys/tokens in ${f}`, () => {
    assert.ok(!html.includes('sk-'), `${f} contains potential API key`);
    assert.ok(!html.includes('token=') || f.includes('checkout'), `${f} contains potential token`);
  });
});

// ── 4. No old external checkout links ──
console.log('\nNo old checkout');
allPilahHtml.forEach(f => {
  const html = readFile(f);
  test(`No lynk.id checkout in ${f}`, () => {
    assert.ok(!html.includes('lynk.id'), `${f} contains old lynk.id checkout link`);
  });
  test(`No tokopedia/shopee in ${f}`, () => {
    assert.ok(!html.includes('tokopedia') && !html.includes('shopee'), `${f} contains old marketplace link`);
  });
});

// ── 5. No unsupported claims ──
console.log('\nNo unsupported claims');
const allHtml = allPilahHtml.map(f => readFile(f)).join('\n');
test('No "konsultasi tanpa batas" claim', () => {
  assert.ok(!allHtml.includes('konsultasi tanpa batas'), 'Contains unsupported consultation claim');
});
test('No unsupported guarantee claim (outside disclaimer)', () => {
  // "jaminan hasil" in "Tidak termasuk:" is a disclaimer, not a claim
  const lines = allHtml.split('\n');
  let unsupportedClaim = false;
  lines.forEach(line => {
    if (line.includes('jaminan hasil') && !line.toLowerCase().includes('tidak termasuk')) {
      unsupportedClaim = true;
    }
  });
  assert.ok(!unsupportedClaim, 'Unsupported guarantee claim found outside disclaimer');
});
test('No "gratis" claim for paid products', () => {
  // Check landing and volume pages for gratis near product context
  const publicPages = allPilahHtml.filter(f => !f.includes('checkout') && !f.includes('thank-you'));
  publicPages.forEach(f => {
    const html = readFile(f);
    // "Gratis" near "Pilah" or pricing context
    assert.ok(!(/gratis.*pilah|pilah.*gratis/i.test(html)), `${f} suggests Pilah is free`);
  });
});
test('No countdown/urgency timer', () => {
  assert.ok(!allHtml.includes('countdown'), 'Contains countdown timer');
  assert.ok(!/setTimeout.*habis/i.test(allHtml), 'Contains urgency timer');
});

// ── 6. Checkout form basics ──
console.log('\nCheckout form basics');
test('Checkout has nama_lengkap field', () => {
  assert.ok(checkoutHtml.includes('name="nama_lengkap"'));
});
test('Checkout has whatsapp field', () => {
  assert.ok(checkoutHtml.includes('name="whatsapp"'));
});
test('Checkout has email field', () => {
  assert.ok(checkoutHtml.includes('name="email"'));
});
test('Checkout has file upload', () => {
  assert.ok(checkoutHtml.includes('type="file"'));
  assert.ok(checkoutHtml.includes('.jpg') || checkoutHtml.includes('image/'));
});
test('Checkout has QRIS payment', () => {
  assert.ok(checkoutHtml.toLowerCase().includes('qris'));
});
test('Checkout has DANA payment', () => {
  assert.ok(checkoutHtml.includes('DANA'));
});
test('Checkout has noindex,nofollow', () => {
  assert.ok(checkoutHtml.includes('noindex'));
  assert.ok(checkoutHtml.includes('nofollow'));
});

// ── 7. Accessibility basics ──
console.log('\nAccessibility');
allPilahHtml.forEach((f) => {
  const html = readFile(f);
  test(`Has lang="id" in ${path.basename(path.dirname(f)) || 'index'}`, () => {
    assert.ok(html.includes('lang="id"'));
  });
  test(`Has skip link in ${path.basename(path.dirname(f)) || 'index'}`, () => {
    assert.ok(html.includes('class="skip"') || html.includes('skip-to-content'));
  });
  test(`Has viewport meta in ${path.basename(path.dirname(f)) || 'index'}`, () => {
    assert.ok(html.includes('name="viewport"'));
  });
});
test('Checkout inputs have labels or aria-labels', () => {
  assert.ok(checkoutHtml.includes('for="nama"') || checkoutHtml.includes('aria-label'));
  assert.ok(checkoutHtml.includes('for="wa"') || checkoutHtml.includes('aria-label'));
  assert.ok(checkoutHtml.includes('for="email"') || checkoutHtml.includes('aria-label'));
});
test('Checkout button is type="submit"', () => {
  assert.ok(checkoutHtml.includes('type="submit"'));
});

// ── 8. Meta pixel stubs ──
console.log('\nMeta pixel stubs');
test('meta-pixel.js exists', () => {
  assert.ok(fileExists('assets/pilah/js/meta-pixel.js'));
});
test('meta-pixel.js has empty metaPixelId', () => {
  const pixelJs = readFile('assets/pilah/js/meta-pixel.js');
  assert.ok(pixelJs.includes("metaPixelId = ''") || pixelJs.includes('metaPixelId: ""'));
});
test('No Purchase event in browser code', () => {
  const pixelJs = readFile('assets/pilah/js/meta-pixel.js');
  assert.ok(!pixelJs.includes("'Purchase'") && !pixelJs.includes('"Purchase"'), 'Purchase event found in browser code');
});
test('Has ViewContent helper', () => {
  const pixelJs = readFile('assets/pilah/js/meta-pixel.js');
  assert.ok(pixelJs.includes('ViewContent') || pixelJs.includes('viewContent'));
});
test('Has InitiateCheckout helper', () => {
  const pixelJs = readFile('assets/pilah/js/meta-pixel.js');
  assert.ok(pixelJs.includes('InitiateCheckout') || pixelJs.includes('initiateCheckout'));
});
test('Has Lead helper', () => {
  const pixelJs = readFile('assets/pilah/js/meta-pixel.js');
  assert.ok(pixelJs.includes('Lead') || pixelJs.includes('lead'));
});

// ── 9. Privacy / cookie notice ──
console.log('\nPrivacy notice');
test('Checkout has privacy section', () => {
  assert.ok(checkoutHtml.includes('id="privacy"') || checkoutHtml.includes('Privasi'));
});
test('Checkout mentions cookie', () => {
  assert.ok(checkoutHtml.toLowerCase().includes('cookie'));
});
test('Checkout mentions pixel disabled', () => {
  assert.ok(checkoutHtml.includes('belum aktif') || checkoutHtml.includes('dinonaktifkan'));
});

// ── 10. QRIS asset ──
console.log('\nQRIS asset');
test('QRIS image exists in assets/pilah', () => {
  assert.ok(fileExists('assets/pilah/qris-kios-adelin-checkout.png'));
});

// ── 11. Build output check ──
console.log('\nBuild output');
test('dist/ directory exists', () => {
  assert.ok(fs.existsSync(path.join(root, 'dist')));
});
test('dist contains pilah/index.html', () => {
  assert.ok(fs.existsSync(path.join(root, 'dist/pilah/index.html')));
});
test('dist contains pilah/checkout/index.html', () => {
  assert.ok(fs.existsSync(path.join(root, 'dist/pilah/checkout/index.html')));
});
test('dist contains assets/pilah/ directory', () => {
  assert.ok(fs.existsSync(path.join(root, 'dist/assets/pilah')));
});

// ── 12. Sitemap includes Pilah pages ──
console.log('\nSitemap');
const sitemap = readFile('sitemap.xml');
test('Sitemap includes pilah/', () => {
  assert.ok(sitemap.includes('pilah/'));
});
test('Sitemap does NOT include checkout', () => {
  assert.ok(!sitemap.includes('checkout'), 'Checkout should not be in sitemap');
});
test('Sitemap does NOT include thank-you', () => {
  assert.ok(!sitemap.includes('thank-you'), 'Thank-you should not be in sitemap');
});

// ── 13. Robots blocks private pages ──
console.log('\nRobots');
const robots = readFile('robots.txt');
test('Robots blocks checkout', () => {
  assert.ok(robots.includes('/pilah/checkout/'));
});
test('Robots blocks thank-you', () => {
  assert.ok(robots.includes('/pilah/thank-you/'));
});

// ── Summary ──
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  ✗ ${f.name}: ${f.error}`));
  process.exit(1);
}
