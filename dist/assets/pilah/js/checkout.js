/**
 * Pilah — Checkout form UI logic (Page 1 of 2)
 * Client-side form validation → POST /api/pilah/order → sessionStorage → redirect to payment
 */
(function(){
  var SKU_DATA = {
    'PLH-01':    { name: 'Pilah Vol.01 — Bisnis & Monetisasi', price: 29000 },
    'PLH-02':    { name: 'Pilah Vol.02 — Konten & Copywriting', price: 29000 },
    'PLH-03':    { name: 'Pilah Vol.03 — Media Sosial', price: 29000 },
    'PLH-BUNDLE': { name: 'Pilah Bundle — 3 Volume + 9 Skills', price: 59000 }
  };

  var STORAGE_KEY = 'pilah_order';
  var form, submitBtn, loadingEl, globalErrEl;
  var errors = {};

  function init() {
    form = document.getElementById('checkout-form');
    if (!form) return;
    submitBtn = document.getElementById('submit-btn');
    loadingEl = document.getElementById('checkout-loading');
    globalErrEl = document.getElementById('global-error');

    // Preselect SKU from URL param
    var urlParams = new URLSearchParams(window.location.search);
    var preSku = urlParams.get('sku');
    if (preSku && SKU_DATA[preSku]) {
      var radio = form.querySelector('input[name="sku"][value="' + preSku + '"]');
      if (radio) {
        radio.checked = true;
        updatePricePreview(preSku);
      }
    }

    // SKU change → update price preview
    var skuInputs = form.querySelectorAll('input[name="sku"]');
    for (var i = 0; i < skuInputs.length; i++) {
      skuInputs[i].addEventListener('change', function(){
        updatePricePreview(this.value);
      });
    }

    form.addEventListener('submit', onSubmit);
    form.addEventListener('reset', clearErrors);

    // Track ViewContent
    if (window.NRDS_PIXEL) window.NRDS_PIXEL.viewContent({content_name: 'Checkout Pilah'});

    // WhatsApp format hint
    var waInput = form.querySelector('input[name="whatsapp"]');
    if (waInput) {
      waInput.addEventListener('blur', function(){
        var val = waInput.value.replace(/[\s\-\(\)\+]/g, '');
        if (val.startsWith('62')) val = '0' + val.slice(2);
        waInput.value = val;
      });
    }
  }

  function updatePricePreview(sku) {
    var preview = document.getElementById('price-preview');
    var data = SKU_DATA[sku];
    if (!preview || !data) { if (preview) preview.style.display = 'none'; return; }
    document.getElementById('preview-product').textContent = data.name;
    document.getElementById('preview-price').textContent = 'Rp' + data.price.toLocaleString('id-ID');
    preview.style.display = 'block';
  }

  function clearErrors() {
    errors = {};
    var msgs = form.querySelectorAll('.error-msg');
    for (var i = 0; i < msgs.length; i++) msgs[i].style.display = 'none';
    var inputs = form.querySelectorAll('input, select');
    for (var i = 0; i < inputs.length; i++) inputs[i].borderColor = '';
    if (globalErrEl) globalErrEl.style.display = 'none';
  }

  function showErr(name, msg) {
    errors[name] = msg;
    var field = form.querySelector('[name="' + name + '"]');
    var errEl = form.querySelector('[data-error="' + name + '"]');
    if (field) field.style.borderColor = 'var(--red)';
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
  }

  function showGlobalErr(msg) {
    if (globalErrEl) { globalErrEl.textContent = msg; globalErrEl.style.display = 'block'; }
  }

  function validate() {
    clearErrors();
    var valid = true;

    // Name
    var nama = form.nama_lengkap.value.trim();
    if (nama.length < 2 || nama.length > 100) {
      showErr('nama_lengkap', 'Nama harus diisi (2-100 karakter, hanya huruf)');
      valid = false;
    } else if (!/^[a-zA-ZÀ-ÿ\s.\-']+$/.test(nama)) {
      showErr('nama_lengkap', 'Nama hanya boleh huruf, spasi, titik, atau tandahubung');
      valid = false;
    }

    // WhatsApp
    var wa = form.whatsapp.value.replace(/[\s\-\(\)\+]/g, '');
    if (wa.startsWith('62')) wa = '0' + wa.slice(2);
    if (!/^08\d{8,13}$/.test(wa)) {
      showErr('whatsapp', 'Nomor WhatsApp tidak valid. Format: 08XXXXXXXXXX');
      valid = false;
    }

    // Email
    var email = form.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showErr('email', 'Email tidak valid');
      valid = false;
    }

    // SKU
    var skuChecked = form.querySelector('input[name="sku"]:checked');
    if (!skuChecked) {
      showErr('sku_terpilih', 'Pilih produk yang ingin dibeli');
      valid = false;
    }

    return valid;
  }

  function setLoading(on) {
    if (!loadingEl) return;
    if (on) {
      loadingEl.style.display = 'flex';
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Memproses...'; }
    } else {
      loadingEl.style.display = 'none';
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Lanjut ke Pembayaran'; }
    }
  }

  function generateOrderId() {
    return 'PLH-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    var skuChecked = form.querySelector('input[name="sku"]:checked');
    var sku = skuChecked ? skuChecked.value : '';
    var data = SKU_DATA[sku] || {};
    var nama = form.nama_lengkap.value.trim();
    var wa = form.whatsapp.value.replace(/[\s\-\(\)\+]/g, '');
    if (wa.startsWith('62')) wa = '0' + wa.slice(2);
    var email = form.email.value.trim().toLowerCase();

    // Track Lead
    if (window.NRDS_PIXEL) window.NRDS_PIXEL.lead({content_name: sku});

    setLoading(true);

    // Try POST to backend API
    fetch('/api/pilah/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nama_lengkap: nama,
        whatsapp: wa,
        email: email,
        sku: sku,
        idempotency_key: 'client-' + Date.now()
      })
    })
    .then(function(res) { return res.json(); })
    .then(function(resp) {
      if (resp.success && resp.data) {
        // API returned order — store full response
        var orderData = resp.data;
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(orderData));
        window.location.href = '../payment/index.html?order=' + orderData.order_id;
      } else {
        // API error — fallback to client-side only
        fallbackSaveAndRedirect(sku, data, nama, wa, email, resp.errors);
      }
    })
        .catch(function(err) {
          // API unreachable — fallback only if not production, otherwise fail-closed
          if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            fallbackSaveAndRedirect(sku, data, nama, wa, email, null);
          } else {
            showGlobalErr('Checkout gagal: server tidak merespons. Silakan coba ulang beberapa menit lagi.');
            setLoading(false);
          }
        });
  }

  function fallbackSaveAndRedirect(sku, skuInfo, nama, wa, email, apiErrors) {
    var orderId = generateOrderId();
    var orderData = {
      order_id: orderId,
      status: 'MENUNGGU_PEMBAYARAN',
      nama_lengkap: nama,
      whatsapp: wa,
      email: email,
      sku: sku,
      harga: skuInfo.price || 0,
      created_at: new Date().toISOString(),
      product_name: skuInfo.name || sku,
      payment: {
        qris_image: '../../assets/pilah/qris-kios-adelin-checkout.png',
        qris_instructions: 'Scan QR ini dan bayar sesuai harga produk yang dipilih.',
        dana_number: '085770702292',
        dana_name: 'Nurwanda Romadhon',
        dana_instructions: 'Transfer Rp' + (skuInfo.price || 0).toLocaleString('id-ID') + ' ke nomor DANA. Catatan: ' + nama + ' — ' + (skuInfo.name || sku)
      },
      _fallback: true
    };

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(orderData));
    setLoading(false);
    window.location.href = '../payment/index.html?order=' + orderId;
  }

  document.addEventListener('DOMContentLoaded', function(){
    init();
  });
})();
