# fix-merah (Vercel Email API)

API kecil untuk ngirim email via Gmail SMTP (Nodemailer) + **database sender email** (multi akun) pakai **Vercel KV**.

## 1) Endpoint kirim email

`POST /api/send-email`

**Headers**
- `X-API-Key: <API_KEY>`

**Body JSON**
```json
{
  "to_email": "target@example.com",
  "subject": "judul",
  "body": "isi email",

  "sender_id": "<optional>",
  "sender_email": "<optional>",
  "sender_app_pass": "<optional>"
}
```

Prioritas sender:
1. `sender_id`
2. `sender_email` + `sender_app_pass`
3. sender aktif di KV
4. default env `GMAIL_USER/GMAIL_PASS`

## 2) Endpoint database sender (owner)

> Semua endpoint ini wajib header `X-API-Key`.

### Add sender
`POST /api/senders/add`

```json
{
  "email": "you@gmail.com",
  "app_password": "abcd efgh ijkl mnop"
}
```

### List sender
`GET /api/senders/list`

### Set aktif
`POST /api/senders/set-active`

```json
{ "id": "<sender_id>" }
```

### Delete sender
`POST /api/senders/del`

```json
{ "id": "<sender_id>" }
```

## 3) ENV di Vercel

Wajib:
- `API_KEY`

Untuk database sender (Vercel KV):
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

> Package `@vercel/kv` membaca env tersebut secara default.

Opsional:
- `GMAIL_USER`, `GMAIL_PASS` (fallback sender kalau belum set sender aktif)
- `MASTER_KEY` (kalau di-set, app password disimpan terenkripsi AES-256-GCM di KV)

## 4) Catatan keamanan

- **Jangan** expose `API_KEY` ke client-side.
- Kalau bisa, set `MASTER_KEY` biar app password ga tersimpan plain text.
