import { beforeEach, describe, expect, it } from "vitest";
import { drafKosong, type DrafBuku } from "@/lib/draf-buku";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { bisaSimpanDraf, createLocalLibrary, ValidasiError } from "@/lib/local-library";

const FIL = PRESET_KATEGORI.find((k) => k.kode === "FIL")!;
const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;

let lib: ReturnType<typeof createLocalLibrary>;

beforeEach(() => {
  lib = createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}` });
});

const atomicHabits: DrafBuku = {
  ...drafKosong("9786020633176"),
  judul: "Atomic Habits",
  pengarang: ["James Clear"],
  penerbit: "Gramedia Pustaka Utama",
  tahun: 2019,
  halaman: 351,
  kelasDdc: "155.24",
  subjek: ["Habit", "Habit breaking"],
  sampul: "9786020633176.jpg",
  sumber: { judul: ["openlibrary"], kelasDdc: ["openlibrary"] },
};

describe("Perpustakaan Lokal: simpan draf Buku", () => {
  it("menyimpan draf sebagai Buku dengan Eksemplar pertamanya (Menunggu Sinkron)", async () => {
    const { bukuId } = await lib.simpanDraf(atomicHabits, { kategoriId: FIL.id });

    const detail = await lib.detailBuku(bukuId);
    expect(detail).toMatchObject({
      judul: "Atomic Habits",
      isbn13: "9786020633176",
      penerbit: "Gramedia Pustaka Utama",
      tahun: 2019,
      halaman: 351,
      kelasDdc: "155.24",
      subjek: ["Habit", "Habit breaking"],
      sampul: "9786020633176.jpg",
      pengarangUtama: { nama: "James Clear" },
    });
    expect(detail?.eksemplar).toHaveLength(1);
    expect(detail?.eksemplar[0]).toMatchObject({ menungguSinkron: true, kategori: { kode: "FIL" } });
  });

  it("pengarang pertama jadi Pengarang Utama, yang lain Kontributor biasa", async () => {
    const { bukuId } = await lib.simpanDraf(
      { ...atomicHabits, pengarang: ["A. Satu", "B. Dua"] },
      { kategoriId: FIL.id },
    );

    const detail = await lib.detailBuku(bukuId);
    expect(detail?.kontributor.map((k) => [k.nama, k.utama])).toEqual([
      ["A. Satu", true],
      ["B. Dua", false],
    ]);
  });

  it("ditolak tanpa Kategori, tanpa judul, atau tanpa pengarang; tidak ada yang tersimpan", async () => {
    await expect(lib.simpanDraf(atomicHabits, { kategoriId: "" })).rejects.toMatchObject({ field: "kategoriId" });
    await expect(lib.simpanDraf({ ...atomicHabits, judul: " " }, { kategoriId: FIL.id })).rejects.toMatchObject({
      field: "judul",
    });
    await expect(lib.simpanDraf({ ...atomicHabits, pengarang: [] }, { kategoriId: FIL.id })).rejects.toBeInstanceOf(
      ValidasiError,
    );
    expect(await lib.daftarKoleksi()).toEqual([]);
  });

  it("draf kosong dengan ISBN (ISBN tidak ditemukan) bisa dilengkapi manual lalu disimpan", async () => {
    const draf = { ...drafKosong("9786026486066"), judul: "Buku Langka", pengarang: ["Penulis Lokal"] };

    const { bukuId } = await lib.simpanDraf(draf, { kategoriId: FIK.id });

    expect(await lib.detailBuku(bukuId)).toMatchObject({ isbn13: "9786026486066", kelasDdc: null, subjek: [] });
  });

  it("Kelas DDC yang diketik manual dari KDT tersimpan, dan yang tidak sah ditolak", async () => {
    const { bukuId } = await lib.simpanDraf({ ...atomicHabits, kelasDdc: "813.6" }, { kategoriId: FIK.id });
    expect((await lib.detailBuku(bukuId))?.kelasDdc).toBe("813.6");

    await expect(
      lib.simpanDraf({ ...atomicHabits, isbn13: "9780735211292", kelasDdc: "813,6" }, { kategoriId: FIK.id }),
    ).rejects.toMatchObject({ field: "kelasDdc" });
  });
});

describe("Perpustakaan Lokal: tombol simpan menunggu Kategori dikonfirmasi", () => {
  it("nonaktif selama Kategori belum dipilih atau belum dikonfirmasi", () => {
    expect(bisaSimpanDraf({ kategoriId: "", dikonfirmasi: false })).toBe(false);
    expect(bisaSimpanDraf({ kategoriId: "", dikonfirmasi: true })).toBe(false);
    // saran sudah terpilih di draf tapi Pemilik belum mengonfirmasi
    expect(bisaSimpanDraf({ kategoriId: FIL.id, dikonfirmasi: false })).toBe(false);
    expect(bisaSimpanDraf({ kategoriId: FIL.id, dikonfirmasi: true })).toBe(true);
  });
});

describe("Perpustakaan Lokal: ISBN yang sudah ada di koleksi", () => {
  it("ISBN baru: tidak ada duplikat", async () => {
    expect(await lib.cariBukuByIsbn("9786020633176")).toBeNull();
  });

  it("ISBN yang sudah tercatat menemukan Buku yang ada, lengkap dengan Kategori terakhirnya", async () => {
    const { bukuId } = await lib.simpanDraf(atomicHabits, { kategoriId: FIL.id });

    expect(await lib.cariBukuByIsbn("9786020633176")).toEqual({
      bukuId,
      judul: "Atomic Habits",
      pengarang: "James Clear",
      kategoriId: FIL.id,
      jumlahEksemplar: 1,
    });
  });

  it("jika Pemilik setuju 'Tambah eksemplar baru?', Eksemplar baru dibuat untuk Buku yang sama (bukan Buku baru)", async () => {
    const { bukuId } = await lib.simpanDraf(atomicHabits, { kategoriId: FIL.id });
    const duplikat = await lib.cariBukuByIsbn("9786020633176");

    await lib.catatEksemplar({ bukuId: duplikat!.bukuId, kategoriId: duplikat!.kategoriId! });

    const detail = await lib.detailBuku(bukuId);
    expect(detail?.eksemplar).toHaveLength(2);
    expect(await lib.daftarKoleksi()).toHaveLength(2);
    expect((await lib.cariBukuByIsbn("9786020633176"))?.jumlahEksemplar).toBe(2);
  });

  it("menyimpan draf dengan ISBN yang sudah ada tetap ditolak (tidak ada Buku ganda)", async () => {
    await lib.simpanDraf(atomicHabits, { kategoriId: FIL.id });

    await expect(lib.simpanDraf(atomicHabits, { kategoriId: FIL.id })).rejects.toMatchObject({ field: "isbn13" });
    expect(await lib.daftarKoleksi()).toHaveLength(1);
  });
});
