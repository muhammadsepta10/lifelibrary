/**
 * Keputusan tampilan yang berkaitan dengan mode offline, dipisah dari
 * komponen supaya bisa dites: strip status di atas aplikasi dan cara
 * memasang aplikasi ke layar utama.
 */

export const TEKS_STRIP_OFFLINE = "Offline · perubahan disimpan di perangkat ini";
export const TEKS_STRIP_LOGIN = "Sesi login habis, masuk lagi untuk Sinkronisasi. Data di perangkat ini tetap aman.";
/** Keterangan pada aksi yang hanya bisa online (ADR 0004). */
export const KETERANGAN_BUTUH_KONEKSI = "Butuh koneksi";

export type Strip =
  | { jenis: "offline"; teks: string }
  | { jenis: "login"; teks: string; href: string };

/**
 * Strip yang tampil, dari atas ke bawah. Strip offline hanya selama offline.
 * Strip login selama sesi kedaluwarsa (server menjawab 401): Sinkronisasi
 * menunggu, data lokal tetap bisa dibuka dan diedit.
 */
export function tentukanStrip(masukan: {
  online: boolean;
  keadaanSinkron: "diam" | "berjalan" | "selesai" | "perlu-login" | "gagal";
}): Strip[] {
  const strip: Strip[] = [];
  if (!masukan.online) strip.push({ jenis: "offline", teks: TEKS_STRIP_OFFLINE });
  if (masukan.keadaanSinkron === "perlu-login") strip.push({ jenis: "login", teks: TEKS_STRIP_LOGIN, href: "/login" });
  return strip;
}

export type CaraPasang =
  | { jenis: "terpasang" }
  /** Browser menawarkan prompt pemasangan (Chromium): tombol "Pasang". */
  | { jenis: "langsung" }
  /** iOS tidak punya prompt; Pemilik harus lewat menu Bagikan. */
  | { jenis: "ios"; langkah: string[] }
  | { jenis: "lainnya"; petunjuk: string };

const LANGKAH_IOS = [
  "Ketuk tombol Bagikan (kotak dengan panah ke atas) di bilah browser.",
  'Gulir, lalu pilih "Tambah ke Layar Utama" (Add to Home Screen).',
  'Ketuk "Tambah". lifelibrary muncul di layar utama dan terbuka seperti aplikasi, juga tanpa koneksi.',
];

export function caraPasang(masukan: {
  userAgent: string;
  standalone: boolean;
  maxTouchPoints: number;
  bisaDipasangLangsung: boolean;
}): CaraPasang {
  if (masukan.standalone) return { jenis: "terpasang" };
  // iPadOS 13+ mengaku sebagai Mac; yang membedakan hanya layar sentuhnya.
  const ios = /iPhone|iPad|iPod/.test(masukan.userAgent) || (/Macintosh/.test(masukan.userAgent) && masukan.maxTouchPoints > 1);
  if (ios) return { jenis: "ios", langkah: LANGKAH_IOS };
  if (masukan.bisaDipasangLangsung) return { jenis: "langsung" };
  return {
    jenis: "lainnya",
    petunjuk: 'Buka menu browser, lalu pilih "Pasang aplikasi" atau "Tambahkan ke layar utama" (Install app / Add to Home screen).',
  };
}
