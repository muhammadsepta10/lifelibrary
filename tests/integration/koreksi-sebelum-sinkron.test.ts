import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalLibrary } from "@/lib/local-library";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import type { Mutasi, SyncTransport } from "@/lib/sync-protocol";
import { createSyncApi } from "@/server/sync";
import { createTestDb } from "../support/test-db";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;
const AGM = PRESET_KATEGORI.find((k) => k.kode === "AGM")!;

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let transport: SyncTransport;
let terkirim: Mutasi[];

beforeEach(async () => {
  ctx = await createTestDb();
  const api = createSyncApi(ctx.db);
  terkirim = [];
  transport = {
    push: (req) => {
      terkirim.push(...req.mutasi);
      return api.push(req);
    },
    pull: (kursor) => api.pull(kursor),
  };
});
afterEach(async () => {
  await ctx.close();
});

const perangkat = () =>
  createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}`, now: () => new Date(2026, 2, 14, 10, 0, 0) });

describe("Koreksi Kategori sebelum Eksemplar pertama kali tersinkron", () => {
  it("Nomor Induk memakai kode Kategori hasil koreksi, bukan kode awal", async () => {
    const lib = perangkat();
    const { eksemplarId } = await lib.tambahBukuManual({ judul: "Sirah Nabawiyah", pengarang: "Mubarakfuri", kategoriId: FIK.id });
    await lib.koreksiKategori(eksemplarId, AGM.id);

    await lib.sinkronkan(transport);

    const e = (await lib.daftarKoleksi()).find((k) => k.eksemplarId === eksemplarId)!;
    expect(e).toMatchObject({ nomorInduk: "AGM-001/2026", kategori: { kode: "AGM" }, menungguSinkron: false });
    expect((await lib.antreanCetak()).map((i) => i.eksemplarId)).toEqual([eksemplarId]);
  });

  it("pencatatan yang dikirim sudah membawa Kategori hasil koreksi", async () => {
    const lib = perangkat();
    const { eksemplarId } = await lib.tambahBukuManual({ judul: "Sirah Nabawiyah", pengarang: "Mubarakfuri", kategoriId: FIK.id });
    await lib.koreksiKategori(eksemplarId, AGM.id);

    await lib.sinkronkan(transport);

    const catat = terkirim.find((m) => m.jenis === "eksemplar.catat");
    expect(catat).toMatchObject({ eksemplar: { id: eksemplarId, kategoriId: AGM.id } });
  });

  it("koreksi sesudah tersinkron tetap dikirim sebagai koreksi dan Nomor Induk tidak berubah", async () => {
    const lib = perangkat();
    const { eksemplarId } = await lib.tambahBukuManual({ judul: "Sirah Nabawiyah", pengarang: "Mubarakfuri", kategoriId: FIK.id });
    await lib.sinkronkan(transport);
    terkirim.length = 0;

    await lib.koreksiKategori(eksemplarId, AGM.id);
    await lib.sinkronkan(transport);

    expect(terkirim.map((m) => m.jenis)).toEqual(["eksemplar.koreksiKategori"]);
    const e = (await lib.daftarKoleksi()).find((k) => k.eksemplarId === eksemplarId)!;
    expect(e).toMatchObject({ nomorInduk: "FIK-001/2026", kategori: { kode: "AGM" } });
  });
});
