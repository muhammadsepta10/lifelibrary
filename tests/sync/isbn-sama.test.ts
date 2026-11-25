import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Mutasi } from "@/lib/sync-protocol";
import { createSyncApi } from "@/server/sync";
import { KATEGORI_ID } from "../support/mutasi";
import { createTestDb } from "../support/test-db";

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
const ISBN = "9786024246945";

const tambahBuku = (bukuId: string, judul = "Laut Bercerita"): Mutasi => ({
  id: uuid(),
  jenis: "buku.tambah",
  buku: {
    id: bukuId,
    judul,
    isbn13: ISBN,
    kontributor: [{ id: uuid(), nama: "Leila S. Chudori", peran: "pengarang", utama: true }],
  },
});
const catat = (bukuId: string, eksemplarId: string): Mutasi => ({
  id: uuid(),
  jenis: "eksemplar.catat",
  eksemplar: { id: eksemplarId, bukuId, kategoriId: KATEGORI_ID.FIK, waktuDicatat: "2026-03-14T10:00:00+07:00" },
});

describe("API Sinkronisasi: dua perangkat menambah Buku dengan ISBN yang sama", () => {
  it("Buku kedua tidak dibuat: Eksemplarnya dipasang ke Buku yang sudah ada, dan hasilnya memberi tahu id Buku yang berlaku", async () => {
    const pertama = uuid();
    await api.push({ mutasi: [tambahBuku(pertama), catat(pertama, uuid())] });
    const kedua = uuid();
    const eksemplarKedua = uuid();
    const mutasiBuku = tambahBuku(kedua);

    const res = await api.push({ mutasi: [mutasiBuku, catat(kedua, eksemplarKedua)] });

    expect(res.hasil[0]).toMatchObject({ status: "diterima", bukuId: pertama });
    expect(res.hasil[1]).toMatchObject({ status: "diterima", eksemplarId: eksemplarKedua, nomorInduk: "FIK-002/2026" });
    const pull = await api.pull(null);
    expect(pull.buku.map((b) => b.id)).toEqual([pertama]);
    expect(pull.eksemplar.map((e) => e.bukuId)).toEqual([pertama, pertama]);
  });

  it("mengirim ulang mutasi yang sama memberi hasil yang sama (idempoten)", async () => {
    const pertama = uuid();
    await api.push({ mutasi: [tambahBuku(pertama)] });
    const kedua = uuid();
    const m = tambahBuku(kedua);

    await api.push({ mutasi: [m] });
    const lagi = await api.push({ mutasi: [m] });

    expect(lagi.hasil[0]).toMatchObject({ status: "diterima", bukuId: pertama });
    expect((await api.pull(null)).buku).toHaveLength(1);
  });

  it("Eksemplar yang dikirim belakangan (batch lain) untuk id Buku lokal yang sama tetap sampai ke Buku yang ada", async () => {
    const pertama = uuid();
    await api.push({ mutasi: [tambahBuku(pertama)] });
    const kedua = uuid();
    await api.push({ mutasi: [tambahBuku(kedua)] });
    const eksemplarId = uuid();

    const res = await api.push({ mutasi: [catat(kedua, eksemplarId)] });

    expect(res.hasil[0]).toMatchObject({ status: "diterima", eksemplarId });
    expect((await api.pull(null)).eksemplar.find((e) => e.id === eksemplarId)?.bukuId).toBe(pertama);
  });

  it("perubahan Buku untuk id lokal yang digantikan mengenai Buku yang ada", async () => {
    const pertama = uuid();
    await api.push({ mutasi: [tambahBuku(pertama)] });
    const kedua = uuid();
    await api.push({ mutasi: [tambahBuku(kedua)] });

    const res = await api.push({
      mutasi: [
        { id: uuid(), jenis: "buku.ubah", bukuId: kedua, waktuUbah: "2026-03-14T11:00:00+07:00", perubahan: { penerbit: "KPG" } },
      ],
    });

    expect(res.hasil[0]).toMatchObject({ status: "diterima" });
    expect((await api.pull(null)).buku[0]).toMatchObject({ id: pertama, penerbit: "KPG" });
  });
});
