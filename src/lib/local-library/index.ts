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
import type { Mutasi, PullResponse, SyncTransport } from "@/lib/sync-protocol";
import {
  bukuKosong,
  eksemplarKosong,
  LocalDb,
  type AturanKategoriRow,
  type BukuRow,
  type EksemplarRow,
  type KategoriRow,
  type LokasiRow,
} from "./db";
import {
  ALASAN_BELUM_PUNYA_NOMOR_INDUK,
  susunRencanaCetak,
  type InputRencanaCetak,
  type ItemAntrean,
  type JumlahAntreanCetak,
  type RencanaCetak,
  type TidakBisaDicetak,
} from "./cetak";
import { ButuhKoneksiError, ValidasiError } from "./errors";
import { periksaFieldBuku, periksaFieldEksemplar, samaNilai } from "./masukan";
import { hitungNomorPanggil, type NomorPanggil } from "./nomor-panggil";
import { isoLokal } from "./waktu";

export { ButuhKoneksiError, ValidasiError } from "./errors";
export type { AturanKategoriRow, KategoriRow, LokasiRow } from "./db";
export { hitungNomorPanggil, type NomorPanggil } from "./nomor-panggil";
export { hitungGrid, TEMPLATE_LABEL_BAWAAN, type GridTemplate, type TemplateLabel };
export type {
  InputRencanaCetak,
  ItemAntrean,
  JenisSel,
  JumlahAntreanCetak,
  LabelCetak,
  LembarCetak,
  RencanaCetak,
  SelCetak,
  TidakBisaDicetak,
} from "./cetak";

export const NOMOR_INDUK_KOSONG = "——";
const BATCH_PUSH = 50;
const META_KURSOR = "kursor";
const META_TEMPLATE_LABEL = "templateLabel";

/** Template Label beserta kolom × baris hasil hitungan. */
export type TemplateLabelLengkap = TemplateLabel & GridTemplate;

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
  templateLabel?: TemplateLabel | null;
};

export type StatusSinkronisasi = {
  /** Jumlah perubahan di outbox yang belum diterima server. */
  menunggu: number;
  /** Jumlah perubahan yang ditolak server dan butuh perhatian Pemilik. */
  ditolak: number;
};

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

  async function daftarKoleksi(): Promise<ItemKoleksi[]> {
    await siap;
    return bacaKoleksi();
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

  async function bacaKoleksi(): Promise<ItemKoleksi[]> {
    const [eksemplar, buku, kategori] = await Promise.all([
      db.eksemplar.toArray(),
      db.buku.toArray(),
      db.kategori.toArray(),
    ]);
    const bukuById = new Map(buku.map((b) => [b.id, b]));
    const katById = new Map(kategori.map((k) => [k.id, k]));
    return eksemplar
      .filter((e) => e.status === "aktif")
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
          },
        ];
      });
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

  async function terapkanPull(res: PullResponse) {
    await db.transaction("rw", [...TABEL_DAFTAR, db.buku, db.eksemplar], async () => {
      await tulisDaftar(res);
      await db.buku.bulkPut(res.buku.map((b) => ({ ...b })));
      await db.eksemplar.bulkPut(
        res.eksemplar.map((e) => ({
          id: e.id,
          bukuId: e.bukuId,
          kategoriId: e.kategoriId,
          nomorInduk: e.nomorInduk,
          waktuDicatat: e.waktuDicatat,
          status: e.status,
          lokasiId: e.lokasiId,
          tanggalMasuk: e.tanggalMasuk,
          asal: e.asal,
          harga: e.harga,
          kondisi: e.kondisi,
          perluCetak: e.perluCetak,
          menungguSinkron: false,
        })),
      );
      await db.meta.put({ key: META_KURSOR, value: res.kursor });
    });
  }

  /**
   * Kirim outbox (push) lalu ambil perubahan baru (pull). Melempar kalau
   * transport gagal; outbox tetap utuh dan bisa dikirim ulang dengan aman
   * karena server idempoten berdasarkan id mutasi.
   */
  async function sinkronkan(transport: SyncTransport) {
    await siap;
    let dikirim = 0;
    let ditolak = 0;
    for (;;) {
      const batch = (await db.outbox.orderBy("seq").toArray())
        .filter((o) => !o.ditolak)
        .slice(0, BATCH_PUSH);
      if (batch.length === 0) break;
      const res = await transport.push({ mutasi: batch.map((o) => o.mutasi) });
      await db.transaction("rw", [db.outbox, db.eksemplar], async () => {
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
        }
      });
    }
    const kursor = (await db.meta.get(META_KURSOR))?.value ?? null;
    await terapkanPull(await transport.pull(kursor));
    return { dikirim, ditolak };
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
  async function bacaBahanCetak(): Promise<(ItemAntrean & { perluCetak: boolean })[]> {
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
            perluCetak: e.perluCetak,
          },
        ];
      });
  }

  /** Eksemplar yang Labelnya belum dicetak (atau perlu dicetak ulang). */
  async function bacaAntreanCetak(): Promise<ItemAntrean[]> {
    return (await bacaBahanCetak())
      .filter((i) => i.perluCetak)
      .map(({ perluCetak: _perluCetak, ...item }) => item);
  }

  async function bacaJumlahAntrean(): Promise<JumlahAntreanCetak> {
    const antrean = await bacaAntreanCetak();
    const siapDicetak = antrean.filter((i) => i.bisaDicetak).length;
    return { total: antrean.length, siapDicetak, menungguNomorInduk: antrean.length - siapDicetak };
  }

  async function antreanCetak(): Promise<ItemAntrean[]> {
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
    const bahan = new Map((await bacaBahanCetak()).map((i) => [i.eksemplarId, i]));
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
    const { online: _online, ...rencana } = input;
    return rencanaCetak(rencana);
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
    detailBuku,
    statusSinkronisasi,
    sinkronkan,
    hapusDataPerangkat,
    /** Pemantau reaktif untuk UI; mengembalikan fungsi berhenti. */
    pantauDetailBuku: (bukuId: string, cb: (detail: DetailBuku | null) => void) =>
      pantau(() => bacaDetailBuku(bukuId), cb),
    pantauKoleksi: (cb: (items: ItemKoleksi[]) => void) => pantau(bacaKoleksi, cb),
    pantauDaftar: (cb: (daftar: DaftarLokal) => void) => pantau(bacaDaftar, cb),
    pantauStatus: (cb: (status: StatusSinkronisasi) => void) => pantau(bacaStatus, cb),
    pantauAntreanCetak: (cb: (items: ItemAntrean[]) => void) => pantau(bacaAntreanCetak, cb),
    pantauJumlahAntreanCetak: (cb: (jumlah: JumlahAntreanCetak) => void) => pantau(bacaJumlahAntrean, cb),
    pantauTemplateLabel: (cb: (t: TemplateLabelLengkap) => void) => pantau(bacaTemplateLabel, cb),
  };
}

export type LocalLibrary = ReturnType<typeof createLocalLibrary>;
