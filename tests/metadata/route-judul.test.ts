import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HasilKandidat } from "@/lib/draf-buku";

/**
 * Kontrak GET /api/metadata/judul: hanya Pemilik, judul minimal 3 karakter.
 * Pemeriksaan login dan pencarian sumber diganti (keduanya diuji di seam lain).
 */
const { tolak, cariKandidat } = vi.hoisted(() => ({
  tolak: vi.fn<() => Promise<Response | null>>(),
  cariKandidat: vi.fn<(m: { judul: string; pengarang?: string }) => Promise<HasilKandidat>>(),
}));
vi.mock("@/server/require-owner", () => ({ tolakJikaBukanPemilik: tolak }));
vi.mock("@/server/metadata/runtime", () => ({ metadataRuntime: () => ({ cariKandidat }) }));

import { GET } from "@/app/api/metadata/judul/route";

const panggil = (query: string) => GET(new Request(`http://localhost/api/metadata/judul${query}`));
const HASIL: HasilKandidat = {
  kandidat: [{ id: "openlibrary:OL1W", sumber: "openlibrary", judul: "Bumi" }],
  sumber: [{ sumber: "openlibrary", status: "ok" }],
};

beforeEach(() => {
  tolak.mockReset().mockResolvedValue(null);
  cariKandidat.mockReset().mockResolvedValue(HASIL);
});

describe("GET /api/metadata/judul", () => {
  it("bukan Pemilik ditolak tanpa mencari", async () => {
    tolak.mockResolvedValue(Response.json({ galat: "Belum login" }, { status: 401 }));

    const res = await panggil("?judul=Bumi");

    expect(res.status).toBe(401);
    expect(cariKandidat).not.toHaveBeenCalled();
  });

  it.each(["", "?judul=", "?judul=%20%20", "?judul=ab", "?judul=%20ab%20", "?pengarang=Tere%20Liye"])(
    "judul kosong atau kurang dari 3 karakter (%j) menghasilkan 400",
    async (query) => {
      const res = await panggil(query);

      expect(res.status).toBe(400);
      expect(cariKandidat).not.toHaveBeenCalled();
    },
  );

  it("Pemilik dengan judul sah mendapat Kandidat dan status sumber; pengarang diteruskan", async () => {
    const res = await panggil("?judul=Bumi&pengarang=Tere%20Liye");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(HASIL);
    expect(cariKandidat).toHaveBeenCalledWith({ judul: "Bumi", pengarang: "Tere Liye" });
  });

  it("pengarang kosong tidak diteruskan", async () => {
    await panggil("?judul=Bumi&pengarang=%20");

    expect(cariKandidat).toHaveBeenCalledWith({ judul: "Bumi", pengarang: undefined });
  });
});
