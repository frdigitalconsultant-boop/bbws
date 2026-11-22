/**
 * Monitoring Pekerjaan OP 2 — Web App (Google Apps Script)
 * ---------------------------------------------------------
 * Dipasang di spreadsheet "Pekerjaan OP 2 Tahun 2026".
 * Langkah pertama: jalankan fungsi setup() sekali dari editor Apps Script.
 */

const CONFIG = {
  TAB_DATA: 'INPUT DATA DISINI YAAAAAA',
  TAB_USER: 'Pengguna',
  TAB_FOTO: 'Foto',
  TAB_LOG: 'Log',
  FOLDER_FOTO: 'Foto Pekerjaan OP 2',   // folder di Google Drive pemilik script
  SESSION_HOURS: 12,                     // lama login sebelum harus masuk lagi
  JUDUL: 'Monitoring Pekerjaan OP 2',
};

// Kolom di tab data (1 = A)
const COL = { NO: 1, PAKET: 2, NOK: 3, KEGIATAN: 4, LOKASI: 5, KEU: 6, FISIK: 7, KENDALA: 8, PENGAWAS: 9, PERENCANA: 10,
  GAMBAR: 11, ASBUILT: 12, MC0: 13, MC100: 14, FOTO: 15, JENIS: 16, PANJANG: 17, TINGGI: 18, VOLUME: 19, DEADLINE: 20 };
const DOCS = [
  { key: 'gambar_rencana', label: 'Gambar rencana', col: COL.GAMBAR, role: 'PERENCANA' },
  { key: 'as_built', label: 'As built', col: COL.ASBUILT, role: 'PENGAWAS' },
  { key: 'mc0', label: 'MC 0', col: COL.MC0, role: 'PERENCANA' },
  { key: 'mc100', label: 'MC 100 & laporan', col: COL.MC100, role: 'PENGAWAS' },
  { key: 'foto', label: 'Foto', col: COL.FOTO, role: 'PENGAWAS' },
];
const ROLES = ['OPERATOR', 'PIC', 'ATASAN'];

/* ================= Web app ================= */

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(CONFIG.JUDUL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
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
  const sh = sheet_(CONFIG.TAB_DATA);
  const last = Math.max(sh.getLastRow(), 2);
  const vals = sh.getRange(1, 1, last, 20).getDisplayValues();
  const update = String(vals[0][5] || '').trim();
  let kategori = 'Penanganan Darurat', paket = '';
  const rows = [];
  for (let i = 2; i < vals.length; i++) {
    const r = vals[i];
    const c = k => String(r[k - 1] == null ? '' : r[k - 1]).trim();
    if (c(1) && !c(2) && !c(4) && c(1).length > 3) {
      kategori = c(1).toLowerCase().replace(/^pekerjaan\s+/, '').replace(/\b\w/g, x => x.toUpperCase());
      continue;
    }
    if (!c(COL.KEGIATAN)) continue;
    if (c(COL.PAKET)) paket = c(COL.PAKET);
    const docs = {};
    DOCS.forEach(d => { const v = c(d.col).toUpperCase(); docs[d.key] = v === 'COMPLETE' ? 1 : v === 'INCOMPLETE' ? 0 : null; });
    rows.push({
      row: i + 1, kategori, paket, kegiatan: c(COL.KEGIATAN), lokasi: c(COL.LOKASI),
      keu: num_(c(COL.KEU)), fisik: num_(c(COL.FISIK)), kendala: c(COL.KENDALA),
      pengawas: c(COL.PENGAWAS), perencana: c(COL.PERENCANA), docs,
      jenis: c(COL.JENIS), deadline: c(COL.DEADLINE),
    });
  }
  return { me, update, rows, foto: readFoto_(), docs: DOCS.map(d => ({ key: d.key, label: d.label, role: d.role })), at: new Date().toISOString() };
}

/* ================= Simpan ================= */

/**
 * payload: { kegiatan, fisik, keu, kendala, docs:{key:1|0|''}, deadline:'23 Nov 2026'|'On Progres', updateLabel:true }
 * Setiap peran hanya bisa mengubah kolom miliknya.
 */
