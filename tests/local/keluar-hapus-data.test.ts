import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalLibrary, type LocalLibrary } from "@/lib/local-library";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { keluarDanHapusData, pesanKonfirmasiHapus } from "@/lib/keluar-hapus-data";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;
const ISBN_A = "9786024246945";

let dbName: string;
let lib: LocalLibrary;
beforeEach(() => {
  dbName = `lifelibrary-test-${crypto.randomUUID()}`;
  lib = createLocalLibrary({ dbName });
});

/** CacheStorage palsu: hanya yang dipakai aplikasi. */
function cachePalsu(nama: string[]) {
  const ada = new Set(nama);
  return {
    ada,
    storage: {
      keys: async () => [...ada],
      delete: async (n: string) => ada.delete(n),
    },
  };
}

describe("ringkasan sebelum menghapus data di perangkat", () => {
  it("menghitung perubahan yang belum terkirim (menunggu dan Gagal terkirim) dan draf menunggu data", async () => {
    await lib.tambahBukuManual({ judul: "A", pengarang: "P", kategoriId: FIK.id });
    await lib.tambahBukuManual({ judul: "B", pengarang: "P", kategoriId: FIK.id });
    const sesi = await lib.mulaiSesiPenerimaan({
      cariMetadata: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await (await sesi.pindai(ISBN_A).then((h) => (h.jenis === "kartu" ? h.selesai : undefined)));

    const ringkasan = await lib.ringkasanDataPerangkat();

    // Satu Buku manual = dua perubahan di outbox (tambah Buku + catat Eksemplar).
    expect(ringkasan).toEqual({ belumTerkirim: 4, drafMenunggu: 1 });
  });

  it("perangkat bersih: nol dan nol", async () => {
    expect(await lib.ringkasanDataPerangkat()).toEqual({ belumTerkirim: 0, drafMenunggu: 0 });
  });
});

describe("pesan konfirmasi", () => {
  it("menyebut jumlah perubahan yang belum terkirim", () => {
    const pesan = pesanKonfirmasiHapus({ belumTerkirim: 3, drafMenunggu: 0 });

    expect(pesan).toContain("3 perubahan belum terkirim");
    expect(pesan).toContain("hilang");
  });

  it("menyebut draf menunggu data bila ada", () => {
    expect(pesanKonfirmasiHapus({ belumTerkirim: 1, drafMenunggu: 2 })).toContain("2 draf menunggu data");
  });

  it("tidak ada yang tertunda: tetap konfirmasi, menyebut semuanya sudah terkirim", () => {
    const pesan = pesanKonfirmasiHapus({ belumTerkirim: 0, drafMenunggu: 0 });

    expect(pesan).toContain("Tidak ada perubahan yang belum terkirim");
  });
});

describe("Keluar & hapus data di perangkat ini", () => {
  it("menghapus IndexedDB (koleksi, perubahan menunggu, draf), seluruh cache, lalu keluar", async () => {
    await lib.tambahBukuManual({ judul: "A", pengarang: "P", kategoriId: FIK.id });
    const urutan: string[] = [];
    const { storage, ada } = cachePalsu(["covers", "app-pages", "serwist-precache-v2"]);
    const signOut = vi.fn(async () => void urutan.push("keluar"));

    const hasil = await keluarDanHapusData({
      library: lib,
      cacheStorage: storage,
      signOut,
      tandaiKeluarTertunda: () => urutan.push("tertunda"),
    });

    expect(hasil).toEqual({ keluar: true });
    expect(ada.size).toBe(0);
    expect(signOut).toHaveBeenCalledTimes(1);
    // Basis data di perangkat benar-benar hilang; yang dibuka lagi kosong, tanpa antrean sisa.
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain(dbName);
    const sesudah = createLocalLibrary({ dbName });
    expect(await sesudah.daftarKoleksi()).toEqual([]);
    expect(await sesudah.ringkasanDataPerangkat()).toEqual({ belumTerkirim: 0, drafMenunggu: 0 });
  });

  it("data terhapus sebelum keluar dari akun (keluar gagal tidak membuat data tersisa)", async () => {
    await lib.tambahBukuManual({ judul: "A", pengarang: "P", kategoriId: FIK.id });
    const { storage } = cachePalsu(["covers"]);
    const tertunda = vi.fn();

    const hasil = await keluarDanHapusData({
      library: lib,
      cacheStorage: storage,
      signOut: async () => {
        throw new TypeError("Failed to fetch");
      },
      tandaiKeluarTertunda: tertunda,
    });

    expect(hasil).toEqual({ keluar: false });
    expect(tertunda).toHaveBeenCalledTimes(1);
    expect(await createLocalLibrary({ dbName }).daftarKoleksi()).toEqual([]);
  });

  it("tanpa CacheStorage (browser lama) tetap menghapus data dan keluar", async () => {
    await lib.tambahBukuManual({ judul: "A", pengarang: "P", kategoriId: FIK.id });
    const signOut = vi.fn(async () => {});

    await keluarDanHapusData({ library: lib, cacheStorage: undefined, signOut, tandaiKeluarTertunda: () => {} });

    expect(signOut).toHaveBeenCalled();
    expect(await createLocalLibrary({ dbName }).daftarKoleksi()).toEqual([]);
  });
});
