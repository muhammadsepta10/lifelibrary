/**
 * Draf Buku: bentuk data antara "ISBN diketik" dan "Buku tersimpan".
 *
 * Draf bisa datang dari Pencarian Metadata ISBN (server) atau dibuat kosong
 * hanya dengan ISBN (`drafKosong`): ISBN tidak ditemukan, tidak ada koneksi,
 * atau (tiket scan offline) hasil scan yang metadatanya menunggu dicari saat
 * online. Draf belum punya Kategori; Pemilik mengonfirmasinya di layar tinjau.
 */

export const SUMBER_METADATA = ["openlibrary", "google", "loc"] as const;
export type SumberMetadata = (typeof SUMBER_METADATA)[number];
export const LABEL_SUMBER: Record<SumberMetadata, string> = {
  openlibrary: "Open Library",
  google: "Google Books",
  loc: "Library of Congress",
};

/** Field draf yang bisa punya sumber. */
export type FieldDraf =
  | "judul"
  | "pengarang"
  | "penerbit"
  | "kota"
  | "tahun"
  | "halaman"
  | "bahasa"
  | "sinopsis"
  | "sampul"
  | "subjek"
  | "kelasDdc";

export type DrafBuku = {
  isbn13: string;
  judul: string;
  /** Nama pengarang; yang pertama jadi Pengarang Utama. */
  pengarang: string[];
  penerbit: string | null;
  kota: string | null;
  tahun: number | null;
  halaman: number | null;
  bahasa: string | null;
  sinopsis: string | null;
  /** Kunci sampul di storage aplikasi (bukan alamat luar), atau null. */
  sampul: string | null;
  subjek: string[];
  /** Kelas DDC dari sumber; tanpa caption (lisensi OCLC). */
  kelasDdc: string | null;
  /** Sumber tiap field yang terisi. Subjek bisa berasal dari beberapa sumber. */
  sumber: Partial<Record<FieldDraf, SumberMetadata[]>>;
};

export type StatusSumber = {
  sumber: SumberMetadata;
  /** `dilewati`: tidak dicoba (mis. kunci API belum diatur). */
  status: "ok" | "kosong" | "galat" | "dilewati";
  pesan?: string;
};

export type HasilPencarianMetadata =
  | { ditemukan: true; draf: DrafBuku; sumber: StatusSumber[] }
  | {
      ditemukan: false;
      isbn13: string;
      sumber: StatusSumber[];
      /** Tidak satu pun sumber bisa dihubungi: bukan berarti bukunya tidak ada. */
      semuaGalat: boolean;
    };

export function drafKosong(isbn13: string): DrafBuku {
  return {
    isbn13,
    judul: "",
    pengarang: [],
    penerbit: null,
    kota: null,
    tahun: null,
    halaman: null,
    bahasa: null,
    sinopsis: null,
    sampul: null,
    subjek: [],
    kelasDdc: null,
    sumber: {},
  };
}

/** Alamat gambar sampul yang dilayani aplikasi (hanya Pemilik yang login). */
export const urlSampul = (kunci: string) => `/api/covers/${kunci}`;
