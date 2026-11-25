import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { createLocalLibrary } from "@/lib/local-library";
import type { SyncTransport } from "@/lib/sync-protocol";
import { createSyncApi } from "@/server/sync";
import { createTestDb } from "../support/test-db";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let transport: SyncTransport;

function perangkat(jam = new Date(2026, 10, 25, 9, 0, 0)) {
  const waktu = { sekarang: jam };
  const lib = createLocalLibrary({
    dbName: `lifelibrary-test-${crypto.randomUUID()}`,
    now: () => waktu.sekarang,
  });
  return { lib, waktu };
}

beforeEach(async () => {
  ctx = await createTestDb();
  const api = createSyncApi(ctx.db);
  transport = { push: (req) => api.push(req), pull: (kursor) => api.pull(kursor) };
});
afterEach(async () => {
  await ctx.close();
});

/** Fetch tanpa jaringan. */
const putus: SyncTransport = {
  push: () => Promise.reject(new TypeError("Failed to fetch")),
  pull: () => Promise.reject(new TypeError("Failed to fetch")),
};

const koleksi1 = async (lib: ReturnType<typeof perangkat>["lib"]) => (await lib.daftarKoleksi())[0];

describe("Peminjaman offline lalu tersinkron", () => {
  it("meminjamkan dan mengembalikan tanpa jaringan, lalu tersinkron ke perangkat lain dengan Nomor Induk dari server", async () => {
    const a = perangkat();
    const b = perangkat();
    const { eksemplarId } = await a.lib.tambahBuku({
      judul: "Laut Bercerita",
      kontributor: [{ nama: "Leila S. Chudori", utama: true }],
      eksemplar: { kategoriId: FIK.id },
    });

    // Offline: buku baru (belum bernomor) dipinjamkan, lalu dikembalikan.
    await expect(a.lib.sinkronkan(putus)).rejects.toThrow();
    const { peminjamanId } = await a.lib.pinjamkan({
      eksemplarId,
      peminjam: { nama: "Rina", kontak: "081234567890" },
      jatuhTempo: "2026-12-09",
    });
    expect((await koleksi1(a.lib)).dipinjam).toBe(true);
    expect((await a.lib.statusSinkronisasi()).menunggu).toBe(3); // buku, eksemplar, pinjam
    await a.lib.kembalikan(peminjamanId);
    expect((await a.lib.statusSinkronisasi()).menunggu).toBe(4);

    // Online lagi: semuanya terkirim berurutan.
    const hasil = await a.lib.sinkronkan(transport);
    expect(hasil).toMatchObject({ dikirim: 4, ditolak: 0 });
    expect((await koleksi1(a.lib)).nomorInduk).toBe("FIK-001/2026");
    expect((await koleksi1(a.lib)).dipinjam).toBe(false);

    await b.lib.sinkronkan(transport);
    const { riwayat, aktif } = await b.lib.daftarPeminjaman();
    expect(aktif).toEqual([]);
    expect(riwayat).toMatchObject([{ judul: "Laut Bercerita", nomorInduk: "FIK-001/2026", peminjam: { nama: "Rina" } }]);
  });

  it("pinjaman aktif yang dibuat offline terlihat di perangkat lain dan membuat Eksemplar tidak tersedia di sana", async () => {
    const a = perangkat();
    const b = perangkat();
    const { eksemplarId } = await a.lib.tambahBuku({
      judul: "Laut Bercerita",
      kontributor: [{ nama: "Leila S. Chudori", utama: true }],
      eksemplar: { kategoriId: FIK.id },
    });
    await a.lib.sinkronkan(transport);
    await b.lib.sinkronkan(transport);

    await a.lib.pinjamkan({ eksemplarId, peminjam: { nama: "Rina" }, jatuhTempo: "2026-12-09" });
    await a.lib.sinkronkan(transport);
    await b.lib.sinkronkan(transport);

    expect((await koleksi1(b.lib)).dipinjam).toBe(true);
    await expect(
      b.lib.pinjamkan({ eksemplarId, peminjam: { nama: "Budi" }, jatuhTempo: "2026-12-09" }),
    ).rejects.toMatchObject({ pesan: expect.stringContaining("sedang dipinjam oleh Rina") });
  });

  it("dua perangkat offline meminjamkan Eksemplar yang sama: yang kedua ditolak server, Gagal terkirim, dan salinannya disamakan", async () => {
    const a = perangkat();
    const b = perangkat();
    const { eksemplarId } = await a.lib.tambahBuku({
      judul: "Laut Bercerita",
      kontributor: [{ nama: "Leila S. Chudori", utama: true }],
      eksemplar: { kategoriId: FIK.id },
    });
    await a.lib.sinkronkan(transport);
    await b.lib.sinkronkan(transport);

    await a.lib.pinjamkan({ eksemplarId, peminjam: { nama: "Rina" }, jatuhTempo: "2026-12-09" });
    await b.lib.pinjamkan({ eksemplarId, peminjam: { nama: "Budi" }, jatuhTempo: "2026-12-10" });

    await a.lib.sinkronkan(transport);
    const hasilB = await b.lib.sinkronkan(transport);

    expect(hasilB).toMatchObject({ dikirim: 0, ditolak: 1 });
    const antrean = await b.lib.daftarAntrean();
    expect(antrean.gagal).toMatchObject([
      { ringkasan: expect.stringContaining("Pinjamkan Laut Bercerita ke Budi"), alasan: expect.stringContaining("sedang dipinjam oleh Rina") },
    ]);
    // B kini melihat kenyataan di server: hanya pinjaman Rina yang aktif.
    const { aktif } = await b.lib.daftarPeminjaman();
    expect(aktif.map((p) => p.peminjam.nama)).toEqual(["Rina"]);
  });

  it("perpanjangan jatuh tempo dari dua perangkat: yang terbaru menang dan perangkat yang kalah diberi tahu", async () => {
    const a = perangkat(new Date(2026, 10, 26, 10, 0, 0));
    const b = perangkat(new Date(2026, 10, 26, 11, 0, 0));
    const { eksemplarId } = await a.lib.tambahBuku({
      judul: "Laut Bercerita",
      kontributor: [{ nama: "Leila S. Chudori", utama: true }],
      eksemplar: { kategoriId: FIK.id },
    });
    const { peminjamanId } = await a.lib.pinjamkan({
      eksemplarId,
      peminjam: { nama: "Rina" },
      tanggalPinjam: "2026-11-25",
      jatuhTempo: "2026-12-09",
    });
    await a.lib.sinkronkan(transport);
    await b.lib.sinkronkan(transport);

    await b.lib.ubahJatuhTempo(peminjamanId, "2026-12-30"); // 11:00, lebih baru
    await a.lib.ubahJatuhTempo(peminjamanId, "2026-12-16"); // 10:00, lebih lama
    await b.lib.sinkronkan(transport);
    const hasilA = await a.lib.sinkronkan(transport);

    expect(hasilA.ditimpa).toMatchObject([{ field: "jatuhTempo", label: "Jatuh tempo", judul: "Laut Bercerita" }]);
    expect((await a.lib.daftarPeminjaman()).aktif[0].jatuhTempo).toBe("2026-12-30");
    expect((await b.lib.daftarPeminjaman()).aktif[0].jatuhTempo).toBe("2026-12-30");
  });

  it("daftar terlambat perangkat lain dihitung dari tanggal hari ini di perangkat itu", async () => {
    const a = perangkat();
    const b = perangkat(new Date(2026, 11, 20, 8, 0, 0));
    const { eksemplarId } = await a.lib.tambahBuku({
      judul: "Laut Bercerita",
      kontributor: [{ nama: "Leila S. Chudori", utama: true }],
      eksemplar: { kategoriId: FIK.id },
    });
    await a.lib.pinjamkan({ eksemplarId, peminjam: { nama: "Rina" }, jatuhTempo: "2026-12-09" });
    await a.lib.sinkronkan(transport);
    await b.lib.sinkronkan(transport);

    expect(await a.lib.jumlahTerlambat()).toBe(0);
    expect(await b.lib.jumlahTerlambat()).toBe(1);
    expect((await b.lib.daftarPeminjaman()).terlambat[0].hariTerlambat).toBe(11);
  });

  it("memindai Label Barcode di perangkat lain membuka Eksemplar yang sudah bernomor", async () => {
    const a = perangkat();
    const b = perangkat();
    const { eksemplarId } = await a.lib.tambahBuku({
      judul: "Laut Bercerita",
      kontributor: [{ nama: "Leila S. Chudori", utama: true }],
      eksemplar: { kategoriId: FIK.id },
    });
    await a.lib.sinkronkan(transport);
    await b.lib.sinkronkan(transport);

    expect(await b.lib.cariDariPindai("FIK-001/2026")).toMatchObject({
      jenis: "eksemplar",
      eksemplar: { eksemplarId, judul: "Laut Bercerita", dipinjam: null },
    });
  });
});
