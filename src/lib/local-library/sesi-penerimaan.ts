/**
 * Sesi Penerimaan: rangkaian pencatatan Eksemplar beruntun yang berbagi
 * tanggal masuk, asal, dan Lokasi (GLOSSARY). Dipakai layar scan kamera
 * (variant B) dan input ISBN; semua keputusan (data sesi, jeda ISBN sama,
 * penolakan barcode non-ISBN, kartu hasil scan beserta statusnya) ada di
 * sini supaya bisa dites lewat seam Perpustakaan Lokal, tanpa kamera.
 *
 * Sesi hidup di memori halaman. Eksemplar yang sudah disimpan aman di
 * Perpustakaan Lokal; kartu yang belum disimpan hilang bila halaman dimuat ulang.
 */
import { liveQuery } from "dexie";
import type { Asal } from "@/lib/buku-fields";
import { drafKosong, type DrafBuku, type HasilPencarianMetadata, type StatusSumber } from "@/lib/draf-buku";
import { normalisasiIsbn } from "@/lib/isbn";
import type { DrafMenungguRow } from "./db";
import type { BukuDuplikat } from "./draf";
import { dariGalat, dariHasil, type KeadaanMetadata } from "./keadaan-metadata";
import { periksaFieldEksemplar } from "./masukan";
import { isoLokal } from "./waktu";

/** ISBN yang sama dalam jeda ini (sejak terlihat terakhir) dianggap bacaan kamera yang berulang. */
export const JEDA_ISBN_SAMA_MS = 1500;

export type DataSesi = {
  /** `YYYY-MM-DD`; null untuk koleksi lama yang tanggal masuknya tidak diketahui. */
  tanggalMasuk: string | null;
  asal: Asal | null;
  lokasiId: string | null;
};

/**
 * Mencari… -> Siap ditinjau -> Tersimpan. "Menunggu data": scan offline (atau
 * sesi login habis), disimpan di perangkat dan dilengkapi otomatis saat online.
 */
export type StatusKartu = "mencari" | "siap" | "tersimpan" | "menunggu-data";
export const LABEL_STATUS_KARTU: Record<StatusKartu, string> = {
  mencari: "Mencari…",
  siap: "Siap ditinjau",
  tersimpan: "Tersimpan",
  "menunggu-data": "Menunggu data",
};

export const NOMOR_INDUK_BELUM = "——";

export type KartuScan = {
  id: string;
  /** Null untuk kartu "Isi manual" tanpa ISBN. */
  isbn13: string | null;
  status: StatusKartu;
  /** Teks status siap tampil, mis. "Mencari…". */
  label: string;
  judul: string;
  pengarang: string;
  /** Draf untuk ditinjau; ada sejak "Siap ditinjau" dan tetap ada setelah Tersimpan. */
  draf: DrafBuku | null;
  sumber: StatusSumber[];
  /** Pesan ramah: ISBN tidak ditemukan, sumber tak terjangkau, dst. */
  catatan: string | null;
  bisaCobaLagi: boolean;
  /** ISBN tidak ditemukan, sumber bisa dihubungi: pencarian cadangan lewat judul boleh ditawarkan. */
  cadanganJudul: boolean;
  bukuId: string | null;
  eksemplarId: string | null;
  /** Hanya setelah Tersimpan dan sudah tersinkron. */
  nomorInduk: string | null;
  /** Nomor Induk, atau "——" selama Menunggu Sinkron. Null sebelum Tersimpan. */
  nomorIndukTampil: string | null;
  menungguSinkron: boolean | null;
};

export type HasilPindai =
  /** Kartu baru dibuat; `selesai` terpenuhi saat pencarian metadatanya berakhir (apa pun hasilnya). */
  | { jenis: "kartu"; kartuId: string; selesai: Promise<void> }
  /** Bukan ISBN yang sah; `pesan` siap ditampilkan. */
  | { jenis: "ditolak"; pesan: string }
  /** Bacaan berulang dalam jeda; tidak tercatat dan tidak perlu umpan balik. */
  | { jenis: "diabaikan" }
  /** ISBN sudah ada di koleksi: tanyakan "Tambah eksemplar baru?" */
  | { jenis: "duplikat"; isbn13: string; buku: BukuDuplikat }
  /** ISBN ini sudah punya kartu yang belum disimpan di sesi ini. */
  | { jenis: "sudahDiDaftar"; kartuId: string };

