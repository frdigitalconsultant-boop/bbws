"""Buat index.html (versi Vercel) dari apps-script/Index.html.

Jalankan setiap kali apps-script/Index.html diubah:  python3 scripts/build-web.py
"""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
src = (root / 'apps-script' / 'Index.html').read_text(encoding='utf-8')
head_extra = (
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    '<meta name="theme-color" content="#0B5E45">\n'
    '<link rel="manifest" href="/manifest.webmanifest">\n'
    '<link rel="icon" type="image/png" href="/icons/icon-192.png">\n'
    '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">\n'
    '<meta name="apple-mobile-web-app-capable" content="yes">\n'
    '<meta name="apple-mobile-web-app-title" content="Monitoring OP 2">\n'
    '<script src="/config.js"></script>\n'
)
out = src.replace('<base target="_top">\n', '', 1).replace('<meta charset="utf-8">\n', '<meta charset="utf-8">\n' + head_extra, 1)
assert out != src, 'Struktur apps-script/Index.html berubah, periksa script ini.'
(root / 'index.html').write_text('<!-- Dibuat otomatis dari apps-script/Index.html oleh scripts/build-web.py. Jangan edit langsung. -->\n' + out, encoding='utf-8')
print('index.html diperbarui')
