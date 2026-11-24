# Riset: Arah UI/UX lifelibrary

Tanggal riset: 2026-11-24. Dokumen ini memakai istilah dari `GLOSSARY.md` dan menghormati ADR 0001–0003. Semua klaim eksternal disertai URL sumber primer (dokumentasi resmi, panduan desain, spesifikasi). Bagian "Rekomendasi" adalah sintesis penulis, bukan kutipan.

> **Keputusan visual (2026-11-24): variant B "Rak Sampul" dipilih** dari prototipe `prototype/ui-visual.prototype.html`. Struktur yang dipakai:
> - Beranda punya header hijau tua dengan rak punggung buku, chip status, dan grid sampul.
> - Navigasi berupa pil mengambang dengan FAB scan oranye di tengah.
> - Kamera scan layar penuh, dan hasil scan muncul sebagai kartu yang menumpuk di atasnya.
> - Detail Buku memakai sampul sebagai hero, dan Eksemplar tampil sebagai kartu tiket yang digeser ke samping.
>
> Font Literata + Inter + JetBrains Mono. Kalau bentrok dengan rekomendasi palet/IA di bawah, variant B yang berlaku.
>
> **Keputusan Label (2026-11-24): desain B "Pasangan" dipilih** dari prototipe `prototype/label.prototype.html`.
> - Satu sel berukuran 66×26 mm, 3×11 = 33 sel per A4, dan dipisah dengan garis gunting menjadi dua stiker:
>   - **Label Punggung** (17 mm): pita warna Kategori dan Nomor Panggil 3 baris
>   - **Label Barcode**: barcode Code 128 berisi Nomor Induk, ditambah judul
> - Konsekuensinya:
>   - Setiap Kategori punya warna.
>   - Pemindai di aplikasi harus mengenali `code_128` (Nomor Induk), selain `ean_13` (ISBN).
>   - Preset Template Label default 66×26 mm, dan akan disesuaikan setelah kertas stiker milik Pemilik diukur.

Catatan sumber: halaman Material Design 2 dan sebagian dokumentasi BookBuddy/StoryGraph hanya bisa dibaca sebagian (halaman berbasis JavaScript, atau info hanya ada di forum). Klaim dari sumber semacam itu ditandai *(sebagian)*.

---

## 1. Pelajaran dari aplikasi yang sudah ada

