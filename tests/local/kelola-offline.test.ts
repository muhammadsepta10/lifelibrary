import { beforeEach, describe, expect, it } from "vitest";
import type { KelolaTransport } from "@/lib/kelola-protocol";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { ButuhKoneksiError, createLocalLibrary } from "@/lib/local-library";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;

let lib: ReturnType<typeof createLocalLibrary>;

beforeEach(() => {
  lib = createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}` });
});

/** Seperti fetch tanpa jaringan: melempar TypeError. */
const putus = () => Promise.reject(new TypeError("Failed to fetch"));
const transportOffline: KelolaTransport = {
  kategori: { buat: putus, ubah: putus, hapus: putus },
  lokasi: { buat: putus, ubah: putus, hapus: putus },
  aturanKategori: { buat: putus, ubah: putus, hapus: putus },
};

describe("Perpustakaan Lokal: kelola saat offline", () => {
  it("Kategori tetap tersedia dari salinan lokal tanpa server", async () => {
    expect((await lib.daftarKategori()).map((k) => k.kode)).toContain("FIK");
    expect(await lib.daftarLokasi()).toEqual([]);
    expect(await lib.daftarAturanKategori()).toEqual([]);
  });

  it.each([
    ["buat Kategori", (k: ReturnType<typeof lib.kelola>) => k.kategori.buat({ kode: "NVL", nama: "Novel", warna: "#336699" })],
    ["arsipkan Kategori", (k: ReturnType<typeof lib.kelola>) => k.kategori.arsipkan(FIK.id)],
    ["buat Lokasi", (k: ReturnType<typeof lib.kelola>) => k.lokasi.buat({ nama: "Rak A" })],
    [
      "buat Aturan Kategori",
      (k: ReturnType<typeof lib.kelola>) =>
        k.aturanKategori.buat({ jenis: "ddc", pola: "2xx", kategoriId: FIK.id, prioritas: 1 }),
    ],
  ])("aksi kelola (%s) gagal dengan 'Butuh koneksi' dan tidak mengubah data lokal", async (_nama, aksi) => {
    const gagal = aksi(lib.kelola(transportOffline));

    await expect(gagal).rejects.toBeInstanceOf(ButuhKoneksiError);
    await expect(gagal).rejects.toThrow("Butuh koneksi");
    expect((await lib.daftarKategori()).map((k) => k.kode)).not.toContain("NVL");
    expect((await lib.daftarKategori()).map((k) => k.id)).toContain(FIK.id);
    expect(await lib.daftarLokasi()).toEqual([]);
    expect(await lib.daftarAturanKategori()).toEqual([]);
    expect((await lib.statusSinkronisasi()).menunggu).toBe(0);
  });
});
