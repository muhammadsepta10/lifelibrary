import { describe, expect, it } from "vitest";
import { createMemoryCoverStore } from "@/server/covers";
import { createKandidatSearch } from "@/server/metadata/kandidat";
import { fakeFetch, fixture, json, type Balasan } from "../support/fake-fetch";

/**
 * Seam: Pencarian Kandidat (pencarian cadangan lewat judul). Jawaban Open
 * Library berasal dari rekaman nyata di tests/fixtures/metadata, tanpa jaringan.
 */

const OL_CARI = "openlibrary.org/search.json";

const siapkan = (balas: Balasan | ((url: string) => Balasan), opsi: { timeoutMs?: number } = {}) => {
  const ff = fakeFetch([{ cocok: OL_CARI, balas: balas as Balasan }]);
  const cari = createKandidatSearch({
    fetch: ff.fetch,
    coverStore: createMemoryCoverStore(),
    timeoutMs: opsi.timeoutMs ?? 100,
  });
  return { cari, ...ff };
};

const parameter = (url: string) => new URL(url).searchParams;

describe("Pencarian Kandidat: Open Library", () => {
  it("judul yang ketemu menghasilkan Kandidat dengan id stabil, sumber, dan field bibliografis seperti Parsial", async () => {
    const { cari } = siapkan(json(fixture("ol-judul-atomic-habits.json")));

    const { kandidat, sumber } = await cari({ judul: "Atomic Habits" });

    expect(sumber).toEqual([{ sumber: "openlibrary", status: "ok" }]);
    expect(kandidat).toHaveLength(5);
    expect(kandidat[0]).toMatchObject({
      id: "openlibrary:OL17930368W",
      sumber: "openlibrary",
      judul: "Atomic Habits",
      pengarang: ["James Clear"],
      tahun: 2016,
      halaman: 322,
      kelasDdc: "155.24",
      subjek: expect.arrayContaining(["Habit", "Habit breaking"]),
      sampulUrl: "https://covers.openlibrary.org/b/id/12539702-L.jpg",
    });
    // Kandidat tanpa DDC, bahasa tunggal, atau sampul tidak mengarang field itu.
    expect(kandidat[4]).toMatchObject({ judul: "Atomic Habits Daily Journal", pengarang: ["Rondyy Rondyy Roo"] });
    expect(kandidat[4]).not.toHaveProperty("sampulUrl");
    expect(kandidat[4]).not.toHaveProperty("kelasDdc");
  });

  it("meminta Open Library dengan parameter title, field terbatas, dan paling banyak 5 hasil; tanpa author bila pengarang kosong", async () => {
    const { cari, permintaan } = siapkan(json(fixture("ol-judul-atomic-habits.json")));

    await cari({ judul: "  Atomic Habits  ", pengarang: "   " });

    expect(permintaan).toHaveLength(1);
    const p = parameter(permintaan[0].url);
    expect(p.get("title")).toBe("Atomic Habits");
    expect(p.has("author")).toBe(false);
    expect(p.get("limit")).toBe("5");
    expect(p.get("fields")?.split(",")).toEqual(
      expect.arrayContaining(["key", "title", "author_name", "first_publish_year", "publisher", "cover_i"]),
    );
    expect(p.get("fields")?.split(",")).not.toContain("*");
    expect(permintaan[0].headers.get("user-agent")).toContain("lifelibrary");
  });

  it("judul yang tidak ketemu menghasilkan daftar kosong dengan status kosong", async () => {
    const { cari } = siapkan(json(fixture("ol-judul-tidak-ada.json")));

    const hasil = await cari({ judul: "zxqvbn lorem tidak ada buku" });

    expect(hasil).toEqual({ kandidat: [], sumber: [{ sumber: "openlibrary", status: "kosong" }] });
  });

  it("judul umum menyempit setelah pengarang ditambahkan: permintaan memuat author dan hasilnya hanya karya pengarang itu", async () => {
    const { cari, permintaan } = siapkan((url) =>
      json(fixture(parameter(url).has("author") ? "ol-judul-bumi-tere-liye.json" : "ol-judul-bumi.json")),
    );

    const umum = await cari({ judul: "Bumi" });
    const sempit = await cari({ judul: "Bumi", pengarang: "Tere Liye" });

    expect(umum.kandidat.map((k) => k.pengarang?.[0])).toContain("Pramoedya Ananta Toer");
    expect(umum.kandidat.length).toBeGreaterThan(sempit.kandidat.length);
    expect(parameter(permintaan[1].url).get("author")).toBe("Tere Liye");
    expect(sempit.kandidat).toHaveLength(1);
    expect(sempit.kandidat[0]).toMatchObject({
      id: "openlibrary:OL23233727W",
      judul: "Bumi",
      pengarang: ["Tere Liye"],
      penerbit: "PT Gramedia Pustaka Utama",
      tahun: 2014,
      halaman: 438,
      bahasa: "Indonesia",
    });
  });

  it("ISBN milik Kandidat tidak dibawa sebagai field Kandidat", async () => {
    const { cari } = siapkan(json(fixture("ol-judul-bumi-tere-liye.json")));

    const { kandidat } = await cari({ judul: "Bumi", pengarang: "Tere Liye" });

    expect(kandidat[0]).not.toHaveProperty("isbn13");
    expect(kandidat[0]).not.toHaveProperty("isbn");
  });

  it.each([
    ["sumber tidak bisa dihubungi", new Error("jaringan putus")],
    ["balasan galat HTTP 500", new Response("", { status: 500 })],
    ["balasan bukan JSON", new Response("<html>", { status: 200, headers: { "content-type": "text/html" } })],
  ] as [string, Balasan][])("%s menghasilkan status galat tanpa melempar", async (_nama, balasan) => {
    const { cari } = siapkan(balasan);

    const hasil = await cari({ judul: "Atomic Habits" });

    expect(hasil.kandidat).toEqual([]);
    expect(hasil.sumber).toEqual([{ sumber: "openlibrary", status: "galat", pesan: expect.any(String) }]);
  });

  it("sumber yang macet melewati batas waktu menjadi galat, bukan menggantung", async () => {
    const { cari } = siapkan("macet", { timeoutMs: 30 });

    const hasil = await cari({ judul: "Atomic Habits" });

    expect(hasil.kandidat).toEqual([]);
    expect(hasil.sumber[0]).toMatchObject({ sumber: "openlibrary", status: "galat" });
    expect(hasil.sumber[0].pesan).toMatch(/timeout|lama/i);
  });
});
