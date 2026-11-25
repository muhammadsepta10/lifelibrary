/**
 * Halaman cangkang aplikasi: HTML statis yang membaca data dari Dexie, jadi
 * aman disimpan di cache dan dibuka saat browser dimulai tanpa koneksi
 * (ADR 0004). Service Worker menyimpannya setelah aplikasi dibuka online
 * (pesan dari halaman, karena rute di balik login tidak bisa di-precache
 * saat install). `pnpm check:build` memastikan daftar ini mencakup setiap
 * halaman di `src/app/(app)`.
 */
export const RUTE_CANGKANG = [
  "/",
  "/koleksi",
  "/tambah",
  "/tambah/isbn",
  "/tambah/sesi",
  "/sinkron",
  "/peminjaman",
  "/lainnya",
  "/lainnya/kategori",
  "/lainnya/lokasi",
  "/lainnya/aturan",
  "/cetak",
  "/cetak/template",
  "/buku-induk",
  "/statistik",
  "/buku",
  "/buku/eksemplar",
  "/buku/ubah",
  "/login",
];

/** Jenis pesan halaman -> Service Worker: simpan halaman-halaman ini. */
export const PESAN_SIMPAN_RUTE = "lifelibrary:simpan-rute";

/** Nama cache halaman dan sampul (SW dan "Keluar & hapus data" memakainya). */
export const CACHE_HALAMAN = "halaman-aplikasi";
export const CACHE_SAMPUL = "sampul";

/**
 * Kunci cache sebuah halaman: tanpa query. `/buku?id=…` adalah satu cangkang
 * yang sama untuk semua Buku; datanya datang dari Dexie, bukan dari alamat.
 */
export function kunciHalaman(url: string): string {
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
}
