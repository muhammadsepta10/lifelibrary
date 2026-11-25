import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSyncApi } from "@/server/sync";
import { createTestDb } from "../support/test-db";
import { mutasiBukuDanEksemplar } from "../support/mutasi";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let api: ReturnType<typeof createSyncApi>;

beforeEach(async () => {
  ctx = await createTestDb();
  api = createSyncApi(ctx.db);
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(async () => {
  vi.useRealTimers();
  await ctx.close();
});

const jam = (detik: number) => vi.setSystemTime(new Date(Date.UTC(2030, 10, 25, 3, 0, detik)));

describe("API Sinkronisasi: kursor pull", () => {
  it("baris yang di-commit terlambat (bercap waktu lebih awal dari baris yang sudah ditarik) tetap sampai", async () => {
    // Transaksi 1 dicap pada detik 10 tetapi baru commit setelah transaksi 2
    // (dicap detik 11) sudah ditarik perangkat. Cap waktunya diatur langsung
    // karena PGlite memproses transaksi satu per satu.
    const lambat = mutasiBukuDanEksemplar({ judul: "Commit terlambat" });
    const cepat = mutasiBukuDanEksemplar({ judul: "Commit duluan" });

    jam(11);
    await api.push({ mutasi: cepat.mutasi });
    jam(12);
    const awal = await api.pull(null);
    expect(awal.buku.map((b) => b.judul)).toEqual(["Commit duluan"]);

    jam(10); // jam transaksi 1 ketika ia dicap, sebelum kursor di atas
    await api.push({ mutasi: lambat.mutasi });
    jam(13);

    const berikutnya = await api.pull(awal.kursor);
    expect(berikutnya.buku.map((b) => b.judul)).toEqual(["Commit terlambat"]);
    expect(berikutnya.eksemplar.map((e) => e.id)).toEqual([lambat.eksemplarId]);
  });

  it("baris yang sudah diterima tidak dikirim ulang walau masih di jendela pengaman", async () => {
    const satu = mutasiBukuDanEksemplar({ judul: "Satu" });
    jam(10);
    await api.push({ mutasi: satu.mutasi });
    jam(11);
    const a = await api.pull(null);
    const b = await api.pull(a.kursor);

    expect(b.buku).toEqual([]);
    expect(b.eksemplar).toEqual([]);
    expect(b.kursor).toBe(a.kursor);
  });

  it("baris yang berubah lagi di dalam jendela pengaman dikirim ulang dengan isi terbaru", async () => {
    const satu = mutasiBukuDanEksemplar({ judul: "Satu" });
    jam(10);
    await api.push({ mutasi: satu.mutasi });
    jam(11);
    const a = await api.pull(null);

    jam(12);
    await api.push({
      mutasi: [
        {
          id: crypto.randomUUID(),
          jenis: "buku.ubah",
          bukuId: satu.bukuId,
          waktuUbah: "2030-11-25T10:00:12+07:00",
          perubahan: { judul: "Satu (revisi)" },
        },
      ],
    });
    const b = await api.pull(a.kursor);

    expect(b.buku.map((x) => x.judul)).toEqual(["Satu (revisi)"]);
  });
});
