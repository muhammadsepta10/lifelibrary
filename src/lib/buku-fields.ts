import { z } from "zod";

/**
 * Field Buku dan Eksemplar yang dipakai bersama klien (validasi lokal) dan
 * server (validasi mutasi). Pesan galat siap ditampilkan ke Pemilik.
 */

export const PERAN = ["pengarang", "penerjemah", "editor"] as const;
export type Peran = (typeof PERAN)[number];
export const LABEL_PERAN: Record<Peran, string> = {
  pengarang: "Pengarang",
  penerjemah: "Penerjemah",
  editor: "Editor",
};

export const ASAL = ["beli", "hadiah", "lainnya"] as const;
export type Asal = (typeof ASAL)[number];
export const LABEL_ASAL: Record<Asal, string> = { beli: "Beli", hadiah: "Hadiah", lainnya: "Lainnya" };

export const KONDISI = ["baru", "baik", "cukup", "rusak"] as const;
export type Kondisi = (typeof KONDISI)[number];
export const LABEL_KONDISI: Record<Kondisi, string> = {
  baru: "Baru",
  baik: "Baik",
  cukup: "Cukup",
  rusak: "Rusak",
};

const uuid = z.string().uuid();

/** Teks bebas yang boleh kosong; string kosong tidak diterima (kosong = null). */
const teksOpsional = z.string().trim().min(1).nullish();

const bilanganPositif = (pesan: string, maks: number) =>
  z.number({ error: pesan }).int(pesan).min(1, pesan).max(maks, pesan).nullish();

export const kontributorSchema = z.object({
  id: uuid,
  nama: z.string().trim().min(1, "Nama Kontributor wajib diisi"),
  peran: z.enum(PERAN),
  utama: z.boolean(),
});
export type KontributorDto = z.infer<typeof kontributorSchema>;

/** Field Buku selain id dan Kontributor; `judul` wajib saat tambah. */
export const bukuFieldSchemas = {
  judul: z.string().trim().min(1, "Judul wajib diisi"),
  penerbit: teksOpsional,
  kota: teksOpsional,
  tahun: bilanganPositif("Tahun harus berupa angka 4 digit", 9999),
  edisi: teksOpsional,
  seri: teksOpsional,
  jilid: teksOpsional,
  bahasa: teksOpsional,
  halaman: bilanganPositif("Halaman harus berupa angka", 99999),
  sinopsis: teksOpsional,
  /** Kunci atau alamat berkas sampul (pengunggahan sampul menyusul). */
  sampul: teksOpsional,
  subjek: z.array(z.string().trim().min(1)).max(50).nullish(),
  /** Kelas DDC: tiga digit, boleh dengan desimal (`155`, `155.24`). */
  kelasDdc: z
    .string()
    .trim()
    .regex(/^\d{3}(\.\d+)?$/, "Kelas DDC berupa 3 digit, boleh dengan desimal (155 atau 155.24)")
    .nullish(),
  isbn13: z
    .string()
    .trim()
    .regex(/^97[89]\d{10}$/, "ISBN harus 13 digit berawalan 978 atau 979")
    .nullish(),
} as const;

export const NAMA_FIELD_BUKU = Object.keys(bukuFieldSchemas) as (keyof typeof bukuFieldSchemas)[];

/** Tanggal kalender `YYYY-MM-DD` yang benar-benar ada. */
export const tanggalKalender = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal berformat TTTT-BB-HH")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Tanggal tidak ada di kalender");

/** Field Eksemplar yang diisi Pemilik (di luar Kategori). Semua boleh kosong. */
export const eksemplarFieldSchemas = {
  /** Boleh kosong: koleksi lama sering tidak diketahui tanggal masuknya. */
  tanggalMasuk: tanggalKalender.nullish(),
  asal: z.enum(ASAL, { error: "Asal tidak dikenal" }).nullish(),
  /** Rupiah utuh. */
  harga: z
    .number({ error: "Harga harus berupa angka" })
    .int("Harga dalam rupiah utuh")
    .min(0, "Harga tidak boleh negatif")
    .nullish(),
  kondisi: z.enum(KONDISI, { error: "Kondisi tidak dikenal" }).nullish(),
  lokasiId: uuid.nullish(),
} as const;

export const NAMA_FIELD_EKSEMPLAR = Object.keys(eksemplarFieldSchemas) as (keyof typeof eksemplarFieldSchemas)[];

export type FieldBuku = {
  judul: string;
  penerbit: string | null;
  kota: string | null;
  tahun: number | null;
  edisi: string | null;
  seri: string | null;
  jilid: string | null;
  bahasa: string | null;
  halaman: number | null;
  sinopsis: string | null;
  sampul: string | null;
  subjek: string[];
  kelasDdc: string | null;
  isbn13: string | null;
};

export type FieldEksemplar = {
  tanggalMasuk: string | null;
  asal: Asal | null;
  harga: number | null;
  kondisi: Kondisi | null;
  lokasiId: string | null;
};
