import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalLibrary } from "@/lib/local-library";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import type { SyncTransport } from "@/lib/sync-protocol";
import { createKelolaApi } from "@/server/kelola";
import { createSyncApi } from "@/server/sync";
import { createTestDb } from "../support/test-db";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;
const AGM = PRESET_KATEGORI.find((k) => k.kode === "AGM")!;

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let transport: SyncTransport;
let kelolaServer: ReturnType<typeof createKelolaApi>;

const perangkat = () =>
  createLocalLibrary({
    dbName: `lifelibrary-test-${crypto.randomUUID()}`,
    now: () => new Date(2026, 2, 14, 10, 0, 0),
  });

beforeEach(async () => {
  ctx = await createTestDb();
  const api = createSyncApi(ctx.db);
  kelolaServer = createKelolaApi(ctx.db);
  transport = { push: (req) => api.push(req), pull: (kursor) => api.pull(kursor) };
});
afterEach(async () => {
  await ctx.close();
});

const lengkap = {
  judul: "Laut Bercerita",
  penerbit: "KPG",
  kota: "Jakarta",
  tahun: 2017,
  edisi: "Cetakan ke-3",
  seri: "Seri Novel",
  jilid: "1",
  bahasa: "Indonesia",
  halaman: 379,
  sinopsis: "Tentang aktivis.",
  subjek: ["Fiksi", "Aktivis"],
  kelasDdc: "899.221",
  isbn13: "9786024246945",
  kontributor: [
    { nama: "Leila S. Chudori", peran: "pengarang" as const, utama: true },
    { nama: "Max Lane", peran: "penerjemah" as const },
  ],
};

describe("Data Buku lengkap lintas perangkat", () => {
  it("semua field Buku dan Eksemplar sampai utuh ke perangkat lain", async () => {
    const a = perangkat();
    const b = perangkat();
    const rak = await kelolaServer.lokasi.buat({ nama: "Rak A, susun 2" });
    await a.sinkronkan(transport); // salin Lokasi ke A
    const { bukuId } = await a.tambahBuku({
      ...lengkap,
      eksemplar: { kategoriId: FIK.id, tanggalMasuk: "2026-03-01", asal: "beli", harga: 95000, kondisi: "baik", lokasiId: rak.id },
    });

    await a.sinkronkan(transport);
    await b.sinkronkan(transport);

    const detail = (await b.detailBuku(bukuId))!;
    expect(detail).toMatchObject({
      judul: "Laut Bercerita",
      kota: "Jakarta",
      edisi: "Cetakan ke-3",
      jilid: "1",
      halaman: 379,
      subjek: ["Fiksi", "Aktivis"],
      kelasDdc: "899.221",
      isbn13: "9786024246945",
    });
    expect(detail.kontributor.map((k) => [k.nama, k.peran, k.utama])).toEqual([
      ["Leila S. Chudori", "pengarang", true],
      ["Max Lane", "penerjemah", false],
    ]);
    expect(detail.eksemplar[0]).toMatchObject({
      nomorInduk: "FIK-001/2026",
      tanggalMasuk: "2026-03-01",
      asal: "beli",
      harga: 95000,
      kondisi: "baik",
      lokasi: { nama: "Rak A, susun 2" },
      nomorPanggil: { teks: "FIK / CHU / l" },
      menungguSinkron: false,
    });
  });

  it("Kontributor bernama sama (beda penulisan) dari dua perangkat menjadi satu Kontributor di keduanya", async () => {
    const a = perangkat();
    const b = perangkat();
    const bukuA = await a.tambahBuku({ judul: "Laut Bercerita", kontributor: [{ nama: "Leila S. Chudori", utama: true }], eksemplar: { kategoriId: FIK.id } });
    const bukuB = await b.tambahBuku({ judul: "Pulang", kontributor: [{ nama: "leila s chudori", utama: true }], eksemplar: { kategoriId: FIK.id } });
    // Di perangkat masing-masing, id Kontributornya belum sama.
    expect((await a.detailBuku(bukuA.bukuId))!.kontributor[0].id).not.toBe((await b.detailBuku(bukuB.bukuId))!.kontributor[0].id);

    await a.sinkronkan(transport);
    await b.sinkronkan(transport);
    await a.sinkronkan(transport);

    for (const lib of [a, b]) {
      const ka = (await lib.detailBuku(bukuA.bukuId))!.kontributor[0];
      const kb = (await lib.detailBuku(bukuB.bukuId))!.kontributor[0];
      expect(kb.id).toBe(ka.id);
      expect(kb.nama).toBe(ka.nama);
    }
  });
});

