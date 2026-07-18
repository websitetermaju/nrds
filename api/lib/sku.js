/**
 * Pilah MVP — SKU catalog & pricing
 * Single source of truth for product data.
 */
const SKUS = {
  'PLH-01':    { name: 'Pilah Vol.01 — Bisnis & Monetisasi',       price: 29000 },
  'PLH-02':    { name: 'Pilah Vol.02 — Konten & Copywriting',      price: 29000 },
  'PLH-03':    { name: 'Pilah Vol.03 — Media Sosial',              price: 29000 },
  'PLH-BUNDLE': { name: 'Pilah Bundle — 3 Volume + 9 Skills',      price: 59000 },
};

const VALID_SKUS = Object.keys(SKUS);

function getSkuData(sku) {
  return SKUS[sku] || null;
}

module.exports = { SKUS, VALID_SKUS, getSkuData };
