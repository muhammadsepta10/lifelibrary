import type { DrafBuku, HasilPencarianMetadata, SumberMetadata, StatusSumber } from "@/lib/draf-buku";
import type { CoverStore } from "@/server/covers";
import { gabungkan, URUTAN_SUMBER } from "./gabung";
import { cariGoogleBooks } from "./google-books";
import { buatPanggil, dalamBatas, GalatSumber, type Panggil } from "./http";
import { cariLoc } from "./loc";
import { cariOpenLibrary } from "./open-library";
import type { Parsial } from "./parsial";
import { unduhDanSimpanSampul } from "./sampul";

export type MetadataOptions = {
  /** fetch yang dipakai; tes memberi fetch palsu tanpa jaringan. */
  fetch?: typeof fetch;
  /** Kunci API Google Books; kosong = Google dilewati. Hanya dipakai di server. */
  googleApiKey?: string;
  coverStore: CoverStore;
  /** Batas waktu per sumber dan per unduhan sampul. */
  timeoutMs?: number;
};

/**
 * Seam: Pencarian Metadata ISBN. ISBN-13 yang sudah dinormalisasi masuk,
 * draf Buku gabungan (dengan sumber tiap field) atau "tidak ditemukan" keluar.
 * Satu sumber yang gagal atau kehabisan waktu tidak menggagalkan yang lain.
 */
export function createMetadataLookup(opts: MetadataOptions) {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const panggil: Panggil = buatPanggil(opts.fetch ?? fetch, timeoutMs);

  async function jalankan(
    sumber: SumberMetadata,
    kerja: (() => Promise<Parsial | null>) | null,
  ): Promise<{ status: StatusSumber; data: Parsial | null }> {
    if (!kerja) {
      return {
        status: { sumber, status: "dilewati", pesan: "Kunci API belum diatur" },
        data: null,
      };
    }
    try {
      const data = await dalamBatas(kerja(), timeoutMs);
      return { status: { sumber, status: data ? "ok" : "kosong" }, data };
    } catch (e) {
      const pesan = e instanceof GalatSumber ? e.message : "Sumber tidak bisa dihubungi";
      return { status: { sumber, status: "galat", pesan }, data: null };
    }
  }

  /** Unduh sampul kandidat pertama yang valid dan simpan; kegagalan tidak pernah menggagalkan pencarian. */
  async function simpanSampul(isbn13: string, kandidat: { url: string; sumber: SumberMetadata }[]) {
    for (const { url, sumber } of kandidat) {
      const kunci = await unduhDanSimpanSampul(panggil, opts.coverStore, isbn13, url);
      if (kunci) return { kunci, sumber };
    }
    return null;
  }

  return async function cariMetadataIsbn(isbn13: string): Promise<HasilPencarianMetadata> {
    const key = opts.googleApiKey;
    const hasil = await Promise.all([
      jalankan("openlibrary", () => cariOpenLibrary(panggil, isbn13)),
      jalankan("google", key ? () => cariGoogleBooks(panggil, isbn13, key) : null),
      jalankan("loc", () => cariLoc(panggil, isbn13)),
    ]);
    const status = hasil.map((h) => h.status);
    const data = Object.fromEntries(hasil.map((h) => [h.status.sumber, h.data])) as Record<SumberMetadata, Parsial | null>;

    if (!hasil.some((h) => h.status.status === "ok")) {
      const dicoba = status.filter((s) => s.status !== "dilewati");
      return {
        ditemukan: false,
        isbn13,
        sumber: status,
        semuaGalat: dicoba.length > 0 && dicoba.every((s) => s.status === "galat"),
      };
    }

    const draf: DrafBuku = gabungkan(isbn13, data);
    const kandidat = URUTAN_SUMBER.flatMap((s) => (data[s]?.sampul ?? []).map((url) => ({ url, sumber: s })));
    const sampul = await simpanSampul(isbn13, kandidat);
    if (sampul) {
      draf.sampul = sampul.kunci;
      draf.sumber.sampul = [sampul.sumber];
    }
    return { ditemukan: true, draf, sumber: status };
  };
}

export type MetadataLookup = ReturnType<typeof createMetadataLookup>;