function saveRow(token, row, payload) {
  const me = session_(token);
  if (me.peran === 'ATASAN') throw new Error('Akun atasan hanya bisa melihat.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(CONFIG.TAB_DATA);
    row = Number(row);
    if (!(row >= 3)) throw new Error('Baris tidak valid.');
    const cur = sh.getRange(row, 1, 1, 20).getDisplayValues()[0];
    const kegiatan = String(cur[COL.KEGIATAN - 1]).trim();
    if (kegiatan !== String(payload.kegiatan || '').trim()) throw new Error('BARIS_BERUBAH');
    const pengawas = String(cur[COL.PENGAWAS - 1]).trim(), perencana = String(cur[COL.PERENCANA - 1]).trim();
    const isOp = me.peran === 'OPERATOR';
    const asPengawas = isOp || (me.peran === 'PIC' && sameName_(pengawas, me.nama));
    const asPerencana = isOp || (me.peran === 'PIC' && sameName_(perencana, me.nama));
    if (!asPengawas && !asPerencana) throw new Error('Kegiatan ini bukan tanggung jawab Anda.');

    const changes = [];
    const setNum = (col, label, v) => {
      if (v === undefined) return;
      if (v === '' || v === null) { if (String(cur[col - 1]).trim() !== '') { sh.getRange(row, col).clearContent(); changes.push(label + ' dikosongkan'); } return; }
      const n = Number(String(v).replace(',', '.'));
      if (!isFinite(n) || n < 0 || n > 100) throw new Error(label + ' harus angka 0 sampai 100.');
      if (num_(cur[col - 1]) !== n) { sh.getRange(row, col).setValue(n); changes.push(label + ' ' + (cur[col - 1] || '-') + ' → ' + n); }
    };
    const setText = (col, label, v) => {
      if (v === undefined) return;
      v = String(v || '').trim();
      if (String(cur[col - 1]).trim() !== v) { const rg = sh.getRange(row, col); rg.setNumberFormat('@'); rg.setValue(v); changes.push(label + ' diubah'); }
    };

    if (asPengawas) { setNum(COL.FISIK, 'Fisik', payload.fisik); setText(COL.KENDALA, 'Kendala', payload.kendala); }
    if (isOp) { setNum(COL.KEU, 'Keuangan', payload.keu); if (payload.deadline !== undefined) setText(COL.DEADLINE, 'Deadline', payload.deadline); }
    DOCS.forEach(d => {
      const ok = d.role === 'PENGAWAS' ? asPengawas : asPerencana;
      if (!ok || !payload.docs || payload.docs[d.key] === undefined) return;
      const v = payload.docs[d.key] === 1 || payload.docs[d.key] === '1' ? 'COMPLETE' : payload.docs[d.key] === 0 || payload.docs[d.key] === '0' ? 'INCOMPLETE' : '';
      if (String(cur[d.col - 1]).trim().toUpperCase() !== v) { sh.getRange(row, d.col).setValue(v); changes.push(d.label + ' → ' + (v || 'kosong')); }
    });

    if (changes.length && payload.updateLabel !== false) {
      const rg = sh.getRange(1, 6); rg.setNumberFormat('@');
      rg.setValue('Update ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd') + ' ' + bulan_(new Date().getMonth()) + ' ' + new Date().getFullYear());
    }
    if (changes.length) log_(me.nama, row, kegiatan, changes.join('; '));
    SpreadsheetApp.flush();
    return { ok: true, changes: changes.length };
  } finally {
    lock.releaseLock();
  }
}

/* ================= Foto ================= */

function uploadPhoto(token, row, kegiatan, dataUrl, ket) {
  const me = session_(token);
  if (me.peran === 'ATASAN') throw new Error('Akun atasan hanya bisa melihat.');
  const sh = sheet_(CONFIG.TAB_DATA);
  const cur = sh.getRange(Number(row), 1, 1, 20).getDisplayValues()[0];
  if (String(cur[COL.KEGIATAN - 1]).trim() !== String(kegiatan || '').trim()) throw new Error('BARIS_BERUBAH');
  if (me.peran !== 'OPERATOR' && !sameName_(cur[COL.PENGAWAS - 1], me.nama) && !sameName_(cur[COL.PERENCANA - 1], me.nama)) throw new Error('Kegiatan ini bukan tanggung jawab Anda.');
  const m = String(dataUrl || '').match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new Error('Format foto tidak didukung. Pakai JPG atau PNG.');
  const bytes = Utilities.base64Decode(m[3]);
  if (bytes.length > 8 * 1024 * 1024) throw new Error('Foto terlalu besar (maks 8 MB).');
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  const blob = Utilities.newBlob(bytes, m[1], stamp + '-' + safe_(kegiatan).slice(0, 40) + '.' + (m[2] === 'jpeg' ? 'jpg' : m[2]));
  const folder = subFolder_(kegiatan);
  const file = folder.createFile(blob);
  file.setDescription((ket || '') + ' — oleh ' + me.nama);
  // Supaya foto bisa tampil di web app untuk semua pengguna yang login.
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const fs = sheet_(CONFIG.TAB_FOTO);
  fs.appendRow([new Date(), Number(row), kegiatan, String(ket || ''), file.getId(), me.nama]);
  log_(me.nama, row, kegiatan, 'Unggah foto' + (ket ? ': ' + ket : ''));
  return { id: file.getId() };
}

