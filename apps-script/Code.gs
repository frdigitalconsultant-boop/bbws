/**
 * Monitoring Pekerjaan OP 2 — server (Google Apps Script)
 * --------------------------------------------------------
 * Dipasang di spreadsheet "Database Monitoring OP 2".
 * Tab yang dipakai: Kegiatan, Dokumen, Pengguna, Riwayat Progres, Foto, Log.
 * Langkah pertama: jalankan fungsi setup() sekali dari editor Apps Script.
 */

const CONFIG = {
  TAB: {
    KEGIATAN: 'Kegiatan',
    DOKUMEN: 'Dokumen',
    PENGGUNA: 'Pengguna',
    RIWAYAT: 'Riwayat Progres',
    FOTO: 'Foto',
    LOG: 'Log',
  },
  FOLDER_FOTO: 'Foto Pekerjaan OP 2', // folder di Google Drive pemilik script
  SESSION_HOURS: 12,                   // lama login sebelum harus masuk lagi
  JUDUL: 'Monitoring Pekerjaan OP 2',
};

// Kolom tab Kegiatan (1 = A)
const K = { ID: 1, PAKET: 2, KATEGORI: 3, NAMA_PAKET: 4, NO: 5, NAMA: 6, LOKASI: 7, JENIS: 8, PANJANG: 9, TINGGI: 10, VOLUME: 11,
  PENGAWAS: 12, PERENCANA: 13, FISIK: 14, KEU: 15, KENDALA: 16, DEADLINE: 17, DIPERBARUI: 18, OLEH: 19 };
const K_COLS = 19;

// Kolom status dokumen di tab Dokumen (A = ID Kegiatan)
const DOCS = [
  { key: 'gambar_rencana', label: 'Gambar rencana', col: 3, role: 'PERENCANA' },
  { key: 'mc0', label: 'MC 0', col: 4, role: 'PERENCANA' },
  { key: 'as_built', label: 'As built', col: 5, role: 'PENGAWAS' },
  { key: 'mc100', label: 'MC 100 & laporan', col: 6, role: 'PENGAWAS' },
  { key: 'foto', label: 'Foto', col: 7, role: 'PENGAWAS' },
];
const ROLES = ['OPERATOR', 'PIC', 'ATASAN'];

