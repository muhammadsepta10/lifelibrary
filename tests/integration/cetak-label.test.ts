import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { createLocalLibrary } from "@/lib/local-library";
import type { SyncTransport } from "@/lib/sync-protocol";
import { createKelolaApi } from "@/server/kelola";
import { createSyncApi } from "@/server/sync";
import { createTestDb } from "../support/test-db";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;
const AGM = PRESET_KATEGORI.find((k) => k.kode === "AGM")!;

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let transport: SyncTransport;
let kelolaServer: ReturnType<typeof createKelolaApi>;

const perangkat = () => createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}` });

beforeEach(async () => {
  ctx = await createTestDb();
  const api = createSyncApi(ctx.db);
  kelolaServer = createKelolaApi(ctx.db);
  transport = { push: (req) => api.push(req), pull: (kursor) => api.pull(kursor) };
});
afterEach(async () => {
  await ctx.close();
});

describe("Cetak Label lintas perangkat", () => {
  it("Eksemplar baru masuk antrean di perangkat lain, ditandai tercetak di A keluar dari antrean B, koreksi Kategori memasukkannya lagi", async () => {
    const a = perangkat();
    const b = perangkat();
    const { eksemplarId } = await a.tambahBukuManual({
      judul: "Sirah Nabawiyah",
      pengarang: "Safiyyurrahman Mubarakfuri",
      kategoriId: FIK.id,
    });
    await a.sinkronkan(transport);
    await b.sinkronkan(transport);
    expect(await b.antreanCetak()).toMatchObject([{ eksemplarId, nomorInduk: "FIK-001/2026", bisaDicetak: true }]);

    await a.tandaiTercetak([eksemplarId]);
    await a.sinkronkan(transport);
    await b.sinkronkan(transport);
    expect(await a.jumlahAntreanCetak()).toEqual({ total: 0, siapDicetak: 0, menungguNomorInduk: 0 });
    expect(await b.antreanCetak()).toEqual([]);

    await a.koreksiKategori(eksemplarId, AGM.id);
    await a.sinkronkan(transport);
    await b.sinkronkan(transport);
    expect((await b.antreanCetak()).map((i) => i.nomorPanggil.teks)).toEqual(["AGM / MUB / s"]);
  });

  it("mengubah judul di satu perangkat memasukkan Eksemplar ke antrean di perangkat lain; Template Label ikut tersalin", async () => {
    const a = perangkat();
    const b = perangkat();
    const { bukuId, eksemplarId } = await a.tambahBukuManual({ judul: "Laut Bercerita", pengarang: "Leila S. Chudori", kategoriId: FIK.id });
    await a.sinkronkan(transport);
    await a.tandaiTercetak([eksemplarId]);
    await a.sinkronkan(transport);
    await b.sinkronkan(transport);
    expect(await b.antreanCetak()).toEqual([]);

    await a.ubahBuku(bukuId, { judul: "Bumi Manusia" });
    await a.kelola(kelolaServer).templateLabel.simpan({ kertas: "F4", w: 70, h: 30, mt: 8, ml: 7, gx: 1, gy: 2 });
    await a.sinkronkan(transport);
    await b.sinkronkan(transport);

    expect((await b.antreanCetak()).map((i) => i.nomorPanggil.teks)).toEqual(["FIK / CHU / b"]);
    expect(await b.templateLabel()).toMatchObject({ kertas: "F4", w: 70, perLembar: 18 });
  });
});