function readFoto_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.TAB_FOTO);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues()
    .filter(r => r[4])
    .map(r => ({ at: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), row: Number(r[1]), kegiatan: String(r[2]), ket: String(r[3]), id: String(r[4]), by: String(r[5]) }))
    .reverse();
}

/* ================= Setup (jalankan sekali) ================= */

/**
 * Membuat tab Pengguna, Foto, Log dan folder foto.
 * Nama PIC diambil otomatis dari kolom PIC pengawas & PIC perencana, masing-masing diberi PIN acak.
 */
function setup() {
  const ss = SpreadsheetApp.getActive();
  let us = ss.getSheetByName(CONFIG.TAB_USER);
  if (!us) {
    us = ss.insertSheet(CONFIG.TAB_USER);
    us.getRange(1, 1, 1, 5).setValues([['Nama', 'Peran', 'PIN', 'Aktif', 'Catatan']]).setFontWeight('bold');
    us.getRange('C:C').setNumberFormat('@');
    const data = sheet_(CONFIG.TAB_DATA).getDataRange().getDisplayValues();
    const seen = {};
    const rows = [['Operator', 'OPERATOR', pin_(), 'YA', 'Ganti nama sesuai operator'], ['Atasan', 'ATASAN', pin_(), 'YA', 'Untuk melihat laporan']];
    data.slice(2).forEach(r => {
      [[r[COL.PENGAWAS - 1], 'pengawas'], [r[COL.PERENCANA - 1], 'perencana']].forEach(([n, as]) => {
        n = String(n || '').trim();
        if (!n || n === '-' || /^OP\s*\d/i.test(n)) return;
        const k = n.toLowerCase();
        if (seen[k]) { if (seen[k].indexOf(as) < 0) seen[k].push(as); return; }
        seen[k] = [as];
        rows.push([n, 'PIC', pin_(), 'YA', seen[k]]);
      });
    });
    rows.forEach(r => { if (Array.isArray(r[4])) r[4] = 'PIC ' + r[4].join(' & '); });
    us.getRange(2, 1, rows.length, 5).setValues(rows);
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(ROLES, true).build();
    us.getRange(2, 2, 200, 1).setDataValidation(rule);
    us.getRange(2, 4, 200, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['YA', 'TIDAK'], true).build());
    us.setFrozenRows(1); us.autoResizeColumns(1, 5);
  }
  if (!ss.getSheetByName(CONFIG.TAB_FOTO)) {
    const f = ss.insertSheet(CONFIG.TAB_FOTO);
    f.getRange(1, 1, 1, 6).setValues([['Waktu', 'Baris', 'Kegiatan', 'Keterangan', 'File ID', 'Oleh']]).setFontWeight('bold'); f.setFrozenRows(1);
  }
  if (!ss.getSheetByName(CONFIG.TAB_LOG)) {
    const l = ss.insertSheet(CONFIG.TAB_LOG);
    l.getRange(1, 1, 1, 5).setValues([['Waktu', 'Oleh', 'Baris', 'Kegiatan', 'Perubahan']]).setFontWeight('bold'); l.setFrozenRows(1);
  }
  rootFolder_();
  SpreadsheetApp.getUi && SpreadsheetApp.getActive().toast('Setup selesai. Cek tab "Pengguna" untuk daftar PIN.', 'Monitoring OP 2', 8);
}

/* ================= Bantuan ================= */

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Tab "' + name + '" tidak ditemukan. Jalankan setup() dulu.');
  return sh;
}
function readUsers_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.TAB_USER);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getDisplayValues()
    .map(r => ({ nama: String(r[0]).trim(), peran: String(r[1]).trim().toUpperCase(), pin: String(r[2]).trim(), aktif: String(r[3]).trim().toUpperCase() !== 'TIDAK' }))
    .filter(u => u.nama && ROLES.indexOf(u.peran) >= 0 && u.pin);
}
function log_(oleh, row, kegiatan, isi) {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.TAB_LOG);
  if (sh) sh.appendRow([new Date(), oleh, row, kegiatan, isi]);
}
function num_(s) {
  let t = String(s == null ? '' : s).trim();
  if (t === '' || t === '-') return null;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, ''); else if (/^\d+,\d+$/.test(t)) t = t.replace(',', '.');
  const n = Number(t); return isFinite(n) ? n : null;
}
function sameName_(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }
function pin_() { return String(Math.floor(100000 + Math.random() * 900000)); }
function safe_(s) { return String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function bulan_(m) { return ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][m]; }
function rootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder(CONFIG.FOLDER_FOTO);
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}
function subFolder_(kegiatan) {
  const root = rootFolder_(), name = safe_(kegiatan).slice(0, 90) || 'Lainnya';
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}
