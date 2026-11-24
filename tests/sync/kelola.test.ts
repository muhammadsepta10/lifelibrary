import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KelolaDitolakError } from "@/lib/kelola-protocol";
import { createKelolaApi } from "@/server/kelola";
import { createSyncApi } from "@/server/sync";
import { createTestDb } from "../support/test-db";
import { KATEGORI_ID, mutasiBukuDanEksemplar } from "../support/mutasi";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let kelola: ReturnType<typeof createKelolaApi>;
let sync: ReturnType<typeof createSyncApi>;

beforeEach(async () => {
  ctx = await createTestDb();
  kelola = createKelolaApi(ctx.db);
  sync = createSyncApi(ctx.db);
});
afterEach(async () => {
  await ctx.close();
});

const ditolak = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error("seharusnya ditolak");
    },
    (e: unknown) => {
      expect(e).toBeInstanceOf(KelolaDitolakError);
      return e as KelolaDitolakError;
    },
  );

const kategoriPull = async () => (await sync.pull(null)).kategori;

describe("Kelola Kategori", () => {
  it("Pemilik membuat Kategori dengan kode, nama, dan warna; muncul di pull", async () => {
    const dto = await kelola.kategori.buat({ kode: "NVL", nama: "Novel Terjemahan", warna: "#336699" });

    expect(dto).toMatchObject({ kode: "NVL", nama: "Novel Terjemahan", warna: "#336699", diarsipkan: false });
    expect((await kategoriPull()).find((k) => k.id === dto.id)).toMatchObject({ kode: "NVL" });
  });

  it("kode dinormalkan ke huruf besar", async () => {
    const dto = await kelola.kategori.buat({ kode: " nvl ", nama: "Novel", warna: "#336699" });
    expect(dto.kode).toBe("NVL");
  });

  it("menolak kode yang sudah dipakai Kategori aktif", async () => {
    const e = await ditolak(kelola.kategori.buat({ kode: "FIK", nama: "Fiksi Lain", warna: "#336699" }));
    expect(e).toMatchObject({ jenis: "konflik", field: "kode" });
  });

  it("menolak kode yang merusak format Nomor Induk, warna bukan #RRGGBB, dan nama kosong", async () => {
    expect(await ditolak(kelola.kategori.buat({ kode: "A/B", nama: "X", warna: "#336699" }))).toMatchObject({
      jenis: "tidak-valid",
      field: "kode",
    });
    expect(await ditolak(kelola.kategori.buat({ kode: "XYZ", nama: "X", warna: "biru" }))).toMatchObject({
      jenis: "tidak-valid",
      field: "warna",
    });
    expect(await ditolak(kelola.kategori.buat({ kode: "XYZ", nama: " ", warna: "#336699" }))).toMatchObject({
      field: "nama",
    });
  });

  it("mengubah nama, kode, dan warna; kode baru juga harus unik", async () => {
    const dto = await kelola.kategori.ubah(KATEGORI_ID.FIK, { kode: "NVL", nama: "Novel", warna: "#112233" });
    expect(dto).toMatchObject({ kode: "NVL", nama: "Novel", warna: "#112233" });

    const e = await ditolak(kelola.kategori.ubah(KATEGORI_ID.AGM, { kode: "NVL" }));
    expect(e).toMatchObject({ jenis: "konflik", field: "kode" });
  });

  it("mengubah Kategori yang tidak ada ditolak", async () => {
    const e = await ditolak(kelola.kategori.ubah(crypto.randomUUID(), { nama: "X" }));
    expect(e.jenis).toBe("tidak-ditemukan");
  });

  it("Kategori yang belum dipakai Eksemplar bisa dihapus dan hilang dari pull berikutnya sebagai penanda hapus", async () => {
    const baru = await kelola.kategori.buat({ kode: "XYZ", nama: "Sementara", warna: "#336699" });

    const hasil = await kelola.kategori.hapus(baru.id);

    expect(hasil).toMatchObject({ id: baru.id, dihapus: true });
    expect((await kategoriPull()).find((k) => k.id === baru.id)).toMatchObject({ dihapus: true });
    // Kodenya bebas dipakai lagi.
    await expect(kelola.kategori.buat({ kode: "XYZ", nama: "Lagi", warna: "#336699" })).resolves.toBeTruthy();
  });

  it("Kategori yang sudah dipakai Eksemplar tidak bisa dihapus, hanya diarsipkan", async () => {
    await sync.push({ mutasi: mutasiBukuDanEksemplar({ kode: "FIK" }).mutasi });

    const e = await ditolak(kelola.kategori.hapus(KATEGORI_ID.FIK));
    expect(e).toMatchObject({ jenis: "konflik" });
    expect(e.pesan).toMatch(/arsipkan/i);

    const arsip = await kelola.kategori.ubah(KATEGORI_ID.FIK, { diarsipkan: true });
    expect(arsip).toMatchObject({ diarsipkan: true, dihapus: false });
    expect((await kategoriPull()).find((k) => k.id === KATEGORI_ID.FIK)).toMatchObject({ diarsipkan: true });
  });

  it("kode Kategori yang diarsipkan boleh dipakai Kategori baru, tetapi memulihkannya ditolak selama kodenya bentrok", async () => {
    await kelola.kategori.ubah(KATEGORI_ID.FIK, { diarsipkan: true });
    await kelola.kategori.buat({ kode: "FIK", nama: "Fiksi Baru", warna: "#336699" });

    const e = await ditolak(kelola.kategori.ubah(KATEGORI_ID.FIK, { diarsipkan: false }));
    expect(e).toMatchObject({ jenis: "konflik", field: "kode" });

    await kelola.kategori.ubah(KATEGORI_ID.FIK, { kode: "FKS", diarsipkan: false });
    expect((await kategoriPull()).find((k) => k.id === KATEGORI_ID.FIK)).toMatchObject({
      kode: "FKS",
      diarsipkan: false,
    });
  });

  it("mengganti kode Kategori tidak mengubah Nomor Induk yang sudah ada, hanya Nomor Induk baru (ADR 0001)", async () => {
    const lama = mutasiBukuDanEksemplar({ judul: "Lama", kode: "FIK", waktuDicatat: "2026-03-14T10:00:00+07:00" });
    await sync.push({ mutasi: lama.mutasi });

    await kelola.kategori.ubah(KATEGORI_ID.FIK, { kode: "NVL" });
    const baru = mutasiBukuDanEksemplar({ judul: "Baru", kode: "FIK", waktuDicatat: "2026-03-15T10:00:00+07:00" });
    const res = await sync.push({ mutasi: baru.mutasi });

    expect(res.hasil.flatMap((h) => (h.status === "diterima" && h.nomorInduk ? [h.nomorInduk] : []))).toEqual([
      "NVL-001/2026",
    ]);
    const { eksemplar } = await sync.pull(null);
    expect(eksemplar.find((e) => e.id === lama.eksemplarId)?.nomorInduk).toBe("FIK-001/2026");
    expect(eksemplar.find((e) => e.id === baru.eksemplarId)?.nomorInduk).toBe("NVL-001/2026");
  });
});

