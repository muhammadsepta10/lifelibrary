import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalLibrary } from "@/lib/local-library";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import type { SyncTransport } from "@/lib/sync-protocol";
import { createSyncApi } from "@/server/sync";
import { createTestDb } from "../support/test-db";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let transport: SyncTransport;

const perangkat = (now?: () => Date) =>
  createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}`, now });

beforeEach(async () => {
  ctx = await createTestDb();
  const api = createSyncApi(ctx.db);
  transport = {
    push: (req) => api.push(req),
    pull: (kursor) => api.pull(kursor),
  };
});
afterEach(async () => {
  vi.useRealTimers();
  await ctx.close();
});

describe("Walking skeleton: Perpustakaan Lokal + API Sinkronisasi", () => {
  it("setelah Sinkronisasi Eksemplar mendapat Nomor Induk dari server dan tidak lagi Menunggu Sinkron", async () => {
    const lib = perangkat(() => new Date(2026, 2, 14, 10, 0, 0));
    await lib.tambahBukuManual({ judul: "Laut Bercerita", pengarang: "Leila S. Chudori", kategoriId: FIK.id });

    await lib.sinkronkan(transport);

    const [item] = await lib.daftarKoleksi();
    expect(item).toMatchObject({
      nomorInduk: "FIK-001/2026",
      nomorIndukTampil: "FIK-001/2026",
      menungguSinkron: false,
    });
    expect((await lib.statusSinkronisasi()).menunggu).toBe(0);
  });

  it("tahun Nomor Induk diambil dari waktu dicatat di perangkat, walau tersinkron tahun berikutnya", async () => {
    const lib = perangkat(() => new Date(2026, 11, 31, 23, 30, 0));
    await lib.tambahBukuManual({ judul: "A", pengarang: "B", kategoriId: FIK.id });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2027, 0, 2, 9, 0, 0));
    await lib.sinkronkan(transport);

    const [item] = await lib.daftarKoleksi();
    expect(item.nomorInduk).toBe("FIK-001/2026");
  });

  it("dua perangkat yang sinkron bersamaan mendapat nomor berurutan tanpa bentrok", async () => {
    const a = perangkat(() => new Date(2026, 2, 14, 10, 0, 0));
    const b = perangkat(() => new Date(2026, 2, 14, 10, 0, 1));
    await a.tambahBukuManual({ judul: "Dari A", pengarang: "P", kategoriId: FIK.id });
    await b.tambahBukuManual({ judul: "Dari B", pengarang: "Q", kategoriId: FIK.id });

    await Promise.all([a.sinkronkan(transport), b.sinkronkan(transport)]);

    const nomor = [...(await a.daftarKoleksi()), ...(await b.daftarKoleksi())]
      .filter((k) => k.nomorInduk)
      .map((k) => k.nomorInduk);
    // Setiap perangkat melihat Eksemplar sendiri dan (lewat pull) milik perangkat lain.
    expect(new Set(nomor)).toEqual(new Set(["FIK-001/2026", "FIK-002/2026"]));
  });

  it("perangkat lain menerima Buku dan Eksemplar lewat pull", async () => {
    const a = perangkat();
    const b = perangkat();
    await a.tambahBukuManual({ judul: "Bumi Manusia", pengarang: "Pramoedya Ananta Toer", kategoriId: FIK.id });
    await a.sinkronkan(transport);

    await b.sinkronkan(transport);

    expect(await b.daftarKoleksi()).toMatchObject([
      { judul: "Bumi Manusia", pengarang: "Pramoedya Ananta Toer", menungguSinkron: false, nomorInduk: "FIK-001/2026" },
    ]);
  });

  it("Sinkronisasi diulang tidak menggandakan Eksemplar maupun nomor", async () => {
    const lib = perangkat();
    await lib.tambahBukuManual({ judul: "A", pengarang: "B", kategoriId: FIK.id });

    await lib.sinkronkan(transport);
    await lib.sinkronkan(transport);

    const koleksi = await lib.daftarKoleksi();
    expect(koleksi).toHaveLength(1);
    expect(koleksi[0].nomorInduk).toBe("FIK-001/2026");
  });

  it("respons hilang di jalan: perubahan yang menunggu diulang kirim, server tidak menggandakan data", async () => {
    const lib = perangkat();
    await lib.tambahBukuManual({ judul: "A", pengarang: "B", kategoriId: FIK.id });
    const putus: SyncTransport = {
      pull: transport.pull,
      push: async (req) => {
        await transport.push(req); // server memproses, tapi klien tidak menerima balasan
        throw new Error("jaringan putus");
      },
    };

    await expect(lib.sinkronkan(putus)).rejects.toThrow("jaringan putus");
    expect((await lib.daftarKoleksi())[0].menungguSinkron).toBe(true);
    expect((await lib.statusSinkronisasi()).menunggu).toBeGreaterThan(0);

    await lib.sinkronkan(transport);

    const [item] = await lib.daftarKoleksi();
    expect(item).toMatchObject({ nomorInduk: "FIK-001/2026", menungguSinkron: false });
    expect((await transport.pull(null)).eksemplar).toHaveLength(1);
  });
});