export type OpsiSesi = {
  cariMetadata: (isbn13: string) => Promise<HasilPencarianMetadata>;
  /** Bawaan: hari ini. `null` = sengaja kosong (koleksi lama). */
  tanggalMasuk?: string | null;
  asal?: Asal | null;
  lokasiId?: string | null;
};

export type DepsSesi = {
  now: () => Date;
  uuid: () => string;
  validasiLokasi: (lokasiId: string | null | undefined) => Promise<void>;
  cariBukuByIsbn: (isbn13: string) => Promise<BukuDuplikat | null>;
  simpanDraf: (
    draf: DrafBuku,
    eksemplar: { kategoriId: string } & DataSesi,
  ) => Promise<{ bukuId: string; eksemplarId: string }>;
  catatEksemplar: (input: { bukuId: string; kategoriId: string } & DataSesi) => Promise<{ eksemplarId: string }>;
  /** Draf "menunggu data" yang tersimpan di perangkat (Dexie). `baca` dipanggil di dalam `liveQuery`. */
  drafMenunggu: {
    semua: () => Promise<DrafMenungguRow[]>;
    baca: (ids: string[]) => Promise<DrafMenungguRow[]>;
    simpan: (row: DrafMenungguRow) => Promise<void>;
    hapus: (id: string) => Promise<void>;
  };
  /** Nomor Induk dan keadaan sinkron Eksemplar; dibaca di dalam `liveQuery` supaya reaktif. */
  bacaEksemplar: (ids: string[]) => Promise<{ id: string; nomorInduk: string | null; menungguSinkron: boolean }[]>;
};

type Kartu = Omit<KartuScan, "label" | "nomorInduk" | "nomorIndukTampil" | "menungguSinkron">;

