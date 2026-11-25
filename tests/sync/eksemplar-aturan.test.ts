import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mutasi } from "@/lib/sync-protocol";
import { createKelolaApi } from "@/server/kelola";
import { createSyncApi } from "@/server/sync";
import { KATEGORI_ID } from "../support/mutasi";
import { createTestDb } from "../support/test-db";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let api: ReturnType<typeof createSyncApi>;
let kelola: ReturnType<typeof createKelolaApi>;

beforeEach(async () => {
  ctx = await createTestDb();
  api = createSyncApi(ctx.db);
  kelola = createKelolaApi(ctx.db);
});
afterEach(async () => {
  vi.useRealTimers();
  await ctx.close();
});

const uuid = () => crypto.randomUUID();
const WAKTU = "2026-03-14T10:00:00+07:00";

const mutasiBuku = (bukuId: string, opts: { isbn13?: string } = {}): Mutasi => ({
  id: uuid(),
  jenis: "buku.tambah",
  buku: {
    id: bukuId,
    judul: "Laut Bercerita",
    ...(opts.isbn13 ? { isbn13: opts.isbn13 } : {}),
    kontributor: [{ id: uuid(), nama: "Leila S. Chudori", peran: "pengarang", utama: true }],
  },
});
const mutasiEksemplar = (bukuId: string, eksemplarId: string, extra: { kategoriId?: string; waktuDicatat?: string } = {}): Mutasi => ({
  id: uuid(),
  jenis: "eksemplar.catat",
  eksemplar: {
    id: eksemplarId,
    bukuId,
    kategoriId: extra.kategoriId ?? KATEGORI_ID.FIK,
    waktuDicatat: extra.waktuDicatat ?? WAKTU,
  },
});
const tandai = (eksemplarIds: string[], waktuUbah: string): Mutasi => ({
  id: uuid(),
  jenis: "eksemplar.tandaiTercetak",
  eksemplarIds,
  waktuUbah,
});
const koreksi = (eksemplarId: string, kategoriId: string, waktuUbah: string): Mutasi => ({
  id: uuid(),
  jenis: "eksemplar.koreksiKategori",
  eksemplarId,
  kategoriId,
  waktuUbah,
});

async function eksemplarTersinkron() {
  const bukuId = uuid();
  const eksemplarId = uuid();
  const res = await api.push({ mutasi: [mutasiBuku(bukuId), mutasiEksemplar(bukuId, eksemplarId)] });
  expect(res.hasil.every((h) => h.status === "diterima")).toBe(true);
  return { bukuId, eksemplarId };
}
const dariPull = async (id: string) => (await api.pull(null)).eksemplar.find((e) => e.id === id)!;

describe("API Sinkronisasi: tandai tercetak per field (LWW)", () => {
  it("penandaan lama yang tiba terlambat tidak menimpa koreksi Kategori yang lebih baru", async () => {
    const { eksemplarId } = await eksemplarTersinkron();
    await api.push({ mutasi: [tandai([eksemplarId], "2026-03-14T10:00:00+07:00")] });
    await api.push({ mutasi: [koreksi(eksemplarId, KATEGORI_ID.AGM, "2026-03-14T12:00:00+07:00")] });
    expect((await dariPull(eksemplarId)).perluCetak).toBe(true);

    // Perangkat lain mencetak pukul 11.00 (sebelum koreksi), baru tersinkron sekarang.
    const res = await api.push({ mutasi: [tandai([eksemplarId], "2026-03-14T11:00:00+07:00")] });

    expect(res.hasil[0]).toMatchObject({ status: "diterima" });
    expect((await dariPull(eksemplarId)).perluCetak).toBe(true);
  });

  it("penandaan yang lebih baru dari koreksi mengeluarkan Eksemplar dari antrean", async () => {
    const { eksemplarId } = await eksemplarTersinkron();
    await api.push({ mutasi: [koreksi(eksemplarId, KATEGORI_ID.AGM, "2026-03-14T12:00:00+07:00")] });

    await api.push({ mutasi: [tandai([eksemplarId], "2026-03-14T13:00:00+07:00")] });

    expect((await dariPull(eksemplarId)).perluCetak).toBe(false);
  });
});