/* ================= Web app ================= */

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(CONFIG.JUDUL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/* ================= API untuk web di Vercel ================= */

// Fungsi yang boleh dipanggil dari luar (web yang di-hosting di Vercel).
const API_FNS = { getLoginNames, login, logout, getData, saveRow, uploadPhoto };

/**
 * Web di Vercel memanggil script ini lewat POST dengan body JSON: { fn: 'getData', args: [...] }.
 * Balasan: { ok: hasil } atau { error: 'pesan' }.
 */
function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const f = API_FNS[req.fn];
    if (!f) throw new Error('Fungsi tidak dikenal.');
    out = { ok: f.apply(null, Array.isArray(req.args) ? req.args : []) };
  } catch (err) {
    out = { error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ================= Login ================= */

/** Daftar nama untuk layar masuk (tanpa PIN). */
function getLoginNames() {
  return readUsers_().filter(u => u.aktif).map(u => ({ nama: u.nama, peran: u.peran }));
}

function login(nama, pin) {
  const u = readUsers_().find(x => x.aktif && x.nama.toLowerCase() === String(nama || '').trim().toLowerCase());
  if (!u || String(u.pin) !== String(pin || '').trim()) {
    Utilities.sleep(800);
    throw new Error('Nama atau PIN salah.');
  }
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('s_' + token, JSON.stringify({ nama: u.nama, peran: u.peran }), CONFIG.SESSION_HOURS * 3600);
  log_(u.nama, '', '', 'Masuk');
  return { token, nama: u.nama, peran: u.peran };
}

function logout(token) {
  CacheService.getScriptCache().remove('s_' + token);
  return true;
}

function session_(token) {
  const raw = token && CacheService.getScriptCache().get('s_' + token);
  if (!raw) throw new Error('SESI_HABIS');
  const s = JSON.parse(raw);
  // pastikan pengguna masih aktif dan perannya terbaru
  const u = readUsers_().find(x => x.aktif && x.nama === s.nama);
  if (!u) throw new Error('SESI_HABIS');
  return { nama: u.nama, peran: u.peran };
}

/* ================= Baca data ================= */

function getData(token) {
  const me = session_(token);
  const kg = sheet_(CONFIG.TAB.KEGIATAN);
  const lastK = kg.getLastRow();
  const kv = lastK >= 2 ? kg.getRange(2, 1, lastK - 1, K_COLS).getValues() : [];
  const docs = readDocs_();
  let terakhir = null;
  const rows = [];
  kv.forEach(r => {
    const id = str_(r[K.ID - 1]);
    if (!id || !str_(r[K.NAMA - 1])) return;
    const dl = r[K.DEADLINE - 1];
    const upd = r[K.DIPERBARUI - 1];
    if (upd instanceof Date && (!terakhir || upd > terakhir)) terakhir = upd;
    rows.push({
      row: id,
      kategori: str_(r[K.KATEGORI - 1]),
      paket: str_(r[K.NAMA_PAKET - 1]),
      kegiatan: str_(r[K.NAMA - 1]),
      lokasi: str_(r[K.LOKASI - 1]),
      jenis: str_(r[K.JENIS - 1]),
      pengawas: str_(r[K.PENGAWAS - 1]),
      perencana: str_(r[K.PERENCANA - 1]),
      fisik: pct_(r[K.FISIK - 1]),
      keu: pct_(r[K.KEU - 1]),
      kendala: str_(r[K.KENDALA - 1]),
      dl: dl instanceof Date ? iso_(dl) : null,
      deadline: dl instanceof Date ? '' : str_(dl),
      docs: docs[id] || DOCS.reduce((o, d) => (o[d.key] = null, o), {}),
    });
  });
  return {
    me,
    update: terakhir ? 'Update terakhir ' + Utilities.formatDate(terakhir, tz_(), 'dd MMM yyyy') : 'Data dari Google Sheets',
    rows,
    foto: readFoto_(),
    docs: DOCS.map(d => ({ key: d.key, label: d.label, role: d.role })),
    at: new Date().toISOString(),
  };
}

function readDocs_() {
  const sh = sheet_(CONFIG.TAB.DOKUMEN);
  const last = sh.getLastRow();
  const out = {};
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, 7).getValues().forEach(r => {
    const id = str_(r[0]);
    if (!id) return;
    const o = {};
    DOCS.forEach(d => { const v = str_(r[d.col - 1]).toLowerCase(); o[d.key] = v === 'lengkap' ? 1 : v === 'belum' ? 0 : null; });
    out[id] = o;
  });
  return out;
}

function readFoto_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.TAB.FOTO);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues()
    .filter(r => r[4])
    .map(r => ({ at: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), row: str_(r[1]), kegiatan: str_(r[2]), ket: str_(r[3]), id: str_(r[4]), by: str_(r[6]) }))
    .reverse();
}

/* ================= Simpan ================= */

/**
 * id: ID Kegiatan (mis. "K012")
 * payload: { kegiatan, fisik, keu, kendala, docs:{key:'1'|'0'|''}, deadline:'2026-11-23'|'On Progres' }
 * Setiap peran hanya bisa mengubah kolom miliknya.
 */
