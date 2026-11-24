# Kategori milik Pemilik terpisah dari Kelas DDC

Koleksi dikelompokkan berdasarkan Kategori yang ditentukan Pemilik (kode pendek seperti `FIK`, `AGM`), bukan langsung berdasarkan DDC. Kelas DDC hanya disimpan sebagai data bibliografis dan menjadi masukan Aturan Kategori. Alasannya: DDC menyebar fiksi ke banyak kelas (813, 823, 899.221, dst.), padahal rak rumah butuh kelompok sederhana seperti "Fiksi". Selain itu, sumber gratis sering tidak memberikan DDC untuk buku asli Indonesia (riset: docs/research/home-library-apps.md), dan caption resmi DDC berlisensi OCLC. Nomor Panggil juga memakai kode Kategori, bukan DDC.

## Consequences

- Eksemplar wajib berkategori sebelum disimpan, karena Nomor Induk memuat kode Kategori (ADR 0001). Saran Kategori diambil dari, berurutan: Aturan Kategori berbasis DDC, aturan kata kunci subjek, lalu Kategori Buku lain dengan pengarang atau seri yang sama. Kalau semuanya tidak menghasilkan saran, Pemilik memilih Kategori sendiri.
- Hanya sumber metadata gratis yang dipakai: Open Library (utama), Google Books, dan Library of Congress. Tidak ada layanan berbayar dan tidak ada scraping.
