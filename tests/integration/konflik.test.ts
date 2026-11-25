import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalLibrary } from "@/lib/local-library";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import type { SyncTransport } from "@/lib/sync-protocol";
import { createSyncApi } from "@/server/sync";
import { createTestDb } from "../support/test-db";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;
const AGM = PRESET_KATEGORI.find((k) => k.kode === "AGM")!;

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let transport: SyncTransport;

/** Perangkat dengan jam yang bisa diatur, supaya "siapa yang terbaru" jelas. */
function perangkat(jam = new Date(2026, 2, 14, 10, 0, 0)) {
  const waktu = { sekarang: jam };
  const lib = createLocalLibrary({
    dbName: `lifelibrary-test-${crypto.randomUUID()}`,
    now: () => waktu.sekarang,
  });
  return { lib, waktu };
}
const jam = (j: number) => new Date(2026, 2, 14, j, 0, 0);

beforeEach(async () => {
  ctx = await createTestDb();
  const api = createSyncApi(ctx.db);
  transport = { push: (req) => api.push(req), pull: (kursor) => api.pull(kursor) };
});
afterEach(async () => {
  await ctx.close();
});

/** Dua perangkat yang sama-sama sudah punya Laut Bercerita (KPG) dan sudah tersinkron. */
async function duaPerangkat() {
  const a = perangkat();
  const b = perangkat();
  const { bukuId, eksemplarId } = await a.lib.tambahBuku({
    judul: "Laut Bercerita",
    penerbit: "KPG",
    kontributor: [{ nama: "Leila S. Chudori", utama: true }],
    eksemplar: { kategoriId: FIK.id },
  });
  await a.lib.sinkronkan(transport);
  await b.lib.sinkronkan(transport);
  return { a, b, bukuId, eksemplarId };
}

describe("Konflik per field: dua perangkat (ADR 0004)", () => {
  it("field berbeda pada Buku yang sama: kedua perubahan ada di kedua perangkat", async () => {
    const { a, b, bukuId } = await duaPerangkat();
    a.waktu.sekarang = jam(11);
    b.waktu.sekarang = jam(12);
    await a.lib.ubahBuku(bukuId, { penerbit: "Gramedia" });
    await b.lib.ubahBuku(bukuId, { tahun: 2017 });

    const hasilA = await a.lib.sinkronkan(transport);
    const hasilB = await b.lib.sinkronkan(transport);
    await a.lib.sinkronkan(transport);

    expect(hasilA.ditimpa).toEqual([]);
    expect(hasilB.ditimpa).toEqual([]);
    for (const p of [a, b]) {
      expect(await p.lib.detailBuku(bukuId)).toMatchObject({ penerbit: "Gramedia", tahun: 2017 });
    }
  });

  it("field yang sama: yang terbaru menang; perangkat yang kalah diberi tahu dan salinannya disamakan", async () => {
    const { a, b, bukuId } = await duaPerangkat();
    a.waktu.sekarang = jam(12);
    b.waktu.sekarang = jam(11);
    await a.lib.ubahBuku(bukuId, { penerbit: "Gramedia" });
    await b.lib.ubahBuku(bukuId, { penerbit: "Mizan" }); // lebih lama, tapi tiba belakangan
    await a.lib.sinkronkan(transport);

    const hasil = await b.lib.sinkronkan(transport);

    expect(hasil.ditimpa).toMatchObject([
      {
        bukuId,
        judul: "Laut Bercerita",
        field: "penerbit",
        label: "Penerbit",
        pesan: "Penerbit di Laut Bercerita diperbarui dari perangkat lain",
      },
    ]);
    expect((await b.lib.detailBuku(bukuId))!.penerbit).toBe("Gramedia");
    expect((await a.lib.detailBuku(bukuId))!.penerbit).toBe("Gramedia");
    expect((await b.lib.statusSinkronisasi()).menunggu).toBe(0);
  });

  it("pemberitahuan dicatat di log Perubahan dari perangkat lain, terbaru dulu, dan bertahan", async () => {
    const { a, b, bukuId, eksemplarId } = await duaPerangkat();
    a.waktu.sekarang = jam(12);
    b.waktu.sekarang = jam(11);
    await a.lib.ubahBuku(bukuId, { penerbit: "Gramedia" });
    await a.lib.ubahEksemplar(eksemplarId, { kondisi: "baik" });
    await b.lib.ubahBuku(bukuId, { penerbit: "Mizan" });
    await b.lib.ubahEksemplar(eksemplarId, { kondisi: "rusak" });
    await a.lib.sinkronkan(transport);

    await b.lib.sinkronkan(transport);

    const log = await b.lib.logPerubahan();
    expect(log.map((l) => l.pesan).sort()).toEqual([
      "Kondisi di Laut Bercerita (FIK-001/2026) diperbarui dari perangkat lain",
      "Penerbit di Laut Bercerita diperbarui dari perangkat lain",
    ]);
    expect(log[0].pada).toBeGreaterThanOrEqual(log[1].pada);
    expect((await a.lib.logPerubahan())).toEqual([]);
  });

  it("pemantau log diberi tahu saat ada pemberitahuan baru", async () => {
    const { a, b, bukuId } = await duaPerangkat();
    a.waktu.sekarang = jam(12);
    b.waktu.sekarang = jam(11);
    await a.lib.ubahBuku(bukuId, { penerbit: "Gramedia" });
    await b.lib.ubahBuku(bukuId, { penerbit: "Mizan" });
    await a.lib.sinkronkan(transport);
    const dilihat: number[] = [];
    const berhenti = b.lib.pantauLog((log) => dilihat.push(log.length));

    await b.lib.sinkronkan(transport);

    await vi.waitFor(() => expect(dilihat.at(-1)).toBe(1));
    berhenti();
  });

  it("Kategori yang dikoreksi di dua perangkat: yang terbaru menang dan yang kalah diberi tahu", async () => {
    const { a, b, bukuId, eksemplarId } = await duaPerangkat();
    a.waktu.sekarang = jam(12);
    b.waktu.sekarang = jam(11);
    await a.lib.koreksiKategori(eksemplarId, AGM.id);
    const lain = PRESET_KATEGORI.find((k) => k.kode !== "FIK" && k.kode !== "AGM")!;
    await b.lib.koreksiKategori(eksemplarId, lain.id);
    await a.lib.sinkronkan(transport);

    const hasil = await b.lib.sinkronkan(transport);

    expect(hasil.ditimpa).toMatchObject([{ field: "kategoriId", label: "Kategori" }]);
    expect((await b.lib.detailBuku(bukuId))!.eksemplar[0].kategori.kode).toBe("AGM");
  });
});

