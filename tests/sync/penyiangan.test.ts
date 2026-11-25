import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KelolaDitolakError } from "@/lib/kelola-protocol";
import { createKelolaApi } from "@/server/kelola";
import { createPenyianganApi } from "@/server/penyiangan";
import { createSyncApi } from "@/server/sync";
import { createTestDb } from "../support/test-db";
import { mutasiBukuDanEksemplar } from "../support/mutasi";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let sync: ReturnType<typeof createSyncApi>;
let penyiangan: ReturnType<typeof createPenyianganApi>;

beforeEach(async () => {
  ctx = await createTestDb();
  sync = createSyncApi(ctx.db);
  penyiangan = createPenyianganApi(ctx.db);
});
afterEach(async () => {
  await ctx.close();
});

/** Satu Buku + Eksemplar baru yang sudah tersinkron. */
async function eksemplarBaru(opts: { kode?: string; waktuDicatat?: string; judul?: string } = {}) {
  const { eksemplarId, bukuId, mutasi } = mutasiBukuDanEksemplar(opts);
  const res = await sync.push({ mutasi });
  const nomorInduk = res.hasil.find((h) => h.status === "diterima" && h.nomorInduk)!;
  return { eksemplarId, bukuId, nomorInduk: (nomorInduk as { nomorInduk: string }).nomorInduk };
}

const di = async (id: string) => (await sync.pull(null)).eksemplar.find((e) => e.id === id)!;

describe("API Penyiangan", () => {
  it("menyimpan jenis, tanggal, dan alasan; Eksemplar tidak dihapus dan Nomor Induknya tetap", async () => {
    const { eksemplarId, nomorInduk } = await eksemplarBaru();

    const hasil = await penyiangan.siangi(eksemplarId, {
      jenis: "hilang",
      tanggal: "2026-05-02",
      alasan: "Dipinjam teman, tidak kembali",
    });

    expect(hasil).toMatchObject({
      id: eksemplarId,
      status: "keluar",
      nomorInduk,
      penyiangan: { jenis: "hilang", tanggal: "2026-05-02", alasan: "Dipinjam teman, tidak kembali" },
    });
    expect(await di(eksemplarId)).toMatchObject({ status: "keluar", nomorInduk });
  });

  it("alasan boleh kosong; jenis dan tanggal wajib dan harus benar", async () => {
    const { eksemplarId } = await eksemplarBaru();

    await expect(penyiangan.siangi(eksemplarId, { jenis: "rusak", tanggal: "2026-13-40" })).rejects.toMatchObject({
      field: "tanggal",
    });
    await expect(
      penyiangan.siangi(eksemplarId, { jenis: "dicuri" as never, tanggal: "2026-05-02" }),
    ).rejects.toMatchObject({ field: "jenis" });
    expect((await di(eksemplarId)).status).toBe("aktif");

    const hasil = await penyiangan.siangi(eksemplarId, { jenis: "rusak", tanggal: "2026-05-02" });
    expect(hasil.penyiangan).toEqual({ jenis: "rusak", tanggal: "2026-05-02", alasan: null });
  });

  it("menolak Eksemplar yang tidak ada dan yang sudah keluar, tanpa mengubah catatan pertama", async () => {
    const { eksemplarId } = await eksemplarBaru();
    await expect(
      penyiangan.siangi(crypto.randomUUID(), { jenis: "hilang", tanggal: "2026-05-02" }),
    ).rejects.toMatchObject({ jenis: "tidak-ditemukan" });

    await penyiangan.siangi(eksemplarId, { jenis: "dijual", tanggal: "2026-05-02", alasan: "Dijual ke Rina" });
    const kedua = penyiangan.siangi(eksemplarId, { jenis: "hilang", tanggal: "2026-06-01" });

    await expect(kedua).rejects.toBeInstanceOf(KelolaDitolakError);
    await expect(kedua).rejects.toMatchObject({ jenis: "konflik" });
    expect((await di(eksemplarId)).penyiangan).toEqual({
      jenis: "dijual",
      tanggal: "2026-05-02",
      alasan: "Dijual ke Rina",
    });
  });

  it("sampai ke perangkat lain lewat pull berikutnya", async () => {
    const { eksemplarId } = await eksemplarBaru();
    const { kursor } = await sync.pull(null);

    await penyiangan.siangi(eksemplarId, { jenis: "dihibahkan", tanggal: "2026-05-02" });

    const berikutnya = await sync.pull(kursor);
    expect(berikutnya.eksemplar).toHaveLength(1);
    expect(berikutnya.eksemplar[0]).toMatchObject({ id: eksemplarId, status: "keluar" });
  });

  it("Eksemplar aktif punya penyiangan null di pull", async () => {
    const { eksemplarId } = await eksemplarBaru();
    expect((await di(eksemplarId)).penyiangan).toBeNull();
  });

  it("Lokasi yang hanya dipakai Eksemplar keluar boleh dihapus", async () => {
    const kelola = createKelolaApi(ctx.db);
    const lokasi = await kelola.lokasi.buat({ nama: "Rak A" });
    const { mutasi, eksemplarId } = mutasiBukuDanEksemplar({});
    const catat = mutasi[1] as { eksemplar: { lokasiId?: string } };
    catat.eksemplar.lokasiId = lokasi.id;
    await sync.push({ mutasi });
    await expect(kelola.lokasi.hapus(lokasi.id)).rejects.toMatchObject({ jenis: "konflik" });

    await penyiangan.siangi(eksemplarId, { jenis: "rusak", tanggal: "2026-05-02" });

    await expect(kelola.lokasi.hapus(lokasi.id)).resolves.toMatchObject({ dihapus: true });
  });
});

describe("Nomor Induk Eksemplar yang keluar tidak dipakai ulang (seam API Sinkronisasi)", () => {
  it("Eksemplar berikutnya di Kategori dan tahun yang sama mendapat nomor baru, bukan nomor yang keluar", async () => {
    const a = await eksemplarBaru({ kode: "FIK" });
    const b = await eksemplarBaru({ kode: "FIK" });
    expect([a.nomorInduk, b.nomorInduk]).toEqual(["FIK-001/2026", "FIK-002/2026"]);

    // Yang terakhir keluar: penghitung tidak boleh mundur.
    await penyiangan.siangi(b.eksemplarId, { jenis: "hilang", tanggal: "2026-05-02" });
    const c = await eksemplarBaru({ kode: "FIK" });
    expect(c.nomorInduk).toBe("FIK-003/2026");

    // Yang pertama keluar: nomornya tidak diisi ulang.
    await penyiangan.siangi(a.eksemplarId, { jenis: "rusak", tanggal: "2026-05-03" });
    const d = await eksemplarBaru({ kode: "FIK" });
    expect(d.nomorInduk).toBe("FIK-004/2026");

    const semua = (await sync.pull(null)).eksemplar.map((e) => e.nomorInduk).sort();
    expect(semua).toEqual(["FIK-001/2026", "FIK-002/2026", "FIK-003/2026", "FIK-004/2026"]);
  });

  it("semua Eksemplar sebuah Kategori keluar: nomor berikutnya tetap melanjutkan", async () => {
    const a = await eksemplarBaru({ kode: "AGM" });
    await penyiangan.siangi(a.eksemplarId, { jenis: "dijual", tanggal: "2026-05-02" });

    const b = await eksemplarBaru({ kode: "AGM" });

    expect(b.nomorInduk).toBe("AGM-002/2026");
  });
});
