import { z } from "zod";
import {
  bukuFieldSchemas,
  eksemplarFieldSchemas,
  kontributorSchema,
  type FieldBuku,
  type FieldEksemplar,
  type KontributorDto,
} from "./buku-fields";
import type { TemplateLabel } from "./label/template-label";
import type { AturanKategoriDto, KategoriDto, LokasiDto } from "./kelola-protocol";
import type { PenyianganDto } from "./penyiangan-protocol";

export type { AturanKategoriDto, KategoriDto, LokasiDto };

/**
 * Kontrak antara Perpustakaan Lokal (klien) dan API Sinkronisasi (server).
 * Id entitas dan id mutasi selalu dibuat di klien (UUID).
 */

const uuid = z.string().uuid();

/** ISO 8601 dengan offset zona perangkat, mis. `2026-12-31T23:30:00+07:00`. */
export const waktuPerangkat = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
    "waktuDicatat harus berformat ISO 8601 dengan offset",
  );

export { kontributorSchema };

const eksemplarFields = z.object(eksemplarFieldSchemas);
const bukuFields = z.object(bukuFieldSchemas);

/** Perubahan Buku: field yang tidak disebut tidak berubah; `null` mengosongkan. */
export const perubahanBukuSchema = bukuFields
  .partial()
  .extend({ kontributor: z.array(kontributorSchema).min(1).optional() });
/** Perubahan Eksemplar: field yang tidak disebut tidak berubah; `null` mengosongkan. */
export const perubahanEksemplarSchema = eksemplarFields.partial();

export const mutasiSchema = z.discriminatedUnion("jenis", [
  z.object({
    id: uuid,
    jenis: z.literal("buku.tambah"),
    buku: bukuFields.extend({ id: uuid, kontributor: z.array(kontributorSchema) }),
  }),
  z.object({
    id: uuid,
    jenis: z.literal("eksemplar.catat"),
    eksemplar: eksemplarFields.extend({
      id: uuid,
      bukuId: uuid,
      kategoriId: uuid,
      waktuDicatat: waktuPerangkat,
    }),
  }),
  /** Mengubah Buku yang sudah ada; `waktuUbah` = saat Pemilik mengubah di perangkat. */
  z.object({
    id: uuid,
    jenis: z.literal("buku.ubah"),
    bukuId: uuid,
    waktuUbah: waktuPerangkat,
    perubahan: perubahanBukuSchema,
  }),
  z.object({
    id: uuid,
    jenis: z.literal("eksemplar.ubah"),
    eksemplarId: uuid,
    waktuUbah: waktuPerangkat,
    perubahan: perubahanEksemplarSchema,
  }),
  /** Pemilik menandai Label Eksemplar sudah tercetak: keluar dari Antrean Cetak. */
  z.object({
    id: uuid,
    jenis: z.literal("eksemplar.tandaiTercetak"),
    eksemplarIds: z.array(uuid).min(1).max(500),
    waktuUbah: waktuPerangkat,
  }),
  /** Koreksi Kategori: mengubah Nomor Panggil, tidak pernah Nomor Induk (ADR 0001). */
  z.object({
    id: uuid,
    jenis: z.literal("eksemplar.koreksiKategori"),
    eksemplarId: uuid,
    kategoriId: uuid,
    waktuUbah: waktuPerangkat,
  }),
]);

export const pushRequestSchema = z.object({
  mutasi: z.array(mutasiSchema),
});

export type Mutasi = z.infer<typeof mutasiSchema>;
export type PushRequest = z.infer<typeof pushRequestSchema>;

/**
 * Field dari mutasi ini yang kalah dari perubahan yang lebih baru dari perangkat
 * lain (ADR 0004: per field, yang terbaru menang). `nilai` adalah nilai yang kini
 * berlaku di server, supaya perangkat bisa menyamakan salinan lokalnya.
 */
export type FieldDitimpa = { field: string; nilai: unknown };

export type HasilMutasi =
  | { id: string; status: "diterima"; nomorInduk?: string; eksemplarId?: string; ditimpa?: FieldDitimpa[] }
  | { id: string; status: "ditolak"; alasan: string };

export type PushResponse = { hasil: HasilMutasi[] };

export type { KontributorDto };

export type BukuDto = FieldBuku & {
  id: string;
  kontributor: KontributorDto[];
};

export type EksemplarDto = FieldEksemplar & {
  id: string;
  bukuId: string;
  kategoriId: string;
  nomorInduk: string | null;
  tahunPencatatan: number;
  waktuDicatat: string;
  status: "aktif" | "keluar";
  /** Terisi bila `status` = `keluar` (Penyiangan). */
  penyiangan: PenyianganDto | null;
  /**
   * Label perlu dicetak: benar sejak Eksemplar dicatat (belum pernah dicetak) dan
   * kembali benar bila Nomor Panggilnya berubah. Antrean Cetak membacanya.
   */
  perluCetak: boolean;
};

export type PullResponse = {
  /** Kursor opak; kirim kembali pada pull berikutnya. */
  kursor: string | null;
  kategori: KategoriDto[];
  lokasi: LokasiDto[];
  aturanKategori: AturanKategoriDto[];
  /** Template Label yang tersimpan bila berubah sejak kursor; null = tidak ada kabar baru. */
  templateLabel: TemplateLabel | null;
  buku: BukuDto[];
  eksemplar: EksemplarDto[];
};

/** Jalur yang dipakai klien untuk bicara ke server (fetch di app, API langsung di tes). */
export type SyncTransport = {
  push(req: PushRequest): Promise<PushResponse>;
  pull(kursor: string | null): Promise<PullResponse>;
};
