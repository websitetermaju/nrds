# Pilah MVP — Serverless Constraints & Architecture

## Status: DRAFT — Siap direview

---

## Arsitektur

```
┌─────────────────────────────────────────────────┐
│  Vercel Hosting                                  │
│                                                  │
│  ┌──────────────┐    ┌────────────────────────┐  │
│  │ Static Files  │    │ Serverless Functions   │  │
│  │ /pilah/*      │    │ /api/pilah/*           │  │
│  │ (HTML/CSS/JS) │    │ (Node.js handlers)     │  │
│  └──────────────┘    └────────────────────────┘  │
│         │                       │                 │
│         │                       ▼                 │
│         │              ┌──────────────┐           │
│         │              │ /tmp/ (data)  │          │
│         │              │ (ephemeral)   │          │
│         │              └──────────────┘           │
│         │                       │                 │
│         │                       ▼                 │
│         │              ┌──────────────────┐       │
│         │              │ n8n Webhook      │       │
│         │              │ (external)       │       │
│         │              └──────────────────┘       │
│         │                       │                 │
│         │                       ▼                 │
│         │              ┌──────────────────┐       │
│         │              │ Brevo SMTP       │       │
│         │              │ (email delivery) │       │
│         │              └──────────────────┘       │
└─────────────────────────────────────────────────┘
```

## Endpoint API

| Method | Endpoint | Fungsi | Auth |
|--------|----------|--------|------|
| POST | `/api/pilah/order` | Checkout baru | Rate limit (10/min/IP) |
| POST | `/api/pilah/order/:id/proof` | Upload bukti bayar | Rate limit |
| GET | `/api/pilah/order/:id/status` | Cek status order | Rate limit |

## State Machine

```
CHECKOUT → MENUNGGU_PEMBAYARAN → MENUNGGU_VERIFIKASI → DIVERIFIKASI → DELIVERED
                ↓                                          ↓
          DIBATALKAN (+24h)                          DITOLAK / COMPLAINED
```

### Transisi Valid

| Dari | Ke | Trigger |
|------|-----|---------|
| (new) | MENUNGGU_PEMBAYARAN | Submit form |
| MENUNGGU_PEMBAYARAN | MENUNGGU_VERIFIKASI | Upload bukti bayar |
| MENUNGGU_PEMBAYARAN | DIBATALKAN | +24 jam expired |
| MENUNGGU_VERIFIKASI | DIVERIFIKASI | Owner SETUJUI |
| MENUNGGU_VERIFIKASI | DITOLAK | Owner TOLAK + alasan |
| MENUNGGU_VERIFIKASI | MENUNGGU_PEMBAYARAN | Buyer upload ulang |
| DIVERIFIKASI | DELIVERED | Email delivery sukses |
| DELIVERED | COMPLAINED | Buyer komplain |

## ⚠️ Serverless Constraints

### Filesystem Read-Only
Vercel serverless functions memiliki filesystem yang **read-only** kecuali `/tmp/`.
Ini berarti:

1. **Tidak bisa persist data ke JSON file** di path permanen
2. **Tidak bisa upload file** ke disk
3. **Data di `/tmp/` bersifat ephemeral** — hilang saat cold start

### Mitigasi yang diimplementasi:

1. **Store**: Menggunakan `/tmp/` sebagai fallback + in-memory Map
2. **Upload bukti bayar**: Menerima base64, forwarding ke n8n webhook untuk storage eksternal
3. **n8n webhook**: Semua event order dikirim ke n8n untuk durability
4. **Audit log**: Tersimpan di memory + /tmp (MVP acceptable)

### Untuk production, upgrade path:

| Opsi | Effort | Notes |
|------|--------|-------|
| Vercel KV (Redis) | Low | Built-in, free tier tersedia |
| @vercel/postgres | Low | PostgreSQL via Vercel |
| Supabase | Medium | Free tier, real-time |
| JSON Store via n8n | Low | n8n simpan ke Google Sheets/DB |

## Data Model

```
Order {
  order_id:          string (PLH-YYYYMMDD-XXXX)
  nama_lengkap:      string (2-100 chars)
  whatsapp:          string (08XXXXXXXXXX, normalized)
  email:             string (valid email)
  sku:               enum [PLH-01, PLH-02, PLH-03, PLH-BUNDLE]
  harga:             number (Rp, derived from SKU)
  status:            enum [MENUNGGU_PEMBAYARAN, MENUNGGU_VERIFIKASI, ...]
  bukti_bayar_*:     upload metadata
  created_at:        ISO timestamp
  expires_at:        ISO timestamp (+24h)
  idempotency_key:   SHA256(email + sku + date)
}
```

## Keamanan

- ✅ Input validation ketat (regex, length, format)
- ✅ Path traversal check pada upload filename
- ✅ SQL injection prevention (no SQL used, parametric approach)
- ✅ XSS prevention (name regex excludes `<`, `>`)
- ✅ Rate limiting per IP (10 req/min)
- ✅ Idempotency key untuk prevent double submit
- ✅ CORS headers
- ✅ Tidak expose kredensial (n8n URL via env var)
- ✅ Audit log semua transaksi

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `N8N_WEBHOOK_URL` | No | (empty) | n8n webhook URL untuk notifikasi |
| `PILAH_DATA_DIR` | No | `/tmp/pilah-data` | Lokasi penyimpanan data |

## n8n Integration

### Workflow yang ada: "PILAH - Tes Brevo SMTP"
- ID: `ulLJAqhUwxEPl64q`
- Webhook path: `pilah-brevo-email-test-20260718`
- Method: POST
- Kirim email test via Brevo SMTP

### Event yang dikirim ke n8n:

| Event | Kapan | Payload |
|-------|-------|---------|
| `ORDER_CREATED` | Saat checkout | Order data + payment info |
| `PROOF_SUBMITTED` | Saat upload bukti | Order data + file metadata + base64 |
| `ORDER_STATUS_CHANGED` | Saat status berubah | Order data + previous status |

### Rekomendasi workflow n8n:

1. **PILAH — Order Notification (Discord)**
   - Trigger: Webhook `pilah-order-notification`
   - Action: Kirim embed ke Discord #Developer-Pilah

2. **PILAH — Email Delivery (Brevo)**
   - Trigger: Webhook `pilah-email-delivery`
   - Action: Kirim email via Brevo SMTP ke buyer

3. **PILAH — Follow-up Scheduler**
   - Trigger: Webhook `pilah-order-created`
   - Action: Wait +2h/+12h/+22h → kirim reminder WA
