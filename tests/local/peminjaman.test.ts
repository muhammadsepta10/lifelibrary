import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { createLocalLibrary, ValidasiError, type LocalLibrary } from "@/lib/local-library";
import { bukuKosong } from "@/lib/local-library/db";
import type { PullResponse, SyncTransport } from "@/lib/sync-protocol";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;

let jam: Date;
let lib: LocalLibrary;
let eksemplarId: string;

beforeEach(async () => {
  jam = new Date(2026, 10, 25, 9, 0, 0, 0);
  lib = createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}`, now: () => jam });
  ({ eksemplarId } = await lib.tambahBuku({
    judul: "Laut Bercerita",
    kontributor: [{ nama: "Leila S. Chudori", utama: true }],
    eksemplar: { kategoriId: FIK.id },
  }));
});

const statusKoleksi = async () => (await lib.daftarKoleksi())[0];

const kosong: PullResponse = {
  kursor: null,
  kategori: [],
  lokasi: [],
  aturanKategori: [],
  templateLabel: null,
  buku: [],
  eksemplar: [],
};

/** Server yang menerima semuanya dan memberi Nomor Induk pada Eksemplar baru. */
const terimaSemua = (): SyncTransport => ({
  push: async ({ mutasi }) => ({
    hasil: mutasi.map((m) =>
      m.jenis === "eksemplar.catat"
        ? { id: m.id, status: "diterima" as const, eksemplarId: m.eksemplar.id, nomorInduk: "FIK-001/2026" }
        : { id: m.id, status: "diterima" as const },
    ),
  }),
  pull: async () => kosong,
});

describe("Perpustakaan Lokal: Peminjaman", () => {
  it("meminjamkan Eksemplar ke Peminjam baru mengubah statusnya menjadi dipinjam, mengembalikannya membuatnya tersedia lagi", async () => {
    expect((await statusKoleksi()).dipinjam).toBe(false);

    const { peminjamanId } = await lib.pinjamkan({
      eksemplarId,
      peminjam: { nama: "Rina", kontak: "081234567890" },
      jatuhTempo: "2026-12-09",
    });

    expect((await statusKoleksi()).dipinjam).toBe(true);
    expect(await lib.cariKoleksi({ status: "dipinjam" })).toHaveLength(1);
    expect(await lib.cariKoleksi({ status: "tersedia" })).toHaveLength(0);

    await lib.kembalikan(peminjamanId);

    expect((await statusKoleksi()).dipinjam).toBe(false);
    expect(await lib.cariKoleksi({ status: "tersedia" })).toHaveLength(1);
  });

  it("Eksemplar yang sedang dipinjam tidak bisa dipinjamkan lagi, ke Peminjam yang sama maupun lain", async () => {
    const { peminjamanId } = await lib.pinjamkan({
      eksemplarId,
      peminjam: { nama: "Rina" },
      jatuhTempo: "2026-12-09",
    });

    const lagi = lib.pinjamkan({ eksemplarId, peminjam: { nama: "Budi" }, jatuhTempo: "2026-12-10" });
    await expect(lagi).rejects.toBeInstanceOf(ValidasiError);
    await expect(lagi).rejects.toMatchObject({ pesan: expect.stringContaining("sedang dipinjam") });
    expect((await lib.daftarPeminjam()).map((p) => p.nama)).toEqual(["Rina"]);

    // Setelah dikembalikan boleh dipinjamkan lagi.
    await lib.kembalikan(peminjamanId);
    await expect(
      lib.pinjamkan({ eksemplarId, peminjam: { nama: "Budi" }, jatuhTempo: "2026-12-10" }),
    ).resolves.toBeDefined();
  });

  it("kartu Eksemplar di Detail Buku menunjukkan siapa yang meminjam dan sampai kapan", async () => {
    const { bukuId } = (await lib.daftarKoleksi())[0];
    expect((await lib.detailBuku(bukuId))!.eksemplar[0].dipinjam).toBeNull();

    await lib.pinjamkan({ eksemplarId, peminjam: { nama: "Rina" }, jatuhTempo: "2026-12-09" });

    expect((await lib.detailBuku(bukuId))!.eksemplar[0].dipinjam).toMatchObject({
      peminjam: { nama: "Rina" },
      jatuhTempo: "2026-12-09",
      terlambat: false,
    });
  });
});

describe("Perpustakaan Lokal: Peminjam lama dan Peminjam baru", () => {
  it("memilih Peminjam lama memakai ulang nama dan kontaknya, tanpa membuat Peminjam kedua", async () => {
    const pertama = await lib.pinjamkan({
      eksemplarId,
      peminjam: { nama: "Rina", kontak: " 081234567890 " },
      jatuhTempo: "2026-12-09",
    });
    await lib.kembalikan(pertama.peminjamanId);

    const [rina] = await lib.daftarPeminjam();
    expect(rina).toMatchObject({ nama: "Rina", kontak: "081234567890", sedangMeminjam: 0, totalPeminjaman: 1 });

    await lib.pinjamkan({ eksemplarId, peminjam: { id: rina.id }, jatuhTempo: "2026-12-23" });

    const sesudah = await lib.daftarPeminjam();
    expect(sesudah).toHaveLength(1);
    expect(sesudah[0]).toMatchObject({ id: rina.id, sedangMeminjam: 1, totalPeminjaman: 2 });
  });

  it("menolak Peminjam tanpa nama dan Peminjam lama yang tidak dikenal", async () => {
    await expect(
      lib.pinjamkan({ eksemplarId, peminjam: { nama: "  " }, jatuhTempo: "2026-12-09" }),
    ).rejects.toMatchObject({ field: "nama" });
    await expect(
      lib.pinjamkan({ eksemplarId, peminjam: { id: crypto.randomUUID() }, jatuhTempo: "2026-12-09" }),
    ).rejects.toBeInstanceOf(ValidasiError);
    expect((await statusKoleksi()).dipinjam).toBe(false);
  });

  it("kontak boleh kosong", async () => {
    await lib.pinjamkan({ eksemplarId, peminjam: { nama: "Rina", kontak: "" }, jatuhTempo: "2026-12-09" });
    expect((await lib.daftarPeminjam())[0].kontak).toBeNull();
  });

  it("jatuh tempo tidak boleh sebelum tanggal pinjam dan tanggal harus ada di kalender", async () => {
    await expect(
      lib.pinjamkan({ eksemplarId, peminjam: { nama: "Rina" }, tanggalPinjam: "2026-11-25", jatuhTempo: "2026-11-24" }),
    ).rejects.toMatchObject({ field: "jatuhTempo" });
    await expect(
      lib.pinjamkan({ eksemplarId, peminjam: { nama: "Rina" }, jatuhTempo: "2026-02-31" }),
    ).rejects.toMatchObject({ field: "jatuhTempo" });
  });

  it("Eksemplar yang belum punya Nomor Induk (Menunggu Sinkron) boleh dipinjamkan", async () => {
    expect((await lib.daftarKoleksi())[0].nomorInduk).toBeNull();
    await expect(
      lib.pinjamkan({ eksemplarId, peminjam: { nama: "Rina" }, jatuhTempo: "2026-12-09" }),
    ).resolves.toBeDefined();
    expect((await lib.daftarPeminjaman()).aktif[0].nomorIndukTampil).toBe("——");
  });

  it("mengoreksi kontak Peminjam", async () => {
    await lib.pinjamkan({ eksemplarId, peminjam: { nama: "Rina", kontak: "0812" }, jatuhTempo: "2026-12-09" });
    const [rina] = await lib.daftarPeminjam();
    await lib.ubahPeminjam(rina.id, { kontak: "081234567890" });
    expect((await lib.daftarPeminjam())[0].kontak).toBe("081234567890");
  });
});

describe("Perpustakaan Lokal: daftar aktif, terlambat, dan riwayat (jam perangkat: 25 Nov 2026)", () => {
  async function tigaPinjaman() {
    const tambah = async (judul: string) =>
      (
        await lib.tambahBuku({
          judul,
          kontributor: [{ nama: "Penulis Uji", utama: true }],
          eksemplar: { kategoriId: FIK.id },
        })
      ).eksemplarId;
    const [a, b, c] = [await tambah("Bumi Manusia"), await tambah("Cantik Itu Luka"), await tambah("Pulang")];
    const lewat = await lib.pinjamkan({ eksemplarId: a, peminjam: { nama: "Rina" }, tanggalPinjam: "2026-11-01", jatuhTempo: "2026-11-15" });
    const hariIni = await lib.pinjamkan({ eksemplarId: b, peminjam: { nama: "Budi" }, tanggalPinjam: "2026-11-11", jatuhTempo: "2026-11-25" });
    const depan = await lib.pinjamkan({ eksemplarId: c, peminjam: { nama: "Sari" }, tanggalPinjam: "2026-11-20", jatuhTempo: "2026-12-04" });
    return { lewat, hariIni, depan };
  }

  it("terlambat hanya bila jatuh tempo sebelum hari ini; jatuh tempo hari ini belum terlambat", async () => {
    await tigaPinjaman();

    const { aktif, terlambat, riwayat } = await lib.daftarPeminjaman();

    expect(aktif.map((p) => [p.judul, p.terlambat, p.hariTerlambat])).toEqual([
      ["Bumi Manusia", true, 10],
      ["Cantik Itu Luka", false, 0],
      ["Pulang", false, 0],
    ]);
    expect(terlambat.map((p) => p.judul)).toEqual(["Bumi Manusia"]);
    expect(riwayat).toEqual([]);
    expect(await lib.jumlahTerlambat()).toBe(1);
  });

  it("daftar mengikuti tanggal hari ini: besoknya jatuh tempo kemarin ikut terlambat", async () => {
    await tigaPinjaman();
    jam = new Date(2026, 10, 26, 8, 0, 0);

    expect((await lib.daftarPeminjaman()).terlambat.map((p) => p.judul)).toEqual(["Bumi Manusia", "Cantik Itu Luka"]);
    expect(await lib.jumlahTerlambat()).toBe(2);
  });

  it("hari dihitung menurut kalender lokal: 23:59 masih hari yang sama", async () => {
    await tigaPinjaman();
    jam = new Date(2026, 10, 25, 23, 59, 0);
    expect(await lib.jumlahTerlambat()).toBe(1);
  });

  it("yang sudah dikembalikan pindah ke riwayat dan tidak lagi dihitung terlambat", async () => {
    const { lewat } = await tigaPinjaman();

    await lib.kembalikan(lewat.peminjamanId);

    const { aktif, terlambat, riwayat } = await lib.daftarPeminjaman();
    expect(aktif).toHaveLength(2);
    expect(terlambat).toEqual([]);
    expect(riwayat.map((p) => [p.judul, p.tanggalKembali, p.terlambat])).toEqual([["Bumi Manusia", "2026-11-25", false]]);
    expect(await lib.jumlahTerlambat()).toBe(0);
  });

  it("memperpanjang jatuh tempo mengeluarkannya dari daftar terlambat", async () => {
    const { lewat } = await tigaPinjaman();
    await lib.ubahJatuhTempo(lewat.peminjamanId, "2026-12-10");
    expect(await lib.jumlahTerlambat()).toBe(0);
    await expect(lib.ubahJatuhTempo(lewat.peminjamanId, "2026-10-01")).rejects.toMatchObject({ field: "jatuhTempo" });
  });

  it("pemantau mengabarkan jumlah terlambat saat Peminjaman berubah", async () => {
    const { lewat } = await tigaPinjaman();
    const nilai: number[] = [];
    const berhenti = lib.pantauJumlahTerlambat((n) => nilai.push(n));
    await vi.waitFor(() => expect(nilai.at(-1)).toBe(1));
    await lib.kembalikan(lewat.peminjamanId);
    await vi.waitFor(() => expect(nilai.at(-1)).toBe(0));
    berhenti();
  });
});

describe("Perpustakaan Lokal: pengingat WhatsApp", () => {
  async function pinjam(kontak: string | null, jatuhTempo = "2026-12-09", tanggalPinjam = "2026-11-01") {
    const { peminjamanId } = await lib.pinjamkan({
      eksemplarId,
      peminjam: { nama: "Rina", kontak },
      tanggalPinjam,
      jatuhTempo,
    });
    return peminjamanId;
  }

  it("membuka wa.me dengan nomor 08… yang dinormalkan jadi 628… dan pesan berisi judul serta jatuh tempo", async () => {
    const url = new URL((await lib.tautanPengingat(await pinjam("0812-3456-7890")))!);

    expect(url.origin + url.pathname).toBe("https://wa.me/6281234567890");
    const pesan = url.searchParams.get("text")!;
    expect(pesan).toContain("Laut Bercerita");
    expect(pesan).toContain("9 Desember 2026");
    expect(pesan).toContain("Rina");
    expect(pesan).not.toMatch(/denda/i);
    // Daftar Peminjaman membawa tautan yang sama untuk tombol WhatsApp.
    expect((await lib.daftarPeminjaman()).aktif[0].tautanPengingat).toBe(url.href);
  });

  it.each([
    ["+62 812-3456-7890", "6281234567890"],
    ["6281234567890", "6281234567890"],
    ["81234567890", "6281234567890"],
    ["(0812) 3456 7890", "6281234567890"],
    ["+65 9123 4567", "6591234567"],
  ])("menormalkan nomor %s menjadi %s", async (kontak, nomor) => {
    expect((await lib.tautanPengingat(await pinjam(kontak)))!).toContain(`https://wa.me/${nomor}?text=`);
  });

  it.each([[null], ["rina@example.com"], ["@rina"], ["0812"]])(
    "kontak %s bukan nomor yang bisa dipakai: tidak ada tautan",
    async (kontak) => {
      expect(await lib.tautanPengingat(await pinjam(kontak))).toBeNull();
    },
  );

  it("pesan untuk yang sudah lewat jatuh tempo menyebutnya terlambat; tanpa tautan setelah dikembalikan", async () => {
    const id = await pinjam("081234567890", "2026-11-10");
    const pesan = new URL((await lib.tautanPengingat(id))!).searchParams.get("text")!;
    expect(pesan).toContain("sudah lewat jatuh tempo");
    expect(pesan).toContain("10 November 2026");

    await lib.kembalikan(id);
    expect(await lib.tautanPengingat(id)).toBeNull();
  });
});

