import { z } from "zod";
import type { AturanKategoriDto, KategoriDto, LokasiDto } from "./kelola-protocol";

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

export const kontributorSchema = z.object({
  id: uuid,
  nama: z.string().trim().min(1),
  peran: z.enum(["pengarang", "penerjemah", "editor"]),
  utama: z.boolean(),
});

export const mutasiSchema = z.discriminatedUnion("jenis", [
  z.object({
    id: uuid,
    jenis: z.literal("buku.tambah"),
    buku: z.object({
      id: uuid,
      judul: z.string().trim().min(1),
      penerbit: z.string().trim().min(1).nullish(),
      tahun: z.number().int().nullish(),
      isbn13: z.string().regex(/^97[89]\d{10}$/).nullish(),
      kontributor: z.array(kontributorSchema),
    }),
  }),
  z.object({
    id: uuid,
    jenis: z.literal("eksemplar.catat"),
    eksemplar: z.object({
      id: uuid,
      bukuId: uuid,
      kategoriId: uuid,
      waktuDicatat: waktuPerangkat,
    }),
  }),
]);

export const pushRequestSchema = z.object({
  mutasi: z.array(mutasiSchema),
});

export type Mutasi = z.infer<typeof mutasiSchema>;
export type PushRequest = z.infer<typeof pushRequestSchema>;

export type HasilMutasi =
  | { id: string; status: "diterima"; nomorInduk?: string; eksemplarId?: string }
  | { id: string; status: "ditolak"; alasan: string };

export type PushResponse = { hasil: HasilMutasi[] };

export type BukuDto = {
  id: string;
  judul: string;
  penerbit: string | null;
  tahun: number | null;
  isbn13: string | null;
  kontributor: { id: string; nama: string; peran: "pengarang" | "penerjemah" | "editor"; utama: boolean }[];
};

export type EksemplarDto = {
  id: string;
  bukuId: string;
  kategoriId: string;
  nomorInduk: string | null;
  tahunPencatatan: number;
  waktuDicatat: string;
  status: "aktif" | "keluar";
};

export type PullResponse = {
  /** Kursor opak; kirim kembali pada pull berikutnya. */
  kursor: string | null;
  kategori: KategoriDto[];
  lokasi: LokasiDto[];
  aturanKategori: AturanKategoriDto[];
  buku: BukuDto[];
  eksemplar: EksemplarDto[];
};

/** Jalur yang dipakai klien untuk bicara ke server (fetch di app, API langsung di tes). */
export type SyncTransport = {
  push(req: PushRequest): Promise<PushResponse>;
  pull(kursor: string | null): Promise<PullResponse>;
};
