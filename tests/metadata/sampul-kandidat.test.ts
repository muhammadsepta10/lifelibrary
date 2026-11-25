import { describe, expect, it } from "vitest";
import { createMemoryCoverStore } from "@/server/covers";
import { createSampulKandidat, urlSampulDiizinkan } from "@/server/metadata/sampul";
import { fakeFetch, gambar, tidakAda, type Balasan } from "../support/fake-fetch";

/**
 * Seam: simpanSampulKandidat. Mengunduh sampul Kandidat yang dipilih Pemilik
 * dan menyimpannya dengan kunci ISBN hasil scan. Fake fetch + cover store memori.
 */

const ISBN = "9786026486066";

const siapkan = (balas: Balasan | (() => Balasan) = gambar(3),opsi: { timeoutMs?: number } = {}) => {
  const ff = fakeFetch([{ cocok: /./, balas }]);
  const coverStore = createMemoryCoverStore();
  const simpan = createSampulKandidat({ fetch: ff.fetch, coverStore, timeoutMs: opsi.timeoutMs ?? 100 });
  return { simpan, coverStore, ...ff };
};

describe("simpanSampulKandidat", () => {
  it.each([
    "https://covers.openlibrary.org/b/id/12810708-L.jpg",
    "https://books.google.com/books/content?id=abc&zoom=1",
    "https://books.googleusercontent.com/books/content?id=abc",
  ])("sampul dari host yang diizinkan (%s) tersimpan dengan kunci ISBN hasil scan", async (url) => {
    const { simpan, coverStore, permintaan } = siapkan(gambar(5));

    const hasil = await simpan({ isbn13: ISBN, url });

    expect(hasil).toEqual({ kunci: `${ISBN}.jpg` });
    expect(permintaan).toHaveLength(1);
    const simpanan = await coverStore.get(`${ISBN}.jpg`);
    expect(simpanan?.contentType).toBe("image/jpeg");
    expect([...simpanan!.bytes]).toEqual([0xff, 0xd8, 0xff, 5]);
  });

  it.each([
    ["host lain", "https://example.com/sampul.jpg"],
    ["host mirip (sufiks)", "https://covers.openlibrary.org.jahat.example/b/id/1-L.jpg"],
    ["subdomain tak dikenal", "https://evil.books.google.com/x.jpg"],
    ["tanpa TLS (http)", "http://covers.openlibrary.org/b/id/1-L.jpg"],
    ["alamat internal", "https://127.0.0.1/sampul.jpg"],
    ["skema lain", "file:///etc/passwd"],
    ["bukan alamat", "bukan url"],
    ["kredensial di alamat", "https://user:sandi@covers.openlibrary.org/b/id/1-L.jpg"],
  ])("alamat tidak diizinkan (%s) ditolak tanpa fetch", async (_nama, url) => {
    const { simpan, coverStore, permintaan } = siapkan();

    expect(urlSampulDiizinkan(url)).toBe(false);
    expect(await simpan({ isbn13: ISBN, url })).toBeNull();
    expect(permintaan).toHaveLength(0);
    expect(await coverStore.get(`${ISBN}.jpg`)).toBeNull();
  });

  it.each([
    ["bukan gambar", new Response("<html>", { headers: { "content-type": "text/html" } })],
    ["kosong", new Response(new Uint8Array(0), { headers: { "content-type": "image/jpeg" } })],
    ["terlalu besar", new Response(new Uint8Array(5 * 1024 * 1024 + 1), { headers: { "content-type": "image/jpeg" } })],
    ["404", tidakAda()],
    ["sumber tidak bisa dihubungi", new Error("jaringan putus")],
  ] as [string, Balasan][])("respons %s menghasilkan null dan tidak menyimpan apa pun", async (_nama, balasan) => {
    const { simpan, coverStore } = siapkan(balasan);

    expect(await simpan({ isbn13: ISBN, url: "https://covers.openlibrary.org/b/id/1-L.jpg" })).toBeNull();
    expect(await coverStore.get(`${ISBN}.jpg`)).toBeNull();
  });

  it("unduhan yang macet melewati batas waktu menjadi null", async () => {
    const { simpan } = siapkan("macet", { timeoutMs: 30 });

    expect(await simpan({ isbn13: ISBN, url: "https://covers.openlibrary.org/b/id/1-L.jpg" })).toBeNull();
  });
});

const alihkan = (lokasi: string, status = 302) => new Response(null, { status, headers: { location: lokasi } });

