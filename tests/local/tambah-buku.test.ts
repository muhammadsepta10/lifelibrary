import { beforeEach, describe, expect, it } from "vitest";
import { createLocalLibrary, ValidasiError } from "@/lib/local-library";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;

let lib: ReturnType<typeof createLocalLibrary>;

beforeEach(() => {
  lib = createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}` });
});

describe("Perpustakaan Lokal: tambah Buku manual", () => {
  it("menyimpan ditolak kalau Kategori kosong, dan tidak ada yang tersimpan", async () => {
    const gagal = lib.tambahBukuManual({ judul: "Laut Bercerita", pengarang: "Leila S. Chudori", kategoriId: "" });

    await expect(gagal).rejects.toBeInstanceOf(ValidasiError);
    await expect(gagal).rejects.toMatchObject({ field: "kategoriId" });
    expect(await lib.daftarKoleksi()).toEqual([]);
    expect((await lib.statusSinkronisasi()).menunggu).toBe(0);
  });

  it("menolak Kategori yang tidak ada di perangkat", async () => {
    await expect(
      lib.tambahBukuManual({ judul: "X", pengarang: "Y", kategoriId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ field: "kategoriId" });
  });

  it("menolak judul atau pengarang kosong", async () => {
    await expect(
      lib.tambahBukuManual({ judul: "  ", pengarang: "Y", kategoriId: FIK.id }),
    ).rejects.toMatchObject({ field: "judul" });
    await expect(
      lib.tambahBukuManual({ judul: "X", pengarang: "", kategoriId: FIK.id }),
    ).rejects.toMatchObject({ field: "pengarang" });
  });

  it("Eksemplar baru langsung tampil di Koleksi: Menunggu Sinkron, Nomor Induk '——'", async () => {
    await lib.tambahBukuManual({ judul: "Laut Bercerita", pengarang: "Leila S. Chudori", kategoriId: FIK.id });

    const koleksi = await lib.daftarKoleksi();

    expect(koleksi).toHaveLength(1);
    expect(koleksi[0]).toMatchObject({
      judul: "Laut Bercerita",
      pengarang: "Leila S. Chudori",
      kategori: { kode: "FIK", nama: "Fiksi", warna: "#E76F51" },
      nomorInduk: null,
      nomorIndukTampil: "——",
      menungguSinkron: true,
    });
  });

  it("id Buku dan Eksemplar dibuat di klien (UUID), tanpa menghubungi server", async () => {
    const { bukuId, eksemplarId } = await lib.tambahBukuManual({
      judul: "Bumi Manusia",
      pengarang: "Pramoedya Ananta Toer",
      kategoriId: FIK.id,
    });

    expect(bukuId).toMatch(UUID);
    expect(eksemplarId).toMatch(UUID);
    expect(bukuId).not.toBe(eksemplarId);
    const koleksi = await lib.daftarKoleksi();
    expect(koleksi[0]).toMatchObject({ bukuId, eksemplarId });
  });

  it("perintah offline tersimpan lokal dan baru dikirim (Buku lalu Eksemplarnya) saat Sinkronisasi", async () => {
    await lib.tambahBukuManual({ judul: "A", pengarang: "B", kategoriId: FIK.id });
    await lib.tambahBukuManual({ judul: "C", pengarang: "D", kategoriId: FIK.id });
    expect(await lib.daftarKoleksi()).toHaveLength(2);
    const terkirim: string[] = [];

    await lib.sinkronkan({
      push: async (req) => {
        terkirim.push(...req.mutasi.map((m) => m.jenis));
        return { hasil: req.mutasi.map((m) => ({ id: m.id, status: "diterima" as const })) };
      },
      pull: async () => ({ kursor: null, kategori: [], lokasi: [], aturanKategori: [], templateLabel: null, buku: [], eksemplar: [] }),
    });

    expect(terkirim).toEqual(["buku.tambah", "eksemplar.catat", "buku.tambah", "eksemplar.catat"]);
  });

  it("menambah Eksemplar kedua untuk Buku yang sama, juga wajib berkategori", async () => {
    const { bukuId } = await lib.tambahBukuManual({ judul: "A", pengarang: "B", kategoriId: FIK.id });

    await expect(lib.catatEksemplar({ bukuId, kategoriId: "" })).rejects.toMatchObject({ field: "kategoriId" });
    await lib.catatEksemplar({ bukuId, kategoriId: FIK.id });

    const koleksi = await lib.daftarKoleksi();
    expect(koleksi).toHaveLength(2);
    expect(new Set(koleksi.map((k) => k.bukuId)).size).toBe(1);
  });

  it("daftar Kategori preset tersedia di perangkat tanpa koneksi", async () => {
    const kategori = await lib.daftarKategori();
    expect(kategori).toHaveLength(12);
    expect(kategori.map((k) => k.kode)).toContain("FIK");
  });
});
