import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createKelolaApi } from "@/server/kelola";
import { createSyncApi } from "@/server/sync";
import type { Mutasi } from "@/lib/sync-protocol";
import { createTestDb } from "../support/test-db";
import { KATEGORI_ID } from "../support/mutasi";

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

type K = { nama: string; peran?: "pengarang" | "penerjemah" | "editor"; utama?: boolean; id?: string };
const kontributor = (daftar: K[]) =>
  daftar.map((k) => ({ id: k.id ?? uuid(), nama: k.nama, peran: k.peran ?? ("pengarang" as const), utama: k.utama ?? false }));

const mutasiBuku = (bukuId: string, ekstra: Record<string, unknown> = {}, daftar: K[] = [{ nama: "Leila S. Chudori", utama: true }]): Mutasi => ({
  id: uuid(),
  jenis: "buku.tambah",
  buku: { id: bukuId, judul: "Laut Bercerita", kontributor: kontributor(daftar), ...ekstra },
});

const mutasiEksemplar = (bukuId: string, eksemplarId: string, ekstra: Record<string, unknown> = {}, kode = "FIK"): Mutasi => ({
  id: uuid(),
  jenis: "eksemplar.catat",
  eksemplar: { id: eksemplarId, bukuId, kategoriId: KATEGORI_ID[kode], waktuDicatat: WAKTU, ...ekstra },
});

/** Buku + Eksemplar yang sudah tersinkron. */
async function sudahTersinkron(ekstraBuku: Record<string, unknown> = {}, ekstraEksemplar: Record<string, unknown> = {}) {
  const bukuId = uuid();
  const eksemplarId = uuid();
  const res = await api.push({
    mutasi: [mutasiBuku(bukuId, ekstraBuku), mutasiEksemplar(bukuId, eksemplarId, ekstraEksemplar)],
  });
  expect(res.hasil.every((h) => h.status === "diterima")).toBe(true);
  return { bukuId, eksemplarId };
}

const bukuDiPull = async (id: string) => (await api.pull(null)).buku.find((b) => b.id === id)!;
const eksemplarDiPull = async (id: string) => (await api.pull(null)).eksemplar.find((e) => e.id === id)!;

describe("API Sinkronisasi: data Buku dan Eksemplar lengkap", () => {
  it("menyimpan semua field Buku dan menyampaikannya lewat pull", async () => {
    const { bukuId } = await sudahTersinkron({
      penerbit: "KPG",
      kota: "Jakarta",
      tahun: 2017,
      edisi: "Cetakan ke-3",
      seri: "Seri Novel",
      jilid: "1",
      bahasa: "Indonesia",
      halaman: 379,
      sinopsis: "Tentang aktivis.",
      sampul: "covers/lb.jpg",
      subjek: ["Fiksi", "Aktivis"],
      kelasDdc: "899.221",
      isbn13: "9786024246945",
    });

    expect(await bukuDiPull(bukuId)).toMatchObject({
      judul: "Laut Bercerita",
      penerbit: "KPG",
      kota: "Jakarta",
      tahun: 2017,
      edisi: "Cetakan ke-3",
      seri: "Seri Novel",
      jilid: "1",
      bahasa: "Indonesia",
      halaman: 379,
      sinopsis: "Tentang aktivis.",
      sampul: "covers/lb.jpg",
      subjek: ["Fiksi", "Aktivis"],
      kelasDdc: "899.221",
      isbn13: "9786024246945",
    });
  });

  it("Buku tanpa field tambahan tetap lengkap bentuknya (kosong = null, subjek = [])", async () => {
    const { bukuId } = await sudahTersinkron();

    expect(await bukuDiPull(bukuId)).toMatchObject({ penerbit: null, kota: null, kelasDdc: null, subjek: [] });
  });

  it("menyimpan data penerimaan Eksemplar: tanggal masuk, asal, harga, kondisi, Lokasi", async () => {
    const lokasi = await kelola.lokasi.buat({ nama: "Rak A, susun 2" });
    const { eksemplarId } = await sudahTersinkron(
      {},
      { tanggalMasuk: "2026-03-01", asal: "beli", harga: 95000, kondisi: "baik", lokasiId: lokasi.id },
    );

    expect(await eksemplarDiPull(eksemplarId)).toMatchObject({
      tanggalMasuk: "2026-03-01",
      asal: "beli",
      harga: 95000,
      kondisi: "baik",
      lokasiId: lokasi.id,
      perluCetak: true, // Eksemplar baru belum pernah dicetak
    });
  });

  it("tanggal masuk boleh kosong", async () => {
    const { eksemplarId } = await sudahTersinkron();

    expect(await eksemplarDiPull(eksemplarId)).toMatchObject({ tanggalMasuk: null, asal: null, harga: null, lokasiId: null });
  });

  it("menolak Eksemplar yang Lokasinya tidak dikenal", async () => {
    const bukuId = uuid();
    const res = await api.push({
      mutasi: [mutasiBuku(bukuId), mutasiEksemplar(bukuId, uuid(), { lokasiId: uuid() })],
    });

    expect(res.hasil[1]).toMatchObject({ status: "ditolak" });
    expect((await api.pull(null)).eksemplar).toEqual([]);
  });

  it("Eksemplar kedua untuk Buku yang ada mendapat Nomor Induk berikutnya", async () => {
    const { bukuId } = await sudahTersinkron();

    const res = await api.push({ mutasi: [mutasiEksemplar(bukuId, uuid(), { asal: "hadiah" })] });

    expect(res.hasil[0]).toMatchObject({ status: "diterima", nomorInduk: "FIK-002/2026" });
  });
});

