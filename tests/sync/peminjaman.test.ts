import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KelolaDitolakError } from "@/lib/kelola-protocol";
import type { Mutasi } from "@/lib/sync-protocol";
import { createPenyianganApi } from "@/server/penyiangan";
import { createSyncApi } from "@/server/sync";
import { createTestDb } from "../support/test-db";
import { mutasiBukuDanEksemplar, mutasiPinjam } from "../support/mutasi";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let sync: ReturnType<typeof createSyncApi>;

beforeEach(async () => {
  ctx = await createTestDb();
  sync = createSyncApi(ctx.db);
});
afterEach(async () => {
  await ctx.close();
});

async function eksemplarBaru() {
  const { eksemplarId, bukuId, mutasi } = mutasiBukuDanEksemplar({});
  await sync.push({ mutasi });
  return { eksemplarId, bukuId };
}

const satu = async (m: Mutasi) => (await sync.push({ mutasi: [m] })).hasil[0];

describe("API Sinkronisasi: Peminjaman", () => {
  it("menerima pinjam dan kembali, dan perangkat lain menerima Peminjam dan Peminjamannya lewat pull", async () => {
    const { eksemplarId } = await eksemplarBaru();
    const pinjam = mutasiPinjam({ eksemplarId, nama: "Rina", kontak: "081234567890" });

    expect(await satu(pinjam)).toMatchObject({ status: "diterima" });
    const kembali: Mutasi = {
      id: crypto.randomUUID(),
      jenis: "peminjaman.ubah",
      peminjamanId: pinjam.peminjaman.id,
      waktuUbah: "2026-12-01T10:00:00+07:00",
      perubahan: { tanggalKembali: "2026-12-01" },
    };
    expect(await satu(kembali)).toMatchObject({ status: "diterima" });

    const tarik = await sync.pull(null);
    expect(tarik.peminjam).toEqual([{ id: pinjam.peminjam.id, nama: "Rina", kontak: "081234567890" }]);
    expect(tarik.peminjaman).toEqual([
      {
        id: pinjam.peminjaman.id,
        eksemplarId,
        peminjamId: pinjam.peminjam.id,
        tanggalPinjam: "2026-11-25",
        jatuhTempo: "2026-12-09",
        tanggalKembali: "2026-12-01",
      },
    ]);
  });

  it("Eksemplar yang sedang dipinjam tidak bisa dipinjamkan lagi, sampai dikembalikan", async () => {
    const { eksemplarId } = await eksemplarBaru();
    const pertama = mutasiPinjam({ eksemplarId, nama: "Rina" });
    await satu(pertama);

    const kedua = await satu(mutasiPinjam({ eksemplarId, nama: "Budi" }));
    expect(kedua).toMatchObject({ status: "ditolak", alasan: expect.stringContaining("sedang dipinjam oleh Rina") });
    expect((await sync.pull(null)).peminjaman).toHaveLength(1);

    await satu({
      id: crypto.randomUUID(),
      jenis: "peminjaman.ubah",
      peminjamanId: pertama.peminjaman.id,
      waktuUbah: "2026-12-01T10:00:00+07:00",
      perubahan: { tanggalKembali: "2026-12-01" },
    });
    expect(await satu(mutasiPinjam({ eksemplarId, nama: "Budi" }))).toMatchObject({ status: "diterima" });
  });

  it("dua perangkat yang meminjamkan Eksemplar yang sama bersamaan: tepat satu yang berhasil", async () => {
    const { eksemplarId } = await eksemplarBaru();
    const a = mutasiPinjam({ eksemplarId, nama: "Rina" });
    const b = mutasiPinjam({ eksemplarId, nama: "Budi" });

    const [hasilA, hasilB] = await Promise.all([
      sync.push({ mutasi: [a] }),
      sync.push({ mutasi: [b] }),
    ]);

    const status = [hasilA.hasil[0].status, hasilB.hasil[0].status].sort();
    expect(status).toEqual(["diterima", "ditolak"]);
    expect((await sync.pull(null)).peminjaman!.filter((p) => p.tanggalKembali === null)).toHaveLength(1);
  });

  it("mengirim ulang mutasi yang sama (idempoten) tidak membuat Peminjaman kedua dan tetap diterima", async () => {
    const { eksemplarId } = await eksemplarBaru();
    const pinjam = mutasiPinjam({ eksemplarId });

    const pertama = await satu(pinjam);
    const ulang = await satu(pinjam);
    // Peminjaman yang sama dengan id mutasi baru (mis. Coba lagi setelah respons hilang).
    const idBaru = await satu({ ...pinjam, id: crypto.randomUUID() });

    expect(pertama.status).toBe("diterima");
    expect(ulang).toEqual(pertama);
    expect(idBaru.status).toBe("diterima");
    expect((await sync.pull(null)).peminjaman).toHaveLength(1);
  });

  it("menolak Eksemplar yang tidak dikenal dan jatuh tempo sebelum tanggal pinjam", async () => {
    expect(await satu(mutasiPinjam({ eksemplarId: crypto.randomUUID() }))).toMatchObject({
      status: "ditolak",
      alasan: expect.stringContaining("Eksemplar tidak ditemukan"),
    });
    const { eksemplarId } = await eksemplarBaru();
    expect(
      await satu(mutasiPinjam({ eksemplarId, tanggalPinjam: "2026-11-25", jatuhTempo: "2026-11-01" })),
    ).toMatchObject({ status: "ditolak" });
    // Penolakan tidak meninggalkan Peminjam yatim.
    expect((await sync.pull(null)).peminjam ?? []).toEqual([]);
  });

  it("Eksemplar tanpa Nomor Induk di perangkat boleh dipinjamkan: mutasinya menyusul catat Eksemplar dalam satu kiriman", async () => {
    const { eksemplarId, mutasi } = mutasiBukuDanEksemplar({});
    const hasil = await sync.push({ mutasi: [...mutasi, mutasiPinjam({ eksemplarId })] });
    expect(hasil.hasil.map((h) => h.status)).toEqual(["diterima", "diterima", "diterima"]);
    expect((await sync.pull(null)).peminjaman).toHaveLength(1);
  });

  it("perubahan jatuh tempo: yang terbaru menang per field dan yang kalah dilaporkan ditimpa", async () => {
    const { eksemplarId } = await eksemplarBaru();
    const pinjam = mutasiPinjam({ eksemplarId });
    await satu(pinjam);
    const ubah = (jatuhTempo: string, waktuUbah: string): Mutasi => ({
      id: crypto.randomUUID(),
      jenis: "peminjaman.ubah",
      peminjamanId: pinjam.peminjaman.id,
      waktuUbah,
      perubahan: { jatuhTempo },
    });

    await satu(ubah("2026-12-30", "2026-11-28T12:00:00+07:00"));
    const kalah = await satu(ubah("2026-12-16", "2026-11-28T11:00:00+07:00"));

    expect(kalah).toMatchObject({ status: "diterima", ditimpa: [{ field: "jatuhTempo", nilai: "2026-12-30" }] });
    expect((await sync.pull(null)).peminjaman![0].jatuhTempo).toBe("2026-12-30");
  });

  it("mengoreksi kontak Peminjam", async () => {
    const { eksemplarId } = await eksemplarBaru();
    const pinjam = mutasiPinjam({ eksemplarId, kontak: "0812" });
    await satu(pinjam);

    await satu({
      id: crypto.randomUUID(),
      jenis: "peminjam.ubah",
      peminjamId: pinjam.peminjam.id,
      waktuUbah: "2026-11-26T09:00:00+07:00",
      perubahan: { kontak: "081234567890" },
    });

    expect((await sync.pull(null)).peminjam?.[0].kontak).toBe("081234567890");
  });

  it("pull berikutnya hanya membawa Peminjaman yang berubah sejak kursor", async () => {
    const { eksemplarId } = await eksemplarBaru();
    const pinjam = mutasiPinjam({ eksemplarId });
    await satu(pinjam);
    const { kursor } = await sync.pull(null);

    expect((await sync.pull(kursor)).peminjaman).toEqual([]);

    await satu({
      id: crypto.randomUUID(),
      jenis: "peminjaman.ubah",
      peminjamanId: pinjam.peminjaman.id,
      waktuUbah: "2026-12-01T10:00:00+07:00",
      perubahan: { tanggalKembali: "2026-12-01" },
    });
    expect((await sync.pull(kursor)).peminjaman).toMatchObject([{ id: pinjam.peminjaman.id, tanggalKembali: "2026-12-01" }]);
  });
});

