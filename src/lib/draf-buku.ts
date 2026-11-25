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
  | "edisi"
  | "seri"
  | "jilid"
  | "penerjemah"
  | "editor"
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
  /** Keterangan edisi/cetakan, mis. "Cetakan pertama". */
  edisi: string | null;
  seri: string | null;
  /** Nomor jilid/volume dalam seri (teks bebas, mis. "2"). */
  jilid: string | null;
  /** Kontributor berperan penerjemah/editor bila sumber memuatnya. */
  penerjemah: string[];
  editor: string[];
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
  /**
   * Field yang terisi dari Kandidat (edisi lain, perlu dicek Pemilik). Tidak
   * ada pada draf yang tersimpan sebelum fitur pencarian judul.
   */
  dariKandidat?: FieldDraf[];
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

/**
 * Kandidat pencarian cadangan lewat judul (ADR 0007): satu terbitan yang
 * mungkin edisi lain dari buku di tangan Pemilik. Field bibliografisnya
 * berbentuk sama dengan draf (hanya yang diketahui sumber yang ada). Tidak
 * pernah diterapkan otomatis, dan tidak membawa ISBN.
 */
export type Kandidat = {
  /** Stabil: sumber + kunci sumber, mis. `openlibrary:OL23233727W`. */
  id: string;
  sumber: SumberMetadata;
  judul: string;
  pengarang?: string[];
  penerbit?: string;
  kota?: string;
  tahun?: number;
  edisi?: string;
  seri?: string;
  jilid?: string;
  penerjemah?: string[];
  editor?: string[];
  halaman?: number;
  bahasa?: string;
  sinopsis?: string;
  subjek?: string[];
  kelasDdc?: string;
  /** Alamat sampul di situs sumber, untuk pratinjau dan unduhan oleh server. */
  sampulUrl?: string;
};

export type HasilKandidat = { kandidat: Kandidat[]; sumber: StatusSumber[] };

export function drafKosong(isbn13: string): DrafBuku {
  return {
    isbn13,
    judul: "",
    pengarang: [],
    penerbit: null,
    kota: null,
    tahun: null,
    edisi: null,
    seri: null,
    jilid: null,
    penerjemah: [],
    editor: [],
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

/** Batas subjek pada satu draf/Kandidat dan jumlah Kandidat yang ditawarkan (ADR 0007). */
export const MAKS_SUBJEK = 20;
export const MAKS_KANDIDAT = 5;

const kosong = (nilai: unknown) => nilai === null || nilai === undefined || nilai === "" || (Array.isArray(nilai) && nilai.length === 0);

/**
 * Menerapkan Kandidat ke draf: hanya field yang masih kosong yang diisi,
 * isian Pemilik tidak pernah ditimpa. ISBN draf (hasil scan) dan sampul tidak
 * disentuh. Field yang terisi dicatat di `sumber` dan `dariKandidat`.
 */
export function terapkanKandidat(draf: DrafBuku, kandidat: Kandidat): DrafBuku {
  const hasil: DrafBuku = { ...draf, sumber: { ...draf.sumber } };
  const terisi: FieldDraf[] = [];
  const isi = <K extends Exclude<FieldDraf, "sampul"> & keyof Kandidat & keyof DrafBuku>(field: K, nilai: Kandidat[K]) => {
    if (kosong(nilai) || !kosong(draf[field])) return;
    (hasil as Record<string, unknown>)[field] = nilai;
    hasil.sumber[field] = [kandidat.sumber];
    terisi.push(field);
  };

  isi("judul", kandidat.judul);
  isi("pengarang", kandidat.pengarang);
  isi("penerbit", kandidat.penerbit);
  isi("kota", kandidat.kota);
  isi("tahun", kandidat.tahun);
  isi("edisi", kandidat.edisi);
  isi("seri", kandidat.seri);
  isi("jilid", kandidat.jilid);
  isi("penerjemah", kandidat.penerjemah);
  isi("editor", kandidat.editor);
  isi("halaman", kandidat.halaman);
  isi("bahasa", kandidat.bahasa);
  isi("sinopsis", kandidat.sinopsis);
  isi("subjek", kandidat.subjek?.slice(0, MAKS_SUBJEK));
  isi("kelasDdc", kandidat.kelasDdc);

  if (terisi.length) hasil.dariKandidat = [...new Set([...(draf.dariKandidat ?? []), ...terisi])];
  return hasil;
}