describe("API Sinkronisasi: Kontributor", () => {
  const kontributorDi = async (id: string) => (await bukuDiPull(id)).kontributor;

  it("menyimpan peran dan Pengarang Utama", async () => {
    const bukuId = uuid();
    await api.push({
      mutasi: [
        mutasiBuku(bukuId, {}, [
          { nama: "Pramoedya", peran: "pengarang", utama: true },
          { nama: "Max Lane", peran: "penerjemah" },
          { nama: "Sapardi", peran: "editor" },
        ]),
      ],
    });

    const k = await kontributorDi(bukuId);
    expect(k.map((x) => [x.nama, x.peran, x.utama])).toEqual([
      ["Pramoedya", "pengarang", true],
      ["Max Lane", "penerjemah", false],
      ["Sapardi", "editor", false],
    ]);
  });

  it("nama ternormalisasi yang sama digabung lintas Buku: satu Kontributor, nama pertama dipakai", async () => {
    const a = uuid();
    const b = uuid();
    await api.push({ mutasi: [mutasiBuku(a, {}, [{ nama: "Leila S. Chudori", utama: true }])] });
    await api.push({ mutasi: [mutasiBuku(b, { judul: "Pulang" }, [{ nama: "  LEILA s chudori", utama: true }])] });

    const [ka] = await kontributorDi(a);
    const [kb] = await kontributorDi(b);
    expect(kb.id).toBe(ka.id);
    expect(kb.nama).toBe("Leila S. Chudori");
  });

  it("nama yang sama dalam satu Buku digabung menjadi satu entri per peran", async () => {
    const bukuId = uuid();
    await api.push({
      mutasi: [
        mutasiBuku(bukuId, {}, [
          { nama: "Eka Kurniawan", peran: "pengarang", utama: true },
          { nama: "eka kurniawan", peran: "pengarang" },
          { nama: "Eka Kurniawan", peran: "editor" },
        ]),
      ],
    });

    const k = await kontributorDi(bukuId);
    expect(k.map((x) => [x.peran, x.utama])).toEqual([
      ["pengarang", true],
      ["editor", false],
    ]);
    expect(new Set(k.map((x) => x.id)).size).toBe(1);
  });

  it("menolak Buku tanpa Pengarang Utama atau dengan lebih dari satu", async () => {
    const tanpa = await api.push({ mutasi: [mutasiBuku(uuid(), {}, [{ nama: "A" }, { nama: "B" }])] });
    const dua = await api.push({
      mutasi: [
        mutasiBuku(uuid(), {}, [
          { nama: "A", utama: true },
          { nama: "B", utama: true },
        ]),
      ],
    });

    expect(tanpa.hasil[0]).toMatchObject({ status: "ditolak" });
    expect(dua.hasil[0]).toMatchObject({ status: "ditolak" });
    expect((await api.pull(null)).buku).toEqual([]);
  });
});

