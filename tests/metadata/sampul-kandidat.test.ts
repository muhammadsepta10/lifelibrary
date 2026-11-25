import { describe, expect, it } from "vitest";
import { createMemoryCoverStore } from "@/server/covers";
import { createSampulKandidat, urlSampulDiizinkan } from "@/server/metadata/sampul";
import { fakeFetch, gambar, tidakAda, type Balasan } from "../support/fake-fetch";

/**
 * Seam: simpanSampulKandidat. Mengunduh sampul Kandidat yang dipilih Pemilik
 * dan menyimpannya dengan kunci ISBN hasil scan. Fake fetch + cover store memori.
 */

const ISBN = "9786026486066";

const siapkan = (balas: Balasan = gambar(3), opsi: { timeoutMs?: number } = {}) => {
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
