import { describe, expect, it } from "vitest";
import { drafKosong, type HasilPencarianMetadata } from "@/lib/draf-buku";
import { dariGalat, dariHasil } from "@/lib/local-library/keadaan-metadata";

const ISBN = "9786026486066";

describe("Keadaan metadata: cadangan judul boleh dipakai", () => {
  it("benar hanya bila ISBN tidak ditemukan dan sumber masih bisa dihubungi", () => {
    const tidakDitemukan: HasilPencarianMetadata = { ditemukan: false, isbn13: ISBN, sumber: [], semuaGalat: false };

    expect(dariHasil(ISBN, tidakDitemukan).cadanganJudul).toBe(true);
  });

  it("salah bila semua sumber galat (diarahkan ke Coba lagi dulu)", () => {
    const semuaGalat: HasilPencarianMetadata = { ditemukan: false, isbn13: ISBN, sumber: [], semuaGalat: true };

    expect(dariHasil(ISBN, semuaGalat).cadanganJudul).toBe(false);
  });

  it("salah bila ISBN ditemukan", () => {
    const ketemu: HasilPencarianMetadata = { ditemukan: true, draf: { ...drafKosong(ISBN), judul: "Ada" }, sumber: [] };

    expect(dariHasil(ISBN, ketemu).cadanganJudul).toBe(false);
  });

  it("salah saat offline, login habis, atau galat lain", () => {
    const login = Object.assign(new Error("login"), { name: "LoginDiperlukanError" });

    expect(dariGalat(ISBN, new TypeError("Failed to fetch")).cadanganJudul).toBe(false);
    expect(dariGalat(ISBN, login).cadanganJudul).toBe(false);
    expect(dariGalat(ISBN, new Error("500")).cadanganJudul).toBe(false);
  });
});
