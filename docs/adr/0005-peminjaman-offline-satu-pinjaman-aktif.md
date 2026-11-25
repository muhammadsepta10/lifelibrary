# Peminjaman offline: satu pinjaman aktif per Eksemplar, dijaga server

Peminjaman dan pengembalian ditulis ke Perpustakaan Lokal lalu masuk outbox (ADR 0004), jadi bisa dilakukan tanpa koneksi. Aturan "Eksemplar yang sedang dipinjam tidak bisa dipinjamkan lagi" dijaga di dua tempat: di perangkat dari data lokal (supaya Pemilik langsung diberi tahu), dan di server dengan indeks unik parsial pada Peminjaman yang belum punya tanggal kembali (supaya dua perangkat yang berpacu hanya menghasilkan satu pinjaman aktif).

## Consequences

- **Eksemplar yang belum bernomor (Menunggu Sinkron) boleh dipinjamkan** di perangkat. Meminjam tidak butuh Nomor Induk; mutasi pinjam antre sesudah mutasi catat Eksemplarnya, jadi server memprosesnya berurutan. Label Barcode baru ada setelah tersinkron, jadi meminjam lewat scan hanya untuk Eksemplar yang sudah bernomor; lewat Koleksi tetap bisa untuk semuanya.
- **Perangkat yang kalah berpacu ditolak server.** Mutasinya menjadi Gagal terkirim dengan alasan "sedang dipinjam oleh …", dan Peminjaman lokal yang ditolak dibuang supaya salinan perangkat sama dengan server.
- **Penyiangan menolak Eksemplar yang sedang dipinjam** (lokal dan server); Eksemplar yang sudah keluar tidak bisa dipinjamkan. Server mengunci baris Eksemplar pada keduanya.
- **Terlambat dihitung dari tanggal hari ini di perangkat** (tanggal kalender lokal): terlambat bila jatuh tempo lebih awal dari hari ini. Tidak ada status terlambat yang disimpan, dan tidak ada denda.
- **Peminjam** hanya nama dan kontak, tanpa akun. Peminjam ikut terkirim di setiap mutasi pinjam supaya mutasi berdiri sendiri. Nama dan kontak, jatuh tempo, dan tanggal kembali diselesaikan per field, yang terakhir menang.
