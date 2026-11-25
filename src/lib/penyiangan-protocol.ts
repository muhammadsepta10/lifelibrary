import { z } from "zod";
import { tanggalKalender } from "./buku-fields";
import type { EksemplarDto } from "./sync-protocol";

/**
 * Kontrak Penyiangan: mengeluarkan Eksemplar dari koleksi aktif. Hanya online
 * (ADR 0004), tidak lewat outbox. Eksemplar tidak dihapus dan Nomor Induknya
 * tidak dipakai ulang (ADR 0001).
 */

export const JENIS_PENYIANGAN = ["hilang", "rusak", "dihibahkan", "dijual"] as const;
export type JenisPenyiangan = (typeof JENIS_PENYIANGAN)[number];
export const LABEL_PENYIANGAN: Record<JenisPenyiangan, string> = {
  hilang: "Hilang",
  rusak: "Rusak",
  dihibahkan: "Dihibahkan",
  dijual: "Dijual",
};

export const penyianganSchema = z.object({
  jenis: z.enum(JENIS_PENYIANGAN, { error: "Pilih alasan keluar: hilang, rusak, dihibahkan, atau dijual" }),
  tanggal: tanggalKalender,
  /** Keterangan bebas dari Pemilik; boleh kosong karena jenisnya sudah menjelaskan. */
  alasan: z.string().trim().min(1).max(500, "Alasan maksimal 500 karakter").nullish(),
});
export type PenyianganInput = z.input<typeof penyianganSchema>;

/** Catatan Penyiangan sebuah Eksemplar yang sudah keluar. */
export type PenyianganDto = {
  jenis: JenisPenyiangan;
  /** `YYYY-MM-DD` */
  tanggal: string;
  alasan: string | null;
};

/** Jalur yang dipakai klien untuk Penyiangan (fetch di app, API langsung di tes). */
export type PenyianganTransport = {
  /** Hasilnya Eksemplar terbaru (status `keluar`). */
  siangi(eksemplarId: string, input: PenyianganInput): Promise<EksemplarDto>;
};
