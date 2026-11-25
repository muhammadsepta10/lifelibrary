import { z } from "zod";
import { tanggalKalender } from "./buku-fields";

/**
 * Kontrak Peminjaman (GLOSSARY): satu Eksemplar dipinjamkan ke seorang
 * Peminjam, lengkap dengan tanggal pinjam, jatuh tempo, dan tanggal kembali.
 * Tanpa denda. Peminjaman dan pengembalian bisa dicatat offline lewat outbox
 * (ADR 0004); id dibuat di klien.
 */

const uuid = z.string().uuid();

export const peminjamSchema = z.object({
  id: uuid,
  nama: z.string().trim().min(1, "Nama Peminjam wajib diisi").max(120, "Nama maksimal 120 karakter"),
  /** Nomor WhatsApp/telepon atau kontak lain; boleh kosong. */
  kontak: z.string().trim().max(120, "Kontak maksimal 120 karakter").nullish(),
});

export const peminjamanBaruSchema = z.object({
  id: uuid,
  eksemplarId: uuid,
  tanggalPinjam: tanggalKalender,
  jatuhTempo: tanggalKalender,
});

/** Perubahan Peminjam: field yang tidak disebut tidak berubah; `kontak: null` mengosongkan. */
export const perubahanPeminjamSchema = z.object({
  nama: peminjamSchema.shape.nama.optional(),
  kontak: peminjamSchema.shape.kontak.optional(),
});

/** Perubahan Peminjaman: perpanjangan (jatuh tempo baru) dan/atau pengembalian. */
export const perubahanPeminjamanSchema = z.object({
  jatuhTempo: tanggalKalender.optional(),
  tanggalKembali: tanggalKalender.optional(),
});

export type PeminjamDto = { id: string; nama: string; kontak: string | null };

export type PeminjamanDto = {
  id: string;
  eksemplarId: string;
  peminjamId: string;
  /** `YYYY-MM-DD` */
  tanggalPinjam: string;
  jatuhTempo: string;
  /** Null selama masih dipinjam. */
  tanggalKembali: string | null;
};

export const NAMA_FIELD_PEMINJAM = ["nama", "kontak"] as const;
export const NAMA_FIELD_PEMINJAMAN = ["jatuhTempo", "tanggalKembali"] as const;
