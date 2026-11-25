import { liveQuery } from "dexie";
import type { Asal, FieldBuku, FieldEksemplar, KontributorDto, Kondisi, Peran } from "@/lib/buku-fields";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { gabungKontributor, normalisasiNama, periksaPengarangUtama } from "@/lib/kontributor";
import {
  type AturanKategoriDto,
  type KategoriDto,
  type KelolaTransport,
  type LokasiDto,
} from "@/lib/kelola-protocol";
import {
  hitungGrid,
  TEMPLATE_LABEL_BAWAAN,
  type GridTemplate,
  type TemplateLabel,
} from "@/lib/label/template-label";
import { susunBukuInduk, type BarisBukuInduk } from "@/lib/buku-induk";
import { labelField } from "@/lib/label-field";
import type { PenyianganDto, PenyianganInput, PenyianganTransport } from "@/lib/penyiangan-protocol";
import type { FieldDitimpa, Mutasi, PullResponse, SyncTransport } from "@/lib/sync-protocol";
import { saringKoleksi, type KriteriaKoleksi } from "./cari-koleksi";
import { susunRingkasanBeranda, type RingkasanBeranda } from "./beranda";
import { hitungStatistik } from "./statistik";
import { idEksemplarDipinjam } from "./status-koleksi";
import {
  bukuKosong,
  eksemplarKosong,
  LocalDb,
  type AturanKategoriRow,
  type BukuRow,
  type EksemplarRow,
  type KategoriRow,
  type LogRow,
  type LokasiRow,
  type OutboxRow,
  type PeminjamanRow,
  type PeminjamRow,
} from "./db";
import {
  ALASAN_BELUM_PUNYA_NOMOR_INDUK,
  susunRencanaCetak,
  type InputRencanaCetak,
  type ItemAntreanCetak,
  type JumlahAntreanCetak,
  type RencanaCetak,
  type TidakBisaDicetak,
} from "./cetak";
import type { DrafBuku, HasilPencarianMetadata } from "@/lib/draf-buku";
import { bisaSimpanDraf, type BukuDuplikat } from "./draf";
import { ButuhKoneksiError, ValidasiError } from "./errors";
import { dariHasil, pencarianPerluMenunggu } from "./keadaan-metadata";
import { periksaFieldBuku, periksaFieldEksemplar, samaNilai } from "./masukan";
import { hitungNomorPanggil, type NomorPanggil } from "./nomor-panggil";
import { hitungSaranKategori, type MasukanSaran, type SaranKategori } from "./saran-kategori";
import { buatSesiPenerimaan, type OpsiSesi } from "./sesi-penerimaan";
import { isoLokal } from "./waktu";
import {
  buatPeminjaman,
  type DaftarPeminjaman,
  type ItemPeminjam,
  type PinjamanAktif,
} from "./peminjaman";

export { ButuhKoneksiError, ValidasiError } from "./errors";
export type { AturanKategoriRow, KategoriRow, LogRow, LokasiRow } from "./db";
export { hitungNomorPanggil, type NomorPanggil } from "./nomor-panggil";
export { hitungGrid, TEMPLATE_LABEL_BAWAAN, type GridTemplate, type TemplateLabel };
export type {
  InputRencanaCetak,
  ItemAntreanCetak,
  JenisSel,
  JumlahAntreanCetak,
  LabelCetak,
  LembarCetak,
  RencanaCetak,
  SelCetak,
  TidakBisaDicetak,
} from "./cetak";
export { susunChipBeranda, type BukuTerbaru, type ChipBeranda, type RingkasanBeranda } from "./beranda";
export { saringKoleksi, normalisasiTeks, type KriteriaKoleksi } from "./cari-koleksi";
export { STATUS_KOLEKSI, LABEL_STATUS_KOLEKSI, type StatusKoleksi } from "./status-koleksi";
export type {
  DaftarPeminjaman,
  HasilCariEksemplar,
  HasilPindaiLabel,
  InputPeminjam,
  InputPinjamkan,
  ItemPeminjam,
  ItemPeminjaman,
  PinjamanAktif,
} from "./peminjaman";
export { bacaNomorInduk, POLA_NOMOR_INDUK } from "@/lib/nomor-induk";
export { tanggalLokal } from "./peminjaman";
export type { Statistik } from "./statistik";
export type { BarisBukuInduk } from "@/lib/buku-induk";
export { normalisasiIsbn, type HasilIsbn } from "@/lib/isbn";
export type { MasukanSaran, SaranKategori } from "./saran-kategori";
export { bisaSimpanDraf, type BukuDuplikat };
export {
  JEDA_ISBN_SAMA_MS,
  LABEL_STATUS_KARTU,
  NOMOR_INDUK_BELUM,
  type DataSesi,
  type HasilPindai,
  type KartuScan,
  type OpsiSesi,
  type SesiPenerimaan,
  type StatusKartu,
} from "./sesi-penerimaan";

export const NOMOR_INDUK_KOSONG = "——";
const BATCH_PUSH = 50;
const META_KURSOR = "kursor";
const META_TEMPLATE_LABEL = "templateLabel";

/** Template Label beserta kolom × baris hasil hitungan. */
export type TemplateLabelLengkap = TemplateLabel & GridTemplate;
const LOG_MAKS = 200;

export type CreateOptions = {
  /** Nama database IndexedDB; tes memberi nama unik per kasus. */
  dbName?: string;
  /** Jam perangkat; dipakai untuk waktu pencatatan Eksemplar. */
  now?: () => Date;
  uuid?: () => string;
};

export type ItemKoleksi = {
  eksemplarId: string;
  bukuId: string;
  judul: string;
  pengarang: string;
  kategori: { kode: string; nama: string; warna: string };
  nomorInduk: string | null;
  /** Nomor Induk, atau "——" selama belum diberikan server. */
  nomorIndukTampil: string;
  /** Dihitung dari data terkini (Kategori, Pengarang Utama, judul). */
  nomorPanggil: NomorPanggil;
  menungguSinkron: boolean;
  waktuDicatat: string;
  kategoriId: string;
  lokasi: { id: string; nama: string } | null;
  isbn13: string | null;
  sampul: string | null;
  /** Semua nama Kontributor (bukan hanya Pengarang Utama); bahan pencarian. */
  kontributor: string[];
  /** `keluar` setelah Penyiangan. `daftarKoleksi` hanya memuat yang aktif. */
  status: "aktif" | "keluar";
  /** Sedang dipinjam: punya Peminjaman tanpa tanggal kembali (`idEksemplarDipinjam`). */
  dipinjam: boolean;
};

export type InputKontributor = { nama: string; peran?: Peran; utama?: boolean };

/** Isian field Eksemplar; yang tidak disebut atau kosong disimpan sebagai null. */
export type InputFieldEksemplar = Partial<FieldEksemplar>;

export type InputBukuBaru = Partial<Omit<FieldBuku, "judul">> & {
  judul: string;
  /** Tepat satu `utama: true` (Pengarang Utama). */
  kontributor: InputKontributor[];
  /** Eksemplar pertama; Kategori wajib. */
  eksemplar: { kategoriId: string } & InputFieldEksemplar;
};

/** Perubahan Buku: hanya field yang disebut yang berubah; null/"" mengosongkan. */
export type PerubahanBuku = Partial<FieldBuku> & { kontributor?: InputKontributor[] };

export type EksemplarDetail = {
  id: string;
  nomorInduk: string | null;
  nomorIndukTampil: string;
  menungguSinkron: boolean;
  status: "aktif" | "keluar";
  penyiangan: PenyianganDto | null;
  kategori: { id: string; kode: string; nama: string; warna: string };
  nomorPanggil: NomorPanggil;
  lokasi: { id: string; nama: string } | null;
  tanggalMasuk: string | null;
  asal: Asal | null;
  harga: number | null;
  kondisi: Kondisi | null;
  waktuDicatat: string;
  perluCetak: boolean;
  /** Pinjaman yang sedang berjalan; null bila tersedia. */
  dipinjam: PinjamanAktif | null;
};

export type DetailBuku = BukuRow & {
  pengarangUtama: KontributorDto | null;
  /** Urut menurut waktu dicatat (terlama dulu). */
  eksemplar: EksemplarDetail[];
};

/** Kategori, Lokasi, dan Aturan Kategori yang tersalin di perangkat (untuk layar kelola). */
export type DaftarLokal = {
  /** Termasuk Kategori yang diarsipkan. */
  kategori: KategoriRow[];
  lokasi: LokasiRow[];
  aturanKategori: AturanKategoriRow[];
};

