# lifelibrary

Pengelola perpustakaan pribadi di rumah: mencatat koleksi buku ala perpustakaan, lengkap dengan penomoran, kategori, dan peminjaman.

## Language

### Koleksi

**Pemilik**:
Satu-satunya orang yang mengelola koleksi. Satu Pemilik, satu koleksi.
_Hindari_: admin, user, pustakawan

**Buku**:
Data bibliografis sebuah terbitan (judul, pengarang, penerbit, tahun, ISBN kalau ada). Satu Buku bisa punya banyak Eksemplar.
_Hindari_: judul, title, record

**Eksemplar**:
Satu fisik Buku milik Pemilik, dengan data penerimaannya sendiri: tanggal masuk, asal (beli/hadiah/lainnya), harga, kondisi.
_Hindari_: copy, item, kopi

**Lokasi**:
Tempat fisik yang didefinisikan Pemilik untuk menyimpan Eksemplar (misalnya "Rak A, susun 2"). Setiap Eksemplar berada di paling banyak satu Lokasi.
_Hindari_: rak, posisi, shelf

**Penyiangan**:
Pengeluaran Eksemplar dari koleksi aktif (hilang, rusak, dihibahkan, dijual), lengkap dengan tanggal dan alasannya. Eksemplar tidak dihapus dan Nomor Induknya tidak dipakai ulang.
_Hindari_: hapus, delete, weeding

**Kontributor**:
Orang yang berperan dalam sebuah Buku, dengan peran pengarang, penerjemah, atau editor. Satu Buku bisa punya banyak Kontributor; salah satunya Pengarang Utama.
_Hindari_: author (untuk semua peran), penulis

**Pengarang Utama**:
Kontributor yang namanya dipakai untuk Nomor Panggil.
_Hindari_: main author

**Sesi Penerimaan**:
Rangkaian pencatatan Eksemplar beruntun yang berbagi tanggal masuk, asal, dan Lokasi yang sama (misalnya belanja 10 buku sekaligus, atau input koleksi lama).
_Hindari_: batch, bulk input

### Metadata

**Pencarian Metadata ISBN**:
Pencarian data Buku ke sumber gratis (Open Library, Google Books, Library of Congress) memakai ISBN hasil scan; jalur utama untuk melengkapi draf Buku. Menjawab "tidak ditemukan" bila sumber bisa dihubungi tetapi tidak satu pun punya ISBN itu.
_Hindari_: lookup, fetch metadata, auto-fill

**Kandidat**:
Satu hasil pencarian cadangan lewat judul yang bisa dipilih Pemilik untuk melengkapi draf Buku. Tidak pernah diterapkan otomatis; memilihnya hanya mengisi field draf yang masih kosong dan menandainya "perlu dicek".
_Hindari_: suggestion, match

### Kategorisasi

**Kategori**:
Pengelompokan koleksi yang ditentukan Pemilik, masing-masing dengan kode pendek (misalnya `FIK`, `AGM`) dan warna. Kategori dipakai untuk Nomor Induk, Nomor Panggil, dan penataan rak. Setiap Eksemplar wajib berkategori sebelum disimpan.
_Hindari_: genre, rak, klasifikasi

**Kelas DDC**:
Nomor klasifikasi Dewey sebuah Buku (misalnya `155.24`), diketahui dari sumber metadata atau KDT. Data bibliografis, bukan Kategori.
_Hindari_: kategori DDC, call number

**Aturan Kategori**:
Aturan milik Pemilik yang memetakan Kelas DDC atau subjek ke sebuah Kategori, dipakai untuk menyarankan Kategori secara otomatis.
_Hindari_: mapping, rule

**KDT**:
Katalog Dalam Terbitan: blok data katalog yang tercetak di balik halaman judul buku Indonesia, sering memuat Kelas DDC.
_Hindari_: CIP

### Penomoran

**Nomor Induk**:
Nomor identitas unik dan permanen sebuah Eksemplar, diberikan saat Eksemplar pertama kali tersinkron ke server, berformat kode Kategori saat dicatat, nomor urut, dan tahun pencatatan (misalnya `FIK-001/2026`).
_Hindari_: nomor buku, ID, kode

**Nomor Panggil**:
Kode yang menentukan letak Eksemplar di rak, disusun dari kategori, pengarang, dan judul (misalnya `FIK / TER / l`); boleh berubah kalau kategori dikoreksi.
_Hindari_: call number, label rak

**Label**:
Sepasang stiker cetak untuk satu Eksemplar, dipisah dengan menggunting: Label Punggung dan Label Barcode.
_Hindari_: stiker, tag

**Label Punggung**:
Bagian Label yang ditempel di punggung buku, berisi pita warna Kategori dan Nomor Panggil.
_Hindari_: spine label

**Label Barcode**:
Bagian Label yang ditempel di sampul belakang atau halaman dalam, berisi barcode Nomor Induk; di-scan untuk mengenali Eksemplar, misalnya saat Peminjaman.
_Hindari_: barcode buku, stiker ISBN

**Template Label**:
Tata letak lembar Label: ukuran kertas, jumlah kolom dan baris, ukuran Label, dan margin.
_Hindari_: layout cetak

**Antrean Cetak**:
Daftar Eksemplar yang Labelnya belum dicetak.
_Hindari_: print queue

**Buku Induk**:
Daftar seluruh Eksemplar yang pernah dicatat, diurutkan menurut Nomor Induk, termasuk yang sudah melalui Penyiangan.
_Hindari_: inventaris, register

### Sinkronisasi

**Sinkronisasi**:
Pengiriman perubahan yang tersimpan di perangkat ke server, dan pengambilan perubahan dari perangkat lain.
_Hindari_: sync, upload, backup

**Menunggu Sinkron**:
Keadaan sebuah perubahan atau Eksemplar yang baru tersimpan di perangkat dan belum diterima server; Eksemplar dalam keadaan ini belum punya Nomor Induk.
_Hindari_: pending, draft, offline item

### Peminjaman

**Peminjaman**:
Catatan satu Eksemplar yang dipinjamkan ke seorang Peminjam: tanggal pinjam, jatuh tempo, tanggal kembali. Tanpa denda.
_Hindari_: sirkulasi, loan

**Peminjam**:
Orang di luar sistem (teman, keluarga) yang meminjam Eksemplar; cukup nama dan kontak, tanpa akun.
_Hindari_: member, anggota, user
