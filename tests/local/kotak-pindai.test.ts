import { describe, expect, it } from "vitest";
import {
  BATAS_BELUM_TERBACA_MS,
  KOTAK_MATI,
  LAMA_BERHASIL_MS,
  LAMA_DITOLAK_MS,
  ubahKotak,
  warnaKotak,
  type KeadaanKotak,
  type PeristiwaKotak,
} from "@/lib/kotak-pindai";

/**
 * Kotak bidik di layar scan memberi tahu Pemilik apa yang terjadi:
 * putih = mencari, hijau = terbaca, merah = terbaca tapi ditolak, atau
 * terlalu lama tidak ada barcode yang terbaca. Kasus nyata: barcode ISBN
 * yang tercetak terlalu tipis tidak pernah terbaca ZXing dan ZXing tidak
 * melaporkan galat apa pun; tanpa batas waktu Pemilik menunggu tanpa tahu
 * harus mengetik ISBN.
 */

function jalankan(...peristiwa: PeristiwaKotak[]): KeadaanKotak {
  return peristiwa.reduce(ubahKotak, KOTAK_MATI);
}

describe("kotak pindai", () => {
  it("putih saat kamera mati dan saat baru mulai mencari", () => {
    expect(warnaKotak(KOTAK_MATI)).toBe("putih");
    expect(warnaKotak(jalankan({ jenis: "aktif", waktu: 0 }))).toBe("putih");
  });

  it("merah bila tidak ada barcode terbaca selama batas waktu", () => {
    const k = jalankan({ jenis: "aktif", waktu: 1000 }, { jenis: "detak", waktu: 1000 + BATAS_BELUM_TERBACA_MS - 1 });
    expect(k.jenis).toBe("mencari");
    const lewat = ubahKotak(k, { jenis: "detak", waktu: 1000 + BATAS_BELUM_TERBACA_MS });
    expect(lewat.jenis).toBe("belumTerbaca");
    expect(warnaKotak(lewat)).toBe("merah");
  });

  it("bacaan apa pun (mis. ISBN sama yang diabaikan) memulai ulang hitungan batas waktu", () => {
    const k = jalankan(
      { jenis: "aktif", waktu: 0 },
      { jenis: "terbaca", waktu: BATAS_BELUM_TERBACA_MS - 1 },
      { jenis: "detak", waktu: BATAS_BELUM_TERBACA_MS + 100 },
    );
    expect(k.jenis).toBe("mencari");
  });

  it("bacaan berikutnya memulihkan kotak dari merah 'belum terbaca'", () => {
    const k = jalankan(
      { jenis: "aktif", waktu: 0 },
      { jenis: "detak", waktu: BATAS_BELUM_TERBACA_MS },
      { jenis: "terbaca", waktu: BATAS_BELUM_TERBACA_MS + 10 },
    );
    expect(warnaKotak(k)).toBe("putih");
  });

  it("hijau sebentar saat berhasil, lalu kembali putih dan hitungan mulai dari akhir kilatan", () => {
    const k = jalankan({ jenis: "aktif", waktu: 0 }, { jenis: "berhasil", waktu: 100 });
    expect(warnaKotak(k)).toBe("hijau");
    expect(warnaKotak(ubahKotak(k, { jenis: "detak", waktu: 100 + LAMA_BERHASIL_MS - 1 }))).toBe("hijau");
    const kembali = ubahKotak(k, { jenis: "detak", waktu: 100 + LAMA_BERHASIL_MS });
    expect(kembali).toEqual({ jenis: "mencari", sejak: 100 + LAMA_BERHASIL_MS });
  });

  it("merah sebentar saat barcode terbaca tapi ditolak, lalu kembali putih", () => {
    const k = jalankan({ jenis: "aktif", waktu: 0 }, { jenis: "ditolak", waktu: 100 });
    expect(warnaKotak(k)).toBe("merah");
    expect(k.jenis).toBe("ditolak");
    expect(warnaKotak(ubahKotak(k, { jenis: "detak", waktu: 100 + LAMA_DITOLAK_MS }))).toBe("putih");
  });

  it("bacaan netral tidak memotong kilatan hijau atau merah yang sedang tampil", () => {
    const k = jalankan({ jenis: "aktif", waktu: 0 }, { jenis: "ditolak", waktu: 100 }, { jenis: "terbaca", waktu: 200 });
    expect(k.jenis).toBe("ditolak");
  });

  it("nonaktif (kamera mati atau dijeda) mengembalikan kotak putih dan menghentikan hitungan", () => {
    const k = jalankan({ jenis: "aktif", waktu: 0 }, { jenis: "nonaktif" }, { jenis: "detak", waktu: BATAS_BELUM_TERBACA_MS * 3 });
    expect(k).toEqual(KOTAK_MATI);
    expect(jalankan({ jenis: "berhasil", waktu: 0 })).toEqual(KOTAK_MATI);
  });

  it("aktif lagi setelah dijeda menghitung dari awal", () => {
    const k = jalankan(
      { jenis: "aktif", waktu: 0 },
      { jenis: "nonaktif" },
      { jenis: "aktif", waktu: 10_000 },
      { jenis: "detak", waktu: 10_000 + BATAS_BELUM_TERBACA_MS - 1 },
    );
    expect(k.jenis).toBe("mencari");
  });
});
