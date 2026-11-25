import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RUTE_CANGKANG, kunciHalaman } from "@/lib/rute-cangkang";

/** Rute halaman nyata dari `src/app/(app)/**\/page.tsx`. */
function rutePadaDisk(): string[] {
  const akar = join(process.cwd(), "src/app/(app)");
  const hasil: string[] = [];
  const telusuri = (dir: string, rute: string) => {
    for (const nama of readdirSync(dir)) {
      const jalur = join(dir, nama);
      if (statSync(jalur).isDirectory()) telusuri(jalur, `${rute}/${nama}`);
      else if (nama === "page.tsx") hasil.push(rute === "" ? "/" : rute);
    }
  };
  telusuri(akar, "");
  return hasil.sort();
}

describe("rute cangkang aplikasi yang disimpan untuk offline", () => {
  it("memuat setiap halaman di (app), supaya terbuka saat browser dimulai offline", () => {
    expect(rutePadaDisk().filter((r) => !RUTE_CANGKANG.includes(r))).toEqual([]);
  });

  it("memuat halaman login (setelah Keluar tanpa koneksi)", () => {
    expect(RUTE_CANGKANG).toContain("/login");
  });

  it("tidak memuat rute yang tidak ada", () => {
    const ada = new Set([...rutePadaDisk(), "/login"]);
    expect(RUTE_CANGKANG.filter((r) => !ada.has(r))).toEqual([]);
  });
});

describe("kunci halaman di cache", () => {
  it("mengabaikan query: /buku?id=1 dan /buku?id=2 memakai cangkang yang sama", () => {
    expect(kunciHalaman("https://x.test/buku?id=1")).toBe("https://x.test/buku");
    expect(kunciHalaman("https://x.test/buku?id=2")).toBe("https://x.test/buku");
  });

  it("mempertahankan path dan origin", () => {
    expect(kunciHalaman("http://localhost:3100/lainnya/kategori")).toBe("http://localhost:3100/lainnya/kategori");
  });
});
