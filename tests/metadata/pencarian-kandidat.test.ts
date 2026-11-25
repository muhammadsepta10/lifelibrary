import { describe, expect, it } from "vitest";
import { createMemoryCoverStore } from "@/server/covers";
import { createKandidatSearch } from "@/server/metadata/kandidat";
import { fakeFetch, fixture, json, type Balasan } from "../support/fake-fetch";

/**
 * Seam: Pencarian Kandidat (pencarian cadangan lewat judul). Jawaban Open
 * Library berasal dari rekaman nyata di tests/fixtures/metadata, tanpa jaringan.
 */

const OL_CARI = "openlibrary.org/search.json";
const GOOGLE = "googleapis.com/books/v1/volumes";
const KUNCI_RAHASIA = "KUNCI-TES-RAHASIA";
const GOOGLE_DILEWATI = { sumber: "google", status: "dilewati", pesan: "Kunci API belum diatur" };

type Jawab = Balasan | ((url: string) => Balasan);

/** Tanpa `google` di opsi, kunci tidak diatur dan Google dilewati. */
const siapkan = (balas: Jawab, opsi: { timeoutMs?: number; google?: Jawab } = {}) => {
  const ff = fakeFetch([
    { cocok: OL_CARI, balas: balas as Balasan },
    ...(opsi.google ? [{ cocok: GOOGLE, balas: opsi.google as Balasan }] : []),
  ]);
  const cari = createKandidatSearch({
    fetch: ff.fetch,
    coverStore: createMemoryCoverStore(),
    timeoutMs: opsi.timeoutMs ?? 100,
    googleApiKey: opsi.google ? KUNCI_RAHASIA : undefined,
  });
  return { cari, ...ff };
};

const parameter = (url: string) => new URL(url).searchParams;

describe("Pencarian Kandidat: Open Library", () => {
  it("judul yang ketemu menghasilkan Kandidat dengan id stabil, sumber, dan field bibliografis seperti Parsial", async () => {
    const { cari } = siapkan(json(fixture("ol-judul-atomic-habits.json")));

    const { kandidat, sumber } = await cari({ judul: "Atomic Habits" });

    expect(sumber).toEqual([{ sumber: "openlibrary", status: "ok" }, GOOGLE_DILEWATI]);
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

    expect(hasil).toEqual({ kandidat: [], sumber: [{ sumber: "openlibrary", status: "kosong" }, GOOGLE_DILEWATI] });
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
    expect(hasil.sumber).toEqual([{ sumber: "openlibrary", status: "galat", pesan: expect.any(String) }, GOOGLE_DILEWATI]);
  });

  it("sumber yang macet melewati batas waktu menjadi galat, bukan menggantung", async () => {
    const { cari } = siapkan("macet", { timeoutMs: 30 });

    const hasil = await cari({ judul: "Atomic Habits" });

    expect(hasil.kandidat).toEqual([]);
    expect(hasil.sumber[0]).toMatchObject({ sumber: "openlibrary", status: "galat" });
    expect(hasil.sumber[0].pesan).toMatch(/timeout|lama/i);
  });
});

const OL_KOSONG = json(fixture("ol-judul-tidak-ada.json"));