describe("API Sinkronisasi: ubah Buku", () => {
  const ubah = (bukuId: string, perubahan: Record<string, unknown>): Mutasi =>
    ({ id: uuid(), jenis: "buku.ubah", bukuId, waktuUbah: WAKTU, perubahan }) as Mutasi;

  it("mengubah hanya field yang disebut; null mengosongkan; muncul di pull berikutnya", async () => {
    const { bukuId } = await sudahTersinkron({ penerbit: "KPG", tahun: 2017, kota: "Jakarta" });
    const { kursor } = await api.pull(null);

    const res = await api.push({ mutasi: [ubah(bukuId, { penerbit: null, tahun: 2020, judul: "Laut Bercerita (Revisi)" })] });

    expect(res.hasil[0]).toMatchObject({ status: "diterima" });
    expect(await bukuDiPull(bukuId)).toMatchObject({
      judul: "Laut Bercerita (Revisi)",
      penerbit: null,
      tahun: 2020,
      kota: "Jakarta",
    });
    expect((await api.pull(kursor)).buku.map((b) => b.id)).toEqual([bukuId]);
  });

  it("mengganti Kontributor dan Pengarang Utama", async () => {
    const { bukuId } = await sudahTersinkron();

    await api.push({
      mutasi: [ubah(bukuId, { kontributor: kontributor([{ nama: "Ahmad Fauzi", utama: true }, { nama: "Leila S. Chudori", peran: "penerjemah" }]) })],
    });

    const k = (await bukuDiPull(bukuId)).kontributor;
    expect(k.map((x) => [x.nama, x.peran, x.utama])).toEqual([
      ["Ahmad Fauzi", "pengarang", true],
      ["Leila S. Chudori", "penerjemah", false],
    ]);
  });

  it("perubahan Kontributor yang bernama sama dengan yang ada tetap memakai Kontributor itu", async () => {
    const { bukuId } = await sudahTersinkron();
    const [lama] = (await bukuDiPull(bukuId)).kontributor;

    await api.push({
      mutasi: [ubah(bukuId, { kontributor: kontributor([{ nama: "leila s. chudori", utama: true }]) })],
    });

    expect((await bukuDiPull(bukuId)).kontributor).toMatchObject([{ id: lama.id, nama: "Leila S. Chudori", utama: true }]);
  });

  it("menolak perubahan Kontributor tanpa tepat satu Pengarang Utama; Buku tidak berubah", async () => {
    const { bukuId } = await sudahTersinkron();

    const res = await api.push({ mutasi: [ubah(bukuId, { judul: "Baru", kontributor: kontributor([{ nama: "A" }]) })] });

    expect(res.hasil[0]).toMatchObject({ status: "ditolak" });
    expect(await bukuDiPull(bukuId)).toMatchObject({ judul: "Laut Bercerita" });
  });

  it("menolak Buku yang tidak ada dan ISBN yang sudah dipakai Buku lain", async () => {
    const a = await sudahTersinkron({ isbn13: "9786024246945" });
    const b = await sudahTersinkron({ judul: "Lain", isbn13: "9789791234567" });

    const res = await api.push({
      mutasi: [ubah(uuid(), { judul: "Hantu" }), ubah(b.bukuId, { isbn13: "9786024246945" })],
    });

    expect(res.hasil.map((h) => h.status)).toEqual(["ditolak", "ditolak"]);
    expect((await bukuDiPull(a.bukuId)).isbn13).toBe("9786024246945");
    expect((await bukuDiPull(b.bukuId)).isbn13).toBe("9789791234567");
  });

  it("idempoten: mutasi yang sama dua kali memberi hasil yang sama", async () => {
    const { bukuId } = await sudahTersinkron();
    const m = ubah(bukuId, { penerbit: "KPG" });

    const pertama = await api.push({ mutasi: [m] });
    const kedua = await api.push({ mutasi: [m] });

    expect(kedua).toEqual(pertama);
  });
});

