# Offline-first: salinan lokal IndexedDB (Dexie) + outbox buatan sendiri

Aplikasi harus bisa dipakai tanpa koneksi. Seluruh koleksi disalin ke IndexedDB lewat Dexie, dan sampul disimpan di cache Service Worker. Setiap perubahan ditulis ke lokal terlebih dahulu, dimasukkan ke outbox, lalu dikirim ke API Next.js begitu koneksi kembali. Server memakai `updatedAt` untuk mengambil perubahan dari server. Kami memilih ini daripada sync engine (PowerSync, ElectricSQL, Zero, Replicache) karena hanya ada satu Pemilik dengan beberapa perangkat. Sync engine butuh layanan atau biaya tambahan dan menyulitkan deploy di Vercel free (ADR 0002).

## Consequences

- **Nomor Induk hanya diberikan server saat Sinkronisasi** (melengkapi ADR 0001). Eksemplar yang dibuat offline berstatus Menunggu Sinkron, belum bernomor, dan belum bisa dicetak Labelnya. Penomoran di perangkat dan pemesanan blok nomor per perangkat ditolak, karena keduanya bisa menghasilkan nomor bentrok atau urutan yang bolong.
- **Konflik diselesaikan per field: perubahan terakhir yang menang.** Kalau sebuah field ditimpa perubahan dari perangkat lain, muncul pemberitahuan. Tidak ada layar resolusi konflik manual.
- **Yang bisa dilakukan offline:** melihat koleksi, menambah Buku manual, mengedit Buku, Peminjaman, saran Kategori (Kategori dan Aturan Kategori ikut disalin ke perangkat), dan scan ISBN. Hasil scan disimpan sebagai draf "menunggu data", dan metadatanya dicari saat online.
- **Hanya bisa online:** mengelola Kategori, Aturan Kategori, Lokasi, dan Template Label, mencetak Label, Penyiangan, dan ekspor Buku Induk.
- **Sesi login yang kedaluwarsa tidak mengunci data lokal.** Data di perangkat yang pernah login tetap bisa dibuka dan diedit, dan Sinkronisasi menunggu sampai login ulang. Ada aksi "Keluar & hapus data di perangkat ini".
