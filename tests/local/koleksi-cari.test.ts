import { beforeEach, describe, expect, it } from "vitest";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { createLocalLibrary, saringKoleksi, type ItemKoleksi } from "@/lib/local-library";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;
const AGM = PRESET_KATEGORI.find((k) => k.kode === "AGM")!;
const SEJ = PRESET_KATEGORI.find((k) => k.kode === "SEJ")!;

let lib: ReturnType<typeof createLocalLibrary>;

beforeEach(async () => {
  lib = createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}` });
  await lib.tambahBuku({
    judul: "Laut Bercerita",
    isbn13: "9786024246945",
    kontributor: [
      { nama: "Leila S. Chudori", peran: "pengarang", utama: true },
      { nama: "Hilmar Farid", peran: "editor" },
    ],
    eksemplar: { kategoriId: FIK.id },
  });
  await lib.tambahBuku({
    judul: "Sirah Nabawiyah",
    kontributor: [{ nama: "Muhammad Husain Haekal", utama: true }],
    eksemplar: { kategoriId: AGM.id },
  });
  await lib.tambahBuku({
    judul: "Sapiens",
    isbn13: "9786024246938",
    kontributor: [{ nama: "Yuval Noah Harari", utama: true }],
    eksemplar: { kategoriId: SEJ.id },
  });
});

const judul = async (k: Parameters<typeof lib.cariKoleksi>[0]) =>
  (await lib.cariKoleksi(k)).map((i) => i.judul).sort();

describe("Perpustakaan Lokal: cari Koleksi (tanpa server)", () => {
  it("menemukan Buku dari judul, huruf besar-kecil dan aksen tidak berpengaruh", async () => {
    expect(await judul({ q: "laut BERCERITA" })).toEqual(["Laut Bercerita"]);
    expect(await judul({ q: "bercerita" })).toEqual(["Laut Bercerita"]);
  });

  it("menemukan Buku dari Kontributor mana pun, bukan hanya Pengarang Utama", async () => {
    expect(await judul({ q: "chudori" })).toEqual(["Laut Bercerita"]);
    expect(await judul({ q: "hilmar" })).toEqual(["Laut Bercerita"]);
    expect(await judul({ q: "harari" })).toEqual(["Sapiens"]);
  });

  it("menemukan Buku dari ISBN, juga yang diketik dengan tanda hubung", async () => {
    expect(await judul({ q: "9786024246945" })).toEqual(["Laut Bercerita"]);
    expect(await judul({ q: "978-602-4246-93-8" })).toEqual(["Sapiens"]);
  });

  it("Eksemplar yang Menunggu Sinkron (tanpa Nomor Induk) tetap ditemukan lewat judul dan Nomor Panggil", async () => {
    const [item] = await lib.cariKoleksi({ q: "sirah" });
    expect(item.nomorInduk).toBeNull();
    expect(item.menungguSinkron).toBe(true);
    expect(await judul({ q: item.nomorPanggil.teks })).toEqual(["Sirah Nabawiyah"]);
  });

  it("menemukan Buku dari Nomor Panggil (seluruhnya atau sebagian)", async () => {
    expect(await judul({ q: "FIK / CHU / l" })).toEqual(["Laut Bercerita"]);
    expect(await judul({ q: "agm / hae" })).toEqual(["Sirah Nabawiyah"]);
  });

  it("beberapa kata harus cocok semuanya, boleh di medan berbeda; tanpa hasil memberi daftar kosong", async () => {
    expect(await judul({ q: "laut chudori" })).toEqual(["Laut Bercerita"]);
    expect(await judul({ q: "laut harari" })).toEqual([]);
    expect(await judul({ q: "tidak ada" })).toEqual([]);
  });

  it("teks kosong tidak menyaring", async () => {
    expect(await lib.cariKoleksi({ q: "  " })).toHaveLength(3);
    expect(await lib.cariKoleksi()).toHaveLength(3);
  });

  it("filter Kategori digabung dengan pencarian teks", async () => {
    expect(await judul({ kategoriId: FIK.id })).toEqual(["Laut Bercerita"]);
    expect(await judul({ kategoriId: FIK.id, q: "sapiens" })).toEqual([]);
    expect(await judul({ kategoriId: SEJ.id, q: "sapiens" })).toEqual(["Sapiens"]);
  });

  it("filter status: menunggu sinkron dan tersedia memuat Eksemplar belum tersinkron; keluar kosong", async () => {
    expect(await judul({ status: "menunggu-sinkron" })).toHaveLength(3);
    expect(await judul({ status: "tersedia" })).toHaveLength(3);
    expect(await judul({ status: "dipinjam" })).toEqual([]);
    expect(await judul({ status: "keluar" })).toEqual([]);
  });

  it("dari bacaan lokal yang sama: Eksemplar dipinjam hanya masuk 'dipinjam', keluar hanya masuk 'keluar'", () => {
    const dasar = {
      eksemplarId: "x", bukuId: "b", judul: "J", pengarang: "P", kategori: { kode: "FIK", nama: "Fiksi", warna: "#000" },
      nomorInduk: "FIK-001/2026", nomorIndukTampil: "FIK-001/2026", nomorPanggil: { kode: "FIK", pengarang: "P", judul: "j", teks: "FIK / P / j" },
      menungguSinkron: false, waktuDicatat: "2026-01-01T00:00:00+07:00", kategoriId: "k", lokasi: null, isbn13: null, sampul: null,
      kontributor: ["P"], status: "aktif", dipinjam: false,
    } satisfies ItemKoleksi;
    const items: ItemKoleksi[] = [
      { ...dasar, eksemplarId: "ada" },
      { ...dasar, eksemplarId: "pinjam", dipinjam: true },
      { ...dasar, eksemplarId: "keluar", status: "keluar" },
      { ...dasar, eksemplarId: "baru", menungguSinkron: true },
    ];
    const id = (s: Parameters<typeof saringKoleksi>[1]) => saringKoleksi(items, s).map((i) => i.eksemplarId);

    expect(id({})).toEqual(["ada", "pinjam", "baru"]);
    expect(id({ status: "tersedia" })).toEqual(["ada", "baru"]);
    expect(id({ status: "dipinjam" })).toEqual(["pinjam"]);
    expect(id({ status: "menunggu-sinkron" })).toEqual(["baru"]);
    expect(id({ status: "keluar" })).toEqual(["keluar"]);
  });
});
