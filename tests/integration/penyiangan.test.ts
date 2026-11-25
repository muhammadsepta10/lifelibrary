import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { ButuhKoneksiError, createLocalLibrary, ValidasiError } from "@/lib/local-library";
import type { PenyianganTransport } from "@/lib/penyiangan-protocol";
import type { SyncTransport } from "@/lib/sync-protocol";
import { createPenyianganApi } from "@/server/penyiangan";
import { createSyncApi } from "@/server/sync";
import { createTestDb } from "../support/test-db";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let transport: SyncTransport;
let penyiangan: PenyianganTransport;

const perangkat = (tahun = 2026) =>
  createLocalLibrary({
    dbName: `lifelibrary-test-${crypto.randomUUID()}`,
    now: () => new Date(`${tahun}-03-14T03:00:00Z`),
  });

beforeEach(async () => {
  ctx = await createTestDb();
  const api = createSyncApi(ctx.db);
  transport = { push: (req) => api.push(req), pull: (kursor) => api.pull(kursor) };
  penyiangan = createPenyianganApi(ctx.db);
});
afterEach(async () => {
  await ctx.close();
});

/** Seperti fetch tanpa jaringan. */
const putus = () => Promise.reject(new TypeError("Failed to fetch"));
const transportOffline: PenyianganTransport = { siangi: putus };

describe("Perpustakaan Lokal: Penyiangan", () => {
  it("Eksemplar keluar hilang dari koleksi aktif tapi tetap di Buku Induk dengan Nomor Induknya, alasan, dan tanggal", async () => {
    const lib = perangkat();
    const { eksemplarId } = await lib.tambahBukuManual({ judul: "Laut Bercerita", pengarang: "Leila S. Chudori", kategoriId: FIK.id });
    await lib.tambahBukuManual({ judul: "Bumi Manusia", pengarang: "Pramoedya Ananta Toer", kategoriId: FIK.id });
    await lib.sinkronkan(transport);

    const hasil = await lib
      .penyiangan(penyiangan)
      .siangi(eksemplarId, { jenis: "rusak", tanggal: "2026-05-02", alasan: "Terendam banjir" });

    expect(hasil).toMatchObject({ status: "keluar", nomorInduk: "FIK-001/2026" });
    expect((await lib.daftarKoleksi()).map((k) => k.judul)).toEqual(["Bumi Manusia"]);
    const induk = await lib.bukuInduk();
    expect(induk.baris.map((b) => [b.nomorInduk, b.status])).toEqual([
      ["FIK-001/2026", "keluar"],
      ["FIK-002/2026", "aktif"],
    ]);
    expect(induk.baris[0].penyiangan).toEqual({ jenis: "rusak", tanggal: "2026-05-02", alasan: "Terendam banjir" });
  });

  it("perangkat lain melihat `keluar` setelah pull", async () => {
    const a = perangkat();
    const b = perangkat();
    const { eksemplarId } = await a.tambahBukuManual({ judul: "A", pengarang: "B C", kategoriId: FIK.id });
    await a.sinkronkan(transport);
    await b.sinkronkan(transport);
    expect(await b.daftarKoleksi()).toHaveLength(1);

    await a.penyiangan(penyiangan).siangi(eksemplarId, { jenis: "hilang", tanggal: "2026-05-02" });
    await b.sinkronkan(transport);

    expect(await b.daftarKoleksi()).toEqual([]);
    expect((await b.bukuInduk()).baris[0]).toMatchObject({ status: "keluar", penyiangan: { jenis: "hilang" } });
    expect((await b.detailBuku((await b.bukuInduk()).baris[0].bukuId))!.eksemplar[0].status).toBe("keluar");
  });

  it("offline: gagal dengan 'Butuh koneksi' dan Eksemplar tetap aktif", async () => {
    const lib = perangkat();
    const { eksemplarId } = await lib.tambahBukuManual({ judul: "A", pengarang: "B C", kategoriId: FIK.id });
    await lib.sinkronkan(transport);

    const gagal = lib.penyiangan(transportOffline).siangi(eksemplarId, { jenis: "hilang", tanggal: "2026-05-02" });

    await expect(gagal).rejects.toBeInstanceOf(ButuhKoneksiError);
    await expect(gagal).rejects.toThrow("Butuh koneksi");
    expect(await lib.daftarKoleksi()).toHaveLength(1);
    expect((await lib.statusSinkronisasi()).menunggu).toBe(0);
  });

  it("Eksemplar yang masih Menunggu Sinkron tidak bisa disiangi: sinkronkan dulu", async () => {
    const lib = perangkat();
    const { eksemplarId } = await lib.tambahBukuManual({ judul: "A", pengarang: "B C", kategoriId: FIK.id });

    const gagal = lib.penyiangan(penyiangan).siangi(eksemplarId, { jenis: "hilang", tanggal: "2026-05-02" });

    await expect(gagal).rejects.toBeInstanceOf(ValidasiError);
    expect(await lib.daftarKoleksi()).toHaveLength(1);
  });

  it("Nomor Induk berikutnya tidak memakai nomor Eksemplar yang keluar, dari sisi Perpustakaan Lokal", async () => {
    const lib = perangkat();
    const { eksemplarId } = await lib.tambahBukuManual({ judul: "A", pengarang: "B C", kategoriId: FIK.id });
    await lib.sinkronkan(transport);
    await lib.penyiangan(penyiangan).siangi(eksemplarId, { jenis: "dijual", tanggal: "2026-05-02" });

    await lib.tambahBukuManual({ judul: "D", pengarang: "E F", kategoriId: FIK.id });
    await lib.sinkronkan(transport);

    expect((await lib.daftarKoleksi()).map((k) => k.nomorInduk)).toEqual(["FIK-002/2026"]);
  });
});