describe("Pull tidak menimpa perubahan lokal yang masih menunggu", () => {
  it("edit lokal yang ditolak server tetap terlihat setelah pull, dan field lain ikut diperbarui", async () => {
    const { a, b, bukuId } = await duaPerangkat();
    // Perangkat lain mengubah penerbit dan tahun.
    a.waktu.sekarang = jam(12);
    await a.lib.ubahBuku(bukuId, { penerbit: "Gramedia", tahun: 2020 });
    await a.lib.sinkronkan(transport);
    // Edit di B ditolak server (ISBN yang dipakai Buku lain).
    await a.lib.tambahBuku({
      judul: "Pulang",
      isbn13: "9786024246945",
      kontributor: [{ nama: "Leila S. Chudori", utama: true }],
      eksemplar: { kategoriId: FIK.id },
    });
    await a.lib.sinkronkan(transport);
    b.waktu.sekarang = jam(13);
    await b.lib.ubahBuku(bukuId, { isbn13: "9786024246945", penerbit: "Mizan" });

    const hasil = await b.lib.sinkronkan(transport);

    expect(hasil.ditolak).toBe(1);
    const detail = (await b.lib.detailBuku(bukuId))!;
    expect(detail.isbn13).toBe("9786024246945"); // edit lokal tidak tergulung pull
    expect(detail.penerbit).toBe("Mizan");
    expect(detail.tahun).toBe(2020); // field tanpa edit tertunda ikut pull
  });

  it("edit yang dibuat saat Sinkronisasi sedang berjalan tidak tertimpa pull", async () => {
    const { a, b, bukuId } = await duaPerangkat();
    a.waktu.sekarang = jam(12);
    await a.lib.ubahBuku(bukuId, { penerbit: "Gramedia" });
    await a.lib.sinkronkan(transport);
    // Pemilik mengedit di B tepat setelah push selesai dan sebelum pull diterapkan.
    const sambilJalan: SyncTransport = {
      push: transport.push,
      pull: async (kursor) => {
        const res = await transport.pull(kursor);
        b.waktu.sekarang = jam(13);
        await b.lib.ubahBuku(bukuId, { penerbit: "Mizan" });
        return res;
      },
    };

    await b.lib.sinkronkan(sambilJalan);

    expect((await b.lib.detailBuku(bukuId))!.penerbit).toBe("Mizan");
    expect((await b.lib.statusSinkronisasi()).menunggu).toBe(1);

    await b.lib.sinkronkan(transport);
    await a.lib.sinkronkan(transport);
    expect((await a.lib.detailBuku(bukuId))!.penerbit).toBe("Mizan");
  });
});

