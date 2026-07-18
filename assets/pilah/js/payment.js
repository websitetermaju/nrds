/**
 * Pilah — Payment page UI logic (Page 2 of 2)
 * Reads order data from sessionStorage, renders summary, handles upload, confirms order.
 */
(function(){
  var STORAGE_KEY = 'pilah_order';
  var orderData = null;

  function init() {
    var orderId = getOrderIdFromURL();
    if (!orderId) {
      showFallback();
      return;
    }

    // Read order from sessionStorage
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) { showFallback(); return; }
      orderData = JSON.parse(raw);
      // Verify order_id matches
      if (orderData.order_id !== orderId) {
        showFallback();
        return;
      }
    } catch(e) {
      showFallback();
      return;
    }

    renderOrderSummary();
    setupUpload();
    setupConfirmButton();

    // Track ViewContent for payment page
    if (window.NRDS_PIXEL) window.NRDS_PIXEL.viewContent({content_name: 'Payment Pilah'});
  }

  function getOrderIdFromURL() {
    var params = new URLSearchParams(window.location.search);
    return params.get('order') || '';
  }

  function showFallback() {
    var fallback = document.getElementById('no-data-fallback');
    var paymentPage = document.getElementById('payment-page');
    if (fallback) fallback.style.display = 'block';
    if (paymentPage) paymentPage.style.display = 'none';
  }

  function renderOrderSummary() {
    var paymentPage = document.getElementById('payment-page');
    if (paymentPage) paymentPage.style.display = 'block';

    var harga = orderData.harga || 0;
    var hargaFormatted = 'Rp' + harga.toLocaleString('id-ID');

    // Fill summary
    setText('pay-order-id', orderData.order_id || '-');
    setText('pay-product', orderData.product_name || orderData.sku || '-');
    setText('pay-price', hargaFormatted);
    setText('pay-name', orderData.nama_lengkap || '-');
    setText('pay-sku', orderData.sku || '-');
    setText('pay-nominal', hargaFormatted);

    // DANA note
    var danaNote = (orderData.nama_lengkap || '[Nama]') + ' — ' + (orderData.product_name || orderData.sku || '[Produk]');
    setText('pay-dana-note', danaNote);
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function setupUpload() {
    var area = document.getElementById('upload-area');
    var fileInput = document.getElementById('proof-file');
    var errorEl = document.getElementById('upload-error');
    var successEl = document.getElementById('upload-success');
    var pendingNote = document.getElementById('upload-pending-note');
    var confirmBtn = document.getElementById('confirm-btn');
    if (!area || !fileInput) return;

    var selectedFile = null;

    area.addEventListener('click', function(){ fileInput.click(); });
    area.addEventListener('dragover', function(e){ e.preventDefault(); area.style.borderColor = 'var(--green)'; });
    area.addEventListener('dragleave', function(){ area.style.borderColor = ''; });
    area.addEventListener('drop', function(e){
      e.preventDefault();
      area.style.borderColor = '';
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', function(){
      if (fileInput.files.length) handleFile(fileInput.files[0]);
    });

    function handleFile(file) {
      // Validate type
      var allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (allowed.indexOf(file.type) === -1) {
        showUploadError('Format file tidak didukung. Gunakan JPG, PNG, atau WebP.');
        return;
      }
      // Validate size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        showUploadError('Ukuran file terlalu besar (maks 5MB).');
        return;
      }
      // Valid — show success
      selectedFile = file;
      if (errorEl) errorEl.style.display = 'none';
      if (successEl) {
        successEl.textContent = '✓ File terpilih: ' + file.name + ' (' + (file.size / 1024 / 1024).toFixed(2) + ' MB)';
        successEl.style.display = 'block';
      }
      if (pendingNote) pendingNote.style.display = 'none';

      // Store file info in sessionStorage (actual upload to backend pending)
      if (orderData) {
        orderData._proof = {
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          status: 'uploaded_locally'
        };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(orderData));
      }

      // Enable confirm button
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Saya sudah bayar — Konfirmasi';
      }
    }

    function showUploadError(msg) {
      if (errorEl) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
      }
      if (successEl) successEl.style.display = 'none';
    }
  }

  function setupConfirmButton() {
    var confirmBtn = document.getElementById('confirm-btn');
    if (!confirmBtn) return;

    confirmBtn.addEventListener('click', function(e) {
      e.preventDefault();
      if (confirmBtn.disabled) return;

      // Update order status locally
      if (orderData) {
        orderData.status = 'MENUNGGU_VERIFIKASI';
        orderData.confirmed_at = new Date().toISOString();
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(orderData));
      }

      // Track Lead (payment confirmed — not purchase yet, that's server-side)
      if (window.NRDS_PIXEL) window.NRDS_PIXEL.lead({content_name: orderData ? orderData.sku : 'unknown'});

      // Try to POST confirmation to API (fire-and-forget)
      if (orderData && orderData.order_id && !orderData._fallback) {
        var proofData = orderData._proof || {};
        fetch('/api/pilah/order/' + orderData.order_id + '/proof', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: proofData.filename || '',
            mimeType: proofData.mimeType || '',
            sizeBytes: proofData.sizeBytes || 0
          })
        }).catch(function(){}); // fire-and-forget, proceed to thank-you regardless
      }

      // Redirect to thank-you
      window.location.href = '../thank-you/index.html?order=' + (orderData ? orderData.order_id : '');
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    init();
  });
})();
