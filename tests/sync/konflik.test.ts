import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createSyncApi } from "@/server/sync";
import { buku as bukuTabel } from "@/server/db/schema";
import type { Mutasi } from "@/lib/sync-protocol";
import { createTestDb } from "../support/test-db";
import { mutasiBukuDanEksemplar } from "../support/mutasi";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let api: ReturnType<typeof createSyncApi>;

beforeEach(async () => {
  ctx = await createTestDb();
  api = createSyncApi(ctx.db);
});
afterEach(async () => {
  await ctx.close();
});

const uuid = () => crypto.randomUUID();
const T10 = "2026-03-14T10:00:00+07:00";
const T11 = "2026-03-14T11:00:00+07:00";
const T12 = "2026-03-14T12:00:00+07:00";

const ubahBuku = (bukuId: string, waktuUbah: string, perubahan: Record<string, unknown>): Mutasi =>
  ({ id: uuid(), jenis: "buku.ubah", bukuId, waktuUbah, perubahan }) as Mutasi;
const ubahEksemplar = (eksemplarId: string, waktuUbah: string, perubahan: Record<string, unknown>): Mutasi =>
  ({ id: uuid(), jenis: "eksemplar.ubah", eksemplarId, waktuUbah, perubahan }) as Mutasi;

async function sudahTersinkron() {
  const { bukuId, eksemplarId, mutasi } = mutasiBukuDanEksemplar({});
  await api.push({ mutasi });
  return { bukuId, eksemplarId };
}
const bukuDiPull = async (id: string) => (await api.pull(null)).buku.find((b) => b.id === id)!;
const eksemplarDiPull = async (id: string) => (await api.pull(null)).eksemplar.find((e) => e.id === id)!;

