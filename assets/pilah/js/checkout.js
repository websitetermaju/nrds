/**
 * Pilah — Checkout form UI logic
 * Client-side only. No real order submission.
 * Validates form, shows payment info, placeholder upload.
 */
(function(){
  var SKU_DATA = {
    'PLH-01':    { name: 'Pilah Vol.01 — Bisnis & Monetisasi', price: 29000 },
    'PLH-02':    { name: 'Pilah Vol.02 — Konten & Copywriting', price: 29000 },
    'PLH-03':    { name: 'Pilah Vol.03 — Media Sosial', price: 29000 },
    'PLH-BUNDLE': { name: 'Pilah Bundle — 3 Volume + 9 Skills', price: 59000 }
  };

  var form, skuInputs, submitBtn, checkoutForm, resultSection;
  var errors = {};

  function init() {
    form = document.getElementById('checkout-form');
    checkoutForm = document.getElementById('checkout-form-wrap');
    resultSection = document.getElementById('result-section');
    if (!form) return;

    skuInputs = form.querySelectorAll('input[name="sku"]');
    submitBtn = document.getElementById('submit-btn');

    // Preselect SKU from URL param
    var urlParams = new URLSearchParams(window.location.search);
    var preSku = urlParams.get('sku');
    if (preSku && SKU_DATA[preSku]) {
      var radio = form.querySelector('input[name="sku"][value="' + preSku + '"]');
      if (radio) radio.checked = true;
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

  function clearErrors() {
    errors = {};
    var msgs = form.querySelectorAll('.error-msg');
    for (var i = 0; i < msgs.length; i++) msgs[i].style.display = 'none';
    var inputs = form.querySelectorAll('input, select');
    for (var i = 0; i < inputs.length; i++) inputs[i].style.borderColor = '';
  }

  function showErr(name, msg) {
    errors[name] = msg;
    var field = form.querySelector('[name="' + name + '"]');
    var errEl = form.querySelector('[data-error="' + name + '"]');
    if (field) field.style.borderColor = 'var(--red)';
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
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

  function onSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    var skuChecked = form.querySelector('input[name="sku"]:checked');
    var sku = skuChecked ? skuChecked.value : '';
    var data = SKU_DATA[sku] || {};
    var nama = form.nama_lengkap.value.trim();

    // Track Lead (form submitted — no purchase yet)
    if (window.NRDS_PIXEL) window.NRDS_PIXEL.lead({content_name: sku});

    // Show result section
    checkoutForm.style.display = 'none';
    resultSection.style.display = 'block';

    // Fill in order details
    document.getElementById('result-product').textContent = data.name || sku;
    document.getElementById('result-price').textContent = 'Rp' + (data.price || 0).toLocaleString('id-ID');
    document.getElementById('result-name').textContent = nama;
    document.getElementById('result-sku').textContent = sku;

    // Set upload nominal
    var nominalEl = document.getElementById('upload-nominal');
    if (nominalEl) nominalEl.textContent = 'Rp' + (data.price || 0).toLocaleString('id-ID');

    // Scroll to result
    resultSection.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  // Upload placeholder handler
  function setupUpload() {
    var area = document.querySelector('.upload-area');
    var fileInput = document.querySelector('.upload-area input[type=file]');
    if (!area || !fileInput) return;

    area.addEventListener('click', function(){ fileInput.click(); });
    area.addEventListener('dragover', function(e){ e.preventDefault(); area.style.borderColor = 'var(--green)'; });
    area.addEventListener('dragleave', function(){ area.style.borderColor = ''; });
    area.addEventListener('drop', function(e){
      e.preventDefault();
      area.style.borderColor = '';
      if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        showUploadPreview(fileInput.files[0]);
      }
    });
    fileInput.addEventListener('change', function(){
      if (fileInput.files.length) showUploadPreview(fileInput.files[0]);
    });
  }

  function showUploadPreview(file) {
    var area = document.querySelector('.upload-area');
    if (!area) return;
    var allowed = ['image/jpeg','image/png','image/webp'];
    if (allowed.indexOf(file.type) === -1) {
      alert('Format file tidak didukung. Gunakan JPG, PNG, atau WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Ukuran file terlalu besar (maks 5MB).');
      return;
    }
    area.innerHTML = '<p style="color:var(--green);font-weight:700">✓ File terpilih: ' + file.name + '</p><p style="font-size:12px;color:var(--faint)">' + (file.size / 1024 / 1024).toFixed(2) + ' MB</p>';
  }

  // Expose setupUpload
  window.NRDS_CHECKOUT = { setupUpload: setupUpload };

  document.addEventListener('DOMContentLoaded', function(){
    init();
    setupUpload();
  });
})();