function saveRow(token, id, payload) {
  const me = session_(token);
  if (me.peran === 'ATASAN') throw new Error('Akun atasan hanya bisa melihat.');
  payload = payload || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const kg = sheet_(CONFIG.TAB.KEGIATAN);
    const r = findRow_(kg, id);
    if (!r) throw new Error('Kegiatan ' + id + ' tidak ditemukan.');
    const cur = kg.getRange(r, 1, 1, K_COLS).getValues()[0];
    const nama = str_(cur[K.NAMA - 1]);
    if (nama !== str_(payload.kegiatan)) throw new Error('BARIS_BERUBAH');
    const isOp = me.peran === 'OPERATOR';
    const asPengawas = isOp || (me.peran === 'PIC' && sameName_(cur[K.PENGAWAS - 1], me.nama));
    const asPerencana = isOp || (me.peran === 'PIC' && sameName_(cur[K.PERENCANA - 1], me.nama));
    if (!asPengawas && !asPerencana) throw new Error('Kegiatan ini bukan tanggung jawab Anda.');

    const changes = [];
    let progresBerubah = false;
    const setPct = (col, label, v) => {
      if (v === undefined) return;
      const old = pct_(cur[col - 1]);
      if (v === '' || v === null) {
        if (old !== null) { kg.getRange(r, col).clearContent(); cur[col - 1] = ''; changes.push(label + ' dikosongkan'); progresBerubah = true; }
        return;
      }
      const n = Number(String(v).replace(',', '.'));
      if (!isFinite(n) || n < 0 || n > 100) throw new Error(label + ' harus angka 0 sampai 100.');
      if (old === null || Math.abs(old - n) > 1e-9) {
        kg.getRange(r, col).setValue(n / 100); cur[col - 1] = n / 100;
        changes.push(label + ' ' + (old === null ? '-' : fmtPct_(old)) + ' → ' + fmtPct_(n)); progresBerubah = true;
      }
    };
    const setText = (col, label, v) => {
      if (v === undefined) return;
      v = str_(v);
      if (str_(cur[col - 1]) !== v) { kg.getRange(r, col).setValue(v); changes.push(label + ' diubah'); }
    };

    if (asPengawas) { setPct(K.FISIK, 'Fisik', payload.fisik); setText(K.KENDALA, 'Kendala', payload.kendala); }
    if (isOp) {
      setPct(K.KEU, 'Keuangan', payload.keu);
      if (payload.deadline !== undefined && payload.deadline !== '') {
        const old = cur[K.DEADLINE - 1];
        const oldKey = old instanceof Date ? iso_(old) : str_(old);
        const m = String(payload.deadline).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const nv = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : 'On Progres';
        const newKey = m ? payload.deadline : 'On Progres';
        if (oldKey !== newKey) { kg.getRange(r, K.DEADLINE).setValue(nv); changes.push('Deadline → ' + (m ? Utilities.formatDate(nv, tz_(), 'dd MMM yyyy') : 'On Progres')); }
      }
    }

    // Status dokumen
    if (payload.docs) {
      const dk = sheet_(CONFIG.TAB.DOKUMEN);
      let dr = findRow_(dk, id);
      if (!dr) { dk.appendRow([id]); dr = dk.getLastRow(); }
      const dcur = dk.getRange(dr, 1, 1, 7).getValues()[0];
      DOCS.forEach(d => {
        const ok = d.role === 'PENGAWAS' ? asPengawas : asPerencana;
        const v = payload.docs[d.key];
        if (!ok || v === undefined) return;
        const nv = String(v) === '1' ? 'Lengkap' : String(v) === '0' ? 'Belum' : '';
        if (str_(dcur[d.col - 1]) !== nv) { dk.getRange(dr, d.col).setValue(nv); changes.push(d.label + ' → ' + (nv || 'kosong')); }
      });
    }

    if (changes.length) {
      const now = new Date();
      kg.getRange(r, K.DIPERBARUI, 1, 2).setValues([[now, me.nama]]);
      if (progresBerubah) {
        sheet_(CONFIG.TAB.RIWAYAT).appendRow([now, id, nama, cur[K.FISIK - 1], cur[K.KEU - 1], me.nama, 'Diperbarui lewat aplikasi']);
      }
      log_(me.nama, id, nama, changes.join('; '));
    }
    SpreadsheetApp.flush();
    return { ok: true, changes: changes.length };
  } finally {
    lock.releaseLock();
  }
}

/* ================= Foto ================= */

