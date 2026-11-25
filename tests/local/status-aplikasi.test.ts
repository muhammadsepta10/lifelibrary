import { describe, expect, it } from "vitest";
import {
  KETERANGAN_BUTUH_KONEKSI,
  TEKS_STRIP_LOGIN,
  TEKS_STRIP_OFFLINE,
  caraPasang,
  tentukanStrip,
} from "@/lib/status-aplikasi";

describe("strip status aplikasi", () => {
  it("online dan sesi baik: tidak ada strip", () => {
    expect(tentukanStrip({ online: true, keadaanSinkron: "selesai" })).toEqual([]);
  });

  it("offline: strip tipis 'Offline · perubahan disimpan di perangkat ini'", () => {
    expect(TEKS_STRIP_OFFLINE).toBe("Offline · perubahan disimpan di perangkat ini");
    expect(tentukanStrip({ online: false, keadaanSinkron: "diam" })).toEqual([
      { jenis: "offline", teks: "Offline · perubahan disimpan di perangkat ini" },
    ]);
  });

  it("strip offline hilang begitu online lagi", () => {
    expect(tentukanStrip({ online: false, keadaanSinkron: "diam" })).toHaveLength(1);
    expect(tentukanStrip({ online: true, keadaanSinkron: "diam" })).toHaveLength(0);
  });

  it("sesi login kedaluwarsa: strip 'masuk lagi untuk Sinkronisasi' dengan tautan masuk", () => {
    expect(TEKS_STRIP_LOGIN).toContain("masuk lagi untuk Sinkronisasi");
    expect(tentukanStrip({ online: true, keadaanSinkron: "perlu-login" })).toEqual([
      { jenis: "login", teks: TEKS_STRIP_LOGIN, href: "/login" },
    ]);
  });

  it("offline dan sesi kedaluwarsa: kedua strip, offline di atas", () => {
    expect(tentukanStrip({ online: false, keadaanSinkron: "perlu-login" }).map((s) => s.jenis)).toEqual(["offline", "login"]);
  });

  it("sinkron gagal biasa (server error) bukan alasan menampilkan strip login", () => {
    expect(tentukanStrip({ online: true, keadaanSinkron: "gagal" })).toEqual([]);
  });

  it("keterangan aksi online-only adalah 'Butuh koneksi'", () => {
    expect(KETERANGAN_BUTUH_KONEKSI).toBe("Butuh koneksi");
  });
});

describe("cara memasang ke layar utama", () => {
  const IPHONE_SAFARI =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const IPHONE_CHROME =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
  const IPAD_DESKTOP_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
  const ANDROID_CHROME =
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
  const MAC_SAFARI = IPAD_DESKTOP_UA;

  it("sudah terpasang (standalone): tidak perlu instruksi", () => {
    expect(caraPasang({ userAgent: IPHONE_SAFARI, standalone: true, maxTouchPoints: 5, bisaDipasangLangsung: false })).toEqual({ jenis: "terpasang" });
  });

  it("iPhone Safari: langkah Add to Home Screen dari tombol Bagikan", () => {
    const hasil = caraPasang({ userAgent: IPHONE_SAFARI, standalone: false, maxTouchPoints: 5, bisaDipasangLangsung: false });

    expect(hasil.jenis).toBe("ios");
    if (hasil.jenis !== "ios") return;
    const teks = hasil.langkah.join(" ");
    expect(teks).toContain("Bagikan");
    expect(teks).toContain("Tambah ke Layar Utama");
    expect(teks).toContain("Add to Home Screen");
  });

  it("iPhone dengan Chrome (CriOS) juga memakai langkah iOS", () => {
    expect(caraPasang({ userAgent: IPHONE_CHROME, standalone: false, maxTouchPoints: 5, bisaDipasangLangsung: false }).jenis).toBe("ios");
  });

  it("iPad yang menyamar sebagai Mac (layar sentuh) dikenali sebagai iOS", () => {
    expect(caraPasang({ userAgent: IPAD_DESKTOP_UA, standalone: false, maxTouchPoints: 5, bisaDipasangLangsung: false }).jenis).toBe("ios");
  });

  it("Mac sungguhan (tanpa sentuh) bukan iOS", () => {
    expect(caraPasang({ userAgent: MAC_SAFARI, standalone: false, maxTouchPoints: 0, bisaDipasangLangsung: false }).jenis).toBe("lainnya");
  });

  it("Android Chrome dengan prompt pemasangan: tombol Pasang langsung", () => {
    expect(caraPasang({ userAgent: ANDROID_CHROME, standalone: false, maxTouchPoints: 5, bisaDipasangLangsung: true })).toEqual({ jenis: "langsung" });
  });

  it("browser lain tanpa prompt: petunjuk umum lewat menu browser", () => {
    const hasil = caraPasang({ userAgent: ANDROID_CHROME, standalone: false, maxTouchPoints: 5, bisaDipasangLangsung: false });

    expect(hasil.jenis).toBe("lainnya");
  });
});
