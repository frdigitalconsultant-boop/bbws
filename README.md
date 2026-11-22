# Monitoring Pekerjaan OP 2

Web app untuk memantau progres pekerjaan OP 2 (Dinas PU): progres fisik, progres keuangan, status dokumen laporan, kendala, dan foto lapangan. Data disimpan di Google Sheets, foto di Google Drive.

## Isi repo

| File | Fungsi |
|---|---|
| `apps-script/Code.gs` | Server: login PIN, baca/simpan data, unggah foto, log perubahan |
| `apps-script/Index.html` | Tampilan web app (beranda, progres, input, laporan, PIC) |

## Peran pengguna

- **PIC**: hanya bisa mengedit kegiatan yang mencantumkan namanya di kolom PIC pengawas atau PIC perencana.
  - Sebagai pengawas: progres fisik, kendala, as built, MC 100, foto.
  - Sebagai perencana: gambar rencana, MC 0.
- **Operator**: bisa mengedit semua kegiatan, termasuk progres keuangan dan deadline.
- **Atasan**: hanya melihat.

Setiap perubahan tercatat di tab **Log**.

## Cara pasang

1. Buka spreadsheet pekerjaan, lalu **Ekstensi → Apps Script**.
2. Tempel isi `Code.gs` ke file `Code.gs`.
3. Tambah file HTML bernama `Index`, tempel isi `Index.html`.
4. Simpan, pilih fungsi **setup**, klik **Jalankan**, lalu izinkan akses.
   Ini membuat tab **Pengguna** (nama + PIN acak dari kolom PIC), **Foto**, **Log**, dan folder foto di Drive.
5. Ganti nama "Operator" dan "Atasan" di tab Pengguna dengan nama asli.
6. **Deploy → New deployment → Web app**: Execute as **Me**, Who has access **Anyone**.
7. Buka link web app di HP, lalu **Tambahkan ke layar utama**.

## Catatan

- Nama login harus sama persis dengan nama di kolom PIC.
- Foto di Drive diatur "siapa saja yang punya link bisa melihat" agar bisa tampil di aplikasi.
- Login PIN dipakai untuk masa trial. Untuk pemakaian resmi, sebaiknya diganti login akun Google kantor.
- Tab data yang dibaca: `INPUT DATA DISINI YAAAAAA` (bisa diubah di `CONFIG` pada `Code.gs`).
