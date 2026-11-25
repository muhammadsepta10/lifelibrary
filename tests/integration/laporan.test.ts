import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { createLocalLibrary } from "@/lib/local-library";
import type { SyncTransport } from "@/lib/sync-protocol";
import { createKelolaApi } from "@/server/kelola";
import { createPenyianganApi } from "@/server/penyiangan";
import { createSyncApi } from "@/server/sync";
import { createTestDb } from "../support/test-db";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;
const AGM = PRESET_KATEGORI.find((k) => k.kode === "AGM")!;

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let transport: SyncTransport;
let clock: Date;
let lib: ReturnType<typeof createLocalLibrary>;

beforeEach(async () => {
  ctx = await createTestDb();
  const api = createSyncApi(ctx.db);
  transport = { push: (req) => api.push(req), pull: (kursor) => api.pull(kursor) };
  clock = new Date("2026-03-14T03:00:00Z");
  lib = createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}`, now: () => clock });
});
afterEach(async () => {
  await ctx.close();
});

const catat = (judul: string, kategoriId: string, eksemplar: Record<string, unknown> = {}) =>
  lib.tambahBuku({ judul, kontributor: [{ nama: "Penulis Anonim", utama: true }], eksemplar: { kategoriId, ...eksemplar } });

describe("Perpustakaan Lokal: filter Lokasi", () => {
  it("menyaring menurut Lokasi dan menggabungkannya dengan Kategori", async () => {
    const lokasiA = await createKelolaApi(ctx.db).lokasi.buat({ nama: "Rak A" });
    const lokasiB = await createKelolaApi(ctx.db).lokasi.buat({ nama: "Rak B" });
    await lib.sinkronkan(transport);
    await catat("Satu", FIK.id, { lokasiId: lokasiA.id });
    await catat("Dua", AGM.id, { lokasiId: lokasiA.id });
    await catat("Tiga", FIK.id, { lokasiId: lokasiB.id });
    await catat("Empat", FIK.id);

    const judul = async (k: Parameters<typeof lib.cariKoleksi>[0]) =>
      (await lib.cariKoleksi(k)).map((i) => i.judul).sort();

    expect(await judul({ lokasiId: lokasiA.id })).toEqual(["Dua", "Satu"]);
    expect(await judul({ lokasiId: lokasiA.id, kategoriId: FIK.id })).toEqual(["Satu"]);
    expect(await judul({ lokasiId: lokasiB.id, q: "tiga" })).toEqual(["Tiga"]);
    expect(await judul({ lokasiId: lokasiB.id, q: "satu" })).toEqual([]);
  });

  it("Eksemplar keluar muncul hanya di status 'keluar', dengan filter yang sama", async () => {
    const { eksemplarId } = await catat("Satu", FIK.id);
    await catat("Dua", FIK.id);
    await lib.sinkronkan(transport);
    await lib.penyiangan(createPenyianganApi(ctx.db)).siangi(eksemplarId, { jenis: "hilang", tanggal: "2026-04-01" });

    expect((await lib.cariKoleksi()).map((i) => i.judul)).toEqual(["Dua"]);
    expect((await lib.cariKoleksi({ status: "keluar" })).map((i) => i.judul)).toEqual(["Satu"]);
    expect((await lib.cariKoleksi({ status: "keluar", q: "dua" }))).toEqual([]);
    expect(await lib.cariKoleksi({ status: "tersedia" })).toHaveLength(1);
  });
});

describe("Perpustakaan Lokal: Buku Induk", () => {
  async function isi() {
    const a = await catat("A", FIK.id, { tanggalMasuk: "2026-01-10", asal: "beli", harga: 90000 });
    const b = await catat("B", AGM.id, { tanggalMasuk: "2026-02-05", asal: "hadiah" });
    const c = await catat("C", FIK.id, { tanggalMasuk: "2026-02-20", asal: "beli", harga: 60000 });
    await lib.sinkronkan(transport);
    clock = new Date("2027-01-05T03:00:00Z");
    const d = await catat("D", FIK.id, { asal: "lainnya" });
    await lib.sinkronkan(transport);
    return { a, b, c, d };
  }

  it("memuat semua Eksemplar urut Nomor Induk (Kategori, tahun, urut), termasuk yang keluar", async () => {
    const { a } = await isi();
    await lib.penyiangan(createPenyianganApi(ctx.db)).siangi(a.eksemplarId, { jenis: "dijual", tanggal: "2026-06-01" });

    const { baris } = await lib.bukuInduk();

    expect(baris.map((b) => [b.nomorInduk, b.judul, b.status])).toEqual([
      ["AGM-001/2026", "B", "aktif"],
      ["FIK-001/2026", "A", "keluar"],
      ["FIK-002/2026", "C", "aktif"],
      ["FIK-001/2027", "D", "aktif"],
    ]);
    expect(baris[1]).toMatchObject({ tanggalMasuk: "2026-01-10", asal: "beli", harga: 90000 });
    expect(baris[3]).toMatchObject({ tanggalMasuk: null, asal: "lainnya", harga: null });
  });

  it("urutan memakai angka: FIK-010 sesudah FIK-009", async () => {
    for (let i = 0; i < 10; i++) await catat(`Buku ${i}`, FIK.id);
    await lib.sinkronkan(transport);

    const nomor = (await lib.bukuInduk()).baris.map((b) => b.nomorInduk);

    expect(nomor.slice(-2)).toEqual(["FIK-009/2026", "FIK-010/2026"]);
  });

  it("filter tahun pencatatan, dan daftar tahun yang tersedia (terbaru dulu) tidak ikut menyempit", async () => {
    await isi();

    const hasil = await lib.bukuInduk({ tahun: 2027 });

    expect(hasil.baris.map((b) => b.nomorInduk)).toEqual(["FIK-001/2027"]);
    expect(hasil.tahun).toEqual([2027, 2026]);
    expect((await lib.bukuInduk({ tahun: 2026 })).baris).toHaveLength(3);
  });

  it("Eksemplar Menunggu Sinkron tampil paling akhir tanpa Nomor Induk, mengikuti filter tahun", async () => {
    await isi();
    await catat("E", FIK.id); // belum sinkron, dicatat 2027

    const semua = (await lib.bukuInduk()).baris;
    expect(semua[semua.length - 1]).toMatchObject({ judul: "E", nomorInduk: null, menungguSinkron: true });
    expect((await lib.bukuInduk({ tahun: 2026 })).baris.some((b) => b.nomorInduk === null)).toBe(false);
    expect((await lib.bukuInduk({ tahun: 2027 })).baris.map((b) => b.judul)).toEqual(["D", "E"]);
  });
});

describe("Perpustakaan Lokal: statistik", () => {
  it("jumlah per Kategori, masuk per bulan, dan total nilai cocok dengan data", async () => {
    const a = await catat("A", FIK.id, { tanggalMasuk: "2026-01-10", harga: 90000 });
    await catat("B", AGM.id, { tanggalMasuk: "2026-01-25", harga: 40000 });
    await catat("C", FIK.id, { tanggalMasuk: "2026-03-02", harga: 60000 });
    await catat("D", FIK.id, { tanggalMasuk: "2026-03-20" }); // harga tidak diketahui
    await catat("E", AGM.id); // tanggal masuk tidak diketahui
    await lib.sinkronkan(transport);

    const s = await lib.statistik();

    expect(s.totalEksemplar).toBe(5);
    expect(s.perKategori.map((k) => [k.kode, k.jumlah])).toEqual([
      ["FIK", 3],
      ["AGM", 2],
    ]);
    expect(s.perBulan).toEqual([
      { bulan: "2026-01", jumlah: 2 },
      { bulan: "2026-02", jumlah: 0 },
      { bulan: "2026-03", jumlah: 2 },
    ]);
    expect(s.tanpaTanggalMasuk).toBe(1);
    expect(s.totalNilai).toBe(190000);
    expect(s.tanpaHarga).toBe(2);

    // Eksemplar keluar: tidak lagi dihitung di koleksi dan nilai, tapi tetap tercatat pernah masuk.
    await lib.penyiangan(createPenyianganApi(ctx.db)).siangi(a.eksemplarId, { jenis: "hilang", tanggal: "2026-04-01" });
    const sesudah = await lib.statistik();
    expect(sesudah.totalEksemplar).toBe(4);
    expect(sesudah.perKategori.map((k) => [k.kode, k.jumlah])).toEqual([
      ["AGM", 2],
      ["FIK", 2],
    ]);
    expect(sesudah.totalNilai).toBe(100000);
    expect(sesudah.perBulan[0]).toEqual({ bulan: "2026-01", jumlah: 2 });
  });

  it("mengikuti koreksi Kategori", async () => {
    const a = await catat("A", FIK.id);
    await lib.sinkronkan(transport);

    await lib.koreksiKategori(a.eksemplarId, AGM.id);

    expect((await lib.statistik()).perKategori.map((k) => [k.kode, k.jumlah])).toEqual([["AGM", 1]]);
  });

  it("koleksi kosong: semua nol", async () => {
    expect(await lib.statistik()).toEqual({
      totalEksemplar: 0,
      perKategori: [],
      perBulan: [],
      tanpaTanggalMasuk: 0,
      totalNilai: 0,
      tanpaHarga: 0,
    });
  });

  it("bulan lintas tahun tidak melewatkan bulan", async () => {
    await catat("A", FIK.id, { tanggalMasuk: "2025-11-30" });
    await catat("B", FIK.id, { tanggalMasuk: "2026-01-02" });

    expect((await lib.statistik()).perBulan).toEqual([
      { bulan: "2025-11", jumlah: 1 },
      { bulan: "2025-12", jumlah: 0 },
      { bulan: "2026-01", jumlah: 1 },
    ]);
  });
});