export async function buatSesiPenerimaan(deps: DepsSesi, opsi: OpsiSesi) {
  const periksaData = async (d: Partial<DataSesi>): Promise<Partial<DataSesi>> => {
    const bersih = periksaFieldEksemplar(d) as Partial<DataSesi>;
    await deps.validasiLokasi(bersih.lokasiId);
    return bersih;
  };

  let data: DataSesi = {
    tanggalMasuk: isoLokal(deps.now()).slice(0, 10),
    asal: null,
    lokasiId: null,
    ...(await periksaData({ tanggalMasuk: opsi.tanggalMasuk, asal: opsi.asal, lokasiId: opsi.lokasiId })),
  };

  const daftar: Kartu[] = [];
  /** Id kartu yang punya draf di Dexie (menunggu data, atau sudah dilengkapi dan belum ditinjau). */
  const diPerangkat = new Set<string>();
  const sedangMenyimpan = new Set<string>();
  /** Terakhir kali tiap kode terlihat (kunci: ISBN-13, atau teks mentah untuk kode yang ditolak). */
  const terlihat = new Map<string, number>();
  const pendengar = new Set<() => void>();
  const beritahu = () => pendengar.forEach((f) => f());

  function ubahKartu(id: string, perubahan: Partial<Kartu>) {
    const k = daftar.find((x) => x.id === id);
    if (k) Object.assign(k, perubahan);
    beritahu();
  }

  function kartuBaru(isbn13: string | null, awal: Partial<Kartu> = {}): Kartu {
    const k: Kartu = {
      id: deps.uuid(),
      isbn13,
      status: "mencari",
      judul: "",
      pengarang: "",
      draf: null,
      sumber: [],
      catatan: null,
      bisaCobaLagi: false,
      cadanganJudul: false,
      bukuId: null,
      eksemplarId: null,
      ...awal,
    };
    daftar.push(k);
    beritahu();
    return k;
  }

  /** Kartu dari draf yang tersimpan di perangkat (scan offline sebelumnya). */
  function kartuDariRow(r: DrafMenungguRow): Kartu {
    return {
      id: r.id,
      isbn13: r.isbn13,
      status: r.status,
      judul: r.draf.judul,
      pengarang: r.draf.pengarang[0] ?? "",
      draf: r.draf,
      sumber: r.sumber,
      catatan: r.catatan,
      bisaCobaLagi: r.bisaCobaLagi,
      cadanganJudul: r.cadanganJudul ?? false,
      bukuId: null,
      eksemplarId: null,
    };
  }
  for (const r of (await deps.drafMenunggu.semua()).sort((a, b) => a.dicatat - b.dicatat)) {
    daftar.push(kartuDariRow(r));
    diPerangkat.add(r.id);
  }

  async function hapusDariPerangkat(kartuId: string) {
    if (!diPerangkat.delete(kartuId)) return;
    await deps.drafMenunggu.hapus(kartuId);
  }

  /**
   * Mencari metadata untuk kartu. Sukses atau "tidak ditemukan" berakhir Siap
   * ditinjau. Tanpa koneksi (atau login habis) kartu menjadi "Menunggu data" dan
   * drafnya disimpan di perangkat supaya dilengkapi saat online.
   */
  async function cari(kartuId: string, isbn13: string) {
    let keadaan: KeadaanMetadata;
    try {
      keadaan = dariHasil(isbn13, await opsi.cariMetadata(isbn13));
    } catch (e) {
      keadaan = dariGalat(isbn13, e);
    }
    if (!daftar.some((k) => k.id === kartuId)) return; // dibuang selagi mencari
    ubahKartu(kartuId, {
      status: keadaan.status,
      draf: keadaan.draf,
      judul: keadaan.draf.judul,
      pengarang: keadaan.draf.pengarang[0] ?? "",
      sumber: keadaan.sumber,
      catatan: keadaan.catatan,
      bisaCobaLagi: keadaan.bisaCobaLagi,
      cadanganJudul: keadaan.cadanganJudul,
    });
    if (keadaan.status === "menunggu-data") {
      diPerangkat.add(kartuId);
      await deps.drafMenunggu.simpan({
        id: kartuId,
        isbn13,
        status: "menunggu-data",
        draf: keadaan.draf,
        sumber: keadaan.sumber,
        catatan: keadaan.catatan,
        bisaCobaLagi: keadaan.bisaCobaLagi,
        cadanganJudul: keadaan.cadanganJudul,
        dicatat: deps.now().getTime(),
      });
    } else {
      await hapusDariPerangkat(kartuId);
    }
  }

  const kartuAda = (id: string) => {
    const k = daftar.find((x) => x.id === id);
    if (!k) throw new Error("Kartu tidak ditemukan");
    return k;
  };

  async function bacaKartu(): Promise<KartuScan[]> {
    const ids = daftar.flatMap((k) => (k.eksemplarId ? [k.eksemplarId] : []));
    const eksemplar = new Map((await deps.bacaEksemplar(ids)).map((e) => [e.id, e]));
    // Draf di perangkat bisa dilengkapi di luar sesi (saat online): ambil keadaannya yang terbaru.
    const row = new Map(
      (await deps.drafMenunggu.baca(daftar.filter((k) => diPerangkat.has(k.id)).map((k) => k.id))).map((r) => [r.id, r]),
    );
    return daftar.map((kartuMemori) => {
      const r = row.get(kartuMemori.id);
      const k =
        r && (kartuMemori.status === "menunggu-data" || kartuMemori.status === "siap")
          ? { ...kartuMemori, ...kartuDariRow(r), bukuId: null, eksemplarId: null }
          : kartuMemori;
      const e = k.eksemplarId ? eksemplar.get(k.eksemplarId) : undefined;
      return {
        ...k,
        label: LABEL_STATUS_KARTU[k.status],
        nomorInduk: e?.nomorInduk ?? null,
        nomorIndukTampil: k.status === "tersimpan" ? (e?.nomorInduk ?? NOMOR_INDUK_BELUM) : null,
        menungguSinkron: k.status === "tersimpan" ? (e?.menungguSinkron ?? true) : null,
      };
    });
  }

  return {
    data: (): DataSesi => ({ ...data }),

    /** Mengubah data sesi; berlaku untuk Eksemplar yang disimpan sesudahnya. */
    async ubah(perubahan: Partial<DataSesi>) {
      data = { ...data, ...(await periksaData(perubahan)) };
    },

    /**
     * Satu pintu untuk bacaan kamera, ketikan, dan scanner USB. ISBN-10 dan -13
     * buku yang sama dianggap satu ISBN.
     */
    async pindai(kode: string): Promise<HasilPindai> {
      const isbn = normalisasiIsbn(kode);
      const kunci = isbn.ok ? isbn.isbn13 : kode.trim();
      const waktu = deps.now().getTime();
      const sebelumnya = terlihat.get(kunci);
      // Jeda dihitung sejak bacaan terakhir: buku yang masih dipegang di depan kamera tidak tercatat lagi.
      terlihat.set(kunci, waktu);
      if (sebelumnya !== undefined && waktu - sebelumnya < JEDA_ISBN_SAMA_MS) return { jenis: "diabaikan" };

      if (!isbn.ok) return { jenis: "ditolak", pesan: isbn.pesan };
      const buku = await deps.cariBukuByIsbn(isbn.isbn13);
      if (buku) return { jenis: "duplikat", isbn13: isbn.isbn13, buku };
      const ada = daftar.find((k) => k.isbn13 === isbn.isbn13 && k.status !== "tersimpan");
      if (ada) return { jenis: "sudahDiDaftar", kartuId: ada.id };
      const kartu = kartuBaru(isbn.isbn13);
      return { jenis: "kartu", kartuId: kartu.id, selesai: cari(kartu.id, isbn.isbn13) };
    },

    /** "Isi manual": kartu siap ditinjau dengan draf kosong, tanpa ISBN dan tanpa mencari metadata. */
    isiManual(): { kartuId: string } {
      const kartu = kartuBaru(null, { status: "siap", draf: drafKosong("") });
      return { kartuId: kartu.id };
    },

    /** Mencari metadata lagi untuk kartu yang gagal. */
    async cobaLagi(kartuId: string) {
      const k = kartuAda(kartuId);
      if (!k.isbn13 || k.status === "tersimpan") throw new Error("Kartu ini tidak bisa dicoba lagi");
      ubahKartu(kartuId, { status: "mencari", catatan: null, bisaCobaLagi: false, cadanganJudul: false });
      await cari(kartuId, k.isbn13);
    },

    /** Membuang kartu yang belum disimpan. */
    buang(kartuId: string) {
      const k = kartuAda(kartuId);
      if (k.status === "tersimpan") throw new Error("Kartu yang sudah tersimpan tidak bisa dibuang");
      daftar.splice(daftar.indexOf(k), 1);
      beritahu();
      void hapusDariPerangkat(kartuId);
    },

    /** Kartu sesi ini, urut dari yang pertama dipindai. */
    kartu: bacaKartu,

    /** Pemantau reaktif untuk UI (termasuk Nomor Induk yang datang lewat Sinkronisasi); mengembalikan fungsi berhenti. */
    pantau(cb: (kartu: KartuScan[]) => void) {
      let sub: { unsubscribe(): void } | undefined;
      let berhenti = false;
      // Mulai ulang langganan tiap kartu berubah: daftar id Eksemplar yang diamati ikut berubah.
      const mulai = () => {
        sub?.unsubscribe();
        if (berhenti) return;
        sub = liveQuery(bacaKartu).subscribe({ next: cb, error: (e) => console.error("pantau kartu gagal", e) });
      };
      pendengar.add(mulai);
      mulai();
      return () => {
        berhenti = true;
        pendengar.delete(mulai);
        sub?.unsubscribe();
      };
    },

    /** Jawaban "ya" untuk "Tambah eksemplar baru?": Eksemplar baru untuk Buku yang sudah ada. */
    async tambahEksemplar(duplikat: Extract<HasilPindai, { jenis: "duplikat" }>, kategoriId: string) {
      const { isbn13, buku } = duplikat;
      const hasil = await deps.catatEksemplar({ bukuId: buku.bukuId, kategoriId, ...data });
      kartuBaru(isbn13, {
        status: "tersimpan",
        bukuId: buku.bukuId,
        eksemplarId: hasil.eksemplarId,
        judul: buku.judul,
        pengarang: buku.pengarang,
      });
      return hasil;
    },

    /** Menyimpan draf yang sudah ditinjau sebagai Buku + Eksemplar dengan data sesi. */
    async simpan(kartuId: string, draf: DrafBuku, kategoriId: string) {
      const k = kartuAda(kartuId);
      if (k.status === "tersimpan" || sedangMenyimpan.has(kartuId)) throw new Error("Kartu ini sudah disimpan");
      sedangMenyimpan.add(kartuId);
      try {
        const hasil = await deps.simpanDraf(draf, { kategoriId, ...data });
        await hapusDariPerangkat(kartuId);
        ubahKartu(kartuId, {
          status: "tersimpan",
          ...hasil,
          draf,
          judul: draf.judul,
          pengarang: draf.pengarang[0] ?? "",
          catatan: null,
          bisaCobaLagi: false,
          cadanganJudul: false,
        });
        return hasil;
      } finally {
        sedangMenyimpan.delete(kartuId);
      }
    },
  };
}

export type SesiPenerimaan = Awaited<ReturnType<typeof buatSesiPenerimaan>>;
