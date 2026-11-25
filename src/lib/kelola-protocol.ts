import { z } from "zod";
import type { TemplateLabel } from "./label/template-label";

/**
 * Kontrak pengelolaan Kategori, Lokasi, dan Aturan Kategori (ADR 0004: hanya
 * online, tidak lewat outbox). Hasil setiap perintah adalah entitas terbaru;
 * entitas yang dihapus kembali sebagai penanda `dihapus: true` supaya
 * perangkat lain ikut menghapusnya lewat pull.
 */

const uuid = z.string().uuid();

/** Kode Kategori dipakai di Nomor Induk (`FIK-001/2026`), jadi hanya huruf besar/angka. */
export const kodeKategori = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{2,5}$/, "Kode terdiri dari 2–5 huruf atau angka"));

const warna = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Warna harus berformat #RRGGBB");

const nama = (pesan: string) => z.string().trim().min(1, pesan);

export const kategoriBaruSchema = z.object({
  kode: kodeKategori,
  nama: nama("Nama Kategori wajib diisi"),
  warna,
});
export const kategoriUbahSchema = kategoriBaruSchema
  .partial()
  .extend({ diarsipkan: z.boolean().optional() });

export const lokasiBaruSchema = z.object({ nama: nama("Nama Lokasi wajib diisi") });
export const lokasiUbahSchema = lokasiBaruSchema.partial();

/**
 * Kelas DDC: tepat tiga digit (`155`) atau dengan x sebagai pengganti
 * (`2xx` = seluruh kelas 200-an, `15x` = 150-an). Subdivisi desimal
 * (`155.24`) tercakup oleh tiga digit pertamanya.
 */
export const POLA_DDC = /^(\d{3}|\dxx|\d\dx)$/;

export const jenisAturan = z.enum(["ddc", "subjek"]);
export type JenisAturan = z.infer<typeof jenisAturan>;

/** Prioritas 1 diperiksa paling dulu; angka lebih besar lebih belakangan. */
const prioritas = z
  .number({ error: "Prioritas wajib diisi" })
  .int("Prioritas harus bilangan bulat")
  .min(1, "Prioritas minimal 1")
  .max(999, "Prioritas maksimal 999");

const aturanDasar = z.object({
  jenis: jenisAturan,
  pola: z.string().trim().min(1, "Pola wajib diisi"),
  kategoriId: uuid,
  prioritas,
});
function periksaPola(a: { jenis?: JenisAturan; pola?: string }, ctx: z.RefinementCtx) {
  if (a.jenis === "ddc" && a.pola !== undefined && !POLA_DDC.test(a.pola.toLowerCase())) {
    ctx.addIssue({
      code: "custom",
      path: ["pola"],
      message: "Kelas DDC berupa tiga digit (155) atau dengan x (2xx, 15x)",
    });
  }
}
export const aturanBaruSchema = aturanDasar.superRefine(periksaPola);
/** Ubah: jenis tidak berubah; polanya diperiksa terhadap jenis aturan yang tersimpan. */
export const aturanUbahSchema = aturanDasar.omit({ jenis: true }).partial();

export type KategoriBaru = z.input<typeof kategoriBaruSchema>;
export type KategoriUbah = z.input<typeof kategoriUbahSchema>;
export type LokasiBaru = z.input<typeof lokasiBaruSchema>;
export type LokasiUbah = z.input<typeof lokasiUbahSchema>;
export type AturanBaru = z.input<typeof aturanBaruSchema>;
export type AturanUbah = z.input<typeof aturanUbahSchema>;

export type KategoriDto = {
  id: string;
  kode: string;
  nama: string;
  warna: string;
  diarsipkan: boolean;
  /** Penanda hapus untuk pull; Kategori yang dipakai Eksemplar tidak pernah dihapus. */
  dihapus: boolean;
};

export type LokasiDto = { id: string; nama: string; dihapus: boolean };

export type AturanKategoriDto = {
  id: string;
  jenis: JenisAturan;
  /** DDC dinormalkan ke huruf kecil (`2xx`); kata kunci subjek apa adanya. */
  pola: string;
  kategoriId: string;
  prioritas: number;
  dihapus: boolean;
};

/** Penolakan server yang siap ditampilkan ke Pemilik. */
export class KelolaDitolakError extends Error {
  constructor(
    public readonly jenis: "tidak-valid" | "konflik" | "tidak-ditemukan",
    public readonly field: string | null,
    public readonly pesan: string,
  ) {
    super(pesan);
    this.name = "KelolaDitolakError";
  }
}

type Perintah<Baru, Ubah, Dto> = {
  buat(input: Baru): Promise<Dto>;
  ubah(id: string, perubahan: Ubah): Promise<Dto>;
  hapus(id: string): Promise<Dto>;
};

/** Jalur yang dipakai klien untuk mengelola daftar (fetch di app, API langsung di tes). */
export type KelolaTransport = {
  kategori: Perintah<KategoriBaru, KategoriUbah, KategoriDto>;
  lokasi: Perintah<LokasiBaru, LokasiUbah, LokasiDto>;
  aturanKategori: Perintah<AturanBaru, AturanUbah, AturanKategoriDto>;
  /** Template Label: satu per koleksi; menyimpan menggantikan yang lama. */
  templateLabel: { simpan(input: TemplateLabel): Promise<TemplateLabel> };
};
