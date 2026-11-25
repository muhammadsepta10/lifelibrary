import type { LocalDb } from "./db";

/**
 * Status Koleksi yang bisa dipilih di filter. Setiap status adalah predikat
 * atas satu Eksemplar, jadi sebuah Eksemplar bisa memenuhi lebih dari satu
 * (Eksemplar baru yang Menunggu Sinkron dan belum dipinjam adalah "tersedia"
 * sekaligus "menunggu sinkron", karena bukunya memang ada di rak):
 *
 * - `tersedia`: aktif dan tidak sedang dipinjam
 * - `dipinjam`: aktif dan sedang dipinjam
 * - `menunggu-sinkron`: aktif dan belum diterima server
 * - `keluar`: sudah melalui Penyiangan
 *
 * Tanpa status, Koleksi hanya berisi Eksemplar aktif.
 */
export const STATUS_KOLEKSI = ["tersedia", "dipinjam", "menunggu-sinkron", "keluar"] as const;
export type StatusKoleksi = (typeof STATUS_KOLEKSI)[number];
export const LABEL_STATUS_KOLEKSI: Record<StatusKoleksi, string> = {
  tersedia: "Tersedia",
  dipinjam: "Dipinjam",
  "menunggu-sinkron": "Menunggu Sinkron",
  keluar: "Keluar",
};

/**
 * Id Eksemplar yang sedang dipinjam: yang punya Peminjaman tanpa tanggal kembali.
 * Dipanggil dari pembaca Koleksi yang dipantau liveQuery, jadi tabel `peminjaman`
 * yang dibaca di sini otomatis memicu pembaruan Koleksi.
 */
export async function idEksemplarDipinjam(db: LocalDb): Promise<Set<string>> {
  const aktif = await db.peminjaman.filter((p) => p.tanggalKembali === null).toArray();
  return new Set(aktif.map((p) => p.eksemplarId));
}
