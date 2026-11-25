import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalLibrary } from "@/lib/local-library";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import type { SyncTransport } from "@/lib/sync-protocol";
import { createKelolaApi } from "@/server/kelola";
import { createSyncApi } from "@/server/sync";
import { createTestDb } from "../support/test-db";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;
const AGM = PRESET_KATEGORI.find((k) => k.kode === "AGM")!;
const ISBN = "9786024246945";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let transport: SyncTransport;

const perangkat = () =>
  createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}`, now: () => new Date(2026, 2, 14, 10, 0, 0) });

beforeEach(async () => {
  ctx = await createTestDb();
  const api = createSyncApi(ctx.db);
  transport = { push: (req) => api.push(req), pull: (kursor) => api.pull(kursor) };
});
afterEach(async () => {
  await ctx.close();
});

const buku = (lib: ReturnType<typeof perangkat>, judul = "Laut Bercerita") =>
  lib.tambahBuku({
    judul,
    isbn13: ISBN,
    kontributor: [{ nama: "Leila S. Chudori", utama: true }],
    eksemplar: { kategoriId: FIK.id },
  });

describe("Dua perangkat offline menambah Buku dengan ISBN yang sama", () => {
  it("Eksemplar perangkat kedua tidak tertinggal '——': ia bernomor dan menempel pada Buku yang sama", async () => {
    const a = perangkat();
    const b = perangkat();
    const bukuA = await buku(a);
    const bukuB = await buku(b);
    await a.sinkronkan(transport);

    const hasil = await b.sinkronkan(transport);

    expect(hasil).toMatchObject({ dikirim: 2, ditolak: 0 });
    expect(await b.daftarAntrean()).toEqual({ tertunda: [], gagal: [] });
    const koleksi = await b.daftarKoleksi();
    expect(koleksi.map((k) => k.nomorInduk).sort()).toEqual(["FIK-001/2026", "FIK-002/2026"]);
    expect(koleksi.every((k) => !k.menungguSinkron)).toBe(true);
    expect(new Set(koleksi.map((k) => k.bukuId))).toEqual(new Set([bukuA.bukuId]));
    expect(await b.detailBuku(bukuB.bukuId)).toBeNull();
    expect(await b.cariBukuByIsbn(ISBN)).toMatchObject({ bukuId: bukuA.bukuId, jumlahEksemplar: 2 });
    // Eksemplar B menunjuk Buku yang berlaku, bukan id lokal yang digantikan.
    expect(koleksi.find((k) => k.eksemplarId === bukuB.eksemplarId)?.bukuId).toBe(bukuA.bukuId);
  });

  it("perubahan yang masih menunggu atas Buku lokal yang digantikan ikut ke Buku yang berlaku", async () => {
    const a = perangkat();
    const b = perangkat();
    const bukuA = await buku(a);
    const bukuB = await buku(b);
    await b.ubahBuku(bukuB.bukuId, { penerbit: "KPG" });
    await a.sinkronkan(transport);

    await b.sinkronkan(transport);
    await a.sinkronkan(transport);

    expect(await a.detailBuku(bukuA.bukuId)).toMatchObject({ penerbit: "KPG" });
    expect((await b.daftarAntrean()).gagal).toEqual([]);
  });
});

describe("Buang perubahan yang ditolak server", () => {
  it("koreksi Kategori ke Kategori yang diarsipkan: Buang mengembalikan salinan lokal ke Kategori di server", async () => {
    const a = perangkat();
    const { eksemplarId } = await buku(a);
    await a.sinkronkan(transport);
    await createKelolaApi(ctx.db).kategori.ubah(AGM.id, { diarsipkan: true });
    await a.koreksiKategori(eksemplarId, AGM.id);
    await a.sinkronkan(transport);
    const [gagal] = (await a.daftarAntrean()).gagal;
    expect(gagal).toMatchObject({ ringkasan: "Koreksi Kategori pada Laut Bercerita" });
    expect((await a.daftarKoleksi())[0].kategori.kode).toBe("AGM"); // salinan lokal masih bergeser

    await a.buang(gagal.id);
    await a.sinkronkan(transport);

    expect(await a.daftarAntrean()).toEqual({ tertunda: [], gagal: [] });
    expect((await a.daftarKoleksi())[0].kategori.kode).toBe("FIK");
  });
});
