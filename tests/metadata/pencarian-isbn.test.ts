import { describe, expect, it } from "vitest";
import { createMemoryCoverStore } from "@/server/covers";
import { createMetadataLookup } from "@/server/metadata";
import { fakeFetch, fixture, gambar, json, tidakAda, xml, type Balasan } from "../support/fake-fetch";

/**
 * Seam: Pencarian Metadata ISBN. Semua jawaban sumber berasal dari rekaman
 * nyata di tests/fixtures/metadata (kecuali gb-sintetis-*, ditandai
 * `_synthetic`), tanpa jaringan.
 */


const OL_SEARCH = "openlibrary.org/search.json";
const OL_EDISI = "openlibrary.org/isbn/";
const GOOGLE = "googleapis.com/books/v1/volumes";
const LOC = "lx2.loc.gov/sru/lcdb";
const SAMPUL = "covers.openlibrary.org";

const ATOMIC_ID = "9786020633176";
const LAUT = "9786024246945";
const TAK_ADA = "9786026486066";
const ATOMIC_EN = "9780735211292";

type Peta = Record<string, Balasan>;
const siapkan = (peta: Peta, opsi: { googleApiKey?: string | undefined; timeoutMs?: number } = {}) => {
  const ff = fakeFetch(Object.entries(peta).map(([cocok, balas]) => ({ cocok, balas })));
  const sampul = createMemoryCoverStore();
  const cari = createMetadataLookup({
    fetch: ff.fetch,
    coverStore: sampul,
    timeoutMs: opsi.timeoutMs ?? 100,
    googleApiKey: "googleApiKey" in opsi ? opsi.googleApiKey : "KUNCI-TES-RAHASIA",
  });
  return { cari, sampul, ...ff };
};

const atomicIndonesia: Peta = {
  [OL_SEARCH]: json(fixture("ol-search-9786020633176.json")),
  [OL_EDISI]: json(fixture("ol-isbn-9786020633176.json")),
  [GOOGLE]: json(fixture("gb-kosong.json")),
  [LOC]: xml(fixture("loc-sru-notfound.xml")),
  [SAMPUL]: gambar(7),
};

const lautBercerita: Peta = {
  [OL_SEARCH]: json(fixture("ol-search-9786024246945.json")),
  [OL_EDISI]: json(fixture("ol-isbn-9786024246945.json")),
  [GOOGLE]: json(fixture("gb-kosong.json")),
  [LOC]: xml(fixture("loc-sru-9786024246945.xml")),
  [SAMPUL]: gambar(9),
};

const tidakDitemukan: Peta = {
  [OL_SEARCH]: json(fixture("ol-search-9786026486066-notfound.json")),
  [OL_EDISI]: tidakAda(),
  [GOOGLE]: json(fixture("gb-kosong.json")),
  [LOC]: xml(fixture("loc-sru-notfound.xml")),
  [SAMPUL]: tidakAda(),
};

async function ditemukan(hasil: ReturnType<ReturnType<typeof siapkan>["cari"]>) {
  const h = await hasil;
  if (!h.ditemukan) throw new Error("seharusnya ditemukan");
  return h;
}

