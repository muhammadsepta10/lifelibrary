import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KelolaDitolakError } from "@/lib/kelola-protocol";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { createLocalLibrary, ValidasiError } from "@/lib/local-library";
import type { SyncTransport } from "@/lib/sync-protocol";
import { createKelolaApi } from "@/server/kelola";
import { createSyncApi } from "@/server/sync";
import { createTestDb } from "../support/test-db";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;
const AGM = PRESET_KATEGORI.find((k) => k.kode === "AGM")!;

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let transport: SyncTransport;
let kelolaApi: ReturnType<typeof createKelolaApi>;

const perangkat = () => createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}` });

beforeEach(async () => {
  ctx = await createTestDb();
  const api = createSyncApi(ctx.db);
  transport = { push: (req) => api.push(req), pull: (kursor) => api.pull(kursor) };
  kelolaApi = createKelolaApi(ctx.db);
});
afterEach(async () => {
  await ctx.close();
});

describe("Perpustakaan Lokal: kelola Kategori", () => {
  it("Kategori baru langsung muncul di pilihan perangkat, bisa dipakai, dan sampai ke perangkat lain lewat pull", async () => {
    const a = perangkat();
    const b = perangkat();

    const baru = await a.kelola(kelolaApi).kategori.buat({ kode: "nvl", nama: "Novel", warna: "#336699" });

    expect((await a.daftarKategori()).find((k) => k.id === baru.id)).toMatchObject({ kode: "NVL", nama: "Novel" });
    await expect(
      a.tambahBukuManual({ judul: "Laut Bercerita", pengarang: "Leila S. Chudori", kategoriId: baru.id }),
    ).resolves.toBeTruthy();

    await b.sinkronkan(transport);
    expect((await b.daftarKategori()).find((k) => k.id === baru.id)).toMatchObject({ kode: "NVL" });
  });

  it("mengubah nama, kode, dan warna; Koleksi menampilkan Kategori yang terbaru", async () => {
    const lib = perangkat();
    await lib.tambahBukuManual({ judul: "A", pengarang: "B", kategoriId: FIK.id });

    await lib.kelola(kelolaApi).kategori.ubah(FIK.id, { kode: "NVL", nama: "Novel", warna: "#112233" });

    const [item] = await lib.daftarKoleksi();
    expect(item.kategori).toEqual({ kode: "NVL", nama: "Novel", warna: "#112233" });
  });

  it("kode yang bentrok dengan Kategori aktif ditolak dengan pesan untuk Pemilik, dan tidak mengubah apa pun", async () => {
    const lib = perangkat();

    const gagal = lib.kelola(kelolaApi).kategori.buat({ kode: "FIK", nama: "Lain", warna: "#336699" });

    await expect(gagal).rejects.toBeInstanceOf(KelolaDitolakError);
    await expect(gagal).rejects.toMatchObject({ field: "kode" });
    expect((await lib.daftarKategori()).filter((k) => k.kode === "FIK")).toHaveLength(1);
  });

  it("Kategori yang diarsipkan hilang dari pilihan (juga di perangkat lain setelah pull) tapi tetap terlihat di layar kelola", async () => {
    const a = perangkat();
    const b = perangkat();
    await b.sinkronkan(transport);

    await a.kelola(kelolaApi).kategori.arsipkan(AGM.id);
    await b.sinkronkan(transport);

    for (const lib of [a, b]) {
      expect((await lib.daftarKategori()).map((k) => k.id)).not.toContain(AGM.id);
      expect((await lib.daftarKategoriTermasukArsip()).find((k) => k.id === AGM.id)).toMatchObject({
        diarsipkan: true,
      });
    }
    await expect(
      b.tambahBukuManual({ judul: "X", pengarang: "Y", kategoriId: AGM.id }),
    ).rejects.toBeInstanceOf(ValidasiError);
  });

  it("Kategori yang diarsipkan bisa dipulihkan ke pilihan", async () => {
    const lib = perangkat();
    const kelola = lib.kelola(kelolaApi);
    await kelola.kategori.arsipkan(AGM.id);

    await kelola.kategori.pulihkan(AGM.id);

    expect((await lib.daftarKategori()).map((k) => k.id)).toContain(AGM.id);
  });

  it("Kategori yang dipakai Eksemplar tidak bisa dihapus (hanya diarsipkan); yang belum dipakai bisa dan hilang di perangkat lain", async () => {
    const a = perangkat();
    const b = perangkat();
    const kelola = a.kelola(kelolaApi);
    await a.tambahBukuManual({ judul: "A", pengarang: "B", kategoriId: FIK.id });
    await a.sinkronkan(transport);

    await expect(kelola.kategori.hapus(FIK.id)).rejects.toMatchObject({ jenis: "konflik" });
    expect((await a.daftarKategori()).map((k) => k.id)).toContain(FIK.id);

    const sementara = await kelola.kategori.buat({ kode: "XYZ", nama: "Sementara", warna: "#336699" });
    await b.sinkronkan(transport);
    expect((await b.daftarKategori()).map((k) => k.id)).toContain(sementara.id);

    await kelola.kategori.hapus(sementara.id);
    await b.sinkronkan(transport);

    expect((await a.daftarKategoriTermasukArsip()).map((k) => k.id)).not.toContain(sementara.id);
    expect((await b.daftarKategoriTermasukArsip()).map((k) => k.id)).not.toContain(sementara.id);
  });
});

describe("Perpustakaan Lokal: kelola Lokasi", () => {
  it("membuat, mengubah, dan menghapus Lokasi; perangkat lain mengikuti lewat pull", async () => {
    const a = perangkat();
    const b = perangkat();
    const kelola = a.kelola(kelolaApi);

    const rakA = await kelola.lokasi.buat({ nama: "Rak A, susun 2" });
    const rakB = await kelola.lokasi.buat({ nama: "Rak B" });
    await kelola.lokasi.ubah(rakA.id, { nama: "Rak A, susun 3" });
    await kelola.lokasi.hapus(rakB.id);

    expect(await a.daftarLokasi()).toEqual([{ id: rakA.id, nama: "Rak A, susun 3" }]);
    await b.sinkronkan(transport);
    expect(await b.daftarLokasi()).toEqual([{ id: rakA.id, nama: "Rak A, susun 3" }]);
  });

  it("nama kosong ditolak", async () => {
    await expect(perangkat().kelola(kelolaApi).lokasi.buat({ nama: " " })).rejects.toMatchObject({ field: "nama" });
  });
});

describe("Perpustakaan Lokal: daftar tersedia saat offline", () => {
  it("Kategori, Lokasi, dan Aturan Kategori yang tersalin lewat pull tetap terbaca ketika server tidak terjangkau", async () => {
    const pemilik = perangkat();
    const kelola = pemilik.kelola(kelolaApi);
    const novel = await kelola.kategori.buat({ kode: "NVL", nama: "Novel", warna: "#336699" });
    const rak = await kelola.lokasi.buat({ nama: "Rak A, susun 2" });
    const aturan = await kelola.aturanKategori.buat({ jenis: "subjek", pola: "novel", kategoriId: novel.id, prioritas: 1 });
    const ponsel = perangkat();
    await ponsel.sinkronkan(transport);

    const putus = () => Promise.reject(new TypeError("Failed to fetch"));
    await expect(ponsel.sinkronkan({ push: putus, pull: putus })).rejects.toThrow();

    expect((await ponsel.daftarKategori()).map((k) => k.kode)).toContain("NVL");
    expect(await ponsel.daftarLokasi()).toEqual([{ id: rak.id, nama: "Rak A, susun 2" }]);
    expect((await ponsel.daftarAturanKategori()).map((a) => a.id)).toEqual([aturan.id]);
    await expect(
      ponsel.tambahBukuManual({ judul: "A", pengarang: "B", kategoriId: novel.id }),
    ).resolves.toBeTruthy();
  });
});

describe("Perpustakaan Lokal: kelola Aturan Kategori", () => {
  it("membuat aturan rentang DDC dan kata kunci subjek, terurut menurut prioritas", async () => {
    const lib = perangkat();
    const kelola = lib.kelola(kelolaApi);

    const agama = await kelola.aturanKategori.buat({ jenis: "ddc", pola: "2xx", kategoriId: AGM.id, prioritas: 2 });
    const novel = await kelola.aturanKategori.buat({ jenis: "subjek", pola: "novel", kategoriId: FIK.id, prioritas: 1 });

    expect(await lib.daftarAturanKategori()).toEqual([
      { id: novel.id, jenis: "subjek", pola: "novel", kategoriId: FIK.id, prioritas: 1 },
      { id: agama.id, jenis: "ddc", pola: "2xx", kategoriId: AGM.id, prioritas: 2 },
    ]);
  });

  it("mengubah dan menghapus aturan; perangkat lain mengikuti lewat pull", async () => {
    const a = perangkat();
    const b = perangkat();
    const kelola = a.kelola(kelolaApi);
    const psikologi = await kelola.aturanKategori.buat({ jenis: "ddc", pola: "155", kategoriId: FIK.id, prioritas: 3 });
    const buangan = await kelola.aturanKategori.buat({ jenis: "subjek", pola: "x", kategoriId: FIK.id, prioritas: 4 });

    await kelola.aturanKategori.ubah(psikologi.id, { kategoriId: AGM.id, prioritas: 1 });
    await kelola.aturanKategori.hapus(buangan.id);
    await b.sinkronkan(transport);

    for (const lib of [a, b]) {
      expect(await lib.daftarAturanKategori()).toEqual([
        { id: psikologi.id, jenis: "ddc", pola: "155", kategoriId: AGM.id, prioritas: 1 },
      ]);
    }
  });

  it("pola DDC yang tidak valid ditolak", async () => {
    await expect(
      perangkat().kelola(kelolaApi).aturanKategori.buat({ jenis: "ddc", pola: "agama", kategoriId: AGM.id, prioritas: 1 }),
    ).rejects.toMatchObject({ field: "pola" });
  });
});