function uploadPhoto(token, id, kegiatan, dataUrl, ket) {
  const me = session_(token);
  if (me.peran === 'ATASAN') throw new Error('Akun atasan hanya bisa melihat.');
  const kg = sheet_(CONFIG.TAB.KEGIATAN);
  const r = findRow_(kg, id);
  if (!r) throw new Error('Kegiatan ' + id + ' tidak ditemukan.');
  const cur = kg.getRange(r, 1, 1, K_COLS).getValues()[0];
  if (str_(cur[K.NAMA - 1]) !== str_(kegiatan)) throw new Error('BARIS_BERUBAH');
  if (me.peran !== 'OPERATOR' && !sameName_(cur[K.PENGAWAS - 1], me.nama) && !sameName_(cur[K.PERENCANA - 1], me.nama)) {
    throw new Error('Kegiatan ini bukan tanggung jawab Anda.');
  }
  const m = String(dataUrl || '').match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new Error('Format foto tidak didukung. Pakai JPG atau PNG.');
  const bytes = Utilities.base64Decode(m[3]);
  if (bytes.length > 8 * 1024 * 1024) throw new Error('Foto terlalu besar (maks 8 MB).');
  const stamp = Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd-HHmmss');
  const blob = Utilities.newBlob(bytes, m[1], id + '-' + stamp + '.' + (m[2] === 'jpeg' ? 'jpg' : m[2]));
  const file = subFolder_(id, kegiatan).createFile(blob);
  file.setDescription((ket || '') + ' — oleh ' + me.nama);
  // Supaya foto bisa tampil di aplikasi untuk semua pengguna yang login.
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = 'https://drive.google.com/file/d/' + file.getId() + '/view';
  sheet_(CONFIG.TAB.FOTO).appendRow([new Date(), id, str_(kegiatan), str_(ket), file.getId(), url, me.nama]);
  log_(me.nama, id, kegiatan, 'Unggah foto' + (ket ? ': ' + ket : ''));
  return { id: file.getId() };
}

/* ================= Setup (jalankan sekali) ================= */

/** Memeriksa tab database dan membuat folder foto di Google Drive. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  const hilang = Object.values(CONFIG.TAB).filter(t => !ss.getSheetByName(t));
  if (hilang.length) throw new Error('Tab berikut tidak ditemukan: ' + hilang.join(', ') + '. Pastikan script dipasang di spreadsheet Database Monitoring OP 2.');
  const folder = rootFolder_();
  const n = readUsers_().length;
  ss.toast('Database siap. ' + n + ' pengguna aktif. Folder foto: ' + folder.getName(), 'Monitoring OP 2', 8);
  return 'OK';
}

/* ================= Bantuan ================= */

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Tab "' + name + '" tidak ditemukan.');
  return sh;
}
function findRow_(sh, id) {
  id = str_(id);
  if (!id || sh.getLastRow() < 2) return 0;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (str_(ids[i][0]) === id) return i + 2;
  return 0;
}
function readUsers_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.TAB.PENGGUNA);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getDisplayValues()
    .map(r => ({ nama: str_(r[0]), peran: str_(r[1]).toUpperCase(), pin: str_(r[2]), aktif: str_(r[3]).toUpperCase() !== 'TIDAK' }))
    .filter(u => u.nama && ROLES.indexOf(u.peran) >= 0 && u.pin);
}
function log_(oleh, id, kegiatan, isi) {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.TAB.LOG);
  if (sh) sh.appendRow([new Date(), oleh, id, kegiatan, isi]);
}
function str_(v) { return v == null ? '' : String(v).trim(); }
/** Nilai persen di sheet disimpan sebagai pecahan (0,85); aplikasi memakai 0–100. */
function pct_(v) {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace('%', '').replace(',', '.'));
  if (!isFinite(n)) return null;
  return typeof v === 'number' ? Math.round(n * 10000) / 100 : n;
}
function fmtPct_(n) { return (Math.round(n * 10) / 10) + '%'; }
function iso_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); }
function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone() || Session.getScriptTimeZone(); }
function sameName_(a, b) { return str_(a).toLowerCase() === str_(b).toLowerCase(); }
function safe_(s) { return String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function rootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const fid = props.getProperty('FOLDER_ID');
  if (fid) { try { return DriveApp.getFolderById(fid); } catch (e) {} }
  const f = DriveApp.createFolder(CONFIG.FOLDER_FOTO);
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}
function subFolder_(id, kegiatan) {
  const root = rootFolder_(), name = (id + ' ' + safe_(kegiatan)).slice(0, 100);
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}