describe("API Sinkronisasi: konflik per field (ADR 0004)", () => {
  it("dua perangkat mengubah field berbeda pada Buku yang sama: kedua perubahan tersimpan", async () => {
    const { bukuId } = await sudahTersinkron();

    const a = await api.push({ mutasi: [ubahBuku(bukuId, T10, { penerbit: "KPG" })] });
    const b = await api.push({ mutasi: [ubahBuku(bukuId, T11, { tahun: 2017 })] });

    expect(a.hasil[0]).toEqual({ id: expect.any(String), status: "diterima" });
    expect(b.hasil[0]).toEqual({ id: expect.any(String), status: "diterima" });
    expect(await bukuDiPull(bukuId)).toMatchObject({ penerbit: "KPG", tahun: 2017 });
  });

  it("field berbeda yang terlambat tiba dengan waktu lebih lama tetap tersimpan", async () => {
    const { bukuId } = await sudahTersinkron();

    await api.push({ mutasi: [ubahBuku(bukuId, T12, { tahun: 2017 })] });
    await api.push({ mutasi: [ubahBuku(bukuId, T10, { penerbit: "KPG" })] });

    expect(await bukuDiPull(bukuId)).toMatchObject({ penerbit: "KPG", tahun: 2017 });
  });

  it("field yang sama: yang terbaru menang walau tiba lebih dulu; respons push yang kalah menyebut field yang ditimpa", async () => {
    const { bukuId } = await sudahTersinkron();

    const menang = await api.push({ mutasi: [ubahBuku(bukuId, T12, { penerbit: "Gramedia" })] });
    const kalah = await api.push({ mutasi: [ubahBuku(bukuId, T10, { penerbit: "KPG" })] });

    expect(menang.hasil[0]).not.toHaveProperty("ditimpa");
    expect(kalah.hasil[0]).toMatchObject({
      status: "diterima",
      ditimpa: [{ field: "penerbit", nilai: "Gramedia" }],
    });
    expect((await bukuDiPull(bukuId)).penerbit).toBe("Gramedia");
  });

  it("field yang sama: yang lebih baru menimpa yang lebih lama bila tiba belakangan", async () => {
    const { bukuId } = await sudahTersinkron();

    await api.push({ mutasi: [ubahBuku(bukuId, T10, { penerbit: "KPG" })] });
    const baru = await api.push({ mutasi: [ubahBuku(bukuId, T12, { penerbit: "Gramedia" })] });

    expect(baru.hasil[0]).not.toHaveProperty("ditimpa");
    expect((await bukuDiPull(bukuId)).penerbit).toBe("Gramedia");
  });

  it("satu mutasi bisa menang di satu field dan kalah di field lain", async () => {
    const { bukuId } = await sudahTersinkron();
    await api.push({ mutasi: [ubahBuku(bukuId, T12, { penerbit: "Gramedia" })] });

    const res = await api.push({ mutasi: [ubahBuku(bukuId, T10, { penerbit: "KPG", tahun: 2017 })] });

    expect(res.hasil[0]).toMatchObject({ ditimpa: [{ field: "penerbit", nilai: "Gramedia" }] });
    expect(await bukuDiPull(bukuId)).toMatchObject({ penerbit: "Gramedia", tahun: 2017 });
  });

  it("field yang kalah tapi nilainya sama dengan server tidak dilaporkan sebagai ditimpa", async () => {
    const { bukuId } = await sudahTersinkron();
    await api.push({ mutasi: [ubahBuku(bukuId, T12, { penerbit: "KPG" })] });

    const res = await api.push({ mutasi: [ubahBuku(bukuId, T10, { penerbit: "KPG" })] });

    expect(res.hasil[0]).not.toHaveProperty("ditimpa");
  });

  it("field yang belum pernah diubah dianggap berwaktu paling awal: perubahan apa pun menang", async () => {
    const { bukuId } = await sudahTersinkron();

    const res = await api.push({ mutasi: [ubahBuku(bukuId, "1999-01-01T00:00:00+07:00", { penerbit: "KPG" })] });

    expect(res.hasil[0]).not.toHaveProperty("ditimpa");
    expect((await bukuDiPull(bukuId)).penerbit).toBe("KPG");
  });

  it("waktu dibandingkan sebagai waktu mutlak, bukan teks (zona perangkat berbeda)", async () => {
    const { bukuId } = await sudahTersinkron();
    // 10:00+07:00 = 03:00Z, lebih awal daripada 05:00Z walau teksnya "lebih besar".
    await api.push({ mutasi: [ubahBuku(bukuId, "2026-03-14T05:00:00Z", { penerbit: "Gramedia" })] });

    const res = await api.push({ mutasi: [ubahBuku(bukuId, T10, { penerbit: "KPG" })] });

    expect(res.hasil[0]).toMatchObject({ ditimpa: [{ field: "penerbit", nilai: "Gramedia" }] });
  });

  it("Kontributor diperlakukan sebagai satu field: yang kalah dikembalikan dengan nilai server", async () => {
    const { bukuId } = await sudahTersinkron();
    const kontributor = (nama: string) => [{ id: uuid(), nama, peran: "pengarang", utama: true }];
    await api.push({ mutasi: [ubahBuku(bukuId, T12, { kontributor: kontributor("Pramoedya Ananta Toer") })] });

    const res = await api.push({ mutasi: [ubahBuku(bukuId, T10, { kontributor: kontributor("Tere Liye") })] });

    expect(res.hasil[0]).toMatchObject({
      ditimpa: [{ field: "kontributor", nilai: [{ nama: "Pramoedya Ananta Toer", peran: "pengarang", utama: true }] }],
    });
    expect((await bukuDiPull(bukuId)).kontributor.map((k) => k.nama)).toEqual(["Pramoedya Ananta Toer"]);
  });

  it("Eksemplar: field berbeda bergabung, field sama dimenangkan yang terbaru", async () => {
    const { eksemplarId } = await sudahTersinkron();

    await api.push({ mutasi: [ubahEksemplar(eksemplarId, T12, { kondisi: "baik" })] });
    const res = await api.push({
      mutasi: [ubahEksemplar(eksemplarId, T10, { kondisi: "rusak", asal: "hadiah" })],
    });

    expect(res.hasil[0]).toMatchObject({ ditimpa: [{ field: "kondisi", nilai: "baik" }] });
    expect(await eksemplarDiPull(eksemplarId)).toMatchObject({ kondisi: "baik", asal: "hadiah" });
  });

  it("koreksi Kategori yang lebih lama kalah dari koreksi yang lebih baru", async () => {
    const { eksemplarId } = await sudahTersinkron();
    const kategori = (await api.pull(null)).kategori;
    const [satu, dua] = kategori.filter((k) => k.kode !== "FIK").slice(0, 2);
    const koreksi = (waktuUbah: string, kategoriId: string): Mutasi => ({
      id: uuid(),
      jenis: "eksemplar.koreksiKategori",
      eksemplarId,
      kategoriId,
      waktuUbah,
    });

    await api.push({ mutasi: [koreksi(T12, satu.id)] });
    const res = await api.push({ mutasi: [koreksi(T10, dua.id)] });

    expect(res.hasil[0]).toMatchObject({ status: "diterima", ditimpa: [{ field: "kategoriId", nilai: satu.id }] });
    expect((await eksemplarDiPull(eksemplarId)).kategoriId).toBe(satu.id);
  });

  it("mutasi yang kalah seluruhnya tidak mengubah Buku maupun kursor pull", async () => {
    const { bukuId } = await sudahTersinkron();
    await api.push({ mutasi: [ubahBuku(bukuId, T12, { penerbit: "Gramedia" })] });
    const { kursor } = await api.pull(null);

    await api.push({ mutasi: [ubahBuku(bukuId, T10, { penerbit: "KPG" })] });

    const sesudah = await api.pull(kursor);
    expect(sesudah.buku).toEqual([]);
    expect(sesudah.kursor).toBe(kursor);
  });
});