describe("Perpustakaan Lokal: scan Label Barcode", () => {
  /** Perangkat lain mengirim Eksemplar bernomor lewat pull. */
  async function eksemplarBernomor(nomorInduk = "FIK-014/2026") {
    const bukuId = crypto.randomUUID();
    const id = crypto.randomUUID();
    await lib.sinkronkan({
      push: terimaSemua().push,
      pull: async () => ({
        ...kosong,
        kursor: "k",
        buku: [
          {
            id: bukuId,
            judul: "Pulang",
            kontributor: [{ id: crypto.randomUUID(), nama: "Leila", peran: "pengarang", utama: true }],
            ...bukuKosong(),
          },
        ],
        eksemplar: [
          {
            id,
            bukuId,
            kategoriId: FIK.id,
            nomorInduk,
            tahunPencatatan: 2026,
            waktuDicatat: "2026-03-14T10:00:00+07:00",
            status: "aktif",
            penyiangan: null,
            tanggalMasuk: null,
            asal: null,
            harga: null,
            kondisi: null,
            lokasiId: null,
            perluCetak: false,
          },
        ],
      }),
    });
    return { id, bukuId };
  }

  it("memindai Nomor Induk membuka Eksemplar yang sesuai, tersedia atau sedang dipinjam siapa", async () => {
    const { id, bukuId } = await eksemplarBernomor();

    const tersedia = await lib.cariDariPindai("FIK-014/2026");
    expect(tersedia).toMatchObject({
      jenis: "eksemplar",
      eksemplar: { eksemplarId: id, bukuId, judul: "Pulang", nomorInduk: "FIK-014/2026", dipinjam: null },
    });

    await lib.pinjamkan({ eksemplarId: id, peminjam: { nama: "Rina" }, tanggalPinjam: "2026-11-01", jatuhTempo: "2026-11-10" });
    const dipinjam = await lib.cariDariPindai(" FIK-014/2026\n");
    expect(dipinjam).toMatchObject({
      jenis: "eksemplar",
      eksemplar: { dipinjam: { peminjam: { nama: "Rina" }, jatuhTempo: "2026-11-10", terlambat: true, hariTerlambat: 15 } },
    });
  });

  it("kode Kategori berangka dan nomor urut lebih dari 3 digit tetap dikenali", async () => {
    await eksemplarBernomor("A1-1234/2026");
    expect(await lib.cariDariPindai("A1-1234/2026")).toMatchObject({ jenis: "eksemplar" });
  });

  it("ISBN atau teks lain ditolak dengan pesan ramah", async () => {
    expect(await lib.cariDariPindai("9786024246945")).toMatchObject({ jenis: "bukanNomorInduk" });
    expect(await lib.cariDariPindai("fik-014/2026")).toMatchObject({ jenis: "bukanNomorInduk" });
  });

  it("Nomor Induk sah yang belum ada di perangkat ini: tidak ditemukan, dengan petunjuk sinkron", async () => {
    expect(await lib.cariDariPindai("FIK-099/2026")).toMatchObject({
      jenis: "tidakDitemukan",
      nomorInduk: "FIK-099/2026",
      pesan: expect.stringContaining("Sinkronkan"),
    });
  });
});

describe("Perpustakaan Lokal: Penyiangan menolak Eksemplar yang sedang dipinjam", () => {
  it("setelah dikembalikan Penyiangan berjalan lagi", async () => {
    const { peminjamanId } = await lib.pinjamkan({ eksemplarId, peminjam: { nama: "Rina" }, jatuhTempo: "2026-12-09" });
    const siangi = vi.fn(async () => ({
      status: "keluar" as const,
      penyiangan: { jenis: "hilang" as const, tanggal: "2026-11-25", alasan: null },
    }));
    // Eksemplar baru masih Menunggu Sinkron; sinkronkan dulu supaya Penyiangan terbuka.
    await lib.sinkronkan(terimaSemua());
    const pen = lib.penyiangan({ siangi: siangi as never });

    await expect(pen.siangi(eksemplarId, { jenis: "hilang", tanggal: "2026-11-25" })).rejects.toMatchObject({
      pesan: expect.stringContaining("sedang dipinjam"),
    });
    expect(siangi).not.toHaveBeenCalled();

    await lib.kembalikan(peminjamanId);
    await pen.siangi(eksemplarId, { jenis: "hilang", tanggal: "2026-11-25" });
    expect(siangi).toHaveBeenCalledTimes(1);
  });
});
