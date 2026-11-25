import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kontrak POST /api/metadata/sampul: hanya Pemilik, ISBN sah, host sampul
 * yang dikenal. Kegagalan unduh bukan galat. Pemeriksaan login dan unduhan
 * diganti (keduanya diuji di seam lain).
 */
const { tolak, simpanSampulKandidat } = vi.hoisted(() => ({
  tolak: vi.fn<() => Promise<Response | null>>(),
  simpanSampulKandidat: vi.fn<(m: { isbn13: string; url: string }) => Promise<{ kunci: string } | null>>(),
}));
vi.mock("@/server/require-owner", () => ({ tolakJikaBukanPemilik: tolak }));
vi.mock("@/server/metadata/runtime", () => ({ metadataRuntime: () => ({ simpanSampulKandidat }) }));

import { POST } from "@/app/api/metadata/sampul/route";

const ISBN = "9786026486066";
const URL_OL = "https://covers.openlibrary.org/b/id/12810708-L.jpg";
const panggil = (body: unknown) =>
  POST(
    new Request("http://localhost/api/metadata/sampul", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  tolak.mockReset().mockResolvedValue(null);
  simpanSampulKandidat.mockReset().mockResolvedValue({ kunci: `${ISBN}.jpg` });
});

describe("POST /api/metadata/sampul", () => {
  it("bukan Pemilik ditolak tanpa mengunduh", async () => {
    tolak.mockResolvedValue(Response.json({ galat: "Belum login" }, { status: 401 }));

    const res = await panggil({ isbn13: ISBN, url: URL_OL });

    expect(res.status).toBe(401);
    expect(simpanSampulKandidat).not.toHaveBeenCalled();
  });

  it("Pemilik dengan ISBN sah dan host yang diizinkan mendapat kunci sampul", async () => {
    const res = await panggil({ isbn13: ISBN, url: URL_OL });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kunci: `${ISBN}.jpg` });
    expect(simpanSampulKandidat).toHaveBeenCalledWith({ isbn13: ISBN, url: URL_OL });
  });

  it("ISBN-10 sah dinormalisasi ke ISBN-13 sebelum dipakai sebagai kunci", async () => {
    await panggil({ isbn13: "6026486062", url: URL_OL });

    expect(simpanSampulKandidat).toHaveBeenCalledWith({ isbn13: ISBN, url: URL_OL });
  });

  it.each([
    ["ISBN tidak sah", { isbn13: "123", url: URL_OL }],
    ["ISBN hilang", { url: URL_OL }],
    ["host tidak diizinkan", { isbn13: ISBN, url: "https://example.com/sampul.jpg" }],
    ["tanpa TLS", { isbn13: ISBN, url: "http://covers.openlibrary.org/b/id/1-L.jpg" }],
    ["alamat hilang", { isbn13: ISBN }],
    ["alamat bukan teks", { isbn13: ISBN, url: 42 }],
    ["badan bukan JSON", "bukan json"],
    ["badan bukan objek", "null"],
  ])("%s menghasilkan 400 tanpa mengunduh", async (_nama, body) => {
    const res = await panggil(body);

    expect(res.status).toBe(400);
    expect(simpanSampulKandidat).not.toHaveBeenCalled();
  });

  it("kegagalan unduh menghasilkan { kunci: null }, bukan galat", async () => {
    simpanSampulKandidat.mockResolvedValue(null);

    const res = await panggil({ isbn13: ISBN, url: URL_OL });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kunci: null });
  });

  it("galat tak terduga di server tetap { kunci: null }", async () => {
    simpanSampulKandidat.mockRejectedValue(new Error("storage rusak"));

    const res = await panggil({ isbn13: ISBN, url: URL_OL });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kunci: null });
  });
});
