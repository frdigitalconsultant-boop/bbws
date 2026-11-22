# Monitoring Pekerjaan OP 2

Web app untuk memantau progres pekerjaan OP 2 (Dinas PU): progres fisik, progres keuangan, status dokumen laporan, kendala, dan foto lapangan.

- **Tampilan web** di-hosting di **Vercel**.
- **Data** tetap di **Google Sheets**, foto di **Google Drive**.
- **Apps Script** menjadi penghubung (server) antara web dan Sheet.

Repo ini tidak berisi data kantor. Semua data dibaca langsung dari Sheet saat aplikasi dibuka.

## Struktur folder

```
.
├── index.html              ← halaman web (dibuat otomatis, jangan edit langsung)
├── config.js               ← isi alamat server Apps Script di sini
├── manifest.webmanifest    ← supaya bisa "Tambahkan ke layar utama" seperti aplikasi
├── icons/                  ← ikon aplikasi
├── vercel.json             ← pengaturan Vercel
├── .vercelignore           ← file yang tidak ikut di-upload ke Vercel
├── apps-script/
│   ├── Code.gs             ← server: login, baca/simpan data, foto, log
│   └── Index.html          ← sumber tampilan (juga bisa dipakai langsung di Apps Script)
└── scripts/
    └── build-web.py        ← membuat index.html dari apps-script/Index.html
```

## Peran pengguna

- **PIC**: hanya bisa mengedit kegiatan yang mencantumkan namanya di kolom PIC pengawas atau PIC perencana.
  - Sebagai pengawas: progres fisik, kendala, as built, MC 100, foto.
  - Sebagai perencana: gambar rencana, MC 0.
- **Operator**: bisa mengedit semua kegiatan, termasuk progres keuangan dan deadline.
- **Atasan**: hanya melihat.

Setiap perubahan tercatat di tab **Log**.

## Langkah 1 — Pasang server di Google Sheets

1. Buka spreadsheet pekerjaan, lalu **Ekstensi → Apps Script**.
2. Tempel isi `apps-script/Code.gs` ke file `Code.gs`.
3. Tambah file HTML bernama `Index`, tempel isi `apps-script/Index.html`.
4. Simpan, pilih fungsi **setup**, klik **Jalankan**, lalu izinkan akses.
   Ini membuat tab **Pengguna** (nama + PIN acak dari kolom PIC), **Foto**, **Log**, dan folder foto di Drive.
5. Ganti nama "Operator" dan "Atasan" di tab Pengguna dengan nama asli.
6. **Deploy → New deployment → Web app**: Execute as **Me**, Who has access **Anyone**.
7. Salin **URL web app** (berakhiran `/exec`).

Setiap kali `Code.gs` diubah: **Deploy → Manage deployments → Edit (ikon pensil) → Version: New version → Deploy**, supaya URL-nya tetap sama.

## Langkah 2 — Hubungkan web ke server

Buka `config.js`, isi URL dari langkah 1:

```js
window.OP2_API_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
```

Commit dan push ke GitHub.

## Langkah 3 — Deploy ke Vercel

1. Masuk ke [vercel.com](https://vercel.com) dengan akun GitHub.
2. **Add New → Project**, pilih repo ini, klik **Import**.
3. Framework Preset: **Other**. Root Directory, Build Command, dan Output Directory dibiarkan kosong/default.
4. Klik **Deploy**.

Setiap push ke branch `main` akan otomatis memperbarui web di Vercel.

## Pakai di HP seperti aplikasi

Buka alamat Vercel di HP:
- **Android (Chrome)**: menu ⋮ → **Tambahkan ke layar utama** / **Instal aplikasi**.
- **iPhone (Safari)**: tombol Bagikan → **Tambah ke Layar Utama**.

## Mengubah tampilan

Edit `apps-script/Index.html`, lalu jalankan:

```bash
python3 scripts/build-web.py
```

untuk memperbarui `index.html`. Tempel juga `apps-script/Index.html` yang baru ke Apps Script kalau versi Apps Script masih dipakai.

## Catatan

- Nama login harus sama persis dengan nama di kolom PIC.
- URL Apps Script di `config.js` terlihat publik. Itu wajar: tanpa PIN yang benar, server tidak memberikan data apa pun selain daftar nama untuk layar masuk.
- Foto di Drive diatur "siapa saja yang punya link bisa melihat" agar bisa tampil di aplikasi.
- Login PIN dipakai untuk masa trial. Untuk pemakaian resmi, sebaiknya diganti login akun Google kantor.
- Tab data yang dibaca: `INPUT DATA DISINI YAAAAAA` (bisa diubah di `CONFIG` pada `Code.gs`).
