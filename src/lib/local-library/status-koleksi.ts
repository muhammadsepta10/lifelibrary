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
 * TITIK SAMBUNG TIKET #10 (Peminjaman). Satu-satunya tempat yang perlu diubah
 * agar filter "dipinjam" (dan "tersedia") bekerja: kembalikan id Eksemplar
 * yang sedang dipinjam, yaitu yang punya Peminjaman tanpa tanggal kembali.
 * Mis. setelah menambah tabel `peminjaman` di `LocalDb`:
 *
 *   return new Set(
 *     (await db.peminjaman.filter((p) => !p.tanggalKembali).toArray()).map((p) => p.eksemplarId),
 *   );
 *
 * Dipanggil dari pembaca Koleksi yang dipantau liveQuery, jadi tabel yang
 * dibaca di sini otomatis memicu pembaruan Koleksi. Filter, tipe `ItemKoleksi.dipinjam`,
 * dan UI sudah memakai hasilnya.
 */
export async function idEksemplarDipinjam(db: LocalDb): Promise<Set<string>> {
  void db;
  return new Set();
}