describe("Pencarian Kandidat: Google Books", () => {
  it("bila kunci diatur, mencari dengan intitle: (+ inauthor:), paling banyak 5, dan kunci hanya dikirim ke Google", async () => {
    const { cari, permintaan } = siapkan(OL_KOSONG, { google: json(fixture("gb-judul-bumi-tere-liye.json")) });

    await cari({ judul: "Bumi", pengarang: "Tere Liye" });

    const google = permintaan.filter((p) => p.url.includes(GOOGLE));
    expect(google).toHaveLength(1);
    const p = parameter(google[0].url);
    expect(p.get("q")).toBe('intitle:"Bumi" inauthor:"Tere Liye"');
    expect(p.get("maxResults")).toBe("5");
    expect(p.get("key")).toBe(KUNCI_RAHASIA);
    expect(permintaan.filter((x) => x.url.includes(KUNCI_RAHASIA))).toHaveLength(1);
  });

  it("tanpa pengarang, kueri hanya intitle:", async () => {
    const { cari, permintaan } = siapkan(OL_KOSONG, { google: json(fixture("gb-judul-bumi-tere-liye.json")) });

    await cari({ judul: "Atomic Habits" });

    expect(parameter(permintaan.find((p) => p.url.includes(GOOGLE))!.url).get("q")).toBe('intitle:"Atomic Habits"');
  });

  it("tanda kutip di judul tidak merusak kueri", async () => {
    const { cari, permintaan } = siapkan(OL_KOSONG, { google: json(fixture("gb-judul-bumi-tere-liye.json")) });

    await cari({ judul: 'Si "Kancil" Cerdik' });

    expect(parameter(permintaan.find((p) => p.url.includes(GOOGLE))!.url).get("q")).toBe('intitle:"Si Kancil Cerdik"');
  });

  it("Kandidat Google punya id stabil, sumber google, field bibliografis, dan sampul https dari books.google.com", async () => {
    const { cari } = siapkan(OL_KOSONG, { google: json(fixture("gb-judul-atomic-habits.json")) });

    const { kandidat, sumber } = await cari({ judul: "Atomic Habits" });

    expect(sumber).toEqual([
      { sumber: "openlibrary", status: "kosong" },
      { sumber: "google", status: "ok" },
    ]);
    expect(kandidat[0]).toEqual({
      id: "google:XfFvDwAAQBAJ",
      sumber: "google",
      judul: "Atomic Habits: An Easy & Proven Way to Build Good Habits & Break Bad Ones",
      pengarang: ["James Clear"],
      penerbit: "Penguin",
      tahun: 2018,
      halaman: 320,
      bahasa: "Inggris",
      sinopsis: "No matter your goals, Atomic Habits offers a proven framework.",
      subjek: ["Self-Help"],
      sampulUrl: "https://books.google.com/books/content?id=XfFvDwAAQBAJ&printsec=frontcover&img=1&zoom=1",
    });
    // Volume tanpa judul dibuang; yang minim tidak mengarang field.
    expect(kandidat.map((k) => k.id)).not.toContain("google:sintetis-tanpa-judul");
    expect(kandidat.find((k) => k.id === "google:sintetis-tanpa-pengarang")).toEqual({
      id: "google:sintetis-tanpa-pengarang",
      sumber: "google",
      judul: "Atomic Habits: Panduan Belajar",
      penerbit: "Penerbit Contoh",
      tahun: 2020,
    });
    // ISBN volume tidak dibawa.
    expect(kandidat[0]).not.toHaveProperty("isbn13");
  });

  it("kandidat dari dua sumber digabung: Open Library lebih dulu, duplikat (judul + pengarang pertama) dibuang, paling banyak 5", async () => {
    const { cari } = siapkan(json(fixture("ol-judul-atomic-habits.json")), {
      google: json(fixture("gb-judul-atomic-habits.json")),
    });

    const { kandidat, sumber } = await cari({ judul: "Atomic Habits" });

    expect(sumber.map((s) => [s.sumber, s.status])).toEqual([
      ["openlibrary", "ok"],
      ["google", "ok"],
    ]);
    expect(kandidat).toHaveLength(5);
    expect(kandidat.map((k) => k.sumber)).toEqual(["openlibrary", "openlibrary", "openlibrary", "openlibrary", "openlibrary"]);

    // Dengan Open Library yang hanya memberi satu hasil, Google mengisi sisanya setelahnya.
    const { kandidat: sedikit } = await siapkan(json(fixture("ol-judul-bumi-tere-liye.json")), {
      google: json(fixture("gb-judul-atomic-habits.json")),
    }).cari({ judul: "Bumi", pengarang: "Tere Liye" });
    expect(sedikit.map((k) => k.id)).toEqual([
      "openlibrary:OL23233727W",
      // "Atomic Habits: An Easy ..." (James Clear) bukan duplikat dari judul lain mana pun.
      "google:XfFvDwAAQBAJ",
      "google:sintetis-kebiasaan-atomik",
      "google:sintetis-tanpa-pengarang",
      "google:sintetis-tanpa-sampul",
    ]);
  });

  it("Kandidat yang sama di dua sumber (judul sama tanpa beda huruf besar atau tanda baca, pengarang pertama sama) hanya muncul sekali, versi Open Library", async () => {
    const { cari } = siapkan(json(fixture("ol-judul-bumi-tere-liye.json")), {
      google: json(fixture("gb-judul-bumi-tere-liye.json")),
    });

    const { kandidat } = await cari({ judul: "Bumi", pengarang: "Tere Liye" });

    expect(kandidat.map((k) => k.id)).toEqual(["openlibrary:OL23233727W", "google:sintetis-bumi-ebook"]);
    expect(kandidat[0].penerbit).toBe("PT Gramedia Pustaka Utama");
  });

  it("judul sama dengan pengarang pertama berbeda bukan duplikat", async () => {
    const { cari } = siapkan(json(fixture("ol-judul-bumi.json")), { google: json(fixture("gb-judul-bumi-tere-liye.json")) });

    const { kandidat } = await cari({ judul: "Bumi" });

    expect(kandidat.map((k) => k.pengarang?.[0])).toEqual(
      expect.arrayContaining(["Tere Liye", "Pramoedya Ananta Toer"]),
    );
    expect(kandidat.length).toBeLessThanOrEqual(5);
  });

  it.each([
    ["galat HTTP", new Response("", { status: 500 })],
    ["tidak bisa dihubungi", new Error("jaringan putus")],
    ["macet", "macet"],
  ] as [string, Balasan][])("Google %s: Kandidat Open Library tetap keluar dan kunci API tidak bocor ke status", async (_nama, balasan) => {
    const { cari } = siapkan(json(fixture("ol-judul-atomic-habits.json")), { google: balasan, timeoutMs: 40 });

    const hasil = await cari({ judul: "Atomic Habits" });

    expect(hasil.kandidat.length).toBeGreaterThan(0);
    expect(hasil.sumber[0]).toEqual({ sumber: "openlibrary", status: "ok" });
    expect(hasil.sumber[1]).toMatchObject({ sumber: "google", status: "galat" });
    expect(JSON.stringify(hasil)).not.toContain(KUNCI_RAHASIA);
  });

  it("Open Library galat: Kandidat Google tetap keluar", async () => {
    const { cari } = siapkan(new Response("", { status: 500 }), { google: json(fixture("gb-judul-atomic-habits.json")) });

    const hasil = await cari({ judul: "Atomic Habits" });

    expect(hasil.kandidat.length).toBeGreaterThan(0);
    expect(hasil.kandidat.every((k) => k.sumber === "google")).toBe(true);
    expect(hasil.sumber[0]).toMatchObject({ sumber: "openlibrary", status: "galat" });
    expect(hasil.sumber[1]).toEqual({ sumber: "google", status: "ok" });
  });

  it("kedua sumber kosong menghasilkan daftar kosong dengan status kosong", async () => {
    const { cari } = siapkan(OL_KOSONG, { google: json(fixture("gb-judul-tidak-ada.json")) });

    expect(await cari({ judul: "zxqvbn lorem" })).toEqual({
      kandidat: [],
      sumber: [
        { sumber: "openlibrary", status: "kosong" },
        { sumber: "google", status: "kosong" },
      ],
    });
  });

  it("tanpa kunci API, Google dilewati tanpa fetch dan Kandidat Open Library tetap keluar", async () => {
    const { cari, permintaan } = siapkan(json(fixture("ol-judul-atomic-habits.json")));

    const { kandidat, sumber } = await cari({ judul: "Atomic Habits" });

    expect(kandidat.length).toBeGreaterThan(0);
    expect(sumber.find((s) => s.sumber === "google")).toEqual(GOOGLE_DILEWATI);
    expect(permintaan.some((p) => p.url.includes(GOOGLE))).toBe(false);
  });
});