describe("API Sinkronisasi: koreksi dan pencatatan terhadap Kategori yang diarsipkan", () => {
  it("koreksi ke Kategori yang diarsipkan ditolak", async () => {
    const { eksemplarId } = await eksemplarTersinkron();
    await kelola.kategori.ubah(KATEGORI_ID.AGM, { diarsipkan: true });

    const res = await api.push({ mutasi: [koreksi(eksemplarId, KATEGORI_ID.AGM, WAKTU)] });

    expect(res.hasil[0]).toMatchObject({ status: "ditolak", alasan: expect.stringContaining("diarsipkan") });
    expect((await dariPull(eksemplarId)).kategoriId).toBe(KATEGORI_ID.FIK);
  });

  it("Eksemplar baru ke Kategori yang diarsipkan sesudah dicatat offline tetap diterima", async () => {
    await kelola.kategori.ubah(KATEGORI_ID.AGM, { diarsipkan: true });
    const bukuId = uuid();
    const eksemplarId = uuid();

    const res = await api.push({
      mutasi: [mutasiBuku(bukuId), mutasiEksemplar(bukuId, eksemplarId, { kategoriId: KATEGORI_ID.AGM })],
    });

    expect(res.hasil[1]).toMatchObject({ status: "diterima", nomorInduk: "AGM-001/2026" });
  });
});

describe("API Sinkronisasi: tahun pencatatan masuk akal", () => {
  it("waktu pencatatan sebelum tahun 2000 ditolak dengan alasan yang jelas", async () => {
    const bukuId = uuid();
    const res = await api.push({
      mutasi: [mutasiBuku(bukuId), mutasiEksemplar(bukuId, uuid(), { waktuDicatat: "1970-01-01T07:00:00+07:00" })],
    });

    expect(res.hasil[1]).toMatchObject({ status: "ditolak", alasan: expect.stringContaining("jam perangkat") });
  });

  it("waktu pencatatan lebih dari sehari di depan jam server ditolak", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T03:00:00Z"));
    const bukuId = uuid();

    const res = await api.push({
      mutasi: [mutasiBuku(bukuId), mutasiEksemplar(bukuId, uuid(), { waktuDicatat: "2027-02-01T10:00:00+07:00" })],
    });

    expect(res.hasil[1]).toMatchObject({ status: "ditolak", alasan: expect.stringContaining("jam perangkat") });
  });
});

describe("Kelola Kategori: ganti kode mengubah Nomor Panggil", () => {
  it("memasukkan lagi semua Eksemplar aktif Kategori itu ke Antrean Cetak tanpa mengubah Nomor Induk", async () => {
    const a = await eksemplarTersinkron();
    const b = await eksemplarTersinkron();
    const lain = uuid();
    const bukuLain = uuid();
    await api.push({
      mutasi: [mutasiBuku(bukuLain), mutasiEksemplar(bukuLain, lain, { kategoriId: KATEGORI_ID.AGM })],
    });
    await api.push({ mutasi: [tandai([a.eksemplarId, b.eksemplarId, lain], "2026-03-14T10:30:00+07:00")] });
    const { kursor } = await api.pull(null);
    const nomorSebelum = (await dariPull(a.eksemplarId)).nomorInduk;

    await kelola.kategori.ubah(KATEGORI_ID.FIK, { kode: "NOV" });

    const baru = await api.pull(kursor);
    expect(baru.eksemplar.map((e) => e.id).sort()).toEqual([a.eksemplarId, b.eksemplarId].sort());
    expect(baru.eksemplar.every((e) => e.perluCetak)).toBe(true);
    expect((await dariPull(a.eksemplarId)).nomorInduk).toBe(nomorSebelum);
    expect((await dariPull(lain)).perluCetak).toBe(false);
  });

  it("mengubah nama atau warna saja tidak memasukkan Eksemplar ke Antrean Cetak", async () => {
    const a = await eksemplarTersinkron();
    await api.push({ mutasi: [tandai([a.eksemplarId], "2026-03-14T10:30:00+07:00")] });

    await kelola.kategori.ubah(KATEGORI_ID.FIK, { nama: "Fiksi umum", warna: "#112233" });

    expect((await dariPull(a.eksemplarId)).perluCetak).toBe(false);
  });
});