describe("simpanSampulKandidat: pengalihan (redirect)", () => {
  const siapkanAlih = (peta: Record<string, Balasan>) => {
    const ff = fakeFetch([{ cocok: /./, balas: (url) => peta[url] ?? tidakAda() }]);
    const coverStore = createMemoryCoverStore();
    const simpan = createSampulKandidat({ fetch: ff.fetch, coverStore, timeoutMs: 100 });
    return { simpan, coverStore, ...ff };
  };
  const AWAL = "https://covers.openlibrary.org/b/id/1-L.jpg";

  it.each([
    ["archive.org", "https://archive.org/download/x/cover.jpg"],
    ["subdomain archive.org", "https://ia800000.us.archive.org/1/items/x/cover.jpg"],
    ["host sampul lain", "https://books.googleusercontent.com/books/content?id=abc"],
  ])("pengalihan ke %s diikuti dan sampul tersimpan", async (_nama, tujuan) => {
    const { simpan, coverStore, permintaan } = siapkanAlih({ [AWAL]: alihkan(tujuan), [tujuan]: gambar(7) });

    expect(await simpan({ isbn13: ISBN, url: AWAL })).toEqual({ kunci: `${ISBN}.jpg` });
    expect(permintaan.map((p) => p.url)).toEqual([AWAL, tujuan]);
    expect((await coverStore.get(`${ISBN}.jpg`))?.bytes.at(-1)).toBe(7);
  });

  it("alamat Location relatif di-resolve terhadap alamat sebelumnya", async () => {
    const { simpan, permintaan } = siapkanAlih({
      [AWAL]: alihkan("/b/id/2-L.jpg"),
      "https://covers.openlibrary.org/b/id/2-L.jpg": gambar(),
    });

    expect(await simpan({ isbn13: ISBN, url: AWAL })).toEqual({ kunci: `${ISBN}.jpg` });
    expect(permintaan.at(-1)?.url).toBe("https://covers.openlibrary.org/b/id/2-L.jpg");
  });

  it.each([
    ["host asing", "https://example.com/sampul.jpg"],
    ["alamat internal", "https://127.0.0.1/sampul.jpg"],
    ["metadata cloud", "http://169.254.169.254/latest/meta-data"],
    ["tanpa TLS", "http://archive.org/cover.jpg"],
    ["kredensial", "https://user:sandi@archive.org/cover.jpg"],
    ["host mirip archive.org", "https://evilarchive.org/cover.jpg"],
    ["skema lain", "file:///etc/passwd"],
  ])("pengalihan ke %s ditolak tanpa mengambil tujuannya", async (_nama, tujuan) => {
    const { simpan, coverStore, permintaan } = siapkanAlih({ [AWAL]: alihkan(tujuan), [tujuan]: gambar() });

    expect(await simpan({ isbn13: ISBN, url: AWAL })).toBeNull();
    expect(permintaan.map((p) => p.url)).toEqual([AWAL]);
    expect(await coverStore.get(`${ISBN}.jpg`)).toBeNull();
  });

  it("pengalihan yang berputar atau lebih dari 3 lompatan menjadi null", async () => {
    const a = "https://archive.org/a.jpg";
    const putar = siapkanAlih({ [AWAL]: alihkan(a), [a]: alihkan(AWAL) });
    expect(await putar.simpan({ isbn13: ISBN, url: AWAL })).toBeNull();
    expect(putar.permintaan.length).toBeLessThanOrEqual(4);

    const rantai = siapkanAlih({
      [AWAL]: alihkan("https://archive.org/1.jpg"),
      "https://archive.org/1.jpg": alihkan("https://archive.org/2.jpg"),
      "https://archive.org/2.jpg": alihkan("https://archive.org/3.jpg"),
      "https://archive.org/3.jpg": alihkan("https://archive.org/4.jpg"),
      "https://archive.org/4.jpg": gambar(),
    });
    expect(await rantai.simpan({ isbn13: ISBN, url: AWAL })).toBeNull();
  });

  it("tepat 3 lompatan masih diterima", async () => {
    const { simpan } = siapkanAlih({
      [AWAL]: alihkan("https://archive.org/1.jpg"),
      "https://archive.org/1.jpg": alihkan("https://archive.org/2.jpg"),
      "https://archive.org/2.jpg": alihkan("https://archive.org/3.jpg"),
      "https://archive.org/3.jpg": gambar(),
    });
    expect(await simpan({ isbn13: ISBN, url: AWAL })).toEqual({ kunci: `${ISBN}.jpg` });
  });

  it("pengalihan tanpa header Location menjadi null", async () => {
    const { simpan } = siapkanAlih({ [AWAL]: new Response(null, { status: 302 }) });
    expect(await simpan({ isbn13: ISBN, url: AWAL })).toBeNull();
  });
});

describe("simpanSampulKandidat: batas 5 MB ditegakkan sebelum seluruh isi dibaca", () => {
  const url = "https://covers.openlibrary.org/b/id/1-L.jpg";
  const MB = 1024 * 1024;

  it("content-length di atas batas ditolak tanpa membaca isi", async () => {
    let dibaca = false;
    const badan = new ReadableStream<Uint8Array>(
      {
        pull(c) {
          dibaca = true;
          c.enqueue(new Uint8Array([1]));
          c.close();
        },
      },
      { highWaterMark: 0 },
    );
    const { simpan, coverStore } = siapkan(
      () => new Response(badan, { headers: { "content-type": "image/jpeg", "content-length": String(5 * MB + 1) } }),
    );

    expect(await simpan({ isbn13: ISBN, url })).toBeNull();
    expect(dibaca).toBe(false);
    expect(await coverStore.get(`${ISBN}.jpg`)).toBeNull();
  });

  it("isi tanpa content-length berhenti dibaca saat melewati batas", async () => {
    let terkirim = 0;
    let dibatalkan = false;
    const badan = new ReadableStream<Uint8Array>({
      pull(c) {
        terkirim += MB;
        c.enqueue(new Uint8Array(MB));
        if (terkirim > 100 * MB) c.close();
      },
      cancel() {
        dibatalkan = true;
      },
    });
    const { simpan, coverStore } = siapkan(() => new Response(badan, { headers: { "content-type": "image/jpeg" } }));

    expect(await simpan({ isbn13: ISBN, url })).toBeNull();
    expect(terkirim).toBeLessThanOrEqual(8 * MB);
    expect(dibatalkan).toBe(true);
    expect(await coverStore.get(`${ISBN}.jpg`)).toBeNull();
  });

  it("gambar tepat 5 MB masih diterima", async () => {
    const { simpan } = siapkan(new Response(new Uint8Array(5 * MB), { headers: { "content-type": "image/jpeg" } }));
    expect(await simpan({ isbn13: ISBN, url })).toEqual({ kunci: `${ISBN}.jpg` });
  });
});
