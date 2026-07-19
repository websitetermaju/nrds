/**
 * Pilah MVP — Email helper for Brevo transactional emails
 *
 * Builds email payloads for Brevo API (Sendinblue v3).
 * ⚠️  NEVER includes raw Drive folder URLs in email body.
 *     "Akses Produk Saya" button links to Pilah access endpoint.
 */

const BASE_URL = process.env.PILAH_BASE_URL || 'https://nrds.web.id';

/**
 * Build the buyer access URL for an order.
 * @param {string} orderId
 * @param {string} accessToken
 * @returns {string}
 */
function buildAccessUrl(orderId, accessToken) {
  const base = process.env.PILAH_BASE_URL || 'https://nrds.web.id';
  return `${base}/pilah/access/${orderId}?token=${accessToken}`;
}

/**
 * Build Brevo email payload for order status notifications.
 *
 * @param {object} opts
 * @param {string} opts.email - buyer email
 * @param {string} opts.nama_lengkap - buyer name
 * @param {string} opts.orderId - order ID
 * @param {string} opts.accessToken - access token
 * @param {string} opts.sku - SKU code
 * @param {string} opts.skuName - human-readable product name
 * @param {number} opts.harga - price
 * @param {string} [opts.status] - order status (default: DISETUJUI)
 * @param {string} [opts.alasan_penolakan] - rejection reason
 * @returns {object} Brevo API payload
 */
function buildDeliveryEmailPayload(opts) {
  const { email, nama_lengkap, orderId, accessToken, sku, skuName, harga,
    status = 'DISETUJUI', alasan_penolakan } = opts;

  const accessUrl = buildAccessUrl(orderId, accessToken);
  const hargaFormatted = `Rp${Number(harga).toLocaleString('id-ID')}`;

  let subject, body;

  if (status === 'DITOLAK') {
    subject = `Pesanan Ditolak — ${skuName}`;
    body = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#dc3545;">Pesanan Ditolak</h2>
        <p>Halo <strong>${nama_lengkap}</strong>,</p>
        <p>Maaf, pesanan Anda untuk <strong>${skuName}</strong> (${orderId}) belum dapat kami setujui.</p>
        <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:16px;margin:20px 0;">
          <p style="margin:0;"><strong>Alasan:</strong> ${alasan_penolakan || 'Tidak disebutkan'}</p>
        </div>
        <p>Silakan hubungi kami jika ada pertanyaan.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:30px 0;">
        <p style="font-size:12px;color:#888;">Hormat,<br>Tim NR Digital Studio</p>
      </div>
    `;
  } else if (status === 'MENUNGGU_VERIFIKASI') {
    subject = `Bukti Bayar Diterima — ${skuName}`;
    body = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#0d6efd;">Bukti Bayar Diterima</h2>
        <p>Halo <strong>${nama_lengkap}</strong>,</p>
        <p>Bukti pembayaran Anda untuk <strong>${skuName}</strong> (${orderId}) sedang kami verifikasi.</p>
        <p>Kami akan mengirimkan email konfirmasi setelah verifikasi selesai.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:30px 0;">
        <p style="font-size:12px;color:#888;">Hormat,<br>Tim NR Digital Studio</p>
      </div>
    `;
  } else {
    // DISETUJUI (default)
    subject = `Pesanan Disetujui — ${skuName}`;
    body = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#198754;">Terima Kasih, ${nama_lengkap}! 🎉</h2>
        <p>Pesanan Anda untuk <strong>${skuName}</strong> (${orderId}) telah disetujui.</p>
        <div style="background:#f8f9fa;border:1px solid #dee2e6;border-radius:8px;padding:16px;margin:20px 0;">
          <p style="margin:0 0 8px;"><strong>Produk:</strong> ${skuName}</p>
          <p style="margin:0;"><strong>Harga:</strong> ${hargaFormatted}</p>
        </div>
        <div style="text-align:center;margin:30px 0;">
          <a href="${accessUrl}"
             style="display:inline-block;background:#198754;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:bold;">
            Akses Produk Saya
          </a>
        </div>
        <p style="font-size:13px;color:#666;">Klik tombol di atas untuk mengakses produk digital Anda.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:30px 0;">
        <p style="font-size:12px;color:#888;">Hormat,<br>Tim NR Digital Studio</p>
      </div>
    `;
  }

  return {
    to: [{ email, name: nama_lengkap }],
    subject,
    htmlContent: body,
  };
}

module.exports = { buildAccessUrl, buildDeliveryEmailPayload, BASE_URL };