describe("API Penyiangan: Eksemplar yang sedang dipinjam", () => {
  it("ditolak selama dipinjam, berhasil setelah dikembalikan", async () => {
    const penyiangan = createPenyianganApi(ctx.db);
    const { eksemplarId } = await eksemplarBaru();
    const pinjam = mutasiPinjam({ eksemplarId });
    await satu(pinjam);

    const gagal = penyiangan.siangi(eksemplarId, { jenis: "hilang", tanggal: "2026-12-02" });
    await expect(gagal).rejects.toBeInstanceOf(KelolaDitolakError);
    await expect(gagal).rejects.toMatchObject({ message: expect.stringContaining("sedang dipinjam") });
    expect((await sync.pull(null)).eksemplar[0].status).toBe("aktif");

    await satu({
      id: crypto.randomUUID(),
      jenis: "peminjaman.ubah",
      peminjamanId: pinjam.peminjaman.id,
      waktuUbah: "2026-12-01T10:00:00+07:00",
      perubahan: { tanggalKembali: "2026-12-01" },
    });
    await expect(penyiangan.siangi(eksemplarId, { jenis: "hilang", tanggal: "2026-12-02" })).resolves.toMatchObject({
      status: "keluar",
    });
  });

  it("Eksemplar yang sudah keluar tidak bisa dipinjamkan", async () => {
    const penyiangan = createPenyianganApi(ctx.db);
    const { eksemplarId } = await eksemplarBaru();
    await penyiangan.siangi(eksemplarId, { jenis: "rusak", tanggal: "2026-12-02" });

    expect(await satu(mutasiPinjam({ eksemplarId }))).toMatchObject({
      status: "ditolak",
      alasan: expect.stringContaining("sudah keluar"),
    });
  });
});
