import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalLibrary, type KartuScan, type LocalLibrary } from "@/lib/local-library";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { drafKosong, type DrafBuku, type HasilPencarianMetadata } from "@/lib/draf-buku";
import type { PullResponse } from "@/lib/sync-protocol";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;
// ISBN-13 sah berawalan 978 (dari fixture metadata).
const ISBN_A = "9786024246945";
const ISBN_B = "9786020633176";

const dariDraf = (isbn13: string, judul: string): DrafBuku => ({
  ...drafKosong(isbn13),
  judul,
  pengarang: ["Penulis Uji"],
});
const ditemukan = (isbn13: string, judul = `Buku ${isbn13}`): HasilPencarianMetadata => ({
  ditemukan: true,
  draf: dariDraf(isbn13, judul),
  sumber: [{ sumber: "openlibrary", status: "ok" }],
});

let jam: Date;
let lib: LocalLibrary;
const cariMetadata = async (isbn13: string) => ditemukan(isbn13);

beforeEach(() => {
  jam = new Date(2026, 10, 25, 9, 0, 0, 0);
  lib = createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}`, now: () => jam });
});

const mulai = (opsi: Partial<Parameters<LocalLibrary["mulaiSesiPenerimaan"]>[0]> = {}) =>
  lib.mulaiSesiPenerimaan({ cariMetadata, ...opsi });

const kosong: PullResponse = { kursor: null, kategori: [], lokasi: [], aturanKategori: [], buku: [], eksemplar: [], templateLabel: null };

/** Lokasi hanya datang dari server (dikelola online); tes menyalinnya lewat pull. */
async function salinLokasi(nama: string) {
  const id = crypto.randomUUID();
  await lib.sinkronkan({
    push: async () => ({ hasil: [] }),
    pull: async () => ({ ...kosong, lokasi: [{ id, nama, dihapus: false }] }),
  });
  return id;
}

/** Pindai lalu tunggu pencarian metadatanya selesai; mengembalikan id kartu. */
async function pindaiSelesai(sesi: Awaited<ReturnType<typeof mulai>>, kode: string) {
  const hasil = await sesi.pindai(kode);
  if (hasil.jenis !== "kartu") throw new Error(`diharapkan kartu, dapat ${hasil.jenis}`);
  await hasil.selesai;
  return hasil.kartuId;
}

describe("Sesi Penerimaan: data sesi diterapkan ke setiap Eksemplar", () => {
  it("tanggal masuk bawaan adalah hari ini (jam perangkat); asal dan Lokasi kosong", async () => {
    const sesi = await mulai();

    expect(sesi.data()).toEqual({ tanggalMasuk: "2026-11-25", asal: null, lokasiId: null });
  });

  it("tanggal masuk boleh dikosongkan untuk koleksi lama", async () => {
    const sesi = await mulai({ tanggalMasuk: null });

    expect(sesi.data().tanggalMasuk).toBeNull();
  });

  it("Eksemplar baru dari sesi memakai tanggal, asal, dan Lokasi sesi", async () => {
    const lokasiId = await salinLokasi("Rak A, susun 2");
    const sesi = await mulai({ tanggalMasuk: "2026-11-20", asal: "beli", lokasiId });

    const kartuId = await pindaiSelesai(sesi, ISBN_A);
    const { bukuId } = await sesi.simpan(kartuId, dariDraf(ISBN_A, "Buku A"), FIK.id);

    const detail = await lib.detailBuku(bukuId);
    expect(detail!.eksemplar[0]).toMatchObject({
      tanggalMasuk: "2026-11-20",
      asal: "beli",
      lokasi: { id: lokasiId, nama: "Rak A, susun 2" },
    });
  });

  it("mengubah data sesi di tengah sesi berlaku untuk Eksemplar berikutnya, yang lama tidak berubah", async () => {
    const sesi = await mulai({ tanggalMasuk: "2026-11-20", asal: "beli" });
    const kartuA = await pindaiSelesai(sesi, ISBN_A);
    const { bukuId: bukuA } = await sesi.simpan(kartuA, dariDraf(ISBN_A, "Buku A"), FIK.id);

    await sesi.ubah({ asal: "hadiah", tanggalMasuk: null });
    const kartuB = await pindaiSelesai(sesi, ISBN_B);
    const { bukuId: bukuB } = await sesi.simpan(kartuB, dariDraf(ISBN_B, "Buku B"), FIK.id);

    expect((await lib.detailBuku(bukuA))!.eksemplar[0]).toMatchObject({ asal: "beli", tanggalMasuk: "2026-11-20" });
    expect((await lib.detailBuku(bukuB))!.eksemplar[0]).toMatchObject({ asal: "hadiah", tanggalMasuk: null });
    expect(sesi.data()).toEqual({ tanggalMasuk: null, asal: "hadiah", lokasiId: null });
  });

  it("menolak Lokasi yang tidak ada dan tanggal yang tidak sah, data sesi tetap utuh", async () => {
    const sesi = await mulai({ asal: "beli" });

    await expect(sesi.ubah({ lokasiId: crypto.randomUUID() })).rejects.toMatchObject({ field: "lokasiId" });
    await expect(sesi.ubah({ tanggalMasuk: "2026-02-31" })).rejects.toMatchObject({ field: "tanggalMasuk" });
    expect(sesi.data()).toEqual({ tanggalMasuk: "2026-11-25", asal: "beli", lokasiId: null });
    await expect(mulai({ lokasiId: crypto.randomUUID() })).rejects.toMatchObject({ field: "lokasiId" });
  });

  it("Eksemplar dari sesi lain tidak ikut berubah (setiap sesi punya datanya sendiri)", async () => {
    const satu = await mulai({ asal: "beli" });
    const dua = await mulai({ asal: "hadiah" });
    await satu.ubah({ asal: "lainnya" });

    expect(dua.data().asal).toBe("hadiah");
  });
});

describe("Sesi Penerimaan: pindai ISBN", () => {
  it("ISBN yang sama dalam 1,5 detik tidak tercatat ganda; bacaan berulang memperpanjang jeda", async () => {
    const sesi = await mulai();

    const pertama = await sesi.pindai(ISBN_A);
    jam = new Date(jam.getTime() + 1000);
    const kedua = await sesi.pindai(ISBN_A);
    jam = new Date(jam.getTime() + 1400); // 1,4 dtk sejak bacaan terakhir, 2,4 dtk sejak yang pertama
    const ketiga = await sesi.pindai(ISBN_A);

    expect(pertama.jenis).toBe("kartu");
    expect(kedua.jenis).toBe("diabaikan");
    expect(ketiga.jenis).toBe("diabaikan");
    expect(await sesi.kartu()).toHaveLength(1);
  });

  it("setelah jeda 1,5 detik, ISBN yang kartunya belum disimpan tidak dibuatkan kartu ganda", async () => {
    const sesi = await mulai();
    const pertama = await sesi.pindai(ISBN_A);
    if (pertama.jenis === "kartu") await pertama.selesai;
    jam = new Date(jam.getTime() + 1500);

    const kedua = await sesi.pindai(ISBN_A);

    expect(kedua).toMatchObject({ jenis: "sudahDiDaftar", kartuId: pertama.jenis === "kartu" ? pertama.kartuId : "" });
    expect(await sesi.kartu()).toHaveLength(1);
  });

  it("ISBN berbeda tidak terhalang jeda", async () => {
    const sesi = await mulai();

    const a = await sesi.pindai(ISBN_A);
    const b = await sesi.pindai(ISBN_B);

    expect([a.jenis, b.jenis]).toEqual(["kartu", "kartu"]);
    expect((await sesi.kartu()).map((k) => k.isbn13)).toEqual([ISBN_A, ISBN_B]);
  });

  it("barcode non-ISBN (bukan 978/979) ditolak dengan pesan jelas dan tidak membuat kartu", async () => {
    const sesi = await mulai();

    const hasil = await sesi.pindai("8991234567890");

    expect(hasil).toMatchObject({ jenis: "ditolak" });
    expect((hasil as { pesan: string }).pesan).toContain("bukan ISBN");
    expect((hasil as { pesan: string }).pesan).toContain("978 atau 979");
    expect(await sesi.kartu()).toEqual([]);
  });

  it("barcode non-ISBN yang terbaca berulang tidak menumpuk pesan penolakan dalam jeda", async () => {
    const sesi = await mulai();

    const a = await sesi.pindai("8991234567890");
    const b = await sesi.pindai("8991234567890");

    expect([a.jenis, b.jenis]).toEqual(["ditolak", "diabaikan"]);
  });

  it("ISBN-10 dan ISBN-13 buku yang sama dianggap satu ISBN", async () => {
    const sesi = await mulai();

    const a = await sesi.pindai(ISBN_A);
    const b = await sesi.pindai("602-424-694-3"); // ISBN-10 untuk 978-602-424-694-5

    expect(a.jenis).toBe("kartu");
    expect(b.jenis).toBe("diabaikan");
  });
});

/** Buku manual dengan ISBN di koleksi, lalu sesi baru yang memindai ISBN itu. */
async function bukuAdaDiKoleksi(judul = "Laut Bercerita", pengarang = "Leila S. Chudori") {
  const { bukuId } = await lib.tambahBukuManual({ judul, pengarang, kategoriId: FIK.id });
  await lib.ubahBuku(bukuId, { isbn13: ISBN_A });
  return bukuId;
}

describe("Sesi Penerimaan: ISBN yang sudah ada di koleksi", () => {
  it("memunculkan prompt 'Tambah eksemplar baru?' dengan Buku yang ada; tanpa kartu baru", async () => {
    const bukuId = await bukuAdaDiKoleksi();
    const sesi = await mulai();

    const hasil = await sesi.pindai(ISBN_A);

    expect(hasil).toMatchObject({
      jenis: "duplikat",
      isbn13: ISBN_A,
      buku: { bukuId, judul: "Laut Bercerita", pengarang: "Leila S. Chudori", jumlahEksemplar: 1, kategoriId: FIK.id },
    });
    expect(await sesi.kartu()).toEqual([]);
  });

  it("menyetujui prompt menambah Eksemplar dengan data sesi dan tampil sebagai kartu Tersimpan", async () => {
    const bukuId = await bukuAdaDiKoleksi();
    const sesi = await mulai({ tanggalMasuk: "2026-11-20", asal: "hadiah" });
    const hasil = await sesi.pindai(ISBN_A);
    if (hasil.jenis !== "duplikat") throw new Error("diharapkan duplikat");

    const { eksemplarId } = await sesi.tambahEksemplar(hasil, FIK.id);

    const detail = await lib.detailBuku(bukuId);
    expect(detail!.eksemplar).toHaveLength(2);
    expect(detail!.eksemplar.find((e) => e.id === eksemplarId)).toMatchObject({ tanggalMasuk: "2026-11-20", asal: "hadiah" });
    expect(await sesi.kartu()).toMatchObject([
      { status: "tersimpan", label: "Tersimpan", judul: "Laut Bercerita", isbn13: ISBN_A, bukuId, eksemplarId, nomorIndukTampil: "——" },
    ]);
  });

  it("menambah Eksemplar tanpa Kategori ditolak dan tidak membuat kartu", async () => {
    await bukuAdaDiKoleksi();
    const sesi = await mulai();
    const hasil = await sesi.pindai(ISBN_A);
    if (hasil.jenis !== "duplikat") throw new Error("diharapkan duplikat");

    await expect(sesi.tambahEksemplar(hasil, "")).rejects.toMatchObject({ field: "kategoriId" });
    expect(await sesi.kartu()).toEqual([]);
  });
});

/** Penantian terkendali untuk pencarian metadata, supaya status "Mencari…" bisa diamati. */
function tertunda() {
  let selesaikan!: (h: HasilPencarianMetadata) => void;
  let gagalkan!: (e: unknown) => void;
  const janji = new Promise<HasilPencarianMetadata>((ya, tidak) => {
    selesaikan = ya;
    gagalkan = tidak;
  });
  return { janji, selesaikan, gagalkan };
}

describe("Sesi Penerimaan: kartu hasil scan dan statusnya", () => {
  it("kartu berstatus Mencari… lalu Siap ditinjau dengan draf dari metadata", async () => {
    const t = tertunda();
    const sesi = await mulai({ cariMetadata: () => t.janji });

    const hasil = await sesi.pindai(ISBN_A);
    if (hasil.jenis !== "kartu") throw new Error("diharapkan kartu");
    expect(await sesi.kartu()).toMatchObject([{ id: hasil.kartuId, isbn13: ISBN_A, status: "mencari", label: "Mencari…", draf: null }]);

    t.selesaikan(ditemukan(ISBN_A, "Pulang"));
    await hasil.selesai;

    expect(await sesi.kartu()).toMatchObject([
      { status: "siap", label: "Siap ditinjau", judul: "Pulang", pengarang: "Penulis Uji", nomorIndukTampil: null, draf: { judul: "Pulang", isbn13: ISBN_A } },
    ]);
  });

  it("ISBN tidak ditemukan: kartu Siap ditinjau dengan draf kosong ber-ISBN dan catatan", async () => {
    const sesi = await mulai({
      cariMetadata: async (isbn13) => ({ ditemukan: false, isbn13, sumber: [{ sumber: "loc", status: "kosong" }], semuaGalat: false }),
    });

    const kartuId = await pindaiSelesai(sesi, ISBN_A);

    const [kartu] = await sesi.kartu();
    expect(kartu).toMatchObject({ id: kartuId, status: "siap", judul: "", bisaCobaLagi: false, draf: { isbn13: ISBN_A, judul: "" } });
    expect(kartu.catatan).toContain(ISBN_A);
    expect(kartu.catatan).toContain("Isi datanya manual");
  });

  it("pencarian gagal (offline): kartu tetap bisa ditinjau dan diisi manual, dan bisa dicoba lagi", async () => {
    let panggilan = 0;
    const sesi = await mulai({
      cariMetadata: async (isbn13) => {
        if (++panggilan === 1) throw new TypeError("Failed to fetch");
        return ditemukan(isbn13, "Akhirnya Ketemu");
      },
    });

    const kartuId = await pindaiSelesai(sesi, ISBN_A);

    const [gagal] = await sesi.kartu();
    expect(gagal).toMatchObject({ status: "siap", bisaCobaLagi: true, draf: { isbn13: ISBN_A } });
    expect(gagal.catatan).toContain("Tidak ada koneksi");

    await sesi.cobaLagi(kartuId);

    expect(await sesi.kartu()).toMatchObject([{ status: "siap", judul: "Akhirnya Ketemu", catatan: null, bisaCobaLagi: false }]);
  });

  it("sumber metadata tak terjangkau semua: pesan berbeda dari 'tidak ditemukan', boleh coba lagi", async () => {
    const sesi = await mulai({
      cariMetadata: async (isbn13) => ({ ditemukan: false, isbn13, sumber: [{ sumber: "google", status: "galat" }], semuaGalat: true }),
    });

    await pindaiSelesai(sesi, ISBN_A);

    const [kartu] = await sesi.kartu();
    expect(kartu).toMatchObject({ bisaCobaLagi: true });
    expect(kartu.catatan).toContain("tidak bisa dihubungi");
  });

  it("'Isi manual' membuat kartu Siap ditinjau tanpa ISBN, tanpa mencari metadata", async () => {
    let dicari = 0;
    const sesi = await mulai({ cariMetadata: async (i) => (dicari++, ditemukan(i)) });

    const { kartuId } = sesi.isiManual();

    expect(dicari).toBe(0);
    expect(await sesi.kartu()).toMatchObject([{ id: kartuId, status: "siap", isbn13: null, judul: "", draf: { isbn13: "", judul: "" } }]);
    const { bukuId } = await sesi.simpan(kartuId, { ...drafKosong(""), judul: "Buku Tanpa ISBN", pengarang: ["Seseorang"] }, FIK.id);
    expect((await lib.detailBuku(bukuId))!.isbn13).toBeNull();
    expect(await sesi.kartu()).toMatchObject([{ status: "tersimpan", judul: "Buku Tanpa ISBN" }]);
  });

  it("menyimpan menjadikan kartu Tersimpan; Nomor Induk '——' selama Menunggu Sinkron, nomor asli setelah Sinkronisasi", async () => {
    const sesi = await mulai();
    const kartuId = await pindaiSelesai(sesi, ISBN_A);
    await sesi.simpan(kartuId, dariDraf(ISBN_A, "Buku A"), FIK.id);

    expect(await sesi.kartu()).toMatchObject([
      { status: "tersimpan", label: "Tersimpan", nomorInduk: null, nomorIndukTampil: "——", menungguSinkron: true },
    ]);

    await lib.sinkronkan({
      push: async (req) => ({
        hasil: req.mutasi.map((m) =>
          m.jenis === "eksemplar.catat"
            ? { id: m.id, status: "diterima" as const, nomorInduk: "FIK-001/2026", eksemplarId: m.eksemplar.id }
            : { id: m.id, status: "diterima" as const },
        ),
      }),
      pull: async () => kosong,
    });

    expect(await sesi.kartu()).toMatchObject([
      { status: "tersimpan", nomorInduk: "FIK-001/2026", nomorIndukTampil: "FIK-001/2026", menungguSinkron: false },
    ]);
  });

  it("menyimpan kartu dengan Kategori kosong ditolak; kartu tetap Siap ditinjau", async () => {
    const sesi = await mulai();
    const kartuId = await pindaiSelesai(sesi, ISBN_A);

    await expect(sesi.simpan(kartuId, dariDraf(ISBN_A, "Buku A"), "")).rejects.toMatchObject({ field: "kategoriId" });

    expect(await sesi.kartu()).toMatchObject([{ status: "siap" }]);
    expect(await lib.daftarKoleksi()).toEqual([]);
  });

  it("kartu yang sudah Tersimpan tidak bisa disimpan lagi (tidak ada Eksemplar ganda)", async () => {
    const sesi = await mulai();
    const kartuId = await pindaiSelesai(sesi, ISBN_A);
    await sesi.simpan(kartuId, dariDraf(ISBN_A, "Buku A"), FIK.id);

    await expect(sesi.simpan(kartuId, dariDraf(ISBN_A, "Buku A"), FIK.id)).rejects.toThrow();
    expect(await lib.daftarKoleksi()).toHaveLength(1);
  });

  it("kartu yang belum disimpan boleh dibuang; ISBN-nya bisa dipindai lagi setelah jeda", async () => {
    const sesi = await mulai();
    const kartuId = await pindaiSelesai(sesi, ISBN_A);

    sesi.buang(kartuId);
    jam = new Date(jam.getTime() + 2000);
    const lagi = await sesi.pindai(ISBN_A);

    expect(lagi.jenis).toBe("kartu");
    expect(await sesi.kartu()).toHaveLength(1);
  });

  it("kartu yang sudah Tersimpan tidak bisa dibuang", async () => {
    const sesi = await mulai();
    const kartuId = await pindaiSelesai(sesi, ISBN_A);
    await sesi.simpan(kartuId, dariDraf(ISBN_A, "Buku A"), FIK.id);

    expect(() => sesi.buang(kartuId)).toThrow();
  });

  it("pemantau kartu diberi tahu tiap perubahan status, termasuk Nomor Induk dari Sinkronisasi", async () => {
    const t = tertunda();
    const sesi = await mulai({ cariMetadata: () => t.janji });
    const terlihatUI: KartuScan[][] = [];
    const berhenti = sesi.pantau((k) => terlihatUI.push(k));

    const hasil = await sesi.pindai(ISBN_A);
    if (hasil.jenis !== "kartu") throw new Error("diharapkan kartu");
    await vi.waitFor(() => expect(terlihatUI.at(-1)).toMatchObject([{ status: "mencari" }]));

    t.selesaikan(ditemukan(ISBN_A));
    await hasil.selesai;
    await vi.waitFor(() => expect(terlihatUI.at(-1)).toMatchObject([{ status: "siap" }]));

    await sesi.simpan(hasil.kartuId, dariDraf(ISBN_A, "Buku A"), FIK.id);
    await vi.waitFor(() => expect(terlihatUI.at(-1)).toMatchObject([{ status: "tersimpan", nomorIndukTampil: "——" }]));

    await lib.sinkronkan({
      push: async (req) => ({
        hasil: req.mutasi.map((m) =>
          m.jenis === "eksemplar.catat"
            ? { id: m.id, status: "diterima" as const, nomorInduk: "FIK-007/2026", eksemplarId: m.eksemplar.id }
            : { id: m.id, status: "diterima" as const },
        ),
      }),
      pull: async () => kosong,
    });
    await vi.waitFor(() => expect(terlihatUI.at(-1)).toMatchObject([{ nomorIndukTampil: "FIK-007/2026" }]));
    berhenti();
  });
});