describe("Kelola Kategori dan push dari perangkat", () => {
  it("push Eksemplar ke Kategori yang sudah dihapus ditolak, ke Kategori yang diarsipkan tetap diterima", async () => {
    const sementara = await kelola.kategori.buat({ kode: "XYZ", nama: "Sementara", warna: "#336699" });
    await kelola.kategori.hapus(sementara.id);
    const kePenghapusan = mutasiBukuDanEksemplar({ kategoriId: sementara.id });
    const res1 = await sync.push({ mutasi: kePenghapusan.mutasi });
    expect(res1.hasil[1]).toMatchObject({ status: "ditolak" });

    // Perangkat yang offline mencatat sebelum Kategori diarsipkan: catatannya sah.
    await kelola.kategori.ubah(KATEGORI_ID.AGM, { diarsipkan: true });
    const res2 = await sync.push({ mutasi: mutasiBukuDanEksemplar({ kode: "AGM" }).mutasi });
    expect(res2.hasil[1]).toMatchObject({ status: "diterima", nomorInduk: "AGM-001/2026" });
  });
});

describe("Kelola Lokasi", () => {
  it("membuat, mengubah, dan menghapus Lokasi; ketiganya sampai ke pull", async () => {
    const rakA = await kelola.lokasi.buat({ nama: "Rak A, susun 2" });
    expect(rakA).toMatchObject({ nama: "Rak A, susun 2", dihapus: false });

    await kelola.lokasi.ubah(rakA.id, { nama: "Rak A, susun 3" });
    expect((await sync.pull(null)).lokasi).toEqual([{ id: rakA.id, nama: "Rak A, susun 3", dihapus: false }]);

    await kelola.lokasi.hapus(rakA.id);
    expect((await sync.pull(null)).lokasi).toEqual([{ id: rakA.id, nama: "Rak A, susun 3", dihapus: true }]);
  });

  it("menolak nama kosong dan Lokasi yang tidak ada", async () => {
    expect(await ditolak(kelola.lokasi.buat({ nama: "  " }))).toMatchObject({ jenis: "tidak-valid", field: "nama" });
    expect((await ditolak(kelola.lokasi.ubah(crypto.randomUUID(), { nama: "X" }))).jenis).toBe("tidak-ditemukan");
    expect((await ditolak(kelola.lokasi.hapus(crypto.randomUUID()))).jenis).toBe("tidak-ditemukan");
  });

  it("Lokasi yang masih dipakai Eksemplar tidak bisa dihapus; setelah dikosongkan bisa", async () => {
    const rak = await kelola.lokasi.buat({ nama: "Rak A" });
    const { mutasi, eksemplarId } = mutasiBukuDanEksemplar({ kode: "FIK" });
    const catat = mutasi[1] as Extract<(typeof mutasi)[number], { jenis: "eksemplar.catat" }>;
    catat.eksemplar.lokasiId = rak.id;
    await sync.push({ mutasi });

    const e = await ditolak(kelola.lokasi.hapus(rak.id));
    expect(e).toMatchObject({ jenis: "konflik" });
    expect(e.pesan).toContain("1 Eksemplar");
    expect((await sync.pull(null)).lokasi).toMatchObject([{ id: rak.id, dihapus: false }]);

    await sync.push({
      mutasi: [
        {
          id: crypto.randomUUID(),
          jenis: "eksemplar.ubah",
          eksemplarId,
          waktuUbah: "2026-03-14T10:00:00+07:00",
          perubahan: { lokasiId: null },
        },
      ],
    });
    await kelola.lokasi.hapus(rak.id);
    expect((await sync.pull(null)).lokasi).toMatchObject([{ id: rak.id, dihapus: true }]);
  });

  it("pull dengan kursor hanya membawa perubahan setelahnya", async () => {
    await kelola.lokasi.buat({ nama: "Rak A" });
    const { kursor } = await sync.pull(null);
    const rakB = await kelola.lokasi.buat({ nama: "Rak B" });

    const { lokasi } = await sync.pull(kursor);

    expect(lokasi.map((l) => l.id)).toEqual([rakB.id]);
  });
});