type PerubahanDaftar = {
  kategori?: KategoriDto[];
  lokasi?: LokasiDto[];
  aturanKategori?: AturanKategoriDto[];
  templateLabel?: TemplateLabel | null;
};

export type StatusSinkronisasi = {
  /** Jumlah perubahan di outbox yang belum diterima server. */
  menunggu: number;
  /** Jumlah perubahan yang ditolak server dan butuh perhatian Pemilik. */
  ditolak: number;
};

/** Field yang ditimpa perubahan dari perangkat lain; juga baris log halaman Sinkronisasi. */
export type PemberitahuanDitimpa = LogRow;

export type HasilSinkronisasi = {
  dikirim: number;
  ditolak: number;
  /** Field yang ditimpa perubahan dari perangkat lain pada Sinkronisasi ini (untuk notifikasi). */
  ditimpa: PemberitahuanDitimpa[];
};

/** Satu perubahan di outbox, dirangkum untuk halaman Sinkronisasi. */
export type ItemAntrean = {
  /** Id mutasi (juga id outbox). */
  id: string;
  ringkasan: string;
  /** Alasan server menolak; hanya ada pada yang Gagal terkirim. */
  alasan?: string;
};

export type DaftarAntrean = { tertunda: ItemAntrean[]; gagal: ItemAntrean[] };

/** Field yang disentuh sebuah mutasi edit, per entitas (kunci `buku:<id>` / `eksemplar:<id>`). */
function medanEdit(m: Mutasi): { kunci: string; fields: string[] } | null {
  switch (m.jenis) {
    case "buku.ubah":
      return { kunci: `buku:${m.bukuId}`, fields: Object.keys(m.perubahan) };
    case "eksemplar.ubah":
      return { kunci: `eksemplar:${m.eksemplarId}`, fields: Object.keys(m.perubahan) };
    case "eksemplar.koreksiKategori":
      return { kunci: `eksemplar:${m.eksemplarId}`, fields: ["kategoriId", "perluCetak"] };
    case "peminjaman.ubah":
      return { kunci: `peminjaman:${m.peminjamanId}`, fields: Object.keys(m.perubahan) };
    case "peminjam.ubah":
      return { kunci: `peminjam:${m.peminjamId}`, fields: Object.keys(m.perubahan) };
    default:
      return null;
  }
}

/**
 * Seam: Perpustakaan Lokal. Satu-satunya pintu UI untuk membaca dan menulis
 * koleksi. Semua perintah menulis ke IndexedDB lebih dulu, lalu masuk outbox
 * (ADR 0004). Nomor Induk tidak pernah dibuat di perangkat.
 */
