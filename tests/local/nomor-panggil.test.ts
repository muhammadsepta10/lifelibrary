import { beforeEach, describe, expect, it } from "vitest";
import { createLocalLibrary } from "@/lib/local-library";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;
const AGM = PRESET_KATEGORI.find((k) => k.kode === "AGM")!;

let lib: ReturnType<typeof createLocalLibrary>;
beforeEach(() => {
  lib = createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}` });
});

/** Nomor Panggil Eksemplar pertama dari Buku yang baru dicatat. */
async function nomorPanggil(judul: string, pengarang: string, kategoriId = FIK.id) {
  const { bukuId } = await lib.tambahBukuManual({ judul, pengarang, kategoriId });
  const detail = await lib.detailBuku(bukuId);
  return detail!.eksemplar[0].nomorPanggil;
}

describe("Nomor Panggil", () => {
  it("tersusun dari kode Kategori, 3 huruf nama belakang Pengarang Utama (besar), dan huruf awal judul (kecil)", async () => {
    const np = await nomorPanggil("Laut Bercerita", "Leila S. Chudori");

    expect(np.teks).toBe("FIK / CHU / l");
    expect(np.kode).toBe("FIK");
    expect(np.pengarang).toBe("CHU");
    expect(np.judul).toBe("l");
  });

  it("nama belakang adalah kata terakhir nama, bukan kata pertama", async () => {
    expect((await nomorPanggil("Bumi Manusia", "Pramoedya Ananta Toer")).teks).toBe("FIK / TOE / b");
    expect((await nomorPanggil("Sapiens", "Yuval Noah Harari")).teks).toBe("FIK / HAR / s");
  });

  it("nama berformat 'Belakang, Depan' memakai bagian sebelum koma", async () => {
    expect((await nomorPanggil("Laut Bercerita", "Chudori, Leila S.")).pengarang).toBe("CHU");
  });

  it("abaikan akhiran seperti Jr., Sr., dan angka romawi", async () => {
    expect((await nomorPanggil("Atomic Habits", "James Clear Jr.")).pengarang).toBe("CLE");
    expect((await nomorPanggil("Atomic Habits", "James Clear III")).pengarang).toBe("CLE");
  });

  it("nama satu kata dan nama pendek dipakai apa adanya", async () => {
    expect((await nomorPanggil("Ayah", "Hamka")).pengarang).toBe("HAM");
    expect((await nomorPanggil("Tao", "Li")).pengarang).toBe("LI");
  });

  it("huruf beraksen dibaca sebagai huruf biasa", async () => {
    expect((await nomorPanggil("L'Étranger", "Albert Camus")).pengarang).toBe("CAM");
    expect((await nomorPanggil("Röda rummet", "August Strindberg")).pengarang).toBe("STR");
    expect((await nomorPanggil("Satu", "Éric Ångström")).pengarang).toBe("ANG");
  });

  it("kata sandang di awal judul diabaikan (Indonesia dan Inggris)", async () => {
    expect((await nomorPanggil("Si Kancil dan Buaya", "Kancil Penulis")).judul).toBe("k");
    expect((await nomorPanggil("Sang Pemimpi", "Andrea Hirata")).judul).toBe("p");
    expect((await nomorPanggil("Para Pencari Tuhan", "Deddy Mizwar")).judul).toBe("p");
    expect((await nomorPanggil("The Great Gatsby", "F. Scott Fitzgerald")).judul).toBe("g");
    expect((await nomorPanggil("A Brief History of Time", "Stephen Hawking")).judul).toBe("b");
    expect((await nomorPanggil("An Introduction", "Penulis Satu")).judul).toBe("i");
  });

  it("kata sandang tidak dibuang kalau hanya kebetulan awalan kata (Siapa, Theory, Apa)", async () => {
    expect((await nomorPanggil("Siapa Aku", "Penulis Satu")).judul).toBe("s");
    expect((await nomorPanggil("Theory of Everything", "Penulis Satu")).judul).toBe("t");
    expect((await nomorPanggil("Apa Kabar", "Penulis Satu")).judul).toBe("a");
  });

  it("judul yang hanya kata sandang memakai kata itu sendiri", async () => {
    expect((await nomorPanggil("The", "Penulis Satu")).judul).toBe("t");
  });

  it("tanda kutip atau tanda baca di depan judul dilewati", async () => {
    expect((await nomorPanggil("“The Hobbit”", "J. R. R. Tolkien")).judul).toBe("h");
    expect((await nomorPanggil("1984", "George Orwell")).judul).toBe("1");
  });

  it("huruf awal judul dibaca besar-kecilnya sama (SI, the)", async () => {
    expect((await nomorPanggil("SI KANCIL", "Penulis Satu")).judul).toBe("k");
    expect((await nomorPanggil("the road", "Cormac McCarthy")).judul).toBe("r");
  });

  it("kode Kategori diambil dari Kategori Eksemplar yang sekarang", async () => {
    expect((await nomorPanggil("Sirah Nabawiyah", "Safiyyurrahman Mubarakfuri", AGM.id)).teks).toBe(
      "AGM / MUB / s",
    );
  });
});
