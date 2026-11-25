# ISBN sama dari dua perangkat menempel ke Buku yang ada; perubahan yang ditolak bisa dibuang

Dua perangkat offline bisa sama-sama menambah Buku baru dengan ISBN-13 yang sama. Perangkat yang tiba kedua tidak boleh berakhir dengan Buku yang ditolak dan Eksemplar yang tertinggal "——" selamanya (Eksemplar bergantung pada Buku yang tidak pernah ada di server). Server mengambil keputusan: **`buku.tambah` yang ISBN-13-nya sudah dimiliki Buku lain diterima, tetapi Buku kedua tidak dibuat.** Hasilnya membawa `bukuId` (id Buku yang berlaku di server), server mencatat id lokal itu sebagai alias (tabel `buku_alias`), dan mutasi berikutnya yang masih memakai id lokal (`eksemplar.catat`, `buku.ubah`, termasuk yang sudah ada di batch yang sama) dialihkan ke Buku yang ada. Eksemplar perangkat kedua mendapat Nomor Induk seperti biasa dan menempel pada Buku yang sama. Data bibliografis dari Buku kedua yang tidak dibuat dibuang: Buku yang sudah ada di server yang berlaku.

Perangkat, saat menerima hasil itu, mengalihkan Eksemplar lokal dan mutasi yang menunggu ke id Buku server, lalu menghapus Buku lokal yang digantikan begitu Buku server tiba lewat pull.

## Perubahan lain yang ditolak permanen: Buang

Penolakan lain tetap menjadi Gagal terkirim (ADR 0004, "Coba lagi"). Karena sebagian tidak akan pernah berhasil, halaman Sinkronisasi punya aksi **Buang** untuk perubahan yang Gagal terkirim. Membuang perubahan juga membuang yang bergantung padanya: Buku baru yang ditolak membawa Eksemplarnya, perubahan atas Eksemplar itu, dan Peminjamannya. Baris lokal yang dibuat perubahan-perubahan itu dihapus, jadi perangkat kembali sama dengan server. Untuk perubahan edit (Buku, Eksemplar, Koreksi Kategori, Peminjaman), kursor pull dilupakan sehingga Sinkronisasi berikutnya menarik ulang data server dan menimpa nilai lokal yang tadinya dipertahankan. Teks konfirmasi menyebut semua perubahan yang ikut hilang. Hanya yang Gagal terkirim yang bisa dibuang.

## Considered Options

- **Hanya alur Buang untuk ISBN kembar:** paling sederhana di server, tetapi Pemilik harus mengetik ulang Eksemplar fisik yang sudah dicatatnya pada Buku yang ada. Ditolak karena data penerimaan Eksemplar (tanggal masuk, harga, kondisi, Lokasi) ikut hilang.
- **Menggabungkan field Buku kedua ke Buku yang ada:** ditolak karena menimpa data yang sudah ada tanpa sepengetahuan Pemilik, dan konflik per field (ADR 0004) sudah menyelesaikan edit sesudahnya.
- **Perangkat menulis ulang id Buku sebelum kirim:** tidak cukup, karena perangkat tidak tahu ISBN itu sudah dimiliki Buku di server sampai push dijawab; mutasi Eksemplar pada batch yang sama sudah terkirim dengan id lokal.