describe("API Sinkronisasi: ubah Eksemplar dan koreksi Kategori", () => {
  const ubah = (eksemplarId: string, perubahan: Record<string, unknown>): Mutasi =>
    ({ id: uuid(), jenis: "eksemplar.ubah", eksemplarId, waktuUbah: WAKTU, perubahan }) as Mutasi;
  const koreksi = (eksemplarId: string, kategoriId: string): Mutasi => ({
    id: uuid(),
    jenis: "eksemplar.koreksiKategori",
    eksemplarId,
    kategoriId,
    waktuUbah: WAKTU,
  });

  it("mengubah data penerimaan Eksemplar dan memindahkan Lokasi", async () => {
    const rakA = await kelola.lokasi.buat({ nama: "Rak A" });
    const rakB = await kelola.lokasi.buat({ nama: "Rak B" });
    const { eksemplarId } = await sudahTersinkron({}, { lokasiId: rakA.id, harga: 1000 });

    const res = await api.push({
      mutasi: [ubah(eksemplarId, { lokasiId: rakB.id, harga: null, kondisi: "rusak", tanggalMasuk: "2025-12-24" })],
    });

    expect(res.hasil[0]).toMatchObject({ status: "diterima" });
    expect(await eksemplarDiPull(eksemplarId)).toMatchObject({
      lokasiId: rakB.id,
      harga: null,
      kondisi: "rusak",
      tanggalMasuk: "2025-12-24",
    });
  });

  it("menolak Eksemplar yang tidak ada dan Lokasi yang tidak dikenal", async () => {
    const { eksemplarId } = await sudahTersinkron();

    const res = await api.push({ mutasi: [ubah(uuid(), { harga: 1 }), ubah(eksemplarId, { lokasiId: uuid() })] });

    expect(res.hasil.map((h) => h.status)).toEqual(["ditolak", "ditolak"]);
  });

  it("koreksi Kategori mengganti Kategori tapi Nomor Induk tidak berubah, dan menandai perlu cetak", async () => {
    const { eksemplarId } = await sudahTersinkron();
    const sebelum = await eksemplarDiPull(eksemplarId);
    expect(sebelum.nomorInduk).toBe("FIK-001/2026");

    const res = await api.push({ mutasi: [koreksi(eksemplarId, KATEGORI_ID.AGM)] });

    expect(res.hasil[0]).toMatchObject({ status: "diterima" });
    expect(await eksemplarDiPull(eksemplarId)).toMatchObject({
      kategoriId: KATEGORI_ID.AGM,
      nomorInduk: "FIK-001/2026",
      perluCetak: true,
    });
  });

  it("koreksi Kategori tidak memakai ulang atau menggeser nomor urut", async () => {
    const { bukuId, eksemplarId } = await sudahTersinkron();
    await api.push({ mutasi: [koreksi(eksemplarId, KATEGORI_ID.AGM)] });

    const fik = await api.push({ mutasi: [mutasiEksemplar(bukuId, uuid(), {}, "FIK")] });
    const agm = await api.push({ mutasi: [mutasiEksemplar(bukuId, uuid(), {}, "AGM")] });

    // FIK-001 sudah terpakai (walau Eksemplarnya kini AGM); AGM mulai dari 001.
    expect(fik.hasil[0]).toMatchObject({ nomorInduk: "FIK-002/2026" });
    expect(agm.hasil[0]).toMatchObject({ nomorInduk: "AGM-001/2026" });
  });

  it("koreksi Kategori yang sama tidak menandai perlu cetak", async () => {
    const { eksemplarId } = await sudahTersinkron();
    await api.push({
      mutasi: [{ id: uuid(), jenis: "eksemplar.tandaiTercetak", eksemplarIds: [eksemplarId], waktuUbah: WAKTU }],
    });

    await api.push({ mutasi: [koreksi(eksemplarId, KATEGORI_ID.FIK)] });

    expect(await eksemplarDiPull(eksemplarId)).toMatchObject({ perluCetak: false });
  });

  it("koreksi ditolak untuk Kategori tidak dikenal atau Eksemplar yang tidak ada", async () => {
    const { eksemplarId } = await sudahTersinkron();

    const res = await api.push({ mutasi: [koreksi(eksemplarId, uuid()), koreksi(uuid(), KATEGORI_ID.AGM)] });

    expect(res.hasil.map((h) => h.status)).toEqual(["ditolak", "ditolak"]);
    expect(await eksemplarDiPull(eksemplarId)).toMatchObject({ kategoriId: KATEGORI_ID.FIK });
  });
});
