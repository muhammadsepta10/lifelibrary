/**
 * Hasil Pencarian Metadata ISBN diterjemahkan ke keadaan kartu scan. Dipakai
 * Sesi Penerimaan (scan saat ini) dan pelengkapan draf "menunggu data" saat
 * online, supaya keduanya memutuskan hal yang sama.
 */
import { drafKosong, type DrafBuku, type HasilPencarianMetadata, type StatusSumber } from "@/lib/draf-buku";

export type KeadaanMetadata = {
  /** "menunggu-data": belum bisa dicari (offline/login habis), akan dicoba lagi otomatis. */
  status: "siap" | "menunggu-data";
  draf: DrafBuku;
  sumber: StatusSumber[];
  catatan: string | null;
  bisaCobaLagi: boolean;
  /** ISBN tidak ditemukan padahal sumber bisa dihubungi: pencarian cadangan lewat judul boleh ditawarkan (ADR 0007). */
  cadanganJudul: boolean;
};

/** Penyebab yang membuat pencarian harus menunggu, bukan gagal: tanpa jaringan (fetch -> TypeError) atau sesi login habis. */
export function pencarianPerluMenunggu(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof Error && e.name === "LoginDiperlukanError");
}

export function dariHasil(isbn13: string, hasil: HasilPencarianMetadata): KeadaanMetadata {
  if (hasil.ditemukan) {
    return { status: "siap", draf: hasil.draf, sumber: hasil.sumber, catatan: null, bisaCobaLagi: false, cadanganJudul: false };
  }
  return {
    status: "siap",
    draf: drafKosong(isbn13),
    sumber: hasil.sumber,
    bisaCobaLagi: hasil.semuaGalat,
    cadanganJudul: !hasil.semuaGalat,
    catatan: hasil.semuaGalat
      ? "Sumber metadata tidak bisa dihubungi. Coba lagi sebentar lagi, atau isi datanya manual."
      : `ISBN ${isbn13} belum ada di Open Library, Google Books, maupun Library of Congress. Isi datanya manual, ISBN sudah terisi.`,
  };
}

export function dariGalat(isbn13: string, e: unknown): KeadaanMetadata {
  const draf = drafKosong(isbn13);
  if (e instanceof Error && e.name === "LoginDiperlukanError") {
    return {
      status: "menunggu-data",
      draf,
      sumber: [],
      bisaCobaLagi: true,
      cadanganJudul: false,
      catatan: "Sesi login habis. Masuk lagi, maka metadata dicari otomatis. Atau isi datanya manual.",
    };
  }
  if (e instanceof TypeError) {
    return {
      status: "menunggu-data",
      draf,
      sumber: [],
      bisaCobaLagi: true,
      cadanganJudul: false,
      catatan: "Tidak ada koneksi. Draf ini disimpan di perangkat, dan metadatanya dicari otomatis begitu online.",
    };
  }
  return {
    status: "siap",
    draf,
    sumber: [],
    bisaCobaLagi: true,
    cadanganJudul: false,
    catatan: "Pencarian metadata gagal. Coba lagi, atau isi datanya manual.",
  };
}