export function createLocalLibrary(opts: CreateOptions = {}) {
  const db = new LocalDb(opts.dbName ?? "lifelibrary");
  const now = opts.now ?? (() => new Date());
  const uuid = opts.uuid ?? (() => crypto.randomUUID());

  // Salinan awal preset Kategori supaya perangkat bisa dipakai sebelum pull pertama.
  const siap = (async () => {
    await db.open();
    if ((await db.kategori.count()) === 0) {
      await db.kategori.bulkPut(PRESET_KATEGORI.map((k) => ({ ...k, diarsipkan: false })));
    }
  })();

  /** Id outbox = id mutasi; server idempoten berdasarkan id ini. */
  const antre = (mutasi: Mutasi) => db.outbox.add({ id: mutasi.id, mutasi });

  const peminjaman = buatPeminjaman({ db, now, uuid, antre });
  /** Perintah dan pembaca Peminjaman baru jalan setelah database terbuka (preset Kategori tersalin). */
  const sesudahSiap =
    <A extends unknown[], R>(f: (...a: A) => Promise<R>) =>
    async (...a: A) => {
      await siap;
      return f(...a);
    };

  async function validasiKategori(kategoriId: string) {
    if (!kategoriId) throw new ValidasiError("kategoriId", "Pilih Kategori dulu sebelum menyimpan");
    const kat = await db.kategori.get(kategoriId);
    if (!kat || kat.diarsipkan) throw new ValidasiError("kategoriId", "Kategori tidak ditemukan");
    return kat;
  }

  /** Pilihan Kategori: yang diarsipkan tidak muncul. */
  async function daftarKategori(): Promise<KategoriRow[]> {
    return (await daftarKategoriTermasukArsip()).filter((k) => !k.diarsipkan);
  }

  async function daftarKategoriTermasukArsip(): Promise<KategoriRow[]> {
    await siap;
    return bacaKategori();
  }

  async function daftarLokasi(): Promise<LokasiRow[]> {
    await siap;
    return bacaLokasi();
  }

  /** Terurut menurut prioritas: angka 1 diperiksa paling dulu. */
  async function daftarAturanKategori(): Promise<AturanKategoriRow[]> {
    await siap;
    return bacaAturan();
  }

  // Pembaca tanpa `await siap`, supaya bisa dipakai liveQuery.
  const bacaKategori = async () =>
    (await db.kategori.toArray()).sort((a, b) => a.kode.localeCompare(b.kode));
  const bacaLokasi = async () =>
    (await db.lokasi.toArray()).sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  const bacaAturan = async () =>
    (await db.aturanKategori.toArray()).sort(
      (a, b) => a.prioritas - b.prioritas || a.pola.localeCompare(b.pola),
    );
  const bacaDaftar = async (): Promise<DaftarLokal> => ({
    kategori: await bacaKategori(),
    lokasi: await bacaLokasi(),
    aturanKategori: await bacaAturan(),
  });

  async function tambahBukuManual(input: { judul: string; pengarang: string; kategoriId: string }) {
    if (!input.pengarang.trim()) throw new ValidasiError("pengarang", "Pengarang wajib diisi");
    return tambahBuku({
      judul: input.judul,
      kontributor: [{ nama: input.pengarang, peran: "pengarang", utama: true }],
      eksemplar: { kategoriId: input.kategoriId },
    });
  }

  /** Saran Kategori dari data lokal (bekerja offline): Aturan Kategori, lalu Buku lain. */
  async function sarankanKategori(masukan: MasukanSaran): Promise<SaranKategori | null> {
    await siap;
    const [kategori, aturan, buku, eksemplar] = await Promise.all([
      db.kategori.toArray(),
      db.aturanKategori.toArray(),
      db.buku.toArray(),
      db.eksemplar.toArray(),
    ]);
    return hitungSaranKategori(masukan, { kategori, aturan, buku, eksemplar });
  }

  /** Buku yang sudah tercatat dengan ISBN-13 ini, atau null. */
  async function cariBukuByIsbn(isbn13: string): Promise<BukuDuplikat | null> {
    await siap;
    const buku = await db.buku.where("isbn13").equals(isbn13).first();
    if (!buku) return null;
    const eksemplar = (await db.eksemplar.where("bukuId").equals(buku.id).toArray()).sort((a, b) =>
      a.waktuDicatat.localeCompare(b.waktuDicatat),
    );
    return {
      bukuId: buku.id,
      judul: buku.judul,
      pengarang: pengarangUtama(buku)?.nama ?? "",
      kategoriId: eksemplar.at(-1)?.kategoriId ?? null,
      jumlahEksemplar: eksemplar.length,
    };
  }

  /**
   * Menyimpan draf Buku (hasil pencarian metadata yang sudah ditinjau, atau
   * draf kosong yang dilengkapi manual) sebagai Buku baru + Eksemplar pertama.
   * Pengarang pertama menjadi Pengarang Utama.
   */
  async function simpanDraf(draf: DrafBuku, eksemplar: { kategoriId: string } & InputFieldEksemplar) {
    const nama = draf.pengarang.map((n) => n.trim()).filter(Boolean);
    if (!draf.judul.trim()) throw new ValidasiError("judul", "Judul wajib diisi");
    if (nama.length === 0) throw new ValidasiError("pengarang", "Pengarang wajib diisi");
    return tambahBuku({
      judul: draf.judul,
      penerbit: draf.penerbit,
      kota: draf.kota,
      tahun: draf.tahun,
      halaman: draf.halaman,
      bahasa: draf.bahasa,
      sinopsis: draf.sinopsis,
      sampul: draf.sampul,
      subjek: draf.subjek,
      kelasDdc: draf.kelasDdc,
      isbn13: draf.isbn13,
      kontributor: nama.map((n, i) => ({ nama: n, peran: "pengarang" as const, utama: i === 0 })),
      eksemplar,
    });
  }

  /** Memulai Sesi Penerimaan: data sesi dipakai untuk setiap Eksemplar yang disimpan lewatnya. */
  async function mulaiSesiPenerimaan(opsi: OpsiSesi) {
    await siap;
    return buatSesiPenerimaan(
      {
        now,
        uuid,
        validasiLokasi,
        cariBukuByIsbn,
        simpanDraf,
        catatEksemplar,
        drafMenunggu: {
          semua: () => db.drafMenunggu.toArray(),
          baca: async (ids) => (await db.drafMenunggu.bulkGet(ids)).filter((r) => r !== undefined),
          simpan: async (row) => void (await db.drafMenunggu.put(row)),
          hapus: (id) => db.drafMenunggu.delete(id),
        },
        bacaEksemplar: async (ids) =>
          (await db.eksemplar.bulkGet(ids)).flatMap((e) =>
            e ? [{ id: e.id, nomorInduk: e.nomorInduk, menungguSinkron: e.menungguSinkron }] : [],
          ),
      },
      opsi,
    );
  }

  const bacaJumlahDrafMenunggu = () => db.drafMenunggu.where("status").equals("menunggu-data").count();
  /** Jumlah draf scan yang masih menunggu metadata (dicari saat online). */
  async function jumlahDrafMenunggu(): Promise<number> {
    await siap;
    return bacaJumlahDrafMenunggu();
  }

  let sedangMelengkapi: Promise<{ lengkap: number; masihMenunggu: number }> | null = null;

  /**
   * Melengkapi draf scan "menunggu data" lewat Pencarian Metadata; dipanggil
   * saat online (aplikasi dibuka, event `online`, berkala). Yang berhasil
   * (ditemukan, atau pasti tidak ada) menjadi "Siap ditinjau" dan muncul di
   * Sesi Penerimaan yang terbuka lewat `liveQuery`. Tanpa koneksi, login habis,
   * atau semua sumber tak terjangkau, draf tetap menunggu tanpa galat. Satu
   * proses pada satu waktu; pemanggil yang datang saat itu ikut hasilnya.
   */
  function lengkapiDrafMenunggu(
    cariMetadata: (isbn13: string) => Promise<HasilPencarianMetadata>,
  ): Promise<{ lengkap: number; masihMenunggu: number }> {
    sedangMelengkapi ??= (async () => {
      await siap;
      const menunggu = (await db.drafMenunggu.where("status").equals("menunggu-data").toArray()).sort(
        (a, b) => a.dicatat - b.dicatat,
      );
      let lengkap = 0;
      for (const row of menunggu) {
        let hasil: HasilPencarianMetadata;
        try {
          hasil = await cariMetadata(row.isbn13);
        } catch (e) {
          if (pencarianPerluMenunggu(e)) break; // masih offline atau login habis: sisanya tidak akan berhasil juga
          continue; // galat server untuk satu ISBN: coba lagi pada putaran berikutnya
        }
        if (!hasil.ditemukan && hasil.semuaGalat) continue;
        const keadaan = dariHasil(row.isbn13, hasil);
        // Kartu bisa saja sudah dibuang/disimpan selagi mencari; jangan menghidupkannya lagi.
        const diperbarui = await db.drafMenunggu
          .where("id")
          .equals(row.id)
          .modify({ ...keadaan, status: "siap" });
        if (diperbarui > 0) lengkap++;
      }
      return { lengkap, masihMenunggu: await bacaJumlahDrafMenunggu() };
    })().finally(() => {
      sedangMelengkapi = null;
    });
    return sedangMelengkapi;
  }

  /** Kontributor yang sudah dikenal di perangkat, menurut nama ternormalisasi. */
  async function kontributorDikenal() {
    const dikenal = new Map<string, { id: string; nama: string }>();
    for (const b of await db.buku.toArray()) {
      for (const k of b.kontributor) {
        const kunci = normalisasiNama(k.nama);
        if (!dikenal.has(kunci)) dikenal.set(kunci, { id: k.id, nama: k.nama });
      }
    }
    return dikenal;
  }

  /**
   * Merapikan Kontributor masukan: nama yang sama (setelah dinormalkan)
   * dipakai ulang dari Kontributor yang sudah ada dan digabung; wajib tepat
   * satu Pengarang Utama.
   */
  async function siapkanKontributor(input: InputKontributor[]): Promise<KontributorDto[]> {
    const dikenal = await kontributorDikenal();
    const daftar = input
      .filter((k) => k.nama.trim() !== "")
      .map((k) => {
        const nama = k.nama.trim();
        const ada = dikenal.get(normalisasiNama(nama));
        return {
          id: ada?.id ?? uuid(),
          nama: ada?.nama ?? nama,
          peran: k.peran ?? ("pengarang" as const),
          utama: k.utama ?? false,
        };
      });
    const gabung = gabungKontributor(daftar);
    const galat = periksaPengarangUtama(gabung);
    if (galat) throw new ValidasiError("kontributor", galat);
    return gabung;
  }

  async function validasiLokasi(lokasiId: string | null | undefined) {
    if (lokasiId && !(await db.lokasi.get(lokasiId))) {
      throw new ValidasiError("lokasiId", "Lokasi tidak ditemukan");
    }
  }

  async function validasiIsbnBebas(isbn13: string | null | undefined, kecualiBukuId?: string) {
    if (!isbn13) return;
    const sama = await db.buku.where("isbn13").equals(isbn13).first();
    if (sama && sama.id !== kecualiBukuId) {
      throw new ValidasiError("isbn13", "ISBN ini sudah tercatat. Tambahkan Eksemplar ke Buku yang ada");
    }
  }

  /** Buku baru lengkap dengan Eksemplar pertamanya, disimpan lokal lalu masuk outbox. */
  async function tambahBuku(input: InputBukuBaru) {
    await siap;
    const { eksemplar: inputEksemplar, kontributor: inputKontributor, ...inputBuku } = input;
    const field = periksaFieldBuku({ ...bukuKosong(), ...inputBuku });
    if (!field.judul) throw new ValidasiError("judul", "Judul wajib diisi");
    const { kategoriId, ...inputFieldEksemplar } = inputEksemplar;
    await validasiKategori(kategoriId);
    const fieldEksemplar = periksaFieldEksemplar(inputFieldEksemplar);
    await validasiLokasi(fieldEksemplar.lokasiId);

    const bukuId = uuid();
    const eksemplarId = uuid();
    await db.transaction("rw", [db.buku, db.eksemplar, db.outbox], async () => {
      await validasiIsbnBebas(field.isbn13);
      const kontributor = await siapkanKontributor(inputKontributor);
      const buku = { id: bukuId, ...field, kontributor } as BukuRow;
      await db.buku.add(buku);
      await antre({ id: uuid(), jenis: "buku.tambah", buku });
      await simpanEksemplar(eksemplarId, bukuId, kategoriId, fieldEksemplar);
    });
    return { bukuId, eksemplarId };
  }

  async function simpanEksemplar(
    eksemplarId: string,
    bukuId: string,
    kategoriId: string,
    field: Partial<FieldEksemplar> = {},
  ) {
    const waktuDicatat = isoLokal(now());
    const lengkap = { ...eksemplarKosong(), ...field };
    const row: EksemplarRow = {
      ...lengkap,
      id: eksemplarId,
      bukuId,
      kategoriId,
      nomorInduk: null,
      waktuDicatat,
      status: "aktif",
      menungguSinkron: true,
    };
    await db.eksemplar.add(row);
    const { tanggalMasuk, asal, harga, kondisi, lokasiId } = lengkap;
    await antre({
      id: uuid(),
      jenis: "eksemplar.catat",
      eksemplar: { id: eksemplarId, bukuId, kategoriId, waktuDicatat, tanggalMasuk, asal, harga, kondisi, lokasiId },
    });
  }

  /** Eksemplar baru untuk Buku yang sudah ada (mis. dari halaman Detail Buku). */
  async function catatEksemplar(input: { bukuId: string; kategoriId: string } & InputFieldEksemplar) {
    await siap;
    const { bukuId, kategoriId, ...inputField } = input;
    await validasiKategori(kategoriId);
    if (!(await db.buku.get(bukuId))) throw new ValidasiError("bukuId", "Buku tidak ditemukan");
    const field = periksaFieldEksemplar(inputField);
    await validasiLokasi(field.lokasiId);
    const eksemplarId = uuid();
    await db.transaction("rw", [db.eksemplar, db.outbox], () =>
      simpanEksemplar(eksemplarId, bukuId, kategoriId, field),
    );
    return { eksemplarId };
  }

  /**
   * Mengubah Buku (termasuk Kontributor). Hanya field yang benar-benar
   * berbeda yang masuk outbox; tanpa perbedaan tidak terjadi apa-apa.
   */
  async function ubahBuku(bukuId: string, perubahan: PerubahanBuku) {
    await siap;
    const { kontributor: inputKontributor, ...inputField } = perubahan;
    const field = periksaFieldBuku(inputField);
    await db.transaction("rw", [db.buku, db.outbox, db.eksemplar, db.kategori], async () => {
      const buku = await db.buku.get(bukuId);
      if (!buku) throw new ValidasiError("bukuId", "Buku tidak ditemukan");
      const nomorPanggilLama = await nomorPanggilEksemplarBuku(bukuId);
      const beda: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(field)) {
        if (!samaNilai(buku[k as keyof BukuRow], v)) beda[k] = v;
      }
      if ("isbn13" in beda) await validasiIsbnBebas(beda.isbn13 as string | null, bukuId);
      if (inputKontributor) {
        const kontributor = await siapkanKontributor(inputKontributor);
        if (!samaNilai(buku.kontributor, kontributor)) beda.kontributor = kontributor;
      }
      if (Object.keys(beda).length === 0) return;
      await db.buku.update(bukuId, beda as Partial<BukuRow>);
      await antre({ id: uuid(), jenis: "buku.ubah", bukuId, waktuUbah: isoLokal(now()), perubahan: beda });
      // Nomor Panggil berubah: Label lama tidak berlaku lagi, Eksemplar masuk Antrean Cetak.
      const nomorPanggilBaru = await nomorPanggilEksemplarBuku(bukuId);
      const berubah = [...nomorPanggilBaru]
        .filter(([id, teks]) => nomorPanggilLama.get(id) !== teks)
        .map(([id]) => id);
      await db.eksemplar.where("id").anyOf(berubah).modify({ perluCetak: true });
    });
  }

  /** Nomor Panggil tiap Eksemplar sebuah Buku menurut data lokal saat ini. */
  async function nomorPanggilEksemplarBuku(bukuId: string) {
    const buku = await db.buku.get(bukuId);
    const peta = new Map<string, string>();
    if (!buku) return peta;
    const utama = pengarangUtama(buku);
    for (const e of await db.eksemplar.where("bukuId").equals(bukuId).toArray()) {
      const k = await db.kategori.get(e.kategoriId);
      if (!k) continue;
      peta.set(
        e.id,
        hitungNomorPanggil({ kodeKategori: k.kode, pengarangUtama: utama?.nama ?? "", judul: buku.judul }).teks,
      );
    }
    return peta;
  }

  /** Mengubah data penerimaan Eksemplar (tanggal masuk, asal, harga, kondisi, Lokasi). */
  async function ubahEksemplar(eksemplarId: string, perubahan: InputFieldEksemplar) {
    await siap;
    const field = periksaFieldEksemplar(perubahan);
    await validasiLokasi(field.lokasiId);
    await db.transaction("rw", [db.eksemplar, db.outbox], async () => {
      const e = await db.eksemplar.get(eksemplarId);
      if (!e) throw new ValidasiError("eksemplarId", "Eksemplar tidak ditemukan");
      const beda: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(field)) {
        if (!samaNilai(e[k as keyof EksemplarRow], v)) beda[k] = v;
      }
      if (Object.keys(beda).length === 0) return;
      await db.eksemplar.update(eksemplarId, beda as Partial<EksemplarRow>);
      await antre({
        id: uuid(),
        jenis: "eksemplar.ubah",
        eksemplarId,
        waktuUbah: isoLokal(now()),
        perubahan: beda,
      });
    });
  }

  /**
   * Koreksi Kategori: Nomor Panggil mengikuti Kategori baru, Nomor Induk
   * tetap (ADR 0001). Eksemplar ditandai perlu cetak ulang Label.
   */
  async function koreksiKategori(eksemplarId: string, kategoriId: string) {
    await siap;
    await validasiKategori(kategoriId);
    await db.transaction("rw", [db.eksemplar, db.outbox], async () => {
      const e = await db.eksemplar.get(eksemplarId);
      if (!e) throw new ValidasiError("eksemplarId", "Eksemplar tidak ditemukan");
      if (e.kategoriId === kategoriId) return;
      await db.eksemplar.update(eksemplarId, { kategoriId, perluCetak: true });
      await antre({
        id: uuid(),
        jenis: "eksemplar.koreksiKategori",
        eksemplarId,
        kategoriId,
        waktuUbah: isoLokal(now()),
      });
    });
  }

  /** Koleksi aktif: Eksemplar yang sudah keluar (Penyiangan) tidak termasuk. */
  async function daftarKoleksi(): Promise<ItemKoleksi[]> {
    await siap;
    return bacaKoleksiAktif();
  }

  /** Cari dan filter Koleksi dari data lokal (tanpa jaringan). Lihat `KriteriaKoleksi`. */
  async function cariKoleksi(kriteria: KriteriaKoleksi = {}): Promise<ItemKoleksi[]> {
    await siap;
    return saringKoleksi(await bacaKoleksi(), kriteria);
  }

  /** Angka dan Buku terbaru untuk Beranda, dari data lokal. Lihat `susunRingkasanBeranda`. */
  async function ringkasanBeranda(): Promise<RingkasanBeranda> {
    await siap;
    return bacaRingkasanBeranda();
  }

  async function bacaRingkasanBeranda(): Promise<RingkasanBeranda> {
    return susunRingkasanBeranda(await bacaKoleksi());
  }

  async function bukuInduk(opsi: { tahun?: number | null } = {}) {
    await siap;
    return bacaBukuInduk(opsi);
  }

  async function statistik() {
    await siap;
    return bacaStatistik();
  }

  async function detailBuku(bukuId: string): Promise<DetailBuku | null> {
    await siap;
    return bacaDetailBuku(bukuId);
  }

  // Tanpa `await siap` di dalam: dipakai liveQuery, yang kehilangan pelacakan
  // bila di-await promise non-Dexie.
  async function bacaDetailBuku(bukuId: string): Promise<DetailBuku | null> {
    const buku = await db.buku.get(bukuId);
    if (!buku) return null;
    const [eksemplar, kategori, lokasi] = await Promise.all([
      db.eksemplar.where("bukuId").equals(bukuId).toArray(),
      db.kategori.toArray(),
      db.lokasi.toArray(),
    ]);
    const pinjaman = new Map(
      await Promise.all(eksemplar.map(async (e) => [e.id, await peminjaman.pinjamanAktif(e.id)] as const)),
    );
    const katById = new Map(kategori.map((k) => [k.id, k]));
    const lokasiById = new Map(lokasi.map((l) => [l.id, l]));
    const utama = pengarangUtama(buku);
    return {
      ...buku,
      pengarangUtama: utama ?? null,
      eksemplar: eksemplar
        .sort((a, b) => a.waktuDicatat.localeCompare(b.waktuDicatat) || a.id.localeCompare(b.id))
        .flatMap((e) => {
          const k = katById.get(e.kategoriId);
          if (!k) return [];
          const l = e.lokasiId ? lokasiById.get(e.lokasiId) : undefined;
          return [
            {
              id: e.id,
              nomorInduk: e.nomorInduk,
              nomorIndukTampil: e.nomorInduk ?? NOMOR_INDUK_KOSONG,
              menungguSinkron: e.menungguSinkron,
              status: e.status,
              penyiangan: e.penyiangan ?? null,
              kategori: { id: k.id, kode: k.kode, nama: k.nama, warna: k.warna },
              nomorPanggil: hitungNomorPanggil({
                kodeKategori: k.kode,
                pengarangUtama: utama?.nama ?? "",
                judul: buku.judul,
              }),
              lokasi: l ? { id: l.id, nama: l.nama } : null,
              tanggalMasuk: e.tanggalMasuk,
              asal: e.asal,
              harga: e.harga,
              kondisi: e.kondisi,
              waktuDicatat: e.waktuDicatat,
              perluCetak: e.perluCetak,
              dipinjam: pinjaman.get(e.id) ?? null,
            },
          ];
        }),
    };
  }

  const pengarangUtama = (b: BukuRow) => b.kontributor.find((c) => c.utama) ?? b.kontributor[0];

  const bacaKoleksiAktif = async () => (await bacaKoleksi()).filter((i) => i.status === "aktif");

  /** Semua Eksemplar, termasuk yang keluar; terbaru dicatat dulu. */
  async function bacaKoleksi(): Promise<ItemKoleksi[]> {
    const [eksemplar, buku, kategori, lokasi, dipinjam] = await Promise.all([
      db.eksemplar.toArray(),
      db.buku.toArray(),
      db.kategori.toArray(),
      db.lokasi.toArray(),
      idEksemplarDipinjam(db),
    ]);
    const bukuById = new Map(buku.map((b) => [b.id, b]));
    const katById = new Map(kategori.map((k) => [k.id, k]));
    const lokasiById = new Map(lokasi.map((l) => [l.id, l]));
    return eksemplar
      .sort((a, b) => (a.waktuDicatat < b.waktuDicatat ? 1 : a.waktuDicatat > b.waktuDicatat ? -1 : 0))
      .flatMap((e) => {
        const b = bukuById.get(e.bukuId);
        const k = katById.get(e.kategoriId);
        if (!b || !k) return [];
        const utama = pengarangUtama(b);
        return [
          {
            eksemplarId: e.id,
            bukuId: b.id,
            judul: b.judul,
            pengarang: utama?.nama ?? "",
            kategori: { kode: k.kode, nama: k.nama, warna: k.warna },
            nomorInduk: e.nomorInduk,
            nomorIndukTampil: e.nomorInduk ?? NOMOR_INDUK_KOSONG,
            nomorPanggil: hitungNomorPanggil({
              kodeKategori: k.kode,
              pengarangUtama: utama?.nama ?? "",
              judul: b.judul,
            }),
            menungguSinkron: e.menungguSinkron,
            waktuDicatat: e.waktuDicatat,
            kategoriId: k.id,
            lokasi: e.lokasiId && lokasiById.has(e.lokasiId) ? { id: e.lokasiId, nama: lokasiById.get(e.lokasiId)!.nama } : null,
            isbn13: b.isbn13,
            sampul: b.sampul,
            kontributor: b.kontributor.map((c) => c.nama),
            status: e.status,
            dipinjam: dipinjam.has(e.id),
          },
        ];
      });
  }

  async function bacaBukuInduk(opsi: { tahun?: number | null }) {
    const [eksemplar, buku, kategori] = await Promise.all([
      db.eksemplar.toArray(),
      db.buku.toArray(),
      db.kategori.toArray(),
    ]);
    const bukuById = new Map(buku.map((b) => [b.id, b]));
    const katById = new Map(kategori.map((k) => [k.id, k]));
    const baris = eksemplar.flatMap((e): BarisBukuInduk[] => {
      const b = bukuById.get(e.bukuId);
      const k = katById.get(e.kategoriId);
      if (!b || !k) return [];
      return [
        {
          eksemplarId: e.id,
          bukuId: b.id,
          nomorInduk: e.nomorInduk,
          judul: b.judul,
          pengarang: pengarangUtama(b)?.nama ?? "",
          kategori: { kode: k.kode, nama: k.nama },
          // Tahun pencatatan = tahun lokal perangkat saat dicatat (ADR 0001), sama dengan tahun Nomor Induk.
          tahunPencatatan: Number(e.waktuDicatat.slice(0, 4)),
          waktuDicatat: e.waktuDicatat,
          tanggalMasuk: e.tanggalMasuk,
          asal: e.asal,
          harga: e.harga,
          status: e.status,
          menungguSinkron: e.menungguSinkron,
          penyiangan: e.penyiangan ?? null,
        },
      ];
    });
    return susunBukuInduk(baris, opsi);
  }

  async function bacaStatistik() {
    const [eksemplar, kategori] = await Promise.all([db.eksemplar.toArray(), db.kategori.toArray()]);
    return hitungStatistik(eksemplar, kategori);
  }

  /**
   * Penyiangan: mengeluarkan Eksemplar dari koleksi aktif. Hanya online
   * (ADR 0004): lewat `transport`, bukan outbox. Tanpa koneksi gagal dengan
   * `ButuhKoneksiError` dan data lokal tidak berubah. Eksemplar yang masih
   * Menunggu Sinkron belum ada di server, jadi harus disinkronkan dulu.
   */
  function penyiangan(transport: PenyianganTransport) {
    return {
      async siangi(eksemplarId: string, input: PenyianganInput) {
        await siap;
        const e = await db.eksemplar.get(eksemplarId);
        if (!e) throw new ValidasiError("eksemplarId", "Eksemplar tidak ditemukan");
        if (e.status === "keluar") throw new ValidasiError("eksemplarId", "Eksemplar ini sudah keluar dari koleksi");
        if (e.menungguSinkron) {
          throw new ValidasiError("eksemplarId", "Eksemplar ini belum tersinkron. Sinkronkan dulu sebelum mengeluarkannya");
        }
        if ((await idEksemplarDipinjam(db)).has(eksemplarId)) {
          throw new ValidasiError("eksemplarId", "Eksemplar ini sedang dipinjam. Kembalikan dulu sebelum mengeluarkannya");
        }
        let hasil;
        try {
          hasil = await transport.siangi(eksemplarId, input);
        } catch (err) {
          if (err instanceof TypeError) throw new ButuhKoneksiError();
          throw err;
        }
        await db.eksemplar.update(eksemplarId, { status: hasil.status, penyiangan: hasil.penyiangan });
        return hasil;
      },
    };
  }

  async function statusSinkronisasi(): Promise<StatusSinkronisasi> {
    await siap;
    return bacaStatus();
  }

  async function bacaStatus(): Promise<StatusSinkronisasi> {
    const outbox = await db.outbox.toArray();
    const ditolak = outbox.filter((o) => o.ditolak).length;
    return { menunggu: outbox.length - ditolak, ditolak };
  }

  const KATA_JENIS: Record<Mutasi["jenis"], string> = {
    "buku.tambah": "Tambah Buku",
    "eksemplar.catat": "Catat Eksemplar",
    "buku.ubah": "Ubah",
    "eksemplar.ubah": "Ubah",
    "eksemplar.koreksiKategori": "Koreksi Kategori",
    "eksemplar.tandaiTercetak": "Tandai tercetak",
    "peminjaman.pinjamkan": "Pinjamkan",
    "peminjaman.ubah": "Ubah Peminjaman",
    "peminjam.ubah": "Ubah Peminjam",
  };

  async function ringkasan(m: Mutasi): Promise<string> {
    if (m.jenis === "buku.tambah") return `${KATA_JENIS[m.jenis]} ${m.buku.judul}`;
    if (m.jenis === "eksemplar.tandaiTercetak") return `${KATA_JENIS[m.jenis]} ${m.eksemplarIds.length} Label`;
    if (m.jenis === "peminjam.ubah") {
      const nama = (await db.peminjam.get(m.peminjamId))?.nama ?? "Peminjam";
      return `Ubah ${Object.keys(m.perubahan).map(labelField).join(", ")} ${nama}`;
    }
    if (m.jenis === "peminjaman.pinjamkan" || m.jenis === "peminjaman.ubah") {
      const eksemplarId =
        m.jenis === "peminjaman.pinjamkan"
          ? m.peminjaman.eksemplarId
          : (await db.peminjaman.get(m.peminjamanId))?.eksemplarId;
      const e = eksemplarId ? await db.eksemplar.get(eksemplarId) : undefined;
      const judulBuku = (e && (await db.buku.get(e.bukuId))?.judul) || "Buku";
      if (m.jenis === "peminjaman.pinjamkan") return `Pinjamkan ${judulBuku} ke ${m.peminjam.nama}`;
      return `${"tanggalKembali" in m.perubahan ? "Kembalikan" : "Ubah jatuh tempo"} ${judulBuku}`;
    }
    let bukuId: string;
    if (m.jenis === "eksemplar.catat") bukuId = m.eksemplar.bukuId;
    else if (m.jenis === "buku.ubah") bukuId = m.bukuId;
    else bukuId = (await db.eksemplar.get(m.eksemplarId))?.bukuId ?? "";
    const judul = (await db.buku.get(bukuId))?.judul ?? "Buku";
    if (m.jenis === "eksemplar.catat") return `${KATA_JENIS[m.jenis]} ${judul}`;
    if (m.jenis === "eksemplar.koreksiKategori") return `${KATA_JENIS[m.jenis]} pada ${judul}`;
    const labels = Object.keys(m.perubahan).map(labelField).join(", ");
    return `Ubah ${labels} pada ${judul}`;
  }

  async function bacaAntrean(): Promise<DaftarAntrean> {
    const hasil: DaftarAntrean = { tertunda: [], gagal: [] };
    for (const o of await db.outbox.orderBy("seq").toArray()) {
      const item: ItemAntrean = { id: o.id, ringkasan: await ringkasan(o.mutasi) };
      if (o.ditolak) hasil.gagal.push({ ...item, alasan: o.ditolak });
      else hasil.tertunda.push(item);
    }
    return hasil;
  }

  async function daftarAntrean(): Promise<DaftarAntrean> {
    await siap;
    return bacaAntrean();
  }

  /** "Coba lagi": perubahan yang Gagal terkirim (satu, atau semuanya) kembali menunggu dan ikut Sinkronisasi berikutnya. */
  async function cobaLagi(id?: string) {
    await siap;
    await db.outbox
      .filter((o: OutboxRow) => !!o.ditolak && (id === undefined || o.id === id))
      .modify((o: OutboxRow) => {
        delete o.ditolak;
      });
  }

  const bacaLog = () => db.log.orderBy("pada").reverse().toArray();
  async function logPerubahan(): Promise<LogRow[]> {
    await siap;
    return bacaLog();
  }

  const TABEL_DAFTAR = [db.kategori, db.lokasi, db.aturanKategori, db.meta];

  /** Tulis perubahan daftar; yang bertanda `dihapus` dibuang dari salinan lokal. */
  async function tulisDaftar(p: PerubahanDaftar) {
    const kategori = p.kategori ?? [];
    const hapusKategori = kategori.filter((k) => k.dihapus).map((k) => k.id);
    await db.kategori.bulkPut(
      kategori
        .filter((k) => !k.dihapus)
        .map(({ id, kode, nama, warna, diarsipkan }) => ({ id, kode, nama, warna, diarsipkan })),
    );
    await db.kategori.bulkDelete(hapusKategori);
    // Aturan milik Kategori yang dihapus ikut hilang (server menghapusnya juga).
    await db.aturanKategori.where("kategoriId").anyOf(hapusKategori).delete();

    const lokasi = p.lokasi ?? [];
    await db.lokasi.bulkPut(lokasi.filter((l) => !l.dihapus).map(({ id, nama }) => ({ id, nama })));
    await db.lokasi.bulkDelete(lokasi.filter((l) => l.dihapus).map((l) => l.id));

    const aturan = p.aturanKategori ?? [];
    await db.aturanKategori.bulkPut(
      aturan
        .filter((a) => !a.dihapus)
        .map(({ id, jenis, pola, kategoriId, prioritas }) => ({ id, jenis, pola, kategoriId, prioritas })),
    );
    await db.aturanKategori.bulkDelete(aturan.filter((a) => a.dihapus).map((a) => a.id));

    // Template Label disalin di tabel meta (satu per koleksi); null = tidak ada kabar baru.
    if (p.templateLabel) {
      await db.meta.put({ key: META_TEMPLATE_LABEL, value: JSON.stringify(p.templateLabel) });
    }
  }

  /**
   * Field yang masih punya perubahan di outbox (termasuk yang Gagal terkirim)
   * dipertahankan: nilai lokalnya belum diterima server, jadi pull tidak boleh
   * menggantinya.
   */
  async function medanTertunda() {
    const peta = new Map<string, Set<string>>();
    for (const o of await db.outbox.toArray()) {
      if (o.mutasi.jenis === "eksemplar.tandaiTercetak") {
        // Status cetak lokal belum diterima server: pull tidak boleh mengembalikannya ke antrean.
        for (const id of o.mutasi.eksemplarIds) {
          const kunci = `eksemplar:${id}`;
          peta.set(kunci, (peta.get(kunci) ?? new Set<string>()).add("perluCetak"));
        }
        continue;
      }
      const medan = medanEdit(o.mutasi);
      if (!medan) continue;
      const set = peta.get(medan.kunci) ?? new Set<string>();
      medan.fields.forEach((f) => set.add(f));
      peta.set(medan.kunci, set);
    }
    return peta;
  }

  function pertahankan<T extends object>(baru: T, lama: T | undefined, lindung: Set<string> | undefined): T {
    if (!lama || !lindung) return baru;
    const hasil = { ...baru } as Record<string, unknown>;
    for (const f of lindung) if (f in lama) hasil[f] = (lama as Record<string, unknown>)[f];
    return hasil as T;
  }

  async function terapkanPull(res: PullResponse) {
    await db.transaction("rw", [...TABEL_DAFTAR, db.buku, db.eksemplar, db.outbox, db.peminjam, db.peminjaman], async () => {
      const lindung = await medanTertunda();
      await tulisDaftar(res);
      const bukuLama = new Map((await db.buku.bulkGet(res.buku.map((b) => b.id))).map((b) => [b?.id, b]));
      await db.buku.bulkPut(
        res.buku.map((b) => pertahankan({ ...b }, bukuLama.get(b.id), lindung.get(`buku:${b.id}`))),
      );
      const eksemplarLama = new Map(
        (await db.eksemplar.bulkGet(res.eksemplar.map((e) => e.id))).map((e) => [e?.id, e]),
      );
      await db.eksemplar.bulkPut(
        res.eksemplar.map((e) =>
          pertahankan(
            {
              id: e.id,
              bukuId: e.bukuId,
              kategoriId: e.kategoriId,
              nomorInduk: e.nomorInduk,
              waktuDicatat: e.waktuDicatat,
              status: e.status,
              penyiangan: e.penyiangan,
              lokasiId: e.lokasiId,
              tanggalMasuk: e.tanggalMasuk,
              asal: e.asal,
              harga: e.harga,
              kondisi: e.kondisi,
              perluCetak: e.perluCetak,
              menungguSinkron: false,
            },
            eksemplarLama.get(e.id),
            lindung.get(`eksemplar:${e.id}`),
          ),
        ),
      );
      const peminjamLama = new Map(
        (await db.peminjam.bulkGet((res.peminjam ?? []).map((p) => p.id))).map((p) => [p?.id, p]),
      );
      await db.peminjam.bulkPut(
        (res.peminjam ?? []).map((p) => pertahankan({ ...p }, peminjamLama.get(p.id), lindung.get(`peminjam:${p.id}`))),
      );
      const peminjamanLama = new Map(
        (await db.peminjaman.bulkGet((res.peminjaman ?? []).map((p) => p.id))).map((p) => [p?.id, p]),
      );
      await db.peminjaman.bulkPut(
        (res.peminjaman ?? []).map((p) =>
          pertahankan({ ...p }, peminjamanLama.get(p.id), lindung.get(`peminjaman:${p.id}`)),
        ),
      );
      await db.meta.put({ key: META_KURSOR, value: res.kursor });
    });
  }

  /**
   * Field mutasi ini kalah dari perubahan perangkat lain: salinan lokal disamakan
   * dengan nilai server dan dicatat di log. Dilewati bila Pemilik sudah membuat
   * perubahan yang lebih baru untuk field itu (masih di outbox).
   */
  async function terapkanDitimpa(m: Mutasi, daftar: FieldDitimpa[]): Promise<PemberitahuanDitimpa[]> {
    const medan = medanEdit(m);
    if (!medan) return [];
    const [jenis, id] = medan.kunci.split(":");
    const lindung = (await medanTertunda()).get(medan.kunci);
    const hasil: PemberitahuanDitimpa[] = [];
    for (const { field, nilai } of daftar) {
      if (lindung?.has(field)) continue;
      let bukuId: string;
      let eksemplarId: string | null = null;
      let nomorInduk: string | null = null;
      if (jenis === "peminjam") {
        const p = await db.peminjam.get(id);
        if (!p) continue;
        await db.peminjam.update(id, { [field]: nilai } as Partial<PeminjamRow>);
        const label = labelField(field);
        hasil.push({
          id: uuid(),
          pada: now().getTime(),
          bukuId: "",
          eksemplarId: null,
          judul: p.nama,
          field,
          label,
          pesan: `${label} ${p.nama} diperbarui dari perangkat lain`,
        });
        continue;
      }
      if (jenis === "peminjaman") {
        const pj = await db.peminjaman.get(id);
        const e = pj && (await db.eksemplar.get(pj.eksemplarId));
        if (!pj || !e) continue;
        await db.peminjaman.update(id, { [field]: nilai } as Partial<PeminjamanRow>);
        bukuId = e.bukuId;
        eksemplarId = e.id;
        nomorInduk = e.nomorInduk;
        const judul = (await db.buku.get(bukuId))?.judul ?? "";
        const label = labelField(field);
        hasil.push({
          id: uuid(),
          pada: now().getTime(),
          bukuId,
          eksemplarId,
          judul,
          field,
          label,
          pesan: `${label} peminjaman ${judul}${nomorInduk ? ` (${nomorInduk})` : ""} diperbarui dari perangkat lain`,
        });
        continue;
      }
      if (jenis === "buku") {
        bukuId = id;
        await db.buku.update(id, { [field]: nilai } as Partial<BukuRow>);
      } else {
        const e = await db.eksemplar.get(id);
        if (!e) continue;
        bukuId = e.bukuId;
        eksemplarId = id;
        nomorInduk = e.nomorInduk;
        await db.eksemplar.update(id, { [field]: nilai } as Partial<EksemplarRow>);
      }
      const judul = (await db.buku.get(bukuId))?.judul ?? "";
      const label = labelField(field);
      const di = eksemplarId ? `${judul}${nomorInduk ? ` (${nomorInduk})` : ""}` : judul;
      hasil.push({
        id: uuid(),
        pada: now().getTime(),
        bukuId,
        eksemplarId,
        judul,
        field,
        label,
        pesan: `${label} di ${di} diperbarui dari perangkat lain`,
      });
    }
    await db.log.bulkAdd(hasil);
    const lebih = (await db.log.count()) - LOG_MAKS;
    if (lebih > 0) await db.log.orderBy("pada").limit(lebih).delete();
    return hasil;
  }

  /**
   * Kirim outbox (push) lalu ambil perubahan baru (pull). Melempar kalau
   * transport gagal; outbox tetap utuh dan bisa dikirim ulang dengan aman
   * karena server idempoten berdasarkan id mutasi.
   */
  async function sinkronkan(transport: SyncTransport): Promise<HasilSinkronisasi> {
    await siap;
    let dikirim = 0;
    let ditolak = 0;
    const ditimpa: PemberitahuanDitimpa[] = [];
    for (;;) {
      const batch = (await db.outbox.orderBy("seq").toArray())
        .filter((o) => !o.ditolak)
        .slice(0, BATCH_PUSH);
      if (batch.length === 0) break;
      const res = await transport.push({ mutasi: batch.map((o) => o.mutasi) });
      await db.transaction(
        "rw",
        [db.outbox, db.eksemplar, db.buku, db.log, db.peminjam, db.peminjaman],
        async () => {
        for (const h of res.hasil) {
          const entri = batch.find((o) => o.id === h.id);
          if (!entri) continue;
          if (h.status === "ditolak") {
            await db.outbox.update(entri.seq!, { ditolak: h.alasan });
            // Pinjaman yang ditolak server (mis. Eksemplar sudah dipinjam dari perangkat lain)
            // tidak berlaku: salinan lokal kembali sama dengan server.
            if (entri.mutasi.jenis === "peminjaman.pinjamkan") {
              await db.peminjaman.delete(entri.mutasi.peminjaman.id);
            }
            ditolak++;
            continue;
          }
          if (h.eksemplarId && h.nomorInduk) {
            await db.eksemplar.update(h.eksemplarId, { nomorInduk: h.nomorInduk, menungguSinkron: false });
          }
          await db.outbox.delete(entri.seq!);
          dikirim++;
          if (h.ditimpa?.length) ditimpa.push(...(await terapkanDitimpa(entri.mutasi, h.ditimpa)));
        }
      });
    }
    const kursor = (await db.meta.get(META_KURSOR))?.value ?? null;
    await terapkanPull(await transport.pull(kursor));
    return { dikirim, ditolak, ditimpa };
  }

  /**
   * Perintah kelola Kategori, Lokasi, dan Aturan Kategori. Hanya online
   * (ADR 0004): lewat `transport`, bukan outbox. Hasilnya langsung ditulis ke
   * salinan lokal. Tanpa koneksi, perintah gagal dengan `ButuhKoneksiError`
   * dan data lokal tidak berubah.
   */
  function kelola(transport: KelolaTransport) {
    async function jalankan<D>(panggil: () => Promise<D>, simpan: (d: D) => PerubahanDaftar) {
      await siap;
      let hasil: D;
      try {
        hasil = await panggil();
      } catch (e) {
        // fetch melempar TypeError bila jaringan tidak ada; penolakan server dan galat lain dilewatkan.
        if (e instanceof TypeError) throw new ButuhKoneksiError();
        throw e;
      }
      await db.transaction("rw", TABEL_DAFTAR, () => tulisDaftar(simpan(hasil)));
      return hasil;
    }

    function perintah<Baru, Ubah, Dto>(
      t: {
        buat(i: Baru): Promise<Dto>;
        ubah(id: string, u: Ubah): Promise<Dto>;
        hapus(id: string): Promise<Dto>;
      },
      simpan: (d: Dto) => PerubahanDaftar,
    ) {
      return {
        buat: (input: Baru) => jalankan(() => t.buat(input), simpan),
        ubah: (id: string, perubahan: Ubah) => jalankan(() => t.ubah(id, perubahan), simpan),
        hapus: (id: string) => jalankan(() => t.hapus(id), simpan),
      };
    }

    const kategori = perintah(transport.kategori, (d) => ({ kategori: [d] }));
    return {
      templateLabel: {
        simpan: (template: TemplateLabel) =>
          jalankan(() => transport.templateLabel.simpan(template), (d) => ({ templateLabel: d })),
      },
      kategori: {
        ...kategori,
        arsipkan: (id: string) => kategori.ubah(id, { diarsipkan: true }),
        pulihkan: (id: string) => kategori.ubah(id, { diarsipkan: false }),
      },
      lokasi: perintah(transport.lokasi, (d) => ({ lokasi: [d] })),
      aturanKategori: perintah(transport.aturanKategori, (d) => ({ aturanKategori: [d] })),
    };
  }

  /** Template Label tersimpan (atau bawaan) beserta kolom × baris-nya. */
  async function templateLabel(): Promise<TemplateLabelLengkap> {
    await siap;
    return bacaTemplateLabel();
  }

  const bacaTemplateLabel = async (): Promise<TemplateLabelLengkap> => {
    const t = await bacaTemplateTersimpan();
    return { ...t, ...hitungGrid(t) };
  };

  async function bacaTemplateTersimpan(): Promise<TemplateLabel> {
    const row = await db.meta.get(META_TEMPLATE_LABEL);
    if (!row?.value) return TEMPLATE_LABEL_BAWAAN;
    const { kertas, w, h, mt, ml, gx, gy } = JSON.parse(row.value) as TemplateLabel;
    return { kertas, w, h, mt, ml, gx, gy };
  }

  /** Semua Eksemplar aktif sebagai bahan Label, urut menurut waktu dicatat (terlama dulu). */
  async function bacaBahanCetak(): Promise<{ item: ItemAntreanCetak; perluCetak: boolean }[]> {
    const [eksemplar, buku, kategori] = await Promise.all([
      db.eksemplar.toArray(),
      db.buku.toArray(),
      db.kategori.toArray(),
    ]);
    const bukuById = new Map(buku.map((b) => [b.id, b]));
    const katById = new Map(kategori.map((k) => [k.id, k]));
    return eksemplar
      .filter((e) => e.status === "aktif")
      .sort((a, b) => a.waktuDicatat.localeCompare(b.waktuDicatat) || a.id.localeCompare(b.id))
      .flatMap((e) => {
        const b = bukuById.get(e.bukuId);
        const k = katById.get(e.kategoriId);
        if (!b || !k) return [];
        const utama = pengarangUtama(b);
        const bisaDicetak = e.nomorInduk !== null;
        return [
          {
            perluCetak: e.perluCetak,
            item: {
              eksemplarId: e.id,
              bukuId: b.id,
              judul: b.judul,
              pengarang: utama?.nama ?? "",
              kategori: { kode: k.kode, nama: k.nama, warna: k.warna },
              nomorInduk: e.nomorInduk,
              nomorPanggil: hitungNomorPanggil({
                kodeKategori: k.kode,
                pengarangUtama: utama?.nama ?? "",
                judul: b.judul,
              }),
              waktuDicatat: e.waktuDicatat,
              bisaDicetak,
              alasanTidakBisa: bisaDicetak ? null : ALASAN_BELUM_PUNYA_NOMOR_INDUK,
            },
          },
        ];
      });
  }

  /** Eksemplar yang Labelnya belum dicetak (atau perlu dicetak ulang). */
  async function bacaAntreanCetak(): Promise<ItemAntreanCetak[]> {
    return (await bacaBahanCetak()).filter((b) => b.perluCetak).map((b) => b.item);
  }

  async function bacaJumlahAntrean(): Promise<JumlahAntreanCetak> {
    const antrean = await bacaAntreanCetak();
    const siapDicetak = antrean.filter((i) => i.bisaDicetak).length;
    return { total: antrean.length, siapDicetak, menungguNomorInduk: antrean.length - siapDicetak };
  }

  async function antreanCetak(): Promise<ItemAntreanCetak[]> {
    await siap;
    return bacaAntreanCetak();
  }

  async function jumlahAntreanCetak(): Promise<JumlahAntreanCetak> {
    await siap;
    return bacaJumlahAntrean();
  }

  /** Eksemplar Menunggu Sinkron (belum punya Nomor Induk) tidak bisa ditandai tercetak. */
  async function tandaiTercetak(eksemplarIds: string[]) {
    await siap;
    const ids = [...new Set(eksemplarIds)];
    await db.transaction("rw", [db.eksemplar, db.outbox], async () => {
      const antri: string[] = [];
      for (const id of ids) {
        const e = await db.eksemplar.get(id);
        if (!e) throw new ValidasiError("eksemplarId", "Eksemplar tidak ditemukan");
        if (e.nomorInduk === null) {
          throw new ValidasiError(
            "eksemplarId",
            `Eksemplar ${ALASAN_BELUM_PUNYA_NOMOR_INDUK}, jadi Labelnya belum bisa dicetak atau ditandai tercetak`,
          );
        }
        if (e.perluCetak) antri.push(id);
      }
      await db.eksemplar.where("id").anyOf(antri).modify({ perluCetak: false });
      // Server menerima paling banyak 500 Eksemplar per mutasi.
      for (let i = 0; i < antri.length; i += 500) {
        await antre({
          id: uuid(),
          jenis: "eksemplar.tandaiTercetak",
          eksemplarIds: antri.slice(i, i + 500),
          waktuUbah: isoLokal(now()),
        });
      }
    });
  }

  /**
   * Pratinjau cetak: sel per lembar (dilewati, Label, kosong), jumlah lembar,
   * dan Eksemplar yang tidak bisa dicetak. Hanya membaca, jadi jalan offline.
   */
  async function rencanaCetak(input: InputRencanaCetak): Promise<RencanaCetak> {
    await siap;
    const template = input.template ?? (await bacaTemplateTersimpan());
    const bahan = new Map((await bacaBahanCetak()).map((b) => [b.item.eksemplarId, b.item]));
    const pilihan = [...new Set(input.eksemplarIds)].flatMap((id) => {
      const i = bahan.get(id);
      return i ? [i] : [];
    });
    const tidakBisa: TidakBisaDicetak[] = pilihan
      .filter((i) => !i.bisaDicetak)
      .map((i) => ({ eksemplarId: i.eksemplarId, judul: i.judul, alasan: i.alasanTidakBisa! }));
    const siapCetak = pilihan.flatMap((i) =>
      i.nomorInduk === null ? [] : [{ ...i, nomorInduk: i.nomorInduk }],
    );
    return susunRencanaCetak(
      template,
      { posisiAwal: input.posisiAwal, halamanUji: input.halamanUji ?? false },
      siapCetak,
      tidakBisa,
    );
  }

  /** Mencetak hanya bisa online: offline gagal dengan `ButuhKoneksiError` ("Butuh koneksi"). */
  async function siapkanCetak(input: InputRencanaCetak & { online: boolean }): Promise<RencanaCetak> {
    if (!input.online) throw new ButuhKoneksiError();
    return rencanaCetak({
      eksemplarIds: input.eksemplarIds,
      posisiAwal: input.posisiAwal,
      template: input.template,
      halamanUji: input.halamanUji,
    });
  }

  function pantau<T>(baca: () => Promise<T>, cb: (nilai: T) => void) {
    let berhenti = false;
    let sub: { unsubscribe(): void } | undefined;
    void siap.then(() => {
      if (berhenti) return;
      sub = liveQuery(baca).subscribe({ next: cb, error: (e) => console.error("pantau gagal", e) });
    });
    return () => {
      berhenti = true;
      sub?.unsubscribe();
    };
  }

  /** Yang akan hilang bila data di perangkat dihapus: bahan pesan konfirmasi "Keluar & hapus data". */
  async function ringkasanDataPerangkat(): Promise<{ belumTerkirim: number; drafMenunggu: number }> {
    await siap;
    const status = await bacaStatus();
    return { belumTerkirim: status.menunggu + status.ditolak, drafMenunggu: await bacaJumlahDrafMenunggu() };
  }

  /** "Keluar & hapus data di perangkat ini" (ADR 0004): menghapus basis data IndexedDB. */
  async function hapusDataPerangkat() {
    await siap.catch(() => {});
    await db.delete();
  }

  return {
    daftarKategori,
    daftarKategoriTermasukArsip,
    daftarLokasi,
    daftarAturanKategori,
    kelola,
    sarankanKategori,
    cariBukuByIsbn,
    simpanDraf,
    mulaiSesiPenerimaan,
    tambahBukuManual,
    tambahBuku,
    catatEksemplar,
    ubahBuku,
    ubahEksemplar,
    koreksiKategori,
    antreanCetak,
    /** Jumlah untuk chip "Label siap dicetak": pakai `siapDicetak`. */
    jumlahAntreanCetak,
    tandaiTercetak,
    templateLabel,
    rencanaCetak,
    siapkanCetak,
    daftarKoleksi,
    cariKoleksi,
    ringkasanBeranda,
    bukuInduk,
    statistik,
    penyiangan,
    detailBuku,
    /** Peminjaman (tiket #10). */
    pinjamkan: sesudahSiap(peminjaman.pinjamkan),
    kembalikan: sesudahSiap(peminjaman.kembalikan),
    ubahJatuhTempo: sesudahSiap(peminjaman.ubahJatuhTempo),
    ubahPeminjam: sesudahSiap(peminjaman.ubahPeminjam),
    daftarPeminjaman: sesudahSiap(peminjaman.bacaPeminjaman),
    jumlahTerlambat: sesudahSiap(peminjaman.bacaJumlahTerlambat),
    daftarPeminjam: sesudahSiap(peminjaman.bacaPeminjam),
    /** Scan Label Barcode (teks Code 128) -> Eksemplar yang sesuai. */
    cariDariPindai: sesudahSiap(peminjaman.cariDariPindai),
    /** Tautan `wa.me` dengan pesan pengingat terisi; null bila Peminjam tak punya nomor. */
    tautanPengingat: sesudahSiap(peminjaman.bacaTautanPengingat),
    statusSinkronisasi,
    daftarAntrean,
    cobaLagi,
    logPerubahan,
    sinkronkan,
    hapusDataPerangkat,
    ringkasanDataPerangkat,
    jumlahDrafMenunggu,
    lengkapiDrafMenunggu,
    pantauJumlahDrafMenunggu: (cb: (jumlah: number) => void) => pantau(bacaJumlahDrafMenunggu, cb),
    /** Pemantau reaktif untuk UI; mengembalikan fungsi berhenti. */
    pantauDetailBuku: (bukuId: string, cb: (detail: DetailBuku | null) => void) =>
      pantau(() => bacaDetailBuku(bukuId), cb),
    pantauKoleksi: (cb: (items: ItemKoleksi[]) => void) => pantau(bacaKoleksiAktif, cb),
    /** Seluruh Eksemplar termasuk yang keluar; UI menyaringnya dengan `saringKoleksi`. */
    pantauRingkasanBeranda: (cb: (r: RingkasanBeranda) => void) => pantau(bacaRingkasanBeranda, cb),
    pantauKoleksiSemua: (cb: (items: ItemKoleksi[]) => void) => pantau(bacaKoleksi, cb),
    pantauBukuInduk: (opsi: { tahun?: number | null }, cb: (hasil: Awaited<ReturnType<typeof bacaBukuInduk>>) => void) =>
      pantau(() => bacaBukuInduk(opsi), cb),
    pantauStatistik: (cb: (s: Awaited<ReturnType<typeof bacaStatistik>>) => void) => pantau(bacaStatistik, cb),
    pantauDaftar: (cb: (daftar: DaftarLokal) => void) => pantau(bacaDaftar, cb),
    pantauStatus: (cb: (status: StatusSinkronisasi) => void) => pantau(bacaStatus, cb),
    pantauAntreanCetak: (cb: (items: ItemAntreanCetak[]) => void) => pantau(bacaAntreanCetak, cb),
    pantauJumlahAntreanCetak: (cb: (jumlah: JumlahAntreanCetak) => void) => pantau(bacaJumlahAntrean, cb),
    pantauTemplateLabel: (cb: (t: TemplateLabelLengkap) => void) => pantau(bacaTemplateLabel, cb),
    pantauAntrean: (cb: (antrean: DaftarAntrean) => void) => pantau(bacaAntrean, cb),
    pantauLog: (cb: (log: LogRow[]) => void) => pantau(bacaLog, cb),
    pantauPeminjaman: (cb: (daftar: DaftarPeminjaman) => void) => pantau(peminjaman.bacaPeminjaman, cb),
    /** Jumlah terlambat (badge nav, chip Beranda); `jam` bergerak, jadi UI perlu memicu ulang saat tanggal berganti. */
    pantauJumlahTerlambat: (cb: (jumlah: number) => void) => pantau(peminjaman.bacaJumlahTerlambat, cb),
    pantauPeminjam: (cb: (daftar: ItemPeminjam[]) => void) => pantau(peminjaman.bacaPeminjam, cb),
  };
}

export type LocalLibrary = ReturnType<typeof createLocalLibrary>;
