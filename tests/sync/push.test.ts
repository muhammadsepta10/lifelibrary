import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSyncApi } from "@/server/sync";
import { createTestDb } from "../support/test-db";
import { KATEGORI_ID, mutasiBukuDanEksemplar } from "../support/mutasi";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let api: ReturnType<typeof createSyncApi>;

beforeEach(async () => {
  ctx = await createTestDb();
  api = createSyncApi(ctx.db);
});
afterEach(async () => {
  vi.useRealTimers();
  await ctx.close();
});

function nomorIndukDari(hasil: Awaited<ReturnType<typeof api.push>>) {
  return hasil.hasil.flatMap((h) => (h.status === "diterima" && h.nomorInduk ? [h.nomorInduk] : []));
}

describe("API Sinkronisasi: push", () => {
  it("memberi Nomor Induk {KODE}-{urut 3 digit}/{tahun} saat Eksemplar tersinkron", async () => {
    const { mutasi } = mutasiBukuDanEksemplar({ kode: "FIK", waktuDicatat: "2026-03-14T10:00:00+07:00" });

    const res = await api.push({ mutasi });

    expect(nomorIndukDari(res)).toEqual(["FIK-001/2026"]);
  });

  it("dua perangkat yang push Eksemplar Kategori sama bersamaan mendapat nomor berurutan tanpa bentrok", async () => {
    const perangkatA = mutasiBukuDanEksemplar({ judul: "Buku A", kode: "FIK" });
    const perangkatB = mutasiBukuDanEksemplar({ judul: "Buku B", kode: "FIK" });
    const perangkatC = mutasiBukuDanEksemplar({ judul: "Buku C", kode: "FIK" });

    const hasil = await Promise.all([
      api.push({ mutasi: perangkatA.mutasi }),
      api.push({ mutasi: perangkatB.mutasi }),
      api.push({ mutasi: perangkatC.mutasi }),
    ]);

    const nomor = hasil.flatMap(nomorIndukDari).sort();
    expect(nomor).toEqual(["FIK-001/2026", "FIK-002/2026", "FIK-003/2026"]);
  });

  it("nomor urut dihitung terpisah per Kategori", async () => {
    const fik = mutasiBukuDanEksemplar({ kode: "FIK" });
    const agm = mutasiBukuDanEksemplar({ kode: "AGM" });

    const res = await api.push({ mutasi: [...fik.mutasi, ...agm.mutasi] });

    expect(nomorIndukDari(res)).toEqual(["FIK-001/2026", "AGM-001/2026"]);
  });

  it("push dengan id mutasi yang sama dua kali tidak menggandakan data (idempoten)", async () => {
    const { mutasi, eksemplarId } = mutasiBukuDanEksemplar({ kode: "FIK" });

    const pertama = await api.push({ mutasi });
    const kedua = await api.push({ mutasi });

    expect(nomorIndukDari(pertama)).toEqual(["FIK-001/2026"]);
    expect(nomorIndukDari(kedua)).toEqual(["FIK-001/2026"]);

    const pull = await api.pull(null);
    expect(pull.eksemplar.filter((e) => e.id === eksemplarId)).toHaveLength(1);
    expect(pull.buku).toHaveLength(1);

    // Eksemplar berikutnya melanjutkan urutan: tidak ada nomor yang terbuang.
    const berikutnya = await api.push({ mutasi: mutasiBukuDanEksemplar({ kode: "FIK" }).mutasi });
    expect(nomorIndukDari(berikutnya)).toEqual(["FIK-002/2026"]);
  });

  it("Eksemplar yang sama dengan id mutasi baru tidak mendapat Nomor Induk kedua", async () => {
    const { mutasi } = mutasiBukuDanEksemplar({ kode: "FIK" });
    await api.push({ mutasi });

    const ulang = mutasi.map((m) => ({ ...m, id: crypto.randomUUID() }));
    const res = await api.push({ mutasi: ulang });

    expect(nomorIndukDari(res)).toEqual(["FIK-001/2026"]);
  });

  it("tahun diambil dari waktu pencatatan di perangkat, bukan waktu server (31 Des dicatat, 2 Jan tersinkron)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-01-02T03:00:00Z"));
    const { mutasi } = mutasiBukuDanEksemplar({ kode: "FIK", waktuDicatat: "2026-12-31T23:30:00+07:00" });

    const res = await api.push({ mutasi });

    expect(nomorIndukDari(res)).toEqual(["FIK-001/2026"]);
  });

  it("tahun pencatatan memakai tahun lokal perangkat walau UTC sudah ganti tahun", async () => {
    // 1 Jan 2027 03:00 WIB = 31 Des 2026 20:00 UTC; perangkat di WIB mencatat 2027.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T20:00:00Z"));
    const { mutasi } = mutasiBukuDanEksemplar({ kode: "FIK", waktuDicatat: "2027-01-01T03:00:00+07:00" });

    const res = await api.push({ mutasi });

    expect(nomorIndukDari(res)).toEqual(["FIK-001/2027"]);
  });

  it("nomor urut melebar bila lebih dari 999", async () => {
    // Seed penghitung supaya tidak perlu mengirim 1000 Eksemplar.
    const { sql } = await import("drizzle-orm");
    await ctx.db.execute(sql`insert into nomor_induk_counter (kode, tahun, last) values ('FIK', 2026, 999)`);

    const res = await api.push({ mutasi: mutasiBukuDanEksemplar({ kode: "FIK" }).mutasi });

    expect(nomorIndukDari(res)).toEqual(["FIK-1000/2026"]);
  });

  it("menolak Eksemplar dengan Kategori yang tidak dikenal", async () => {
    const { mutasi } = mutasiBukuDanEksemplar({ kode: "FIK" });
    const rusak = mutasi.map((m) =>
      m.jenis === "eksemplar.catat"
        ? { ...m, eksemplar: { ...m.eksemplar, kategoriId: crypto.randomUUID() } }
        : m,
    );

    const res = await api.push({ mutasi: rusak });

    const eks = res.hasil[1];
    expect(eks.status).toBe("ditolak");
    expect((await api.pull(null)).eksemplar).toHaveLength(0);
  });

  it("pull sejak kursor hanya mengembalikan perubahan baru", async () => {
    await api.push({ mutasi: mutasiBukuDanEksemplar({ judul: "Satu" }).mutasi });
    const awal = await api.pull(null);
    expect(awal.eksemplar).toHaveLength(1);
    expect(awal.kategori).toHaveLength(12);

    const kosong = await api.pull(awal.kursor);
    expect(kosong.eksemplar).toHaveLength(0);
    expect(kosong.buku).toHaveLength(0);

    await api.push({ mutasi: mutasiBukuDanEksemplar({ judul: "Dua" }).mutasi });
    const baru = await api.pull(awal.kursor);
    expect(baru.buku.map((b) => b.judul)).toEqual(["Dua"]);
    expect(baru.eksemplar.map((e) => e.nomorInduk)).toEqual(["FIK-002/2026"]);
  });

  it("preset Kategori tersedia untuk perangkat: 10 kelas DDC + Fiksi + Anak", async () => {
    const { kategori } = await api.pull(null);
    expect(kategori.map((k) => k.kode).sort()).toEqual(
      ["AGM", "ANK", "BHS", "FIK", "FIL", "SAS", "SEJ", "SNI", "SNS", "SOS", "TEK", "UMM"].sort(),
    );
    expect(kategori.every((k) => /^#[0-9A-F]{6}$/i.test(k.warna))).toBe(true);
    expect(KATEGORI_ID.FIK).toBeDefined();
  });
});