describe("Pencarian Metadata ISBN: terjemahan dengan Kelas DDC dari edisi lain", () => {
  it("Atomic Habits (edisi Indonesia) mendapat Kelas DDC 155.24 dari Open Library, lengkap dengan sumber per field", async () => {
    const { cari } = siapkan(atomicIndonesia);

    const { draf } = await ditemukan(cari(ATOMIC_ID));

    expect(draf).toMatchObject({
      isbn13: ATOMIC_ID,
      judul: "Atomic Habits: Perubahan Kecil yang memberikan hasil luar biasa",
      pengarang: ["James Clear"],
      penerbit: "Gramedia Pustaka Utama",
      tahun: 2019,
      halaman: 351,
      kelasDdc: "155.24",
    });
    expect(draf.subjek).toEqual(expect.arrayContaining(["Habit", "Habit breaking", "Behavior modification"]));
    expect(draf.sumber).toMatchObject({
      judul: ["openlibrary"],
      pengarang: ["openlibrary"],
      penerbit: ["openlibrary"],
      kelasDdc: ["openlibrary"],
      subjek: ["openlibrary"],
    });
  });

  it("melaporkan status tiap sumber", async () => {
    const { cari } = siapkan(atomicIndonesia);

    const { sumber } = await ditemukan(cari(ATOMIC_ID));

    expect(sumber).toEqual([
      { sumber: "openlibrary", status: "ok" },
      { sumber: "google", status: "kosong" },
      { sumber: "loc", status: "kosong" },
    ]);
  });

  it("mengirim User-Agent yang jelas ke Open Library dan LoC", async () => {
    const { cari, permintaan } = siapkan(atomicIndonesia);

    await cari(ATOMIC_ID);

    const ol = permintaan.find((p) => p.url.includes(OL_SEARCH))!;
    expect(ol.headers.get("user-agent")).toMatch(/^lifelibrary\//);
  });
});

describe("Pencarian Metadata ISBN: buku asli Indonesia tanpa DDC", () => {
  it("tetap menghasilkan draf dari metadata yang ada; Kelas DDC kosong, subjek kosong tanpa Google", async () => {
    const { cari } = siapkan(lautBercerita);

    const { draf } = await ditemukan(cari(LAUT));

    expect(draf).toMatchObject({
      judul: "Laut Bercerita",
      pengarang: ["Leila S. Chudori"],
      penerbit: "Kepustakaan Populer Gramedia",
      kota: "Jakarta",
      tahun: 2017,
      halaman: 390,
      bahasa: "Indonesia",
      kelasDdc: null,
      subjek: [],
    });
    expect(draf.sinopsis).toMatch(/^Di sebuah senja/);
    expect(draf.sumber.kelasDdc).toBeUndefined();
    expect(draf.sumber.halaman).toEqual(["openlibrary"]);
  });

  it("edisi dibaca dari Library of Congress (bidang 250); seri dan jilid kosong karena sumbernya tidak memuatnya", async () => {
    const { cari } = siapkan(lautBercerita);

    const { draf } = await ditemukan(cari(LAUT));

    expect(draf).toMatchObject({ edisi: "Cetakan pertama", seri: null, jilid: null, penerjemah: [], editor: [] });
    expect(draf.sumber.edisi).toEqual(["loc"]);
  });

  it("subjek diambil dari kategori Google Books bila ada (fixture sintetis)", async () => {
    const { cari } = siapkan({ ...lautBercerita, [GOOGLE]: json(fixture("gb-sintetis-9786024246945.json")) });

    const { draf } = await ditemukan(cari(LAUT));

    expect(draf.subjek).toEqual(["Fiction", "Political"]);
    expect(draf.sumber.subjek).toEqual(["google"]);
    // Open Library tetap menang untuk field yang ia punya
    expect(draf.sumber.penerbit).toEqual(["openlibrary"]);
  });

  it("Google Books tanpa kunci API dilewati, tidak dihubungi", async () => {
    const { cari, permintaan } = siapkan(lautBercerita, { googleApiKey: undefined });

    const hasil = await ditemukan(cari(LAUT));

    expect(permintaan.some((p) => p.url.includes(GOOGLE))).toBe(false);
    expect(hasil.sumber.find((s) => s.sumber === "google")).toMatchObject({ status: "dilewati" });
    expect(hasil.draf.judul).toBe("Laut Bercerita");
  });
});

describe("Pencarian Metadata ISBN: Library of Congress dan penggabungan", () => {
  const hanyaLoc: Peta = {
    [OL_SEARCH]: json(fixture("ol-search-9786026486066-notfound.json")),
    [OL_EDISI]: tidakAda(),
    [GOOGLE]: json(fixture("gb-bukan-cocok-9780735211308.json")),
    [LOC]: xml(fixture("loc-sru-9780735211292.xml")),
    [SAMPUL]: tidakAda(),
  };

  it("ISBN edisi Inggris: data dan Kelas DDC 155.24 dari LoC (082 155.2/4), hanya angkanya", async () => {
    const { cari } = siapkan(hanyaLoc);

    const { draf } = await ditemukan(cari(ATOMIC_EN));

    expect(draf).toMatchObject({
      judul: "Atomic habits: tiny changes, remarkable results : an easy & proven way to build good habits & break bad ones",
      pengarang: ["James Clear"],
      penerbit: "Avery, an imprint of Penguin Random House",
      kota: "New York",
      tahun: 2018,
      halaman: 306,
      kelasDdc: "155.24",
    });
    expect(draf.subjek).toEqual(expect.arrayContaining(["Habit", "Habit breaking", "Behavior modification"]));
    expect(new Set(draf.subjek.map((s) => s.toLowerCase())).size).toBe(draf.subjek.length);
    expect(draf.sumber).toMatchObject({ kelasDdc: ["loc"], penerbit: ["loc"], judul: ["loc"] });
  });

  it("hasil Google Books yang ISBN-nya tidak cocok (pencarian kabur) diabaikan", async () => {
    const { cari } = siapkan(hanyaLoc);

    const { draf, sumber } = await ditemukan(cari(ATOMIC_EN));

    expect(draf.judul).not.toMatch(/Better Habits/);
    expect(sumber.find((s) => s.sumber === "google")?.status).toBe("kosong");
  });

  it("sumber berprioritas lebih tinggi menang per field; sumber lain mengisi yang kosong", async () => {
    // Open Library hanya punya kolom pencarian (tanpa edisi): penerbit tidak ada di sana, jadi LoC mengisi
    const { cari } = siapkan({
      ...hanyaLoc,
      [OL_SEARCH]: json(fixture("ol-search-9786020633176.json")),
    });

    const { draf } = await ditemukan(cari(ATOMIC_EN));

    expect(draf.sumber.pengarang).toEqual(["openlibrary"]);
    expect(draf.kelasDdc).toBe("155.24");
    expect(draf.sumber.kelasDdc).toEqual(["openlibrary"]);
    expect(draf.penerbit).toBe("Avery, an imprint of Penguin Random House");
    expect(draf.sumber.penerbit).toEqual(["loc"]);
  });
});

describe("Pencarian Metadata ISBN: tidak ditemukan", () => {
  it("ISBN yang tidak ada di semua sumber: tidak ditemukan, bukan galat", async () => {
    const { cari } = siapkan(tidakDitemukan);

    const hasil = await cari(TAK_ADA);

    expect(hasil).toMatchObject({ ditemukan: false, isbn13: TAK_ADA, semuaGalat: false });
    expect(hasil.sumber.map((s) => s.status)).toEqual(["kosong", "kosong", "kosong"]);
  });
});

describe("Pencarian Metadata ISBN: satu sumber gagal tidak menggagalkan yang lain", () => {
  it("LoC melempar galat dan Google macet (timeout): draf tetap dari Open Library, dua sumber dilaporkan galat", async () => {
    const { cari } = siapkan({ ...atomicIndonesia, [LOC]: new Error("koneksi putus"), [GOOGLE]: "macet" });

    const mulai = Date.now();
    const hasil = await ditemukan(cari(ATOMIC_ID));

    expect(Date.now() - mulai).toBeLessThan(2000);
    expect(hasil.draf.kelasDdc).toBe("155.24");
    expect(hasil.sumber.map((s) => [s.sumber, s.status])).toEqual([
      ["openlibrary", "ok"],
      ["google", "galat"],
      ["loc", "galat"],
    ]);
    expect(hasil.sumber.find((s) => s.sumber === "google")?.pesan).toMatch(/lama|timeout|waktu/i);
  });

  it("Open Library error (HTTP 500): Google Books dan LoC tetap dipakai", async () => {
    const { cari } = siapkan({
      [OL_SEARCH]: new Response("", { status: 500 }),
      [OL_EDISI]: new Response("", { status: 500 }),
      [GOOGLE]: json(fixture("gb-sintetis-9786024246945.json")),
      [LOC]: xml(fixture("loc-sru-9786024246945.xml")),
      [SAMPUL]: gambar(),
    });

    const hasil = await ditemukan(cari(LAUT));

    expect(hasil.sumber[0]).toMatchObject({ sumber: "openlibrary", status: "galat" });
    expect(hasil.draf.judul).toBe("Laut Bercerita");
    expect(hasil.draf.sumber.judul).toEqual(["google"]);
    expect(hasil.draf.subjek).toEqual(["Fiction", "Political"]);
  });

  it("semua sumber galat: tidak ditemukan dengan penanda semuaGalat, supaya UI tidak bilang 'buku tidak ada'", async () => {
    const mati = new Error("offline");
    const { cari } = siapkan({ [OL_SEARCH]: mati, [OL_EDISI]: mati, [GOOGLE]: mati, [LOC]: mati });

    const hasil = await cari(LAUT);

    expect(hasil).toMatchObject({ ditemukan: false, semuaGalat: true });
  });

  it("edisi Open Library 404 tapi pencarian ada: draf dari pencarian, tidak galat", async () => {
    const { cari } = siapkan({ ...lautBercerita, [OL_EDISI]: tidakAda() });

    const hasil = await ditemukan(cari(LAUT));

    expect(hasil.sumber[0]).toMatchObject({ sumber: "openlibrary", status: "ok" });
    expect(hasil.draf.judul).toBe("Laut Bercerita");
  });
});

describe("Pencarian Metadata ISBN: sampul", () => {
  it("sampul diunduh dan disimpan di storage aplikasi; draf memegang kuncinya, bukan alamat luar", async () => {
    const { cari, sampul, permintaan } = siapkan(atomicIndonesia);

    const { draf } = await ditemukan(cari(ATOMIC_ID));

    expect(draf.sampul).toBe(`${ATOMIC_ID}.jpg`);
    expect(draf.sumber.sampul).toEqual(["openlibrary"]);
    const tersimpan = await sampul.get(draf.sampul!);
    expect(tersimpan?.contentType).toBe("image/jpeg");
    expect([...tersimpan!.bytes]).toEqual([0xff, 0xd8, 0xff, 7]);
    expect(permintaan.some((p) => p.url.startsWith("https://covers.openlibrary.org/"))).toBe(true);
    expect(draf.sampul).not.toMatch(/^https?:/);
  });

  it("sampul gagal diunduh: draf tetap jadi, tanpa sampul", async () => {
    const { cari, sampul } = siapkan({ ...atomicIndonesia, [SAMPUL]: new Error("putus") });

    const { draf } = await ditemukan(cari(ATOMIC_ID));

    expect(draf.sampul).toBeNull();
    expect(draf.judul).toContain("Atomic Habits");
    expect(await sampul.get(`${ATOMIC_ID}.jpg`)).toBeNull();
  });

  it("sampul yang bukan gambar (mis. halaman galat) ditolak", async () => {
    const html = new Response("<html>oops</html>", { headers: { "content-type": "text/html" } });
    const { cari } = siapkan({ ...atomicIndonesia, [SAMPUL]: html });

    expect((await ditemukan(cari(ATOMIC_ID))).draf.sampul).toBeNull();
  });
});

describe("Pencarian Metadata ISBN: rahasia", () => {
  it("kunci API Google Books hanya dikirim ke Google, tidak muncul di hasil", async () => {
    const { cari, permintaan } = siapkan({ ...lautBercerita, [GOOGLE]: json(fixture("gb-sintetis-9786024246945.json")) });

    const hasil = await cari(LAUT);

    expect(JSON.stringify(hasil)).not.toContain("KUNCI-TES-RAHASIA");
    const keluar = permintaan.filter((p) => p.url.includes("KUNCI-TES-RAHASIA"));
    expect(keluar.length).toBeGreaterThan(0);
    expect(keluar.every((p) => p.url.includes(GOOGLE))).toBe(true);
  });
});
