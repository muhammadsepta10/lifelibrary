import { describe, expect, it, vi } from "vitest";
import { createLocalLibrary } from "@/lib/local-library";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;

describe("Perpustakaan Lokal: pantau perubahan (untuk UI)", () => {
  it("pemantau Koleksi dan status Sinkronisasi diberi tahu begitu Eksemplar baru disimpan", async () => {
    const lib = createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}` });
    const koleksi = vi.fn();
    const status = vi.fn();
    const berhenti = [lib.pantauKoleksi(koleksi), lib.pantauStatus(status)];

    await vi.waitFor(() => expect(koleksi).toHaveBeenLastCalledWith([]));
    await lib.tambahBukuManual({ judul: "Laut Bercerita", pengarang: "Leila S. Chudori", kategoriId: FIK.id });

    await vi.waitFor(() => expect(koleksi.mock.lastCall?.[0]).toHaveLength(1));
    await vi.waitFor(() => expect(status.mock.lastCall?.[0].menunggu).toBeGreaterThan(0));
    berhenti.forEach((f) => f());
  });
});
