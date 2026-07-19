/**
 * Pilah MVP — Delivery mapping
 * Maps SKU to Google Drive folder URLs for digital product delivery.
 *
 * ⚠️  These URLs are internal. Never expose to public status API.
 *     Buyer access goes through /pilah/access/:id endpoint only.
 */
const DELIVERY_MAP = {
  'PLH-01':     'https://drive.google.com/drive/folders/1LOY-Aqe3aoB9wadYGu50w-Bgkm8bWXbf',
  'PLH-02':     'https://drive.google.com/drive/folders/14ARVYOMEsDQgGQ0RQf6M6sS37N4AiiAt',
  'PLH-03':     'https://drive.google.com/drive/folders/1VebQaSQdr7tZhpKoIJLidQ9kj9UGJZMm',
  'PLH-BUNDLE': 'https://drive.google.com/drive/folders/1FLFgYyO-N7jhy4gwKrBwuZDKLUZtk-6G',
};

/**
 * Get delivery URL for a SKU.
 * @param {string} sku
 * @returns {string|null} Drive folder URL or null if unknown
 */
function getDeliveryUrl(sku) {
  return DELIVERY_MAP[sku] || null;
}

module.exports = { DELIVERY_MAP, getDeliveryUrl };
