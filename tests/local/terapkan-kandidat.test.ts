import { describe, expect, it } from "vitest";
import { drafKosong, terapkanKandidat, type DrafBuku, type Kandidat } from "@/lib/draf-buku";

const ISBN_SCAN = "9786026486066";

const kandidat: Kandidat = {
  id: "openlibrary:OL23233727W",
  sumber: "openlibrary",
  judul: "Bumi (edisi lain)",
  pengarang: ["Tere Liye"],
  penerbit: "PT Gramedia Pustaka Utama",
  tahun: 2014,
  halaman: 438,
  bahasa: "Indonesia",
  subjek: ["Fantasi", "Remaja"],
  kelasDdc: "899.2213",
  sampulUrl: "https://covers.openlibrary.org/b/id/12810708-L.jpg",
};

const drafKetikan = (ubah: Partial<DrafBuku> = {}): DrafBuku => ({ ...drafKosong(ISBN_SCAN), judul: "Bumi", ...ubah });

describe("terapkanKandidat: Kandidat melengkapi draf", () => {
  it("mengisi field kosong dan mencatat sumber serta daftar field yang berasal dari Kandidat", () => {
    const hasil = terapkanKandidat(drafKetikan(), kandidat);

    expect(hasil).toMatchObject({
      pengarang: ["Tere Liye"],
      penerbit: "PT Gramedia Pustaka Utama",
      tahun: 2014,
      halaman: 438,
      bahasa: "Indonesia",
      subjek: ["Fantasi", "Remaja"],
      kelasDdc: "899.2213",
    });
    expect(hasil.sumber).toMatchObject({
      pengarang: ["openlibrary"],
      penerbit: ["openlibrary"],
      tahun: ["openlibrary"],
      halaman: ["openlibrary"],
      bahasa: ["openlibrary"],
      subjek: ["openlibrary"],
      kelasDdc: ["openlibrary"],
    });
    expect([...(hasil.dariKandidat ?? [])].sort()).toEqual(
      ["bahasa", "halaman", "kelasDdc", "penerbit", "pengarang", "subjek", "tahun"],
    );
  });

  it("judul ketikan Pemilik dan ISBN hasil scan tidak berubah, juga tidak dicatat sebagai dari Kandidat", () => {
    const hasil = terapkanKandidat(drafKetikan(), kandidat);

    expect(hasil.judul).toBe("Bumi");
    expect(hasil.isbn13).toBe(ISBN_SCAN);
    expect(hasil.dariKandidat).not.toContain("judul");
    expect(hasil.sumber.judul).toBeUndefined();
  });

  it("field yang sudah terisi tidak ditimpa dan tidak ditandai dari Kandidat", () => {
    const draf = drafKetikan({ pengarang: ["Pengarang Ketikan"], penerbit: "Penerbit Ketikan", tahun: 2020, subjek: ["Ketikan"] });

    const hasil = terapkanKandidat(draf, kandidat);

    expect(hasil).toMatchObject({ pengarang: ["Pengarang Ketikan"], penerbit: "Penerbit Ketikan", tahun: 2020, subjek: ["Ketikan"] });
    expect(hasil.dariKandidat).toEqual(expect.not.arrayContaining(["pengarang", "penerbit", "tahun", "subjek"]));
    expect(hasil.sumber.penerbit).toBeUndefined();
    // Field kosong lain tetap terisi.
    expect(hasil.halaman).toBe(438);
  });

  it("judul kosong ikut terisi, karena tidak ada ketikan yang dilindungi", () => {
    const hasil = terapkanKandidat(drafKetikan({ judul: "" }), kandidat);

    expect(hasil.judul).toBe("Bumi (edisi lain)");
    expect(hasil.dariKandidat).toContain("judul");
  });

  it("subjek kosong terisi paling banyak 20", () => {
    const banyak = Array.from({ length: 30 }, (_, i) => `Subjek ${i}`);

    const hasil = terapkanKandidat(drafKetikan(), { ...kandidat, subjek: banyak });

    expect(hasil.subjek).toEqual(banyak.slice(0, 20));
  });

  it("field yang tidak diketahui Kandidat dibiarkan kosong dan tidak ditandai", () => {
    const hasil = terapkanKandidat(drafKetikan(), { id: "openlibrary:OL1W", sumber: "openlibrary", judul: "Bumi" });

    expect(hasil).toEqual(drafKetikan());
    expect(hasil.dariKandidat ?? []).toEqual([]);
  });

  it("sampul draf tidak disentuh, dan draf asli tidak diubah", () => {
    const draf = drafKetikan({ sampul: "9786026486066.jpg" });
    const salinan = structuredClone(draf);

    const hasil = terapkanKandidat(draf, kandidat);

    expect(hasil.sampul).toBe("9786026486066.jpg");
    expect(draf).toEqual(salinan);
  });

  it("draf lama tanpa daftar penanda tetap diterima, dan menerapkan dua Kandidat berturut-turut tidak menimpa yang pertama", () => {
    const lama = drafKetikan() as Partial<DrafBuku>;
    delete lama.dariKandidat;
    const pertama = terapkanKandidat(lama as DrafBuku, kandidat);

    const kedua = terapkanKandidat(pertama, { ...kandidat, id: "openlibrary:OL2W", penerbit: "Penerbit Lain", edisi: "Cetakan kedua" });

    expect(kedua.penerbit).toBe("PT Gramedia Pustaka Utama");
    expect(kedua.edisi).toBe("Cetakan kedua");
    expect(kedua.dariKandidat).toEqual(expect.arrayContaining(["penerbit", "edisi", "halaman"]));
  });
});
