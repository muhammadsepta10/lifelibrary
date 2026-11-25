# Pencarian lewat judul hanya cadangan saat ISBN tidak ditemukan; Pemilik memilih Kandidat

ISBN tetap jalur utama untuk mendapatkan data Buku. Kalau Pencarian Metadata ISBN menjawab "tidak ditemukan" (sumber bisa dihubungi, tetapi tidak satu pun punya ISBN itu), layar tinjau menawarkan **pencarian cadangan lewat judul**. Begitu Pemilik mengetik judul, aplikasi mencari ke Open Library dan Google Books. Begitu pengarang diisi, pencarian diulang dengan judul + pengarang. Hasilnya berupa daftar **Kandidat** yang dipilih Pemilik, tidak pernah diterapkan otomatis, walaupun hanya ada satu Kandidat yang sangat cocok.

Memilih Kandidat hanya mengisi field draf yang masih kosong. Isian Pemilik tidak pernah ditimpa. ISBN hasil scan tetap menjadi ISBN Buku, sedangkan ISBN milik Kandidat diabaikan. Kandidat hampir selalu edisi lain dari karya yang sama (terjemahan, cetakan lain, penerbit lain), jadi field yang terisi dari Kandidat ditandai "perlu dicek", terutama field milik edisi tertentu (penerbit, kota, tahun, halaman, edisi). Sampul Kandidat ikut dipakai karena Pemilik memilih sambil melihat sampulnya: sampul diunduh server dan disimpan dengan kunci ISBN hasil scan, sama seperti sampul dari pencarian ISBN.

## Consequences

- Pencarian cadangan tidak muncul kalau ISBN ditemukan, kalau semua sumber gagal dihubungi (pesannya tetap "coba lagi"), kalau perangkat offline atau login habis (draf tetap "menunggu data", ADR 0004), di halaman ubah Buku, dan di tambah manual tanpa ISBN.
- Sumber yang dipakai tetap sumber gratis (ADR 0003): Open Library dan Google Books. Library of Congress tidak dipakai untuk pencarian judul karena pencarian judul SRU-nya terlalu banyak hasil yang tidak relevan untuk buku rumah.
- Unduhan sampul Kandidat hanya menerima alamat dari host sampul yang dikenal (Open Library, Google Books), supaya endpoint itu tidak bisa dipakai mengambil alamat sembarang dari server.
- Untuk buku asli Indonesia, manfaatnya terbatas: ISBN yang tidak ada di Open Library dan Google Books biasanya juga tidak ketemu lewat judul. Fitur ini paling berguna untuk buku impor, terjemahan, dan ISBN yang tercatat salah di sumber.

## Considered Options

- **Langsung menerapkan Kandidat teratas:** ditolak. Satu judul bisa cocok dengan puluhan edisi atau buku lain, dan data yang salah masuk tanpa disadari Pemilik.
- **Menerapkan otomatis bila hanya ada satu Kandidat yang persis cocok:** ditolak demi konsistensi. Biaya satu ketukan kecil dibanding risiko edisi yang salah.
- **Memakai ISBN Kandidat:** ditolak. ISBN fisik yang di-scan adalah fakta tentang Eksemplar di tangan Pemilik, dan ISBN dipakai untuk mendeteksi Buku yang sama (ADR 0006).
- **Membaca foto sampul (vision/OCR):** ditunda, bukan ditolak. Akan dipertimbangkan terpisah.
