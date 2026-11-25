import { describe, expect, it } from "vitest";
import { normalisasiIsbn } from "@/lib/local-library";

describe("Perpustakaan Lokal: normalisasi ISBN", () => {
  it("ISBN-13 yang sah diterima apa adanya, tanda hubung dan spasi dibuang", () => {
    expect(normalisasiIsbn("9786020633176")).toEqual({ ok: true, isbn13: "9786020633176" });
    expect(normalisasiIsbn(" 978-602-06-3317-6 ")).toEqual({ ok: true, isbn13: "9786020633176" });
    expect(normalisasiIsbn("ISBN 9786020633176")).toEqual({ ok: true, isbn13: "9786020633176" });
  });

  it("ISBN-10 dinormalisasi ke ISBN-13 (awalan 978, digit pemeriksa baru)", () => {
    expect(normalisasiIsbn("6020633179")).toEqual({ ok: true, isbn13: "9786020633176" });
    expect(normalisasiIsbn("0735211299")).toEqual({ ok: true, isbn13: "9780735211292" });
  });

  it("ISBN-10 berakhiran X dihitung 10", () => {
    // 080442957X -> 9780804429573
    expect(normalisasiIsbn("080442957X")).toEqual({ ok: true, isbn13: "9780804429573" });
    expect(normalisasiIsbn("080442957x")).toEqual({ ok: true, isbn13: "9780804429573" });
  });

  it("menerima awalan 979", () => {
    expect(normalisasiIsbn("9791090636071")).toEqual({ ok: true, isbn13: "9791090636071" });
  });

  it("menolak kode 13 digit selain 978/979 dengan pesan yang jelas", () => {
    // EAN-13 produk biasa, digit pemeriksa sah
    const hasil = normalisasiIsbn("4006381333931");
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.pesan).toContain("978 atau 979");
  });

  it("menolak digit pemeriksa yang salah (ISBN-13 dan ISBN-10)", () => {
    const a = normalisasiIsbn("9786020633177");
    const b = normalisasiIsbn("6020633178");
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok) expect(a.pesan).toMatch(/digit pemeriksa/i);
  });

  it("menolak isian kosong, bukan angka, atau panjang salah", () => {
    for (const salah of ["", "   ", "abc", "12345", "97860206331761", "97860206331A6"]) {
      const hasil = normalisasiIsbn(salah);
      expect(hasil.ok, salah).toBe(false);
      if (!hasil.ok) expect(hasil.pesan.length).toBeGreaterThan(5);
    }
  });
});