describe("Kelola Aturan Kategori", () => {
  it("membuat aturan rentang DDC (2xx dan 155) dan kata kunci subjek dengan prioritas; sampai ke pull", async () => {
    const agama = await kelola.aturanKategori.buat({ jenis: "ddc", pola: "2xx", kategoriId: KATEGORI_ID.AGM, prioritas: 2 });
    const psikologi = await kelola.aturanKategori.buat({ jenis: "ddc", pola: "155", kategoriId: KATEGORI_ID.FIL, prioritas: 1 });
    const kataKunci = await kelola.aturanKategori.buat({ jenis: "subjek", pola: "Novel", kategoriId: KATEGORI_ID.FIK, prioritas: 3 });

    expect(agama).toMatchObject({ jenis: "ddc", pola: "2xx", kategoriId: KATEGORI_ID.AGM, prioritas: 2, dihapus: false });
    expect(psikologi).toMatchObject({ pola: "155", prioritas: 1 });
    expect(kataKunci).toMatchObject({ jenis: "subjek", pola: "Novel", prioritas: 3 });
    expect((await sync.pull(null)).aturanKategori.map((a) => a.id).sort()).toEqual(
      [agama.id, psikologi.id, kataKunci.id].sort(),
    );
  });

  it("pola DDC dinormalkan ke huruf kecil dan hanya menerima tiga digit atau x (2xx, 15x, 155)", async () => {
    const dto = await kelola.aturanKategori.buat({ jenis: "ddc", pola: " 2XX ", kategoriId: KATEGORI_ID.AGM, prioritas: 1 });
    expect(dto.pola).toBe("2xx");
    await expect(
      kelola.aturanKategori.buat({ jenis: "ddc", pola: "15x", kategoriId: KATEGORI_ID.FIL, prioritas: 1 }),
    ).resolves.toBeTruthy();

    for (const pola of ["25", "abc", "155.24", "xxx", "1x5", "2xxx"]) {
      const e = await ditolak(kelola.aturanKategori.buat({ jenis: "ddc", pola, kategoriId: KATEGORI_ID.AGM, prioritas: 1 }));
      expect(e, pola).toMatchObject({ jenis: "tidak-valid", field: "pola" });
    }
  });

  it("menolak pola kosong, prioritas di luar 1–999, dan Kategori yang tidak ada, sudah diarsipkan, atau sudah dihapus", async () => {
    const dasar = { jenis: "subjek", pola: "novel", kategoriId: KATEGORI_ID.FIK, prioritas: 1 } as const;
    expect(await ditolak(kelola.aturanKategori.buat({ ...dasar, pola: " " }))).toMatchObject({ field: "pola" });
    expect(await ditolak(kelola.aturanKategori.buat({ ...dasar, prioritas: 0 }))).toMatchObject({ field: "prioritas" });
    expect(await ditolak(kelola.aturanKategori.buat({ ...dasar, prioritas: 1.5 }))).toMatchObject({ field: "prioritas" });
    expect(await ditolak(kelola.aturanKategori.buat({ ...dasar, kategoriId: crypto.randomUUID() }))).toMatchObject({
      field: "kategoriId",
    });

    await kelola.kategori.ubah(KATEGORI_ID.AGM, { diarsipkan: true });
    expect(await ditolak(kelola.aturanKategori.buat({ ...dasar, kategoriId: KATEGORI_ID.AGM }))).toMatchObject({
      field: "kategoriId",
    });
    const sementara = await kelola.kategori.buat({ kode: "XYZ", nama: "Sementara", warna: "#336699" });
    await kelola.kategori.hapus(sementara.id);
    expect(await ditolak(kelola.aturanKategori.buat({ ...dasar, kategoriId: sementara.id }))).toMatchObject({
      field: "kategoriId",
    });
  });

  it("mengubah pola, Kategori, dan prioritas; pola baru diperiksa menurut jenis aturan", async () => {
    const ddc = await kelola.aturanKategori.buat({ jenis: "ddc", pola: "2xx", kategoriId: KATEGORI_ID.AGM, prioritas: 5 });

    const diubah = await kelola.aturanKategori.ubah(ddc.id, { pola: "29x", kategoriId: KATEGORI_ID.FIL, prioritas: 1 });
    expect(diubah).toMatchObject({ jenis: "ddc", pola: "29x", kategoriId: KATEGORI_ID.FIL, prioritas: 1 });

    expect(await ditolak(kelola.aturanKategori.ubah(ddc.id, { pola: "agama" }))).toMatchObject({ field: "pola" });
    expect((await ditolak(kelola.aturanKategori.ubah(crypto.randomUUID(), { prioritas: 1 }))).jenis).toBe(
      "tidak-ditemukan",
    );
  });

  it("menghapus aturan; perangkat menerimanya sebagai penanda hapus", async () => {
    const a = await kelola.aturanKategori.buat({ jenis: "subjek", pola: "novel", kategoriId: KATEGORI_ID.FIK, prioritas: 1 });

    await kelola.aturanKategori.hapus(a.id);

    expect((await sync.pull(null)).aturanKategori).toMatchObject([{ id: a.id, dihapus: true }]);
    expect((await ditolak(kelola.aturanKategori.hapus(a.id))).jenis).toBe("tidak-ditemukan");
  });

  it("menghapus Kategori ikut menghapus Aturan Kategori yang menunjuknya", async () => {
    const sementara = await kelola.kategori.buat({ kode: "XYZ", nama: "Sementara", warna: "#336699" });
    const a = await kelola.aturanKategori.buat({ jenis: "subjek", pola: "xyz", kategoriId: sementara.id, prioritas: 1 });

    await kelola.kategori.hapus(sementara.id);

    expect((await sync.pull(null)).aturanKategori).toMatchObject([{ id: a.id, dihapus: true }]);
  });
});
