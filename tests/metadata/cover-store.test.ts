import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createLocalFsCoverStore, createMemoryCoverStore, type CoverStore } from "@/server/covers";

const folder = mkdtemp(join(tmpdir(), "lifelibrary-covers-"));
afterAll(async () => rm(await folder, { recursive: true, force: true }));

const implementasi: [string, () => Promise<CoverStore>][] = [
  ["memori (tes)", async () => createMemoryCoverStore()],
  ["berkas lokal (dev)", async () => createLocalFsCoverStore(join(await folder, crypto.randomUUID()))],
];

describe.each(implementasi)("Storage sampul: %s", (_nama, buat) => {
  it("menyimpan dan membaca kembali sampul beserta jenis isinya", async () => {
    const store = await buat();
    await store.put("9786020633176.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");

    const ada = await store.get("9786020633176.jpg");

    expect(ada?.contentType).toBe("image/jpeg");
    expect([...ada!.bytes]).toEqual([1, 2, 3]);
  });

  it("kunci yang tidak ada mengembalikan null; menyimpan ulang menimpa", async () => {
    const store = await buat();
    expect(await store.get("tidak-ada.jpg")).toBeNull();
    await store.put("a.png", new Uint8Array([1]), "image/png");
    await store.put("a.png", new Uint8Array([2]), "image/png");
    expect([...(await store.get("a.png"))!.bytes]).toEqual([2]);
  });

  it.each(["../rahasia.jpg", "a/b.jpg", "", ".tersembunyi", "a..b.jpg"])("menolak kunci tidak aman %j", async (kunci) => {
    const store = await buat();
    await expect(store.put(kunci, new Uint8Array([1]), "image/jpeg")).rejects.toThrow(/kunci/i);
    await expect(store.get(kunci)).rejects.toThrow(/kunci/i);
  });
});
