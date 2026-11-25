/**
 * Keadaan kotak bidik di layar scan kamera, sebagai mesin keadaan murni
 * (waktu selalu dikirim pemanggil, jadi bisa dites tanpa pewaktu).
 *
 * - putih: kamera mati/dijeda, atau sedang mencari barcode
 * - hijau: barcode terbaca dan diterima (sebentar)
 * - merah: barcode terbaca tapi ditolak (sebentar; alasannya di pesan layar),
 *   atau tidak ada barcode terbaca selama `BATAS_BELUM_TERBACA_MS`
 *
 * Batas waktu diperlukan karena ZXing tidak melaporkan apa-apa untuk barcode
 * yang tidak bisa dibaca (mis. garis tercetak terlalu tipis): tanpa itu
 * Pemilik menunggu tanpa tahu sebaiknya mengetik ISBN.
 */

export const BATAS_BELUM_TERBACA_MS = 6000;
export const LAMA_BERHASIL_MS = 700;
export const LAMA_DITOLAK_MS = 2500;

export type KeadaanKotak =
  | { jenis: "mati" }
  | { jenis: "mencari"; sejak: number }
  | { jenis: "berhasil"; sampai: number }
  | { jenis: "ditolak"; sampai: number }
  | { jenis: "belumTerbaca" };

export type PeristiwaKotak =
  /** Kamera menyala dan tidak dijeda. */
  | { jenis: "aktif"; waktu: number }
  /** Kamera mati, gagal, atau dijeda (lembar lain terbuka). */
  | { jenis: "nonaktif" }
  /** Ada barcode terbaca, apa pun hasilnya (termasuk ISBN sama yang diabaikan). */
  | { jenis: "terbaca"; waktu: number }
  | { jenis: "berhasil"; waktu: number }
  | { jenis: "ditolak"; waktu: number }
  /** Pewaktu berdetak: kilatan berakhir atau batas waktu terlewati. */
  | { jenis: "detak"; waktu: number };

export type WarnaKotak = "putih" | "hijau" | "merah";

export const KOTAK_MATI: KeadaanKotak = { jenis: "mati" };

export function ubahKotak(k: KeadaanKotak, p: PeristiwaKotak): KeadaanKotak {
  if (p.jenis === "nonaktif") return KOTAK_MATI;
  if (p.jenis === "aktif") return k.jenis === "mati" ? { jenis: "mencari", sejak: p.waktu } : k;
  if (k.jenis === "mati") return k;

  switch (p.jenis) {
    case "berhasil":
      return { jenis: "berhasil", sampai: p.waktu + LAMA_BERHASIL_MS };
    case "ditolak":
      return { jenis: "ditolak", sampai: p.waktu + LAMA_DITOLAK_MS };
    case "terbaca":
      return k.jenis === "mencari" || k.jenis === "belumTerbaca" ? { jenis: "mencari", sejak: p.waktu } : k;
    case "detak":
      if ((k.jenis === "berhasil" || k.jenis === "ditolak") && p.waktu >= k.sampai) return { jenis: "mencari", sejak: k.sampai };
      if (k.jenis === "mencari" && p.waktu - k.sejak >= BATAS_BELUM_TERBACA_MS) return { jenis: "belumTerbaca" };
      return k;
  }
}

export function warnaKotak(k: KeadaanKotak): WarnaKotak {
  if (k.jenis === "berhasil") return "hijau";
  if (k.jenis === "ditolak" || k.jenis === "belumTerbaca") return "merah";
  return "putih";
}