describe("Edit saat offline lalu online", () => {
  it("edit Buku dan Eksemplar tersimpan lokal, terkirim saat online, dan terlihat di perangkat lain", async () => {
    const a = perangkat();
    const b = perangkat();
    const rak = await kelolaServer.lokasi.buat({ nama: "Rak B" });
    const { bukuId, eksemplarId } = await a.tambahBuku({ ...lengkap, eksemplar: { kategoriId: FIK.id } });
    await a.sinkronkan(transport);
    await b.sinkronkan(transport);

    // A offline: edit Buku, Eksemplar, dan tambah Eksemplar kedua.
    await a.ubahBuku(bukuId, { penerbit: "Gramedia", tahun: 2018 });
    await a.ubahEksemplar(eksemplarId, { lokasiId: rak.id, harga: 80000 });
    const { eksemplarId: kedua } = await a.catatEksemplar({ bukuId, kategoriId: FIK.id, asal: "hadiah" });
    expect((await a.statusSinkronisasi()).menunggu).toBe(3);
    expect(await b.detailBuku(bukuId)).toMatchObject({ penerbit: "KPG", tahun: 2017 });

    await a.sinkronkan(transport);
    await b.sinkronkan(transport);

    expect((await a.statusSinkronisasi()).menunggu).toBe(0);
    const detail = (await b.detailBuku(bukuId))!;
    expect(detail).toMatchObject({ penerbit: "Gramedia", tahun: 2018 });
    expect(detail.eksemplar.find((e) => e.id === eksemplarId)).toMatchObject({ lokasi: { nama: "Rak B" }, harga: 80000 });
    expect(detail.eksemplar.find((e) => e.id === kedua)).toMatchObject({ nomorInduk: "FIK-002/2026", asal: "hadiah" });
  });

  it("perangkat lain bisa menambah Eksemplar ke Buku yang dibuat perangkat pertama", async () => {
    const a = perangkat();
    const b = perangkat();
    const { bukuId } = await a.tambahBukuManual({ judul: "Bumi Manusia", pengarang: "Pramoedya Ananta Toer", kategoriId: FIK.id });
    await a.sinkronkan(transport);
    await b.sinkronkan(transport);

    await b.catatEksemplar({ bukuId, kategoriId: FIK.id, kondisi: "baru" });
    await b.sinkronkan(transport);
    await a.sinkronkan(transport);

    const detail = (await a.detailBuku(bukuId))!;
    expect(detail.eksemplar.map((e) => e.nomorInduk).sort()).toEqual(["FIK-001/2026", "FIK-002/2026"]);
  });

  it("Eksemplar ke Lokasi yang dihapus saat perangkat offline ditolak server dan tercatat sebagai perubahan ditolak", async () => {
    const a = perangkat();
    const rak = await kelolaServer.lokasi.buat({ nama: "Rak C" });
    const { eksemplarId } = await a.tambahBukuManual({ judul: "A", pengarang: "B", kategoriId: FIK.id });
    await a.sinkronkan(transport);
    await a.ubahEksemplar(eksemplarId, { lokasiId: rak.id });

    await kelolaServer.lokasi.hapus(rak.id);
    const hasil = await a.sinkronkan(transport);

    expect(hasil.ditolak).toBe(1);
    expect(await a.statusSinkronisasi()).toEqual({ menunggu: 0, ditolak: 1 });
  });
});

describe("Koreksi Kategori lintas perangkat", () => {
  it("Nomor Panggil berubah di kedua perangkat, Nomor Induk tetap, perlu cetak ikut sampai", async () => {
    const a = perangkat();
    const b = perangkat();
    const { bukuId, eksemplarId } = await a.tambahBukuManual({ judul: "Sirah Nabawiyah", pengarang: "Safiyyurrahman Mubarakfuri", kategoriId: FIK.id });
    await a.sinkronkan(transport);
    await b.sinkronkan(transport);
    const sebelum = (await a.detailBuku(bukuId))!.eksemplar[0];
    expect(sebelum).toMatchObject({ nomorInduk: "FIK-001/2026", nomorPanggil: { teks: "FIK / MUB / s" } });

    await a.koreksiKategori(eksemplarId, AGM.id);
    // Langsung berubah di perangkat A, sebelum sinkron.
    expect((await a.detailBuku(bukuId))!.eksemplar[0]).toMatchObject({ nomorInduk: "FIK-001/2026", nomorPanggil: { teks: "AGM / MUB / s" }, perluCetak: true });
    await a.sinkronkan(transport);
    await b.sinkronkan(transport);

    for (const lib of [a, b]) {
      expect((await lib.detailBuku(bukuId))!.eksemplar[0]).toMatchObject({
        nomorInduk: "FIK-001/2026",
        kategori: { kode: "AGM" },
        nomorPanggil: { teks: "AGM / MUB / s" },
        perluCetak: true,
      });
    }
  });
});