describe("Gagal terkirim dan Coba lagi", () => {
  /** Eksemplar dicatat untuk Buku yang belum pernah sampai ke server: ditolak. */
  async function perubahanDitolak() {
    const { a, b, bukuId } = await duaPerangkat();
    await a.lib.tambahBuku({
      judul: "Pulang",
      isbn13: "9786024246945",
      kontributor: [{ nama: "Leila S. Chudori", utama: true }],
      eksemplar: { kategoriId: FIK.id },
    });
    await a.lib.sinkronkan(transport);
    b.waktu.sekarang = jam(13);
    await b.lib.ubahBuku(bukuId, { isbn13: "9786024246945" });
    await b.lib.sinkronkan(transport);
    return { a, b, bukuId };
  }

  it("mutasi yang ditolak masuk daftar Gagal terkirim dengan alasannya, terpisah dari yang tertunda", async () => {
    const { b, bukuId } = await perubahanDitolak();
    await b.lib.ubahBuku(bukuId, { tahun: 2017 });

    const antrean = await b.lib.daftarAntrean();

    expect(antrean.gagal).toMatchObject([
      { ringkasan: "Ubah ISBN pada Laut Bercerita", alasan: "ISBN sudah tercatat pada Buku lain" },
    ]);
    expect(antrean.tertunda).toMatchObject([{ ringkasan: "Ubah Tahun pada Laut Bercerita" }]);
    expect(await b.lib.statusSinkronisasi()).toEqual({ menunggu: 1, ditolak: 1 });
  });

  it("Coba lagi mengirim ulang mutasi yang gagal; berhasil bila penyebabnya sudah hilang", async () => {
    const { a, b, bukuId } = await perubahanDitolak();
    // Penyebab hilang: Buku lain mengosongkan ISBN-nya.
    const lain = (await a.lib.daftarKoleksi()).find((k) => k.judul === "Pulang")!;
    a.waktu.sekarang = jam(14);
    await a.lib.ubahBuku(lain.bukuId, { isbn13: null });
    await a.lib.sinkronkan(transport);
    const [gagal] = (await b.lib.daftarAntrean()).gagal;

    await b.lib.cobaLagi(gagal.id);
    expect((await b.lib.daftarAntrean()).tertunda).toHaveLength(1);
    const hasil = await b.lib.sinkronkan(transport);

    expect(hasil).toMatchObject({ dikirim: 1, ditolak: 0 });
    expect((await b.lib.daftarAntrean())).toEqual({ tertunda: [], gagal: [] });
    expect((await a.lib.detailBuku(bukuId))!.isbn13).toBe(null);
    await a.lib.sinkronkan(transport);
    expect((await a.lib.detailBuku(bukuId))!.isbn13).toBe("9786024246945");
  });

  it("Coba lagi tanpa id mengulang semua yang gagal; yang masih ditolak kembali ke Gagal terkirim", async () => {
    const { b } = await perubahanDitolak();

    await b.lib.cobaLagi();
    const hasil = await b.lib.sinkronkan(transport);

    expect(hasil.ditolak).toBe(1);
    expect((await b.lib.daftarAntrean()).gagal).toHaveLength(1);
  });

  it("nav: jumlah Menunggu Sinkron tidak menghitung yang gagal terkirim, dan turun saat tersinkron", async () => {
    const { a, bukuId } = await duaPerangkat();
    a.waktu.sekarang = jam(12);
    const dilihat: { menunggu: number; ditolak: number }[] = [];
    const berhenti = a.lib.pantauStatus((s) => dilihat.push(s));

    await a.lib.ubahBuku(bukuId, { penerbit: "Gramedia" });
    await vi.waitFor(() => expect(dilihat.at(-1)).toEqual({ menunggu: 1, ditolak: 0 }));
    await a.lib.sinkronkan(transport);
    await vi.waitFor(() => expect(dilihat.at(-1)).toEqual({ menunggu: 0, ditolak: 0 }));
    berhenti();
  });
});
