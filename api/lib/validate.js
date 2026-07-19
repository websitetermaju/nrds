/**
 * Pilah MVP — Input validation
 * Server-side validation matching PILAH-CHECKOUT-MVP-FINAL-SPEC §7
 */
const { VALID_SKUS, getSkuData } = require('./sku');

/**
 * Normalize WhatsApp number.
 * Removes spaces, dashes, parens, plus signs.
 * Converts 62xxx → 0xxx and +62xxx → 0xxx.
 * Result must start with 08 and be 10-15 digits.
 */
function normalizeWhatsApp(raw) {
  if (typeof raw !== 'string') return null;
  let wa = raw.replace(/[\s\-()]+/g, '');
  if (wa.startsWith('+62')) wa = '0' + wa.slice(3);
  else if (wa.startsWith('62')) wa = '0' + wa.slice(2);
  if (/^08\d{8,13}$/.test(wa)) return wa;
  return null;
}

/**
 * Basic RFC 5322 email validation.
 */
function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate nama_lengkap: 2-100 chars, letters/spaces/dots/hyphens/apostrophes.
 */
function isValidName(name) {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 100) return false;
  return /^[a-zA-ZÀ-ÿ\s.\-']+$/.test(trimmed);
}

/**
 * Validate full checkout payload.
 * Returns { valid: true, data: {...} } or { valid: false, errors: [...] }
 */
function validateCheckout(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body tidak valid'] };
  }

  // nama_lengkap
  const nama = (body.nama_lengkap || '').trim();
  if (!nama) {
    errors.push('Nama harus diisi');
  } else if (!isValidName(nama)) {
    errors.push('Nama harus diisi (2-100 karakter, hanya huruf)');
  }

  // whatsapp
  const wa = normalizeWhatsApp(body.whatsapp);
  if (!wa) {
    errors.push('Nomor WhatsApp tidak valid. Format: 08XXXXXXXXXX');
  }

  // email
  const email = (body.email || '').trim().toLowerCase();
  if (!email) {
    errors.push('Email harus diisi');
  } else if (!isValidEmail(email)) {
    errors.push('Email tidak valid');
  }

  // sku
  const sku = (body.sku || '').trim().toUpperCase();
  if (!sku) {
    errors.push('Pilih produk yang ingin dibeli');
  } else if (!VALID_SKUS.includes(sku)) {
    errors.push('SKU tidak valid');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      nama_lengkap: nama,
      whatsapp: wa,
      email,
      sku,
      harga: getSkuData(sku).price,
    },
  };
}

/**
 * Validate proof upload metadata (serverless-friendly: no raw file, base64/metadata only).
 * Accepts { filename, mimeType, sizeBytes } or { base64, filename }.
 */
function validateProof(body, orderId) {
  const errors = [];

  if (!orderId || typeof orderId !== 'string') {
    errors.push('Order ID tidak valid');
  }

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: errors.length ? errors : ['Request body tidak valid'] };
  }

  // Allow base64 upload or metadata-only (for n8n forwarding)
  if (body.base64) {
    // base64 content provided
    if (typeof body.base64 !== 'string') {
      errors.push('Base64 data harus berupa string');
    } else {
      // Basic size check: base64 ~4/3 of original, max 5MB = ~6.67MB base64
      const approxBytes = Math.ceil(body.base64.length * 3 / 4);
      if (approxBytes > 5 * 1024 * 1024) {
        errors.push('Ukuran file terlalu besar (maks 5MB)');
      }
    }
  }

  // Filename + mimeType validation
  const filename = body.filename || '';
  const mimeType = body.mimeType || body.mime_type || '';

  if (!filename && !body.base64) {
    errors.push('Upload bukti bayar terlebih dahulu');
  }

  if (filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
    if (!allowedExts.includes(ext)) {
      errors.push('Format file tidak didukung. Gunakan JPG, PNG, atau WebP');
    }
    // Path traversal check
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      errors.push('Nama file tidak valid');
    }
  }

  if (mimeType) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(mimeType)) {
      errors.push('Format file tidak didukung. Gunakan JPG, PNG, atau WebP');
    }
  }

  // Size check if provided as metadata
  if (body.sizeBytes && typeof body.sizeBytes === 'number') {
    if (body.sizeBytes > 5 * 1024 * 1024) {
      errors.push('Ukuran file terlalu besar (maks 5MB)');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      filename: filename || `proof_${orderId}.jpg`,
      mimeType: mimeType || 'image/jpeg',
      sizeBytes: body.sizeBytes || 0,
      base64: body.base64 || null,
    },
  };
}

module.exports = {
  normalizeWhatsApp,
  isValidEmail,
  isValidName,
  validateCheckout,
  validateProof,
};