| App | Yang patut ditiru | Yang membuat ruwet / tidak cocok |
|---|---|---|
| **Libib** | Satu input yang menerima ISBN dari scanner USB *atau* ketikan, langsung lookup ([Add Items](https://support.libib.com/libib/website/add-items.html)). Di mobile: tombol **+** → pilih Barcode atau Manual Entry; field ISBN ada di atas kamera sebagai fallback ([Items, mobile](https://support.libib.com/libib/mobile-app/library/items.html)). Copies dikelola di tab terpisah pada halaman item ([Item Overview](https://support.libib.com/libib/website/library/item-overview.html)). Daftar checkout menandai terlambat dengan latar merah muda, aksi Check In/Renew di menu "…" ([Checkouts](https://support.libib.com/libib/mobile-app/lending/checkouts.html)). | Halaman item mencampur Edit, Details pribadi, Move, Delete, Flag. Copies tersembunyi di tab pojok kanan bawah. Tidak ada mode scan beruntun yang eksplisit. |
| **LibraryThing (app)** | Scanner tetap terbuka untuk banyak buku; tombol **Review** di pojok menampilkan semua hasil scan termasuk pemberitahuan eksemplar duplikat; tombol **Light** untuk flash ([blog LT 2015](https://blog.librarything.com/2015/10/librarything-app/)). Pola ini cocok untuk Sesi Penerimaan. | Daftar koleksi hanya berbasis teks; scanner hanya untuk menambah, tidak untuk mencari (dari komentar staf di blog yang sama). |
| **Goodreads** | Ikon kamera langsung di samping kolom cari; hasil muncul di bawah layar tanpa meninggalkan kamera *(sebagian, forum resmi)* ([help forum](https://help.goodreads.com/s/question/0D51H00005sx51WSAQ/how-do-i-scan-a-book-to-see-if-it-is-in-my-books)). | Scanner tidak lagi memberi tahu buku sudah dimiliki; tidak mendukung scanner Bluetooth; ISBN yang tidak ada di database = jalan buntu ([forum](https://help.goodreads.com/s/question/0D51H00005wYT2TSAW/im-trying-to-scan-a-books-barcode-but-the-app-is-not-recognizing-it-but-the-book-is-in-goodreads-database-how-can-i-make-the-scanner-read-the-barcode-is-there-a-way)). Pelajaran: cek duplikat dan jalur manual itu wajib. |
| **BookWyrm** | Urutan pencarian: lokal dulu, lalu katalog luar (OpenLibrary, Inventaire) dengan tombol "Import book", baru form manual sebagai jalan terakhir ([Adding Books](https://docs.joinbookwyrm.com/adding-books.html)). | Fokus sosial (rak baca, ulasan), tidak relevan untuk inventaris fisik. |
| **StoryGraph** | Scanner ada di bagian Owned Books; ketik ISBN manual memperbaiki salah baca *(sebagian, roadmap publik)* ([roadmap](https://roadmap.thestorygraph.com/features/posts/barcode-scanning)). | Hasil scan tidak bisa langsung masuk rak/tag. Staf menyebut buku harus sangat dekat ke kamera. |
| **BookBuddy** | "Powerful barcode scanner", melacak buku dipinjam/dipinjamkan ([kimicoapps.com](https://www.kimicoapps.com/bookbuddy)). | Halaman produk tidak merinci tampilan; tidak bisa dijadikan acuan detail. |
| **SLiMS** | Pemisahan biblio vs item dan modul barcode sudah akrab bagi pustakawan Indonesia (lihat `home-library-apps.md` §4). | Antarmuka admin padat form dan tab; terlalu "kantor" untuk rumah. |

Literal.club dan TinyCat tidak bisa diverifikasi dari sumber primer saat riset (TinyCat 403), jadi tidak dijadikan acuan.

**Kesimpulan:** pola terbaik = (1) satu input ISBN yang juga menerima scanner USB, (2) kamera tetap terbuka dengan daftar hasil yang bisa ditinjau, (3) cek duplikat sebelum simpan, (4) form manual sebagai jalan keluar yang selalu terlihat, (5) Eksemplar sebagai daftar yang jelas di halaman Buku, bukan tab tersembunyi.

---

## 2. Praktik terbaik UX scan barcode

**Viewfinder dan bidang scan.** Dynamsoft menyarankan memproses hanya *Region of Interest* yang lebih kecil dan menampilkan "on-screen target" untuk mengarahkan posisi barcode ([Dynamsoft](https://www.dynamsoft.com/blog/insights/browser-barcode-scanning-challenges-best-practices/)). Material Design memakai "barcode frame" yang batasnya berubah dari transparan ke solid saat terdeteksi, dan memberi isyarat "dekatkan" bila barcode terlalu kecil *(sebagian)* ([Material: Barcode scanning](https://m2.material.io/design/machine-learning/barcode-scanning.html)); aplikasi showcase ML Kit menerapkan reticle yang ukurannya proporsional terhadap preview dan cek ukuran barcode ("move closer") ([ML Kit material-showcase](https://github.com/googlesamples/mlkit/tree/master/android/material-showcase)).

**Batasi format.** ML Kit menyebut membatasi format barcode mempercepat deteksi ([ML Kit](https://developers.google.com/ml-kit/vision/barcode-scanning)). Untuk lifelibrary: hanya EAN-13 berprefix 978/979.

**Umpan balik.** Berikan umpan balik visual dan suara segera, misalnya overlay hijau dan bunyi beep ([Dynamsoft](https://www.dynamsoft.com/blog/insights/browser-barcode-scanning-challenges-best-practices/)). Apple HIG: gabungkan warna, teks, suara, dan haptik agar umpan balik tetap sampai saat perangkat dibisukan atau dipakai dengan VoiceOver ([HIG Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback)). Di web, `navigator.vibrate()` berstatus *limited availability*, butuh aktivasi pengguna, dan diabaikan diam-diam bila tidak didukung ([MDN vibrate](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate)). Jadi getar hanya bonus; layar berkedip + bunyi + teks adalah yang utama.

**Scan beruntun vs tunggal.** Scandit: mode tunggal lebih terkendali dan hemat baterai; mode beruntun cocok untuk volume tinggi. Gunakan state error berbeda untuk kasus berbeda (barang salah, duplikat), dan untuk penolakan yang tidak perlu menghentikan alur, set jeda lanjut ke 0 ([Scandit SparkScan advanced](https://docs.scandit.com/sdks/web/sparkscan/advanced/)). Timeout error panjang (>10 detik) memaksa interaksi; pendek (<2 detik) hanya jeda singkat (sumber sama).

**Fallback.** Selalu sediakan alternatif saat kamera gagal (cahaya, barcode rusak, izin ditolak), termasuk unggah foto ([Dynamsoft](https://www.dynamsoft.com/blog/insights/browser-barcode-scanning-challenges-best-practices/)). Libib dan Goodreads sama-sama mengandalkan ketik ISBN/judul sebagai jalan keluar (lihat §1).

**Izin kamera di web.** `getUserMedia` hanya di secure context; error yang perlu ditangani: `NotAllowedError` (ditolak), `NotFoundError` (tidak ada kamera), `NotReadableError` (dipakai aplikasi lain/OS), `OverconstrainedError`. Pakai `facingMode: "environment"` tanpa `exact` agar laptop tanpa kamera belakang tetap jalan. Bila pengguna mengabaikan prompt, promise bisa tidak pernah selesai ([MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)), jadi tampilkan tombol "Ketik ISBN" sejak awal, jangan menunggu.

**PWA di iOS.** Laporan bug WebKit menunjukkan perilaku kamera di mode standalone (Add to Home Screen) berbeda dari Safari: prompt izin berulang dan tidak tersimpan antarsesi ([WebKit 215884](https://bugs.webkit.org/show_bug.cgi?id=215884)), stream ter-mute saat `history.pushState` ([WebKit 212040](https://bugs.webkit.org/show_bug.cgi?id=212040)), kamera membeku di iOS 17.5.1 ([WebKit 275527](https://bugs.webkit.org/show_bug.cgi?id=275527)). Ini laporan pengguna, bukan dokumentasi Apple, jadi status terkini harus diuji di perangkat. Implikasi desain: halaman scan jangan mengganti route selama kamera aktif (pakai state lokal, bukan navigasi), dan siapkan pesan "izinkan kamera lagi" yang ramah.

---

## 3. Panduan desain yang relevan

- **Navigasi bawah.** Tab bar untuk navigasi, bukan aksi; selalu terlihat; label satu kata; hindari tab "More" otomatis; jangan sembunyikan/menonaktifkan tab, jelaskan bila kosong; untuk struktur kompleks pertimbangkan sidebar ([HIG Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)). NN/g: tab bar cocok untuk sedikit opsi; lebih dari 5 sulit muat dengan target sentuh optimal; ikon berlabel adalah praktik terbaik; menu hamburger paling tidak terlihat ([NN/g Mobile Navigation](https://www.nngroup.com/articles/mobile-navigation-patterns/)).
- **Tombol.** Area sentuh minimal 44×44 pt; maksimal satu–dua tombol menonjol per tampilan; bedakan pilihan utama dengan gaya, bukan ukuran; selalu ada press state ([HIG Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)).
- **Target sentuh WCAG 2.2.** 2.5.8 (AA) minimal 24×24 CSS px; 2.5.5 (AAA) 44×44, disarankan untuk kontrol penting ([WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)). Kontras komponen UI (batas input, ikon) minimal 3:1 ([WCAG 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)); teks 4.5:1 (WCAG 1.4.3).
- **Progressive disclosure.** Tampilkan yang sering dipakai, tunda yang jarang; batas dua level; kontrol menuju level kedua harus jelas labelnya ([NN/g](https://www.nngroup.com/articles/progressive-disclosure/)). Cocok untuk Draf Buku: field inti terlihat, detail bibliografis (Kelas DDC, KDT, penerbit, kota) di "Detail lainnya".
- **Empty state.** Jangan biarkan layar kosong total; jelaskan isi area dan beri tombol langsung untuk mengisinya; bedakan "memuat" dari "kosong" ([NN/g Empty States](https://www.nngroup.com/articles/empty-state-interface-design/)).
- **Pesan error.** Dekat sumber masalah; jangan hanya warna; bahasa jelas tanpa kode; tawarkan solusi; jangan menyalahkan ("tidak valid"); pertahankan input pengguna ([NN/g Error Messages](https://www.nngroup.com/articles/error-message-guidelines/)).
- **Loading.** Tampilkan sesuatu secepatnya (placeholder), biarkan pengguna melakukan hal lain sambil menunggu ([HIG Loading](https://developer.apple.com/design/human-interface-guidelines/loading)).

### 3.1 Offline-first (ADR 0004)

Keputusan final (ADR 0004, istilah **Sinkronisasi** dan **Menunggu Sinkron** di glosarium):
- Seluruh koleksi disalin ke IndexedDB (Dexie); setiap perubahan ditulis lokal dulu, masuk outbox, lalu dikirim saat online.
- **Nomor Induk hanya diberikan server saat Sinkronisasi.** Eksemplar yang dibuat offline berstatus Menunggu Sinkron, belum bernomor, dan Labelnya belum bisa dicetak.
- **Bisa offline:** melihat Koleksi, menambah Buku manual, mengedit Buku, Peminjaman, saran Kategori (Kategori dan Aturan Kategori ikut disalin), dan scan ISBN. Hasil scan offline disimpan sebagai draf **"menunggu data"**; metadatanya dicari begitu online.
- **Hanya online:** mengelola Kategori, Aturan Kategori, Lokasi, dan Template Label; mencetak Label; Penyiangan; ekspor Buku Induk.
- **Konflik per field, perubahan terakhir menang.** Bila sebuah field ditimpa perubahan dari perangkat lain, Pemilik mendapat pemberitahuan kecil. Tidak ada layar resolusi konflik manual.
- **Sesi login kedaluwarsa tidak mengunci data lokal**; Sinkronisasi menunggu sampai login ulang. Ada aksi **"Keluar & hapus data di perangkat ini"**.

Panduan dari sumber primer:

- **Beri tahu perubahan status secepatnya**, jelaskan apa yang masih bisa dilakukan, dan beri tahu pengguna "status data mereka" (sudah tersinkron atau belum); antrekan tugas untuk disinkron nanti; jangan blok UI dengan modal loading layar penuh; jangan pakai warna saja (abu-abu bisa disangka fitur mati), gabungkan teks, ikon, warna ([web.dev Offline UX](https://web.dev/articles/offline-ux-design-guidelines)).
- **`navigator.onLine` tidak andal**: `true` bisa berarti hanya terhubung LAN. MDN: "you should not disable features based on the online status, only provide hints" ([MDN onLine](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine)). Implikasi untuk aksi "hanya online": saat tampak offline, tombolnya tetap terlihat dengan keterangan kecil `wifi-off` "Butuh koneksi"; bila ditekan, aksi dicoba, dan bila request gagal muncul pesan "Belum tersambung. Coba lagi saat online." Jangan disembunyikan, jangan di-`disabled` permanen. Status sebenarnya ditentukan dari berhasil/gagalnya request.
- **Background Sync API** berstatus *limited availability*, bukan Baseline ([MDN Background Sync](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)). Jadi outbox harus juga diproses dari halaman saat event `online`, saat app dibuka/kembali ke foreground, plus tombol "Sinkronkan sekarang".
- **Penyimpanan lokal**: IndexedDB untuk data terstruktur; kuota dibagi per origin; minta `navigator.storage.persist()` agar data tidak dihapus otomatis (Chromium memutuskan dengan heuristik, instalasi PWA membantu) ([web.dev offline data](https://web.dev/learn/pwa/offline-data)).
- **Tingkat umpan balik**: status pasif cukup ditampilkan di dekat item (HIG mencontohkan status di toolbar Mail); peringatan kehilangan data harus menginterupsi lewat alert ([HIG Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback)). Snackbar untuk pesan singkat dengan maksimal satu aksi, bukan untuk info kritis ([M3 Snackbar](https://m3.material.io/components/snackbar/guidelines)).

**Catatan (sudah diputuskan):** tahun pada Nomor Induk diambil dari waktu Eksemplar dicatat di perangkat, bukan waktu server menerimanya. Contoh: Eksemplar dibuat offline 31 Desember 2026 dan tersinkron 2 Januari 2027 tetap bernomor `…/2026` (lihat ADR 0001). UI cukup menampilkan nomor dari server apa adanya.

---

## 4. Rekomendasi: arsitektur informasi

**Mobile — bottom nav 5 tab** (ikon Lucide + label satu kata):

| Tab | Isi | Ikon |
|---|---|---|
| **Beranda** | Ringkasan, aksi cepat, pengingat jatuh tempo, status Sinkronisasi | `house` |
| **Koleksi** | Cari/jelajah Buku, filter Kategori/Lokasi/status | `library` |
| **Tambah** (tengah, sedikit menonjol) | Halaman Sesi Penerimaan: scan, ketik ISBN, atau isi manual | `scan-barcode` |
| **Pinjam** | Peminjaman aktif, terlambat, riwayat | `hand-helping` / `book-up` |
| **Lainnya** | Antrean Cetak, Kategori & Aturan, Lokasi, Buku Induk, Sinkronisasi, Pengaturan | `menu` |

"Tambah" adalah tujuan (halaman), bukan aksi sekali tekan, sehingga tetap sesuai HIG yang melarang tab untuk aksi. "Lainnya" adalah halaman daftar biasa yang dirancang sendiri, bukan overflow otomatis; ini kompromi sadar karena 9 tujuan tidak muat dalam batas 5 tab NN/g. Badge kecil: angka terlambat di **Pinjam**, angka item belum tersinkron di **Lainnya** (HIG: badge untuk informasi penting).

**Desktop (≥1024 px) — sidebar kiri** permanen dengan semua tujuan dalam dua grup: *Koleksi* (Beranda, Koleksi, Tambah, Peminjaman) dan *Pengelolaan* (Antrean Cetak, Kategori, Lokasi, Buku Induk, Sinkronisasi, Pengaturan). HIG menyarankan sidebar untuk struktur kompleks. Input "Scan atau ketik ISBN" juga ada di header desktop agar scanner USB bisa dipakai dari halaman mana pun.

**Route** (Next.js App Router): `/`, `/koleksi`, `/koleksi/[bukuId]`, `/tambah`, `/tambah/draf/[id]`, `/peminjaman`, `/cetak`, `/kategori`, `/lokasi`, `/buku-induk`, `/sinkron`, `/pengaturan`.

---

## 5. Spesifikasi per layar

**Komponen global offline** (berlaku di semua layar):
- **Indikator koneksi**: saat offline, strip tipis di bawah header (bukan modal), ikon `cloud-off` + teks "Offline — perubahan disimpan di perangkat ini". Saat kembali online: snackbar "Tersambung lagi. Mengirim 3 perubahan…" lalu hilang. Saat online normal tidak ada indikator (hindari noise).
- **Badge per item "Menunggu Sinkron"**: chip ungu lembut dengan ikon `clock-arrow-up` + teks (tidak hanya warna). Muncul di kartu Buku, baris Eksemplar, baris Peminjaman, dan draf. Eksemplar Menunggu Sinkron menampilkan "——" di tempat Nomor Induk.
- **Error Sinkronisasi** (gagal kirim, bukan konflik): chip merah `alert-triangle` "Gagal terkirim" pada item + kartu di Beranda; detail dan "Coba lagi" di halaman Sinkronisasi.
- **Pemberitahuan field ditimpa** (konflik, ADR 0004): snackbar singkat tanpa interupsi, satu aksi: "Penerbit di *Laut Bercerita* diperbarui dari perangkat lain. [Lihat]". Juga dicatat di "Perubahan dari perangkat lain" pada halaman Sinkronisasi. Tidak ada dialog pilih versi.
- **Sesi kedaluwarsa**: strip kuning "Sesi login berakhir. Data tetap bisa dipakai; masuk lagi untuk Sinkronisasi. [Masuk]". Tidak memblokir layar.
- **Aksi hanya online** (Kelola Kategori/Aturan Kategori/Lokasi/Template Label, Cetak Label, Penyiangan, Ekspor Buku Induk): tetap tampil, dengan keterangan "Butuh koneksi" saat tampak offline (lihat §3.1).

### Beranda
- Sapaan singkat + jumlah: Buku, Eksemplar aktif, sedang dipinjam.
- Kartu yang hanya tampil bila relevan (progressive disclosure): "2 pinjaman terlambat" (tombol ke Pinjam), "8 Label siap dicetak" (ke Antrean Cetak), "3 perubahan Menunggu Sinkron" / "1 gagal terkirim" (ke Sinkronisasi).
- Tombol utama besar: **Mulai Sesi Penerimaan**. Satu tombol menonjol saja (HIG).
- "Baru ditambahkan": 6 sampul terakhir.
- Empty state (koleksi kosong): ilustrasi rak sederhana, "Rak masih kosong. Mulai dengan memindai ISBN di sampul belakang buku." + tombol **Scan buku pertama** dan tautan "Siapkan Kategori dulu".

### Tambah / Sesi Penerimaan
- **Header sesi** (bisa dilipat): tanggal masuk (default hari ini), asal (Beli/Hadiah/Lainnya), Lokasi. Ringkas: "Hari ini · Beli · Rak A, susun 2 ✎".
- **Area kamera** ~55% tinggi layar dengan frame persegi panjang horizontal (rasio EAN-13), teks bantu "Arahkan barcode ISBN ke dalam kotak". Tombol `flashlight` (bila `torch` didukung) dan "Selesai".
- **Input ISBN** selalu terlihat di bawah kamera: `inputmode="numeric"`, menerima Enter dari scanner USB, autofocus di desktop. Tautan "Tanpa ISBN? Isi manual".
- **Daftar sesi** di bawah (bottom sheet yang bisa ditarik): setiap hasil scan jadi baris dengan status: *Mencari…* (skeleton) → *Siap ditinjau* → *Tersimpan FIK-014/2026*. Pola "Review" LibraryThing.
- Saat scan berhasil: frame berkedip hijau 300 ms + bunyi pendek + getar (bila ada), baris baru muncul; kamera **tidak** berhenti (jeda anti-dobel 1,5 detik untuk ISBN yang sama).
- Pemilik bisa terus scan dan meninjau draf belakangan, atau tap baris untuk meninjau sekarang.
- **Offline**: kamera tetap membaca ISBN dan cek duplikat tetap jalan (dari salinan lokal), tapi lookup metadata ditunda. ISBN disimpan sebagai draf **"menunggu data"** dan otomatis dicari saat online (lalu muncul sebagai "Siap ditinjau"); atau Pemilik tap "Isi manual sekarang". Tombol scan tidak disembunyikan.
- Desktop: kamera opsional (kolom kiri), daftar sesi jadi tabel di kanan; fokus utama input scanner USB.

### Draf Buku (tinjau sebelum simpan)
- Sampul + judul besar di atas, sumber data kecil ("dari Open Library").
- Field inti: Judul, Kontributor (dengan penanda Pengarang Utama), Penerbit, Tahun, ISBN.
- **Kategori** (wajib): chip saran dengan alasan, misalnya "Saran: FIK · dari Aturan Kategori DDC 899.221". Pemilik harus tap **Pakai** atau pilih lain; tombol Simpan nonaktif sampai Kategori terkonfirmasi, dengan teks bantu "Pilih Kategori dulu". Bila tidak ada saran: "Belum ada saran. Pilih Kategori, atau isi Kelas DDC dari KDT."
- **Nomor** (read-only): Nomor Panggil `FIK / TER / l` (dihitung di perangkat). Nomor Induk **tidak dipratinjau** karena hanya server yang memberikannya saat Sinkronisasi (ADR 0004); tampil "Nomor Induk: diberikan saat tersimpan di server" dengan catatan "Setelah diberikan, Nomor Induk tidak berubah" (ADR 0001). Saat online, nomor biasanya muncul beberapa detik setelah Simpan.
- Saran Kategori bekerja offline karena Kategori dan Aturan Kategori disalin ke perangkat.
- Data Eksemplar: diwarisi dari sesi (tanggal, asal, Lokasi), plus harga dan kondisi; tersembunyi di "Data Eksemplar ✎".
- "Detail lainnya" (terlipat): Kelas DDC, subjek, kota terbit, halaman, bahasa, catatan.
- Tombol: **Simpan** (utama), "Simpan & cetak nanti" tidak perlu: semua Eksemplar baru otomatis masuk Antrean Cetak.

### Detail Buku + daftar Eksemplar
- Header: sampul, judul (serif), Kontributor, penerbit · tahun, Kategori chip, Nomor Panggil monospace.
- **Daftar Eksemplar** langsung terlihat (bukan tab tersembunyi seperti Libib): tiap baris = Nomor Induk, Lokasi, kondisi, status (Tersedia / Dipinjam ke Rina, jatuh tempo 12 Des / Keluar: dihibahkan / Menunggu Sinkron).
- Aksi per Eksemplar (menu `…`): Pinjamkan, Kembalikan, Pindah Lokasi, Cetak ulang Label (butuh koneksi), Penyiangan (butuh koneksi).
- Tombol "Tambah eksemplar" di bawah daftar.
- Detail bibliografis lain di bagian terlipat. Edit Buku dalam Drawer (mobile) / Dialog (desktop); pola responsif Dialog+Drawer ada di shadcn ([Drawer](https://ui.shadcn.com/docs/components/drawer)).
- Mengubah Kategori: dialog konfirmasi "Nomor Panggil berubah menjadi AGM / TER / l. Nomor Induk FIK-001/2026 tetap. Cetak ulang Label?" (tambahkan ke Antrean Cetak).

### Koleksi
- Search bar sticky ("Cari judul, pengarang, ISBN, Nomor Induk"); juga menerima scan USB.
- Filter sebagai chip horizontal: Kategori, Lokasi, Status (Tersedia, Dipinjam, Keluar, Menunggu Sinkron). Default menyembunyikan Eksemplar keluar.
- Tampilan **grid sampul** (default mobile, 3 kolom) atau **daftar** (default desktop, kolom Nomor Panggil). Toggle di kanan atas.
- Sampul tidak ada → placeholder warna Kategori + judul dalam serif (tetap rapi).
- Offline: koleksi dari cache lokal; strip "Menampilkan data di perangkat ini".

### Peminjaman
- Segmen: **Aktif** · **Terlambat** · **Riwayat**.
- Baris: sampul kecil, judul, Peminjam, "Jatuh tempo 12 Des". Terlambat: badge "Terlambat 5 hari" (ikon + teks + warna, mengikuti Libib tetapi tidak hanya warna).
- Aksi: **Kembalikan**, **Ingatkan via WhatsApp** (membuka `https://wa.me/<nomor>?text=...`, nomor format internasional tanpa `+`, teks di-URL-encode — [WhatsApp FAQ](https://faq.whatsapp.com/5913398998672934)), Perpanjang.
- Pinjamkan: dari Detail Buku atau tombol + di sini → scan/cari Eksemplar → pilih/ketik Peminjam (nama + nomor WA) → jatuh tempo (chip 7/14/30 hari) → Simpan.
- Offline: mencatat pinjam/kembali tetap bisa (tersimpan lokal, badge Menunggu Sinkron); tombol WhatsApp tetap ada (akan gagal di sisi WA bila tanpa internet).

### Antrean Cetak + Template Label
- Daftar Eksemplar belum dicetak, dengan centang (default semua). Eksemplar **Menunggu Sinkron tidak bisa dipilih**: ditampilkan di grup terpisah dengan ikon jam dan teks "Belum punya Nomor Induk, tunggu Sinkronisasi" (tidak hanya warna).
- Pilih **Template Label** (dropdown: misal "A4 · 3×8 · 64×33 mm", "F4 · 3×10"), dan **"Mulai dari posisi"**: grid mini lembar yang bisa di-tap untuk memilih sel awal (sel sebelumnya tampak sudah terpakai).
- **Pratinjau** skala lembar nyata: tiap Label 3 baris Nomor Panggil + barcode Nomor Induk.
- Tombol **Cetak** membuka `window.print()`; setelah kembali: "Label sudah tercetak dengan benar?" → **Ya, tandai tercetak** / Belum. (Jangan otomatis mengosongkan antrean.)
- Editor Template Label (di Pengaturan atau tautan "Kelola template"): ukuran kertas, kolom, baris, ukuran Label, margin atas/kiri, jarak antar-Label, semua dalam mm, dengan pratinjau langsung.
- Offline: daftar tetap bisa dilihat, tetapi **Cetak** dan editor Template Label hanya online (ADR 0004). Tombol Cetak bertuliskan "Cetak · butuh koneksi".

### Kategori & Aturan Kategori
- Daftar Kategori: kode (monospace, besar), nama, jumlah Eksemplar, warna. Tambah/edit di Drawer. Mengubah kode: peringatan "Hanya berlaku untuk Nomor Induk baru" (ADR 0001).
- Tab kedua **Aturan Kategori**: baris "DDC diawali `899.221` → FIK", "Subjek mengandung `Islam` → AGM". Urutan prioritas sesuai ADR 0003 dijelaskan dalam satu kalimat bantu.
- Empty state: "Belum ada Kategori. Buat minimal satu sebelum menyimpan buku." + template awal (FIK Fiksi, NON Nonfiksi, ANK Anak, AGM Agama, REF Referensi) yang bisa diedit.
- Offline: daftar Kategori dan Aturan Kategori bisa dilihat (salinan lokal), tetapi tambah/edit hanya online. Hal yang sama berlaku untuk halaman Lokasi. Akibatnya Draf Buku offline hanya bisa memilih Kategori dan Lokasi yang sudah ada.

### Buku Induk
- Tabel urut Nomor Induk: tanggal masuk, Nomor Induk, judul, pengarang, asal, harga, status (Penyiangan ditandai coret tipis + alasan).
- Filter tahun pencatatan; tombol **Ekspor CSV** dan **Ekspor PDF**.
- Statistik sederhana di atas: total per Kategori (bar horizontal), Eksemplar masuk per bulan tahun ini, total nilai koleksi.
- Mobile: tabel jadi daftar kartu.
- Ekspor CSV/PDF hanya online (ADR 0004), agar Buku Induk yang diekspor lengkap dan bernomor. Offline, daftar lokal tetap bisa dilihat; Eksemplar Menunggu Sinkron tampil di bawah tanpa Nomor Induk.

### Sinkronisasi — di "Lainnya"
- Status di atas: "Semua tersinkron · terakhir 10.42" atau "3 perubahan Menunggu Sinkron" + tombol **Sinkronkan sekarang**. Bila sesi kedaluwarsa: "Masuk lagi untuk melanjutkan Sinkronisasi" + tombol **Masuk**.
- Daftar outbox: jenis (Buku baru, Edit Buku, Eksemplar baru, Peminjaman, draf menunggu data), judul, waktu, status (Menunggu / Mengirim / Gagal terkirim + alasan dan **Coba lagi**). Pesan gagal mengikuti NN/g: jelas, tanpa kode, ada solusi.
- **Perubahan dari perangkat lain**: log sederhana field yang ditimpa (last write wins), mis. "Penerbit · Laut Bercerita · diubah dari perangkat lain · 09.15". Hanya informasi; tidak ada pilih versi (ADR 0004).
- Info penyimpanan: "Data tersimpan di perangkat ini" + status persist storage (web.dev).

### Pengaturan → "Keluar & hapus data di perangkat ini"
- Dua aksi terpisah: **Keluar** (data lokal tetap, cocok untuk perangkat sendiri) dan **Keluar & hapus data di perangkat ini** (gaya destruktif).
- Konfirmasi wajib (HIG: peringatan kehilangan data harus menginterupsi). Bila masih ada perubahan Menunggu Sinkron: "Masih ada 3 perubahan yang belum terkirim ke server. Kalau dihapus sekarang, perubahan itu hilang." Tombol: **Sinkronkan dulu** (utama) · Hapus tetap (merah).

### Pengaturan
- Profil Pemilik & kata sandi, Template Label, Lokasi (atau halaman sendiri), format Nomor Panggil (pratinjau), kunci API Google Books, bunyi scan on/off, tema (terang/gelap/sistem), Keluar, dan Keluar & hapus data di perangkat ini (lihat atas).

---

## 6. Status kunci

| Status | Perilaku |
|---|---|
| **Kosong** | Penjelasan + satu tombol aksi (NN/g). Contoh Antrean Cetak: "Semua Label sudah dicetak." |
| **Memuat lookup** | Baris draf dengan skeleton + "Mencari di Open Library…" lalu "…Google Books…"; Pemilik tetap bisa scan buku berikutnya (HIG Loading). Timeout 8 detik → "Belum ketemu, coba lagi / isi manual". |
| **Tidak ditemukan** | "ISBN 978-602-xxx belum ada di Open Library, Google Books, maupun Library of Congress. Banyak buku Indonesia memang belum terdaftar." → **Isi manual** (ISBN sudah terisi) · Scan ulang. Bukan "Error". |
| **ISBN salah** (check digit gagal) | "Angkanya sepertinya kurang tepat. Cek lagi 13 digit di bawah barcode." Input dipertahankan. |
| **Duplikat** | Bottom sheet: sampul + "Buku ini sudah ada: 1 eksemplar (FIK-003/2026, Rak A)." Tombol **Tambah eksemplar baru** · Batal. Di Sesi Penerimaan, getar/bunyi berbeda (Scandit: state error berbeda per kasus). |
| **Kamera ditolak** | "Kamera belum diizinkan. Kamu tetap bisa mengetik ISBN atau pakai scanner USB." + langkah singkat membuka izin. |
| **Offline** | Strip global; scan ISBN → draf "menunggu data"; Simpan tetap bisa (lokal, Menunggu Sinkron); aksi hanya online diberi keterangan "Butuh koneksi". |
| **Gagal terkirim** | Chip pada item + kartu Beranda + detail di Sinkronisasi dengan **Coba lagi**. |
| **Field ditimpa** | Snackbar kecil + log di Sinkronisasi; tidak ada layar konflik (ADR 0004). |
| **Sesi kedaluwarsa** | Strip "masuk lagi untuk Sinkronisasi"; data lokal tetap bisa dibuka dan diedit. |

**Aksi saat offline (ADR 0004):**

| Aksi | Offline |
|---|---|
| Jelajah/cari Koleksi, Detail Buku | ✅ dari salinan lokal (sampul dari cache Service Worker) |
| Tambah Buku manual, edit Buku | ✅ disimpan lokal, Menunggu Sinkron |
| Saran & pilih Kategori (yang sudah ada) | ✅ Kategori dan Aturan Kategori disalin ke perangkat |
| Peminjaman (pinjam, kembali, perpanjang) | ✅ disimpan lokal |
| Scan ISBN | ✅ cek duplikat lokal; metadata ⏸ draf "menunggu data" |
| Nomor Induk | ⏸ diberikan server saat Sinkronisasi |
| Kelola Kategori, Aturan Kategori, Lokasi, Template Label | ❌ hanya online |
| Cetak Label | ❌ hanya online |
| Penyiangan | ❌ hanya online |
| Ekspor Buku Induk | ❌ hanya online |

Sesuai MDN, aksi hanya online tidak disembunyikan berdasarkan `navigator.onLine`; tombol diberi keterangan, dicoba saat ditekan, dan gagal dengan pesan yang jelas.

---

## 7. Wireframe ASCII (mobile, ±375 px)

**A. Beranda**
```
┌───────────────────────────────────┐
│ lifelibrary                    ⚙  │
│ ☁̸ Offline · perubahan disimpan di │  ← hanya saat offline
│   perangkat ini                   │
├───────────────────────────────────┤
│ Selamat sore 👋                   │
│ 412 buku · 437 eksemplar · 3 dipinjam│
│                                   │
│ ┌───────────────────────────────┐ │
│ │ ⚠ 2 pinjaman terlambat      › │ │
│ ├───────────────────────────────┤ │
│ │ 🏷 8 Label siap dicetak     › │ │
│ ├───────────────────────────────┤ │
│ │ ⏱ 3 perubahan Menunggu Sinkron›│ │
│ └───────────────────────────────┘ │
│ ┌───────────────────────────────┐ │
│ │   ▥  Mulai Sesi Penerimaan    │ │  ← satu tombol utama
│ └───────────────────────────────┘ │
│ Baru ditambahkan                  │
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐          │
│ │  │ │  │ │⏱ │ │  │ │  │  →       │
│ └──┘ └──┘ └──┘ └──┘ └──┘          │
├───────────────────────────────────┤
│ ⌂      ▤       ▥       ⇄      ≡•  │
│Beranda Koleksi Tambah Pinjam Lainnya│
└───────────────────────────────────┘
```

**B. Tambah / Sesi Penerimaan (scan)**
```
┌───────────────────────────────────┐
│ ← Sesi Penerimaan        Selesai  │
│ Hari ini · Beli · Rak A susun 2 ✎ │
├───────────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ░░░░┌─────────────────────┐░░░░░░ │
│ ░░░░│  ||| |||| | ||| ||  │░░░░░░ │  ← frame EAN-13,
│ ░░░░└─────────────────────┘░░░░░░ │     kedip hijau saat terbaca
│ ░ Arahkan barcode ISBN ke kotak ░ │
│ ░░░░░░░░░░░░░░░░░░░░░ [🔦] ░░░░░ │
├───────────────────────────────────┤
│ [ Ketik atau scan ISBN…      ][↵] │
│ Tanpa ISBN? Isi manual            │
├──────────── ═══ ──────────────────┤  ← sheet bisa ditarik
│ Sesi ini: 4 buku                  │
│ ✓ Laut Bercerita   FIK-014/2026   │
│ ● Atomic Habits   Siap ditinjau › │
│ ◌ 978602…  Mencari di Open Library│
│ ⏱ 978623…  Menunggu data        › │  ← offline: lookup ditunda
└───────────────────────────────────┘
```

**C. Draf Buku**
```
┌───────────────────────────────────┐
│ ← Tinjau buku           2 dari 4  │
├───────────────────────────────────┤
│ ┌────┐ Atomic Habits              │
│ │    │ James Clear (Pengarang     │
│ │    │ Utama) · Gramedia · 2019   │
│ └────┘ dari Open Library          │
│                                   │
│ Judul       [Atomic Habits      ] │
│ Kontributor [James Clear ★] [+ ]  │
│ Penerbit    [Gramedia           ] │
│ Tahun [2019]   ISBN 9786020633176 │
│                                   │
│ Kategori *                        │
│ ┌───────────────────────────────┐ │
│ │ Saran: PSI Psikologi          │ │
│ │ dari Aturan Kategori DDC 155  │ │
│ │ [ Pakai ]   [ Pilih lain ▾ ]  │ │
│ └───────────────────────────────┘ │
│ Nomor Panggil   PSI / CLE / a     │
│ Nomor Induk     diberikan server  │
│ ⓘ Setelah diberikan, tidak berubah│
│                                   │
│ ▸ Data Eksemplar (Beli · Rak A)   │
│ ▸ Detail lainnya (DDC, subjek…)   │
├───────────────────────────────────┤
│ [        Simpan eksemplar       ] │  ← nonaktif sampai
│  Pilih Kategori dulu              │     Kategori dikonfirmasi
└───────────────────────────────────┘
```

**D. Detail Buku**
```
┌───────────────────────────────────┐
│ ←                        ✎   ⋯    │
├───────────────────────────────────┤
│ ┌──────┐ Laut Bercerita           │
│ │      │ Leila S. Chudori         │
│ │      │ KPG · 2017               │
│ └──────┘ [FIK Fiksi]  FIK / CHU / l│
├───────────────────────────────────┤
│ Eksemplar (3)                     │
│ ┌───────────────────────────────┐ │
│ │ FIK-001/2026 · Rak A2   ● Tersedia ⋯│
│ ├───────────────────────────────┤ │
│ │ FIK-002/2026 · Rak A2         │ │
│ │ ⇄ Dipinjam Rina · tempo 12 Des⋯│ │
│ ├───────────────────────────────┤ │
│ │ —— · Rak B1                   │ │
│ │ ⏱ Menunggu Sinkron · belum   ⋯│ │
│ │   bisa dicetak                │ │
│ └───────────────────────────────┘ │
│ [ + Tambah eksemplar ]            │
│                                   │
│ ▸ Detail bibliografis             │
│   ISBN, DDC 899.221 3, subjek…    │
└───────────────────────────────────┘
```

---

## 8. Panduan gaya visual

**Arah:** tenang, "kertas dan tinta", seperti kartu katalog perpustakaan. Warna hangat netral, aksen hijau tua rak kayu, serif untuk judul.

**Palet (terang)** — kontras dihitung dengan rumus WCAG terhadap latar `#FAF6EE`:

| Token | Hex | Pakai | Kontras |
|---|---|---|---|
| `paper` (background) | `#FAF6EE` | latar halaman | — |
| `card` | `#FFFDF8` | kartu, sheet | — |
| `ink` | `#2B2620` | teks utama | 13.9:1 |
| `ink-muted` | `#6B6257` | teks sekunder | 5.6:1 |
| `line` | `#E6DFD2` | pemisah dekoratif | (dekoratif) |
| `line-strong` | `#8C8273` | batas input | 3.5:1 (≥3:1, WCAG 1.4.11) |
| `primary` (hijau rak) | `#2F5D50` | tombol utama, link | 7.0:1; teks putih di atasnya 7.5:1 |
| `accent` (terakota) | `#A8502B` | sorotan, chip Kategori | 5.1:1 |
| `danger` | `#A63D2F` | terlambat, gagal terkirim | 5.9:1 |
| `warning` | teks `#7A4F00` di `#FBEFD5` | peringatan | 6.3:1 |
| `success` | `#3C6E47` | tersimpan, tersedia | 5.5:1 |
| `menunggu` | teks `#5B4A86` di `#ECE7F5` | Menunggu Sinkron | 6.3:1 |
| `offline-bar` | teks `#3D3528` di `#EDE3CF` | strip offline | 9.5:1 |

**Mode gelap:** latar `#1C1915`, teks `#EDE6D9` (14.1:1), muted `#A89F92` (6.7:1), primary `#8FC1AE` (8.7:1). Tailwind v4/shadcn memakai CSS variable sehingga tema cukup didefinisikan sebagai token.

**Tipografi (Google Fonts, sudah dicek tersedia):**
- Judul: **Fraunces** (serif variabel, hangat) — [fonts.google.com/specimen/Fraunces](https://fonts.google.com/specimen/Fraunces). Alternatif lebih tenang: **Literata** (dirancang untuk membaca) atau **Source Serif 4**.
- UI & isi: **Inter** — [fonts.google.com/specimen/Inter](https://fonts.google.com/specimen/Inter).
- Nomor Induk, Nomor Panggil, ISBN: **JetBrains Mono** (angka tabular, mudah dibedakan 0/O, 1/l).
- Skala: 13 / 15 (body mobile 16 untuk input agar iOS tidak zoom) / 18 / 22 / 28. Line-height 1.5 untuk teks.

**Spacing & bentuk:** grid 4 px (4, 8, 12, 16, 24, 32). Gutter halaman 16 px mobile, 24–32 px desktop. Radius: 8 px input/tombol, 12 px kartu, 16 px sheet; sampul buku radius 4 px + bayangan tipis agar terlihat seperti benda fisik. Tinggi tombol/target minimal 44 px (HIG, WCAG 2.5.5).

**Ikon:** **Lucide** (ISC, 1600+ ikon) — [lucide.dev](https://lucide.dev/guide/), stroke 1.75–2, ukuran 20/24. Ikon selalu disertai label di navigasi dan status.

**Gerak:** minimal. Kedip frame scan 300 ms, sheet slide 200 ms; hormati `prefers-reduced-motion`.

---

## 9. Kecocokan stack

- **shadcn/ui**: kode komponen disalin ke proyek dan dimiliki sendiri ("not a component library"), dengan default yang rapi ([docs](https://ui.shadcn.com/docs)). Komponen yang dipakai: Button, Input, Sheet/Drawer (mobile) + Dialog (desktop), Command (pilih Kategori dengan cari), Tabs/ToggleGroup, Badge, Sonner (toast/snackbar), Table, Skeleton. Drawer versi terbaru berbasis Base UI dan bisa dikombinasikan dengan Dialog untuk pola responsif ([Drawer](https://ui.shadcn.com/docs/components/drawer)).
- **PWA**: manifest lewat `app/manifest.ts`; Next.js tidak menyarankan tombol install kustom via `beforeinstallprompt` karena tidak jalan di Safari iOS, dan menampilkan instruksi "Share → Add to Home Screen" untuk iOS; untuk offline caching menyarankan **Serwist** (contoh Turbopack dan webpack), plus hook eksperimental `useOffline` ([Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps)). Setup Serwist: `@serwist/next` + `serwist`, `withSerwistInit({ swSrc: "app/sw.ts", swDest: "public/sw.js" })`, panduan terpisah untuk Turbopack ([Serwist](https://serwist.pages.dev/docs/next/getting-started)). Sesuai ADR 0004: salinan koleksi dan outbox di IndexedDB lewat Dexie, sampul di cache Service Worker (§3.1).
- **Cetak Label**: `@page { size: A4; margin: 0 }` (keyword `A4` = 210×297 mm); F4 tidak punya keyword sehingga dipakai ukuran eksplisit `size: 215mm 330mm`; `size` berstatus Baseline 2024 ([MDN @page size](https://developer.mozilla.org/en-US/docs/Web/CSS/@page/size)). Tata letak Label dengan CSS Grid dalam satuan `mm` dari Template Label; posisi awal = sel kosong sebanyak N−1. Rekomendasi (bukan dari sumber): tambahkan "Cetak halaman uji" berisi kotak garis tepi dan instruksi set skala cetak 100% / "Actual size", karena dialog cetak browser sering memakai "Fit to page".
- **Scan**: polyfill `barcode-detector` (lihat `home-library-apps.md` §5) dengan `formats: ["ean_13"]`.

---

## 10. Contoh microcopy (Bahasa Indonesia)

- Tombol utama: "Mulai Sesi Penerimaan", "Simpan eksemplar", "Tambah eksemplar baru", "Pinjamkan", "Kembalikan", "Tandai tercetak".
- Scan: "Arahkan barcode ISBN ke dalam kotak" · "Terbaca! Mencari data buku…" · "Barcode ini bukan ISBN. Coba barcode yang diawali 978 atau 979."
- Tidak ditemukan: "Data buku ini belum ada di sumber mana pun. Isi manual saja, ISBN-nya sudah kami isikan."
- Duplikat: "Kamu sudah punya buku ini (1 eksemplar di Rak A). Tambah eksemplar baru?"
- Kategori: "Pilih Kategori dulu sebelum menyimpan." · "Saran dari Aturan Kategori: FIK (DDC 899.221)."
- Nomor Induk: "Nomor Induk tidak berubah walau Kategori dikoreksi nanti."
- Offline: "Kamu sedang offline. Perubahan disimpan di perangkat ini dan dikirim otomatis saat tersambung." · Draf scan: "Menunggu data · dicari begitu ada koneksi."
- Menunggu Sinkron: "Menunggu Sinkron · Nomor Induk diberikan setelah tersimpan di server."
- Aksi hanya online: "Butuh koneksi" · "Belum tersambung. Coba lagi saat online."
- Sinkronisasi berhasil: "Semua perubahan sudah terkirim."
- Gagal terkirim: "2 perubahan belum terkirim. Coba lagi"
- Field ditimpa: "Penerbit di *Laut Bercerita* diperbarui dari perangkat lain."
- Sesi kedaluwarsa: "Sesi login berakhir. Data tetap bisa dipakai; masuk lagi untuk Sinkronisasi."
- Hapus data perangkat: "Masih ada 3 perubahan yang belum terkirim. Kalau dihapus sekarang, perubahan itu hilang."
- Cetak: "Mulai dari posisi 5 (4 Label pertama di lembar sudah terpakai)." · "Eksemplar ini belum punya Nomor Induk, jadi Labelnya belum bisa dicetak."
- Pengingat WA: "Halo Rina, cuma mengingatkan buku *Laut Bercerita* jatuh tempo 12 Des. Terima kasih 🙏"
- Penyiangan: "Keluarkan dari koleksi? Eksemplar tetap tercatat di Buku Induk dan Nomor Induknya tidak dipakai lagi."

---

## 11. Jangan lakukan

1. Jangan memakai istilah yang dihindari glosarium di UI: *copy, item, rak* (untuk Lokasi), *genre, hapus, admin, user, member, print queue, batch*.
2. Jangan menambah tab keenam atau menyembunyikan tab; jangan menaruh aksi (mis. "Simpan") di tab bar.
3. Jangan memaksa form panjang di depan: field bibliografis lanjutan selalu di "Detail lainnya".
4. Jangan menghentikan kamera setelah tiap scan di Sesi Penerimaan, dan jangan pindah route selama kamera aktif (iOS standalone).
5. Jangan menampilkan pesan "Error" atau "ISBN tidak valid"; jelaskan dan beri jalan keluar.
6. Jangan menyimpan Eksemplar tanpa Kategori terkonfirmasi, dan jangan pernah mengubah Nomor Induk yang sudah ada.
7. Jangan menandai Label tercetak otomatis setelah dialog cetak.
8. Jangan memakai warna saja untuk status (terlambat, offline, Menunggu Sinkron, gagal terkirim).
9. Jangan memblokir layar dengan modal loading saat lookup atau Sinkronisasi.
10. Jangan menonaktifkan fitur hanya berdasarkan `navigator.onLine`; coba, lalu tunda dengan pesan.
11. Jangan membuat layar resolusi konflik atau dialog "pilih versi" (ADR 0004); cukup pemberitahuan kecil. Jangan menghapus data perangkat tanpa konfirmasi yang menyebut jumlah perubahan belum terkirim.
12. Jangan menampilkan Nomor Induk sementara/tebakan di perangkat; hanya nomor dari server.
13. Jangan menambah fitur sosial (rating, ulasan, feed), gamifikasi, atau dashboard grafik berlebihan; katalog publik dan impor daftar ISBN memang ditunda.
14. Jangan menyalin caption DDC resmi ke UI (lisensi OCLC, ADR 0003).
