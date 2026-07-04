# NR Digital Studio V2 Website — Deployment Guide

Website static multi-page siap hosting untuk NR Digital Studio V2.

## Lokasi Project

`C:\Users\kholifa\Documents\NR Digital Studio V2\10-Website\site`

## Struktur File

```text
site/
├── index.html
├── mulai-dari-sini.html
├── produk.html
├── library.html
├── guides.html
├── tentang.html
├── robots.txt
├── sitemap.xml
├── vercel.json
└── assets/
    ├── css/style.css
    └── js/main.js
```

## Halaman

1. `index.html` — homepage ecosystem.
2. `mulai-dari-sini.html` — onboarding pemula.
3. `produk.html` — product ladder dan CTA beli.
4. `library.html` — hub prompt/workflow/template.
5. `guides.html` — hub edukasi/SEO.
6. `tentang.html` — brand hierarchy NR Digital Studio, Pilah, ORIN.

## Stack

- Static HTML
- CSS custom, mobile-first
- Vanilla JavaScript kecil
- Tidak butuh backend
- Siap deploy ke Vercel / Netlify / GitHub Pages

## Link Checkout

Saat ini CTA beli diarahkan ke:

`https://lynk.id/nurwanda92`

Kalau link checkout berubah, cari dan ganti semua URL tersebut di file HTML.

## Cara Preview Lokal

Dari folder site, jalankan:

```bash
python -m http.server 8080
```

Lalu buka:

`http://localhost:8080`

## Cara Deploy ke Vercel

### Opsi 1 — Via GitHub

1. Buat repository GitHub baru, misalnya `nr-digital-studio-website`.
2. Upload semua isi folder `site/` ke repository.
3. Login ke Vercel.
4. Klik `Add New Project`.
5. Import repository.
6. Framework preset: `Other`.
7. Build command: kosongkan.
8. Output directory: kosongkan / root.
9. Deploy.
10. Setelah live, test semua halaman.

### Opsi 2 — Via Vercel CLI

```bash
npm i -g vercel
cd "C:\Users\kholifa\Documents\NR Digital Studio V2\10-Website\site"
vercel
```

Ikuti prompt Vercel sampai selesai.

## QA Checklist Sebelum Live

### Visual

- [ ] Buka di mobile 360px.
- [ ] Buka di mobile 390px.
- [ ] Buka di tablet 768px.
- [ ] Buka di desktop 1366px.
- [ ] Header tidak pecah.
- [ ] CTA terlihat jelas.
- [ ] Card tidak terlalu rapat.
- [ ] Typography masih terbaca.

### Link

- [ ] Home terbuka.
- [ ] Mulai dari Sini terbuka.
- [ ] Produk terbuka.
- [ ] Library terbuka.
- [ ] Guides terbuka.
- [ ] Tentang terbuka.
- [ ] CTA checkout mengarah ke link yang benar.

### SEO

- [ ] Title tiap halaman ada.
- [ ] Meta description tiap halaman ada.
- [ ] H1 tiap halaman hanya satu.
- [ ] `robots.txt` ada.
- [ ] `sitemap.xml` ada.

## Catatan Maintenance

Update rutin yang disarankan:

- Tambah artikel di `guides.html`.
- Tambah item library di `library.html`.
- Update harga di `produk.html` jika berubah.
- Update link checkout jika pindah platform.
- Tambah OG image nanti agar preview Telegram/WhatsApp lebih premium.

## Status

Website sudah siap sebagai static MVP dan siap dinaikkan ke hosting.
