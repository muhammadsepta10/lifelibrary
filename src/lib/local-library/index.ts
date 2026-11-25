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
import { susunBukuInduk, type BarisBukuInduk } from "@/lib/buku-induk";
import { labelField } from "@/lib/label-field";
import type { PenyianganDto, PenyianganInput, PenyianganTransport } from "@/lib/penyiangan-protocol";
import type { FieldDitimpa, Mutasi, PullResponse, SyncTransport } from "@/lib/sync-protocol";
import { saringKoleksi, type KriteriaKoleksi } from "./cari-koleksi";
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
} from "./db";
import type { DrafBuku } from "@/lib/draf-buku";
import { bisaSimpanDraf, type BukuDuplikat } from "./draf";
import { ButuhKoneksiError, ValidasiError } from "./errors";
import { periksaFieldBuku, periksaFieldEksemplar, samaNilai } from "./masukan";
import { hitungNomorPanggil, type NomorPanggil } from "./nomor-panggil";
import { hitungSaranKategori, type MasukanSaran, type SaranKategori } from "./saran-kategori";
import { isoLokal } from "./waktu";

export { ButuhKoneksiError, ValidasiError } from "./errors";
export type { AturanKategoriRow, KategoriRow, LogRow, LokasiRow } from "./db";
export { hitungNomorPanggil, type NomorPanggil } from "./nomor-panggil";
export { saringKoleksi, normalisasiTeks, type KriteriaKoleksi } from "./cari-koleksi";
export { STATUS_KOLEKSI, LABEL_STATUS_KOLEKSI, type StatusKoleksi } from "./status-koleksi";
export type { Statistik } from "./statistik";
export type { BarisBukuInduk } from "@/lib/buku-induk";
export { normalisasiIsbn, type HasilIsbn } from "@/lib/isbn";
export type { MasukanSaran, SaranKategori } from "./saran-kategori";
export { bisaSimpanDraf, type BukuDuplikat };

export const NOMOR_INDUK_KOSONG = "——";
const BATCH_PUSH = 50;
const META_KURSOR = "kursor";
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
  /** Sedang dipinjam; lihat `idEksemplarDipinjam` (titik sambung tiket Peminjaman). */
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
    await db.transaction("rw", [db.buku, db.outbox], async () => {
      const buku = await db.buku.get(bukuId);
      if (!buku) throw new ValidasiError("bukuId", "Buku tidak ditemukan");
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
    });
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
  };

  async function ringkasan(m: Mutasi): Promise<string> {
    if (m.jenis === "buku.tambah") return `${KATA_JENIS[m.jenis]} ${m.buku.judul}`;
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

  const TABEL_DAFTAR = [db.kategori, db.lokasi, db.aturanKategori];

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
  }

  /**
   * Field yang masih punya perubahan di outbox (termasuk yang Gagal terkirim)
   * dipertahankan: nilai lokalnya belum diterima server, jadi pull tidak boleh
   * menggantinya.
   */
  async function medanTertunda() {
    const peta = new Map<string, Set<string>>();
    for (const o of await db.outbox.toArray()) {
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
    await db.transaction("rw", [...TABEL_DAFTAR, db.buku, db.eksemplar, db.meta, db.outbox], async () => {
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
      await db.transaction("rw", [db.outbox, db.eksemplar, db.buku, db.log], async () => {
        for (const h of res.hasil) {
          const entri = batch.find((o) => o.id === h.id);
          if (!entri) continue;
          if (h.status === "ditolak") {
            await db.outbox.update(entri.seq!, { ditolak: h.alasan });
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
      kategori: {
        ...kategori,
        arsipkan: (id: string) => kategori.ubah(id, { diarsipkan: true }),
        pulihkan: (id: string) => kategori.ubah(id, { diarsipkan: false }),
      },
      lokasi: perintah(transport.lokasi, (d) => ({ lokasi: [d] })),
      aturanKategori: perintah(transport.aturanKategori, (d) => ({ aturanKategori: [d] })),
    };
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

  /** "Keluar & hapus data di perangkat ini" (ADR 0004). */
  async function hapusDataPerangkat() {
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
    tambahBukuManual,
    tambahBuku,
    catatEksemplar,
    ubahBuku,
    ubahEksemplar,
    koreksiKategori,
    daftarKoleksi,
    cariKoleksi,
    bukuInduk,
    statistik,
    penyiangan,
    detailBuku,
    statusSinkronisasi,
    daftarAntrean,
    cobaLagi,
    logPerubahan,
    sinkronkan,
    hapusDataPerangkat,
    /** Pemantau reaktif untuk UI; mengembalikan fungsi berhenti. */
    pantauDetailBuku: (bukuId: string, cb: (detail: DetailBuku | null) => void) =>
      pantau(() => bacaDetailBuku(bukuId), cb),
    pantauKoleksi: (cb: (items: ItemKoleksi[]) => void) => pantau(bacaKoleksiAktif, cb),
    /** Seluruh Eksemplar termasuk yang keluar; UI menyaringnya dengan `saringKoleksi`. */
    pantauKoleksiSemua: (cb: (items: ItemKoleksi[]) => void) => pantau(bacaKoleksi, cb),
    pantauBukuInduk: (opsi: { tahun?: number | null }, cb: (hasil: Awaited<ReturnType<typeof bacaBukuInduk>>) => void) =>
      pantau(() => bacaBukuInduk(opsi), cb),
    pantauStatistik: (cb: (s: Awaited<ReturnType<typeof bacaStatistik>>) => void) => pantau(bacaStatistik, cb),
    pantauDaftar: (cb: (daftar: DaftarLokal) => void) => pantau(bacaDaftar, cb),
    pantauStatus: (cb: (status: StatusSinkronisasi) => void) => pantau(bacaStatus, cb),
    pantauAntrean: (cb: (antrean: DaftarAntrean) => void) => pantau(bacaAntrean, cb),
    pantauLog: (cb: (log: LogRow[]) => void) => pantau(bacaLog, cb),
  };
}

export type LocalLibrary = ReturnType<typeof createLocalLibrary>;