describe("API Sinkronisasi: mutasi ditolak bisa dicoba lagi", () => {
  it("mutasi yang ditolak lalu dikirim ulang dengan id sama diproses ulang, bukan diulang hasil lamanya", async () => {
    const { bukuId, eksemplarId, mutasi } = mutasiBukuDanEksemplar({});
    const [tambahBuku, catat] = mutasi;
    // Eksemplar tiba sebelum Bukunya: ditolak.
    const pertama = await api.push({ mutasi: [catat] });
    expect(pertama.hasil[0]).toMatchObject({ status: "ditolak" });

    await api.push({ mutasi: [tambahBuku] });
    const ulang = await api.push({ mutasi: [catat] });

    expect(ulang.hasil[0]).toMatchObject({ status: "diterima", nomorInduk: "FIK-001/2026", eksemplarId });
    expect((await eksemplarDiPull(eksemplarId)).bukuId).toBe(bukuId);
  });
});

describe("API Sinkronisasi: kursor pull", () => {
  it("pull dengan kursor hanya mengembalikan perubahan baru", async () => {
    const { bukuId } = await sudahTersinkron();
    const { kursor } = await api.pull(null);

    expect(await api.pull(kursor)).toMatchObject({ buku: [], eksemplar: [], kursor });

    await api.push({ mutasi: [ubahBuku(bukuId, T10, { penerbit: "KPG" })] });
    const baru = await api.pull(kursor);
    expect(baru.buku.map((b) => b.id)).toEqual([bukuId]);
    expect(baru.eksemplar).toEqual([]);
  });

  it("baris yang ditulis pada milidetik yang sama dengan kursor tidak terlewat", async () => {
    const satu = mutasiBukuDanEksemplar({ judul: "Satu" });
    await api.push({ mutasi: satu.mutasi });
    const { kursor } = await api.pull(null);
    expect(kursor).toBeTruthy();
    const waktuKursor = new Date(kursor!.split("~")[0]);

    // Buku lain tiba pada milidetik yang persis sama dengan baris terakhir yang sudah terbaca.
    const dua = mutasiBukuDanEksemplar({ judul: "Dua" });
    await api.push({ mutasi: dua.mutasi });
    await ctx.db.update(bukuTabel).set({ updatedAt: waktuKursor }).where(eq(bukuTabel.id, dua.bukuId));

    const baru = await api.pull(kursor);
    expect(baru.buku.map((b) => b.id)).toEqual([dua.bukuId]);
    // dan kursor berikutnya tidak mengulang keduanya
    expect(await api.pull(baru.kursor)).toMatchObject({ buku: [], eksemplar: [] });
  });
});
