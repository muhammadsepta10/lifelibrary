import type { SumberMetadata } from "@/lib/draf-buku";

/** Apa yang diketahui satu sumber tentang sebuah ISBN. Field yang tidak diketahui tidak ada. */
export type Parsial = {
  judul?: string;
  pengarang?: string[];
  penerbit?: string;
  kota?: string;
  tahun?: number;
  halaman?: number;
  bahasa?: string;
  sinopsis?: string;
  subjek?: string[];
  kelasDdc?: string;
  /** Alamat sampul kandidat, urut dari yang terbaik. */
  sampul?: string[];
};

export type KandidatSampul = { url: string; sumber: SumberMetadata };

const BAHASA: Record<string, string> = {
  ind: "Indonesia",
  id: "Indonesia",
  eng: "Inggris",
  en: "Inggris",
  ara: "Arab",
  ar: "Arab",
  jav: "Jawa",
  jv: "Jawa",
  zho: "Mandarin",
  chi: "Mandarin",
  zh: "Mandarin",
  jpn: "Jepang",
  ja: "Jepang",
  nld: "Belanda",
  dut: "Belanda",
  nl: "Belanda",
  fra: "Prancis",
  fre: "Prancis",
  fr: "Prancis",
  deu: "Jerman",
  ger: "Jerman",
  de: "Jerman",
};

/** Kode bahasa (MARC 3 huruf atau ISO 2 huruf) menjadi nama; kode asing dibiarkan. */
export function namaBahasa(kode: string): string | undefined {
  const k = kode.trim().toLowerCase().split("-")[0];
  if (!/^[a-z]{2,3}$/.test(k) || k === "und" || k === "zxx" || k === "mul") return undefined;
  return BAHASA[k] ?? k.toUpperCase();
}

/**
 * Kelas DDC sumber ke bentuk Buku (`155.24`): garis miring penanda segmen dan
 * spasi dibuang. Nilai yang bukan angka DDC (`[Fic]`, `B`) menjadi undefined.
 */
export function normalisasiDdc(mentah: string): string | undefined {
  const bersih = mentah.replace(/[\s/'’]/g, "");
  return /^\d{3}(\.\d+)?$/.test(bersih) ? bersih : undefined;
}

export function ambilTahun(teks: string | undefined): number | undefined {
  const m = teks?.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : undefined;
}

/** Membuang tanda baca penutup gaya katalog (` /`, ` :`, `,`) dan spasi ganda. */
export function rapikan(teks: string | undefined | null): string | undefined {
  const t = teks
    ?.replace(/\s+/g, " ")
    .replace(/\s*[/:;,]\s*$/, "")
    .replace(/(\p{Ll}{3,})\.$/u, "$1")
    .trim();
  return t ? t : undefined;
}

/** "Chudori, Leila S." menjadi "Leila S. Chudori"; nama tanpa koma dibiarkan. */
export function urutanNormalNama(nama: string | undefined): string | undefined {
  const rapi = rapikan(nama);
  if (!rapi) return undefined;
  const bagian = rapi.split(",");
  if (bagian.length !== 2) return rapi;
  const [belakang, depan] = bagian.map((b) => b.trim());
  return depan && belakang ? `${depan} ${belakang}` : rapi;
}

const tidakKosong = <T>(x: T | undefined | null | ""): x is T => x !== undefined && x !== null && x !== "";

export const ambilSatu = <T>(...nilai: (T | undefined | null | "")[]): T | undefined => nilai.find(tidakKosong);
