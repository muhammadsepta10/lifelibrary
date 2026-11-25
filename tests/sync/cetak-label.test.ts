import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KelolaDitolakError } from "@/lib/kelola-protocol";
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
  await ctx.close();
});

const uuid = () => crypto.randomUUID();
const WAKTU = "2026-03-14T10:00:00+07:00";

const mutasiBuku = (bukuId: string, judul = "Laut Bercerita", pengarang = "Leila S. Chudori"): Mutasi => ({
  id: uuid(),
  jenis: "buku.tambah",
  buku: { id: bukuId, judul, kontributor: [{ id: uuid(), nama: pengarang, peran: "pengarang", utama: true }] },
});
const mutasiEksemplar = (bukuId: string, eksemplarId: string, kode = "FIK"): Mutasi => ({
  id: uuid(),
  jenis: "eksemplar.catat",
  eksemplar: { id: eksemplarId, bukuId, kategoriId: KATEGORI_ID[kode], waktuDicatat: WAKTU },
});
const tandai = (eksemplarIds: string[]): Mutasi => ({
  id: uuid(),
  jenis: "eksemplar.tandaiTercetak",
  eksemplarIds,
  waktuUbah: WAKTU,
});
const ubahBuku = (bukuId: string, perubahan: Record<string, unknown>): Mutasi =>
  ({ id: uuid(), jenis: "buku.ubah", bukuId, waktuUbah: WAKTU, perubahan }) as Mutasi;
const koreksi = (eksemplarId: string, kode: string): Mutasi => ({
  id: uuid(),
  jenis: "eksemplar.koreksiKategori",
  eksemplarId,
  kategoriId: KATEGORI_ID[kode],
  waktuUbah: WAKTU,
});

async function eksemplarTersinkron(judul?: string, pengarang?: string) {
  const bukuId = uuid();
  const eksemplarId = uuid();
  const res = await api.push({ mutasi: [mutasiBuku(bukuId, judul, pengarang), mutasiEksemplar(bukuId, eksemplarId)] });
  expect(res.hasil.every((h) => h.status === "diterima")).toBe(true);
  return { bukuId, eksemplarId };
}
const perluCetak = async (id: string) => (await api.pull(null)).eksemplar.find((e) => e.id === id)!.perluCetak;

describe("API Sinkronisasi: Antrean Cetak", () => {
  it("Eksemplar baru langsung perlu dicetak", async () => {
    const { eksemplarId } = await eksemplarTersinkron();

    expect(await perluCetak(eksemplarId)).toBe(true);
  });

  it("menandai tercetak mengeluarkan Eksemplar dari antrean dan muncul di pull berikutnya", async () => {
    const { eksemplarId } = await eksemplarTersinkron();
    const { kursor } = await api.pull(null);

    const res = await api.push({ mutasi: [tandai([eksemplarId])] });

    expect(res.hasil[0]).toMatchObject({ status: "diterima" });
    const baru = await api.pull(kursor);
    expect(baru.eksemplar).toHaveLength(1);
    expect(baru.eksemplar[0]).toMatchObject({ id: eksemplarId, perluCetak: false });
  });

  it("mengirim ulang mutasi yang sama tidak mengubah hasil (idempoten)", async () => {
    const { eksemplarId } = await eksemplarTersinkron();
    const m = tandai([eksemplarId]);

    await api.push({ mutasi: [m] });
    const lagi = await api.push({ mutasi: [m] });

    expect(lagi.hasil[0]).toMatchObject({ status: "diterima" });
    expect(await perluCetak(eksemplarId)).toBe(false);
  });

  it("koreksi Kategori memasukkan lagi Eksemplar yang sudah tercetak, koreksi ke Kategori yang sama tidak", async () => {
    const { eksemplarId } = await eksemplarTersinkron();
    await api.push({ mutasi: [tandai([eksemplarId])] });

    await api.push({ mutasi: [koreksi(eksemplarId, "FIK")] });
    expect(await perluCetak(eksemplarId)).toBe(false);

    await api.push({ mutasi: [koreksi(eksemplarId, "AGM")] });
    expect(await perluCetak(eksemplarId)).toBe(true);
  });

  it("Nomor Panggil berubah karena judul atau Pengarang Utama diubah: Eksemplar masuk antrean lagi", async () => {
    const { bukuId, eksemplarId } = await eksemplarTersinkron("Laut Bercerita", "Leila S. Chudori");
    await api.push({ mutasi: [tandai([eksemplarId])] });

    await api.push({ mutasi: [ubahBuku(bukuId, { penerbit: "KPG", halaman: 379 })] });
    expect(await perluCetak(eksemplarId)).toBe(false);

    // Huruf awal judul sama: Nomor Panggil tidak berubah.
    await api.push({ mutasi: [ubahBuku(bukuId, { judul: "Laut Bercerita (Revisi)" })] });
    expect(await perluCetak(eksemplarId)).toBe(false);

    await api.push({ mutasi: [ubahBuku(bukuId, { judul: "Bumi Manusia" })] });
    expect(await perluCetak(eksemplarId)).toBe(true);

    await api.push({ mutasi: [tandai([eksemplarId])] });
    await api.push({
      mutasi: [
        ubahBuku(bukuId, {
          kontributor: [{ id: uuid(), nama: "Pramoedya Ananta Toer", peran: "pengarang", utama: true }],
        }),
      ],
    });
    expect(await perluCetak(eksemplarId)).toBe(true);
  });
});

describe("API Kelola: Template Label", () => {
  const f4 = { kertas: "F4", w: 70, h: 30, mt: 8, ml: 7, gx: 1, gy: 2 } as const;

  it("belum ada Template Label tersimpan: pull tidak membawa apa-apa", async () => {
    expect((await api.pull(null)).templateLabel).toBeNull();
  });

  it("menyimpan Template Label dan menyampaikannya lewat pull; menyimpan lagi menggantikan yang lama", async () => {
    const hasil = await kelola.templateLabel.simpan(f4);
    expect(hasil).toEqual(f4);
    expect((await api.pull(null)).templateLabel).toEqual(f4);

    const lain = { kertas: "A4", w: 66, h: 26, mt: 5.5, ml: 6, gx: 0, gy: 0 } as const;
    await kelola.templateLabel.simpan(lain);
    expect((await api.pull(null)).templateLabel).toEqual(lain);
  });

  it("pull dengan kursor hanya membawa Template Label yang berubah sesudahnya", async () => {
    await kelola.templateLabel.simpan(f4);
    const { kursor } = await api.pull(null);
    expect((await api.pull(kursor)).templateLabel).toBeNull();

    await kelola.templateLabel.simpan({ ...f4, w: 60 });
    expect((await api.pull(kursor)).templateLabel).toMatchObject({ w: 60 });
  });

  it("menolak ukuran yang tidak masuk akal dengan pesan yang menunjuk field-nya", async () => {
    const tolak = (t: Record<string, unknown>) =>
      kelola.templateLabel.simpan(t as never).catch((e: unknown) => e);

    expect(await tolak({ ...f4, w: 0 })).toBeInstanceOf(KelolaDitolakError);
    expect(await tolak({ ...f4, w: 0 })).toMatchObject({ jenis: "tidak-valid", field: "w" });
    expect(await tolak({ ...f4, mt: -1 })).toMatchObject({ field: "mt" });
    expect(await tolak({ ...f4, kertas: "Letter" })).toMatchObject({ field: "kertas" });
    expect(await tolak({ ...f4, w: 250 })).toMatchObject({ field: "w", pesan: "Label lebih lebar dari kertas F4" });
    expect((await api.pull(null)).templateLabel).toBeNull();
  });
});
