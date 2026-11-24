# Riset: Aplikasi Perpustakaan Pribadi, Sumber Metadata ISBN, dan Klasifikasi

Tanggal riset: 2026-11-24. Bagian bertanda **[diuji]** sudah dicoba langsung dengan `curl` pada tanggal tersebut. Sisanya bersumber dari dokumentasi resmi yang dikutip.

## 1. Aplikasi yang sudah ada

| App | Bibliografi vs copy | Kategorisasi / call number | Scan barcode | Lending | Import/Export | Harga / self-host |
|---|---|---|---|---|---|---|
| **Libib** | Satu item per entri, dikelompokkan dalam "collection" (maks. 100) | DDC, LCC, LCCN hanya di Pro | ISBN/UPC lewat kamera | Hanya Pro: circulation, patron tak terbatas, notifikasi email | Import CSV, export kapan saja | Basic gratis (5.000 item); Pro $9/bln (100.000 item); Ultimate $900/thn. SaaS. [libib.com/pricing](https://www.libib.com/pricing) |
| **LibraryThing** | Work vs edition, ditambah collections dan tags | LC, DDC, atau skema kustom | Ya | Lewat TinyCat | Ya | Gratis tanpa batas jumlah buku sejak Maret 2020 ([LT about](https://www.librarything.com/about), [pengumuman](https://www.librarything.com/topic/317841)). SaaS |
| **TinyCat** | OPAC di atas katalog LibraryThing | Mengikuti LT | Ya | Checkout, patron | Ya | Gratis untuk pemakaian pribadi; berbayar mulai $3/bln untuk lembaga ([librarycat.org](https://www.librarycat.org/)). Butuh akun LT |
| **Koha** (ILS) | Bibliographic record (MARC21/UNIMARC) terpisah dari **item** | Call number per item (952$o), shelving location (952$c) | Barcode per item (952$p) | Circulation penuh | MARC, Z39.50/SRU copy cataloging | Open source, self-host. [Manual Koha](https://koha-community.org/manual/latest/en/html/cataloging.html) |
| **SLiMS** | `biblio` + `item` (lihat §4) | `classification` (DDC) + `call_number` di biblio dan item | Barcode generator + barcode reader | Loan, reservasi, loan rules | MODS, Dublin Core OAI-PMH, Z39.50/SRU, P2P antar-SLiMS | GPL-3.0, PHP/MySQL, self-host. [slims.web.id](https://slims.web.id/web/pages/about/), [GitHub](https://github.com/slims/slims9_bulian) |
| **Inventaire.io** | Work/edition dari Wikidata, plus item milik user | Entitas Wikidata, shelves | Scan barcode | Tiap buku bisa ditandai give/lend/sell; transaksinya di luar app | API, raw data | AGPL-3.0, bisa self-host ([wiki](https://wiki.inventaire.io/wiki/Main_Page), [Codeberg README](https://codeberg.org/inventaire/inventaire)) |
| **BookBuddy** (iOS) | Per buku | Tidak terdokumentasi | "Powerful barcode scanner", "Powered by Worldcat" | Mencatat buku yang dipinjamkan/dipinjam | Export ke Excel/Numbers | Ada versi Lite/premium. [kimicoapps.com](https://www.kimicoapps.com/bookbuddy) |
| **BookWyrm** | Work/edition; fokus sosial (reading log) | Shelves (to-read, read, custom) | – | – | Importer Goodreads, StoryGraph, LibraryThing, Calibre, OpenLibrary, Openreads; connector OpenLibrary, Inventaire, Finna, Libris | Federated (ActivityPub), self-host; lisensi Anti-Capitalist Software License ([docs](https://docs.joinbookwyrm.com/), [repo](https://github.com/bookwyrm-social/bookwyrm/tree/main/bookwyrm/importers)) |
| **Calibre** | Khusus ebook | Tags, series | – | – | Metadata dari Google Books dan Amazon, bisa lewat ISBN | GPL-3.0. [manual](https://manual.calibre-ebook.com/metadata.html) |
| **Goodreads / StoryGraph** | Reading tracker, bukan inventaris fisik | Shelves/genre | – | – | Export CSV | API Goodreads tidak menerbitkan key baru sejak 8 Des 2020 ([help](https://help.goodreads.com/s/article/Does-Goodreads-support-the-use-of-APIs)) |

Pola umumnya: app konsumen (Libib, BookBuddy) memperlakukan "buku = satu baris". ILS sungguhan (Koha, SLiMS) memisahkan **record bibliografi** dari **item/eksemplar fisik**. Hanya Libib Pro dan LibraryThing yang menampilkan DDC/LCC ke pengguna rumahan.

## 2. Sumber metadata ISBN

### Open Library (gratis, tanpa auth) [diuji]
- Endpoint yang tersedia: `/isbn/{isbn}.json` (edition), `/api/books?bibkeys=ISBN:...&jscmd=data`, dan `search.json`. Respons `jscmd=data` memuat `classifications.dewey_decimal_class`, `classifications.lc_classifications`, dan `subjects` ([docs](https://openlibrary.org/dev/docs/api/books)).
- Rate limit: 1 req/detik tanpa identitas, 3 req/detik bila mengirim `User-Agent` berisi nama app dan kontak. Bulk download lewat API dilarang; tersedia data dump bulanan ([developers/api](https://openlibrary.org/developers/api)).
- **Temuan uji:** di level edition, DDC sering kosong. Contohnya *Pride and Prejudice* 9780141439518 tidak punya `classifications` di edition. Sebaliknya `search.json?isbn=...&fields=ddc,lcc,subject` mengagregasi DDC/LCC dari seluruh edition dalam satu **work**, sehingga mengembalikan `ddc: ['823.74','823.7',...]`. Terjemahan Indonesia dari buku internasional ikut terbantu: *Atomic Habits* edisi Gramedia (9786020633176) mendapat `ddc: ['155.24']` dari work-nya. Karya asli Indonesia umumnya tidak punya DDC. *Laut Bercerita* (9786024246945) ada record-nya tetapi tanpa ddc/subject, dan *Negeri 5 Menara* hanya punya nomor LC sementara "MLCSE 2010/00234". Sebagian ISBN Indonesia tidak ditemukan sama sekali.

### Google Books API
- Cari dengan `q=isbn:...`. Request data publik wajib menyertakan API key atau OAuth ([using](https://developers.google.com/books/docs/v1/using)). Field `volumeInfo` mencakup `title, authors, publisher, publishedDate, description, industryIdentifiers, pageCount, categories, mainCategory, language, imageLinks`. **Tidak ada DDC/LCC**; `categories` hanya label bebas mirip BISAC.
- **[diuji]** Request tanpa key langsung kena `429 RESOURCE_EXHAUSTED` karena kuota project anonim bersama 0/habis. Artinya API key wajib. Dokumen resmi tidak menyebut kuota default; angkanya dicek di Cloud Console.

### ISBNdb (berbayar)
- Basic $14.99/bln (5.000 req/hari, 1 req/dtk), Premium $35.99 (15.000, 3/dtk), Pro $99.99 (50.000, 5/dtk), dengan trial 7 hari ([pricing](https://isbndb.com/isbn-database)). Auth lewat header `Authorization` ([docs v2](https://isbndb.com/isbndb-api-documentation-v2)).
- **[diuji]** Skema OpenAPI v2.9.1 ([doc.json](https://api2.isbndb.com/doc.json)) tidak memuat field `dewey`. Yang ada field `thema` (kode Thema), menggantikan `subjects` yang deprecated.

### OCLC Classify / WorldCat
- **Classify sudah dihentikan per 31 Januari 2024**, baik UI maupun API-nya ([OCLC help](https://help.oclc.org/Librarian_Toolbox/Troubleshooting/Why_is_OCLC_discontinuing_OCLC_Classify)). Pengganti yang disebut OCLC adalah WorldCat Metadata API, yang punya endpoint klasifikasi DDC/LCC terpopuler per OCLC Number, tetapi **khusus pelanggan** OCLC Cataloging.

### Library of Congress SRU (gratis, tanpa auth) [diuji]
- `http://lx2.loc.gov:210/lcdb?version=1.1&operation=searchRetrieve&query=bath.isbn=<ISBN>&recordSchema=marcxml`. Skema yang didukung: dc, mods, marcxml, bibframe2. Batasnya maks. 50 record per present dan timeout sesi 60 detik ([LC Z39.50/SRU](https://www.loc.gov/z3950/lcserver.html)).
- Hasil uji: 9780141439518 mengembalikan 050 `PR4034 .P7 2003b`, 082 `823/.7` (ed. 22), dan 650 subjects. Untuk *Negeri 5 Menara* yang keluar hanya 050 "MLCSE…" tanpa 082. Artinya LoC andal untuk buku berbahasa Inggris dan lemah untuk buku lokal.

### Perpusnas RI
- **isbn.perpusnas.go.id**: portal layanan ISBN untuk penerbit. Tidak ditemukan dokumentasi API publik; panduannya hanya juknis berbentuk PDF ([Juknis ISBN 2023](https://admin-isbn.perpusnas.go.id/files/dokumen_surat/Petunjuk%20Teknis%20Layanan%20ISBN%20-%2020230127.pdf)).
- **OPAC SRU Perpusnas**: SLiMS menanamkan default server `https://opac.perpusnas.go.id/sru.aspx` untuk copy cataloging MARC. Parameternya `operation=searchRetrieve&title=...` atau `author=...`, lalu field 082$a dibaca sebagai klasifikasi ([marcsru.php](https://github.com/slims/slims9_bulian/blob/master/admin/modules/bibliography/marcsru.php)). **[diuji, gagal]** dari lokasi riset, endpoint ini diblokir Cloudflare (403), jadi ketersediaannya untuk server di luar Indonesia belum terverifikasi. Kode SLiMS hanya memetakan pencarian ke title/author, bukan ISBN.
- **KDT (Katalog Dalam Terbitan)** dicetak di balik halaman judul buku Indonesia yang mengajukan ISBN ([Juknis ISBN](https://admin-isbn.perpusnas.go.id/files/dokumen_surat/Petunjuk%20Teknis%20Layanan%20ISBN%20-%2020230127.pdf)). Bibliografi Nasional Indonesia menyusun entri KDT berdasarkan DDC ed. 23, lengkap dengan nomor klasifikasi dan tajuk subjek ([BNI 2021](https://pustakawan.perpusnas.go.id/galeri/SKHK%20Pustakawan%20dan%20Asisten%20Perpustakaan/PUSTAKAWAN-Pengembangan%20Koleksi/1.Unsur%20Pengelolaan%20Perpustakaan/B.%20Pengorganisasian%20Bahan%20Perpustakaan%20dan%20Pengetahuan/BNI%20Vol.%2069%20No.%202%20Th.%202021.pdf)). Jadi DDC untuk buku Indonesia sering **tercetak di buku itu sendiri** dan bisa diketik manual atau di-OCR.
- **Indonesia OneSearch** (onesearch.id) mengagregasi katalog via OAI-PMH, tetapi spesifikasi API publik terkini tidak ditemukan ([infoDOCKET 2016](https://www.infodocket.com/2016/03/09/indonesias-national-library-launches-digital-portal/)).

## 3. Skema klasifikasi

- **DDC**: hak cipta dan merek dagang milik OCLC. Untuk penggunaan bisnis, pihak luar diminta menghubungi OCLC ([OCLC: DDC di website](https://help.oclc.org/Metadata_Services/WebDewey/Troubleshooting/Can_I_use_the_DDC_to_organize_information_on_my_Web_site), [Dewey resources](https://www.oclc.org/en/dewey/resources.html)). Lisensi WebDewey melarang menampilkan *caption* DDC di record. Ringkasan tiga level pertama boleh dipasang dengan notice "Used with Permission" ([Schedule 8](https://policies.oclc.org/content/dam/legal/schedules/en_us/Schedule-08-WebDewey-EN-US.pdf)). Implikasinya: **menyimpan nomor** DDC dari sumber lain umum dilakukan, tetapi menyalin teks tabel DDC lengkap ke app berisiko secara lisensi.
- **Adaptasi Indonesia**: Perpusnas berkontribusi pada DDC 23 untuk 899.221 (Kesusastraan Indonesia) dan sastra daerah. Perluasan seksi Islam memakai dasar 297; versi lama Kemenag memakai notasi 2X0/2X1 ([Media Pustakawan](https://ejournal.perpusnas.go.id/mp/article/download/883/864), [Libria UIN Ar-Raniry](https://jurnal.ar-raniry.ac.id/index.php/libria/article/download/1212/907)). Perpusnas juga menyediakan e-DDC ([pustakawan.perpusnas.go.id](https://pustakawan.perpusnas.go.id/berita/1177/apa-itu-e-ddc-dan-e-class)).
- **LCC**: dipakai LoC, nilainya muncul di Open Library dan LoC SRU. Kurang cocok untuk rak rumahan karena notasinya alfanumerik panjang.
- **BISAC**: menggunakan kode untuk mengkategorikan buku gratis dan tanpa izin. Menanam **daftar lengkap** ke dalam produk/database butuh lisensi berbayar ([BISG FAQ](https://www.bisg.org/BISAC-FAQ), [lisensi](https://www.bisg.org/purchasedownload-complete-bisac-list)).
- **Thema**: gratis untuk semua di bawah lisensi permisif EDItEUR ([About Thema](https://www.editeur.org/206/About-Thema/)). ISBNdb kini mengembalikan kode Thema.

**Pemetaan ISBN ke kategori yang realistis:**
1. DDC dari Open Library `search.json` (agregat work), lalu LoC SRU 082.
2. Bila tidak ada DDC, pakai LCC, dipetakan kasar ke kelas utama (mis. P* → 800 sastra).
3. Bila tidak ada, pakai subjects/`categories` Google, dicocokkan dengan kata kunci ke 10 kelas utama DDC (000–900).
4. Bila tetap tidak ada (kasus umum untuk buku asli Indonesia), minta user mengetik nomor DDC dari halaman KDT, atau memilih dari daftar kelas utama. Simpan pilihan per penerbit/penulis sebagai saran berikutnya.

## 4. Konsep data model ala perpustakaan

**Work → Instance → Item.** BIBFRAME mendefinisikan Work sebagai esensi konseptual (pengarang, bahasa, subjek), Instance sebagai perwujudan terbit (penerbit, tahun, format; ISBN berada di level ini), dan Item sebagai satu eksemplar. Lokasi rak, shelf mark, dan barcode berada di level Item ([BIBFRAME 2.0 model](https://www.loc.gov/bibframe/docs/bibframe2-model.html)). Koha memakai pemisahan yang sama, biblio ↔ item 952 ([manual](https://koha-community.org/manual/latest/en/html/cataloging.html)).

**SLiMS** ([install.sql.php](https://github.com/slims/slims9_bulian/blob/master/install/install.sql.php)):
- `biblio`: `title, sor` (statement of responsibility), `edition, isbn_issn, publisher_id, publish_year, collation, series_title, call_number, classification, language_id, publish_place_id, notes, image, gmd_id`, serta RDA `content/media/carrier_type_id`. Topik disimpan lewat `biblio_topic` → `mst_topic`, yang punya kolom `classification`. Pengarang disimpan di tabel relasi.
- `item` (eksemplar): `item_code` (barcode, UNIQUE), `inventory_code` (nomor induk), `call_number`, `coll_type_id`, `location_id` (→ `mst_location`), `item_status_id` (→ `mst_item_status` dengan flag `no_loan`, `skip_stock_take`), `received_date`, `order_no`, `order_date`, `supplier_id`, `invoice`, `invoice_date`, `price`, `price_currency`, `site`, dan `source` (1 = Buy, 2 = Prize/Grant, lihat [item.php](https://github.com/slims/slims9_bulian/blob/master/admin/modules/bibliography/item.php)).
- `loan`: `item_code, member_id, loan_date, due_date, renewed, is_lent, is_return, return_date`. Peminjaman terikat ke **item**, bukan biblio.

**Nomor panggil (call number).** Panduan INLISLite Perpusnas menyusun nomor panggil dari nomor klasifikasi DDC, tiga huruf awal tajuk pengarang utama, dan satu huruf awal judul. Bila tidak ada pengarang utama, dipakai DDC + tiga huruf judul ([Panduan INLISLite](https://drive.perpusnas.go.id/pusdatin-official/inlislite-official-old/PanduanPraktisPengohanBahanPustakaINLISLite3.pdf)). Label punggung buku umumnya mencetak ketiganya dalam tiga baris, contoh ilustratif (bukan dari KDT asli):
```
899.221 3
FUA
n
```
Tajuk nama Indonesia mengikuti aturan Perpusnas: kata utama jatuh pada nama pertama, dengan pengecualian seperti "M. Arif" yang menjadi "Arif, M." ([majalah Perpusnas](https://www.perpusnas.go.id/magazine-detail.php?lang=id&id=8306)).

**Buku induk / nomor induk.** Daftar registrasi memuat judul, pengarang, tempat terbit, penerbit, tahun, asal bahan pustaka, dan nomor induk. Contoh lampirannya punya kolom tanggal penerimaan, nomor induk, klasifikasi, dan harga ([Perka Perpusnas 12/2018](https://jdih.perpusnas.go.id/file_peraturan/Perka_12_2018_Penilaian_AK_Unsur_Pelayanan_Perpustakaan.pdf)). Nomor induk bersifat unik dan biasanya berisi tahun pengadaan, nomor urut eksemplar, dan kode lokal. Ada dua pola: nomor berlanjut, atau reset ke 0000001 tiap tahun. Tanggal pengadaan wajib diisi, harga opsional ([Panduan INLISLite](https://drive.perpusnas.go.id/pusdatin-official/inlislite-official-old/PanduanPraktisPengohanBahanPustakaINLISLite3.pdf)).

## 5. Teknologi scan barcode

- **ISBN/EAN-13**: ISBN-13 terdiri dari prefix 978 atau 979, registration group, registrant, publication, dan check digit mod 10 berbobot 1/3 ([ISBN International](https://www.isbn-international.org/content/what-isbn/10)). **[diuji]** Grup Indonesia menurut RangeMessage resmi ([export_rangemessage.xml](https://www.isbn-international.org/export_rangemessage.xml)) adalah **978-602, 978-623, 978-634, 978-979**. Jadi "979" pada buku Indonesia lama adalah *group* di bawah prefix 978, bukan prefix 979. Konversi ISBN-10 → 13: tambahkan "978" di depan 9 digit pertama, lalu hitung ulang check digit mod 10. ISBN berprefix 979 tidak punya padanan ISBN-10.
- **BarcodeDetector API**: berstatus eksperimental dan hanya di secure context ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector)). Menurut BCD 8.1.10 ([data](https://unpkg.com/@mdn/browser-compat-data@8.1.10/data.json)): didukung Chrome Android 83+ dan Samsung Internet; Chrome desktop hanya di macOS/ChromeOS; Safari/iOS 17 hanya di balik flag; Firefox tidak mendukung. Karena itu perlu fallback.
- **Library JS**: [zxing-js/library](https://github.com/zxing-js/library) (Apache-2.0) dalam maintenance mode. [html5-qrcode](https://github.com/mebjas/html5-qrcode) (Apache-2.0) mendukung EAN_13, tetapi juga dalam maintenance mode dan PR tidak di-merge. QuaggaJS asli tidak aktif sejak 2023; fork aktifnya [quagga2](https://github.com/ericblade/quagga2). Opsi paling modern: [barcode-detector](https://github.com/Sec-ant/barcode-detector), polyfill BarcodeDetector berbasis ZXing-C++ WASM, sehingga satu API berjalan di semua browser.
- **Native**: ML Kit di Android, AVFoundation/VisionKit di iOS.
- **USB/Bluetooth scanner**: berperilaku sebagai keyboard (HID) dan mengetik digit lalu Enter. Cukup dengan input field yang selalu fokus dan menangkap Enter. Contohnya, SLiMS punya modul `barcode_reader` untuk sirkulasi.

## Implikasi untuk lifelibrary

1. **Pisahkan model `Work/Edition` (biblio) dari `Copy` (item).** Copy memuat: barcode/`item_code` unik, `nomor_induk` (format konfigurabel, mis. `2026/0001`), `tanggal_perolehan`, `sumber` (beli / hadiah / warisan / tukar), `harga`, `kondisi`, `lokasi` (rak → tingkat), dan `status` (tersedia / dipinjam / hilang). Ini meniru SLiMS `item` yang sudah familiar bagi pustakawan Indonesia.
2. **Pipeline lookup berurutan:** validasi ISBN, lalu Open Library `search.json` (ddc/lcc/subject di level work), lalu LoC SRU (082/050/650), lalu Google Books (judul/cover/kategori, perlu API key). Coba OPAC SRU Perpusnas sebagai sumber opsional; verifikasi dulu aksesnya dari server production. Cache hasilnya, dan hormati batas 1–3 req/dtk serta User-Agent yang diminta Open Library.
3. **Jangan berharap DDC otomatis untuk buku asli Indonesia.** Tambahkan UX "isi DDC dari halaman KDT", bisa juga dengan OCR foto halaman balik judul. Simpan DDC sebagai string apa adanya, lalu turunkan *kategori* dari 1–3 digit pertama.
4. **Kategori untuk user**: tampilkan 10 kelas utama dan divisi (100 entri) dengan label buatan sendiri dalam bahasa Indonesia. Jangan menyalin caption DDC resmi (isu lisensi OCLC). Sediakan tag bebas sebagai lapisan kedua.
5. **Call number otomatis**: `DDC` + 3 huruf tajuk pengarang (aturan nama Indonesia: kata utama = nama pertama, gelar dibuang) + 1 huruf judul (abaikan artikel). Cetak sebagai label tiga baris, bisa diedit.
6. **Lending ke teman**: tabel `loan(copy_id, peminjam, tanggal_pinjam, jatuh_tempo, tanggal_kembali)` yang terikat ke copy, bukan ke edition.
7. **Scan**: web memakai polyfill `barcode-detector` (ZXing-C++ WASM), ditambah input yang mendukung USB scanner. Terima EAN-13 berprefix 978/979 saja, dan konversi ISBN-10 yang diketik manual.
8. **Import/export**: CSV ala Libib/Goodreads. Pertimbangkan juga export MARC/MODS agar data bisa dipindah ke SLiMS.
