import { beforeEach, describe, expect, it } from "vitest";
import { createLocalLibrary } from "@/lib/local-library";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import type { Mutasi, PullResponse, PushRequest, SyncTransport } from "@/lib/sync-protocol";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;
const KOSONG: PullResponse = { kursor: null, kategori: [], lokasi: [], aturanKategori: [], templateLabel: null, buku: [], eksemplar: [] };

let lib: ReturnType<typeof createLocalLibrary>;
beforeEach(() => {
  lib = createLocalLibrary({
    dbName: `lifelibrary-test-${crypto.randomUUID()}`,
    now: () => new Date(2026, 2, 14, 10, 0, 0),
  });
});

/** Server palsu yang menolak jenis mutasi tertentu dan menerima sisanya; mencatat yang diterima kirim. */
function serverMenolak(tolak: Mutasi["jenis"][], alasan = "ditolak server") {
  const terkirim: Mutasi[] = [];
  const transport: SyncTransport = {
    async push(req: PushRequest) {
      terkirim.push(...req.mutasi);
      return {
        hasil: req.mutasi.map((m) =>
          tolak.includes(m.jenis)
            ? { id: m.id, status: "ditolak" as const, alasan }
            : { id: m.id, status: "diterima" as const },
        ),
      };
    },
    pull: async () => KOSONG,
  };
  return { terkirim, transport };
}

async function bukuBaru(judul = "Pulang") {
  return lib.tambahBuku({
    judul,
    kontributor: [{ nama: "Leila S. Chudori", utama: true }],
    eksemplar: { kategoriId: FIK.id },
  });
}

describe("Buang perubahan yang Gagal terkirim", () => {
  it("Buku baru yang ditolak: Buang juga membuang Eksemplarnya, dan salinan lokal kembali sama dengan server", async () => {
    const { bukuId, eksemplarId } = await bukuBaru();
    await lib.ubahEksemplar(eksemplarId, { harga: 50000 });
    const { transport, terkirim } = serverMenolak(["buku.tambah", "eksemplar.catat", "eksemplar.ubah"]);
    await lib.sinkronkan(transport);
    const [gagalBuku] = (await lib.daftarAntrean()).gagal;
    expect(gagalBuku.ringkasan).toBe("Tambah Buku Pulang");

    const hilang = await lib.pratinjauBuang(gagalBuku.id);

    expect(hilang).toEqual(
      expect.arrayContaining([expect.stringContaining("Buku Pulang"), expect.stringContaining("Eksemplar")]),
    );
    expect(hilang.join("\n")).toContain("Ubah Harga");

    await lib.buang(gagalBuku.id);

    expect(await lib.daftarAntrean()).toEqual({ tertunda: [], gagal: [] });
    expect(await lib.statusSinkronisasi()).toEqual({ menunggu: 0, ditolak: 0 });
    expect(await lib.daftarKoleksi()).toEqual([]);
    expect(await lib.detailBuku(bukuId)).toBeNull();
    terkirim.length = 0;
    await lib.sinkronkan(transport);
    expect(terkirim).toEqual([]);
  });

  it("Eksemplar yang ditolak: Buang membuang Eksemplar dan perubahannya, Buku yang sudah diterima tetap ada", async () => {
    const { bukuId, eksemplarId } = await bukuBaru();
    await lib.ubahEksemplar(eksemplarId, { harga: 50000 });
    const { transport } = serverMenolak(["eksemplar.catat", "eksemplar.ubah"], "Kategori tidak dikenal");
    await lib.sinkronkan(transport);
    await lib.ubahEksemplar(eksemplarId, { kondisi: "baik" }); // menunggu, bergantung pada Eksemplar yang ditolak
    const antrean = await lib.daftarAntrean();
    expect(antrean.gagal.map((g) => g.alasan)).toEqual(["Kategori tidak dikenal", "Kategori tidak dikenal"]);

    await lib.buang(antrean.gagal[0].id);

    expect(await lib.daftarAntrean()).toEqual({ tertunda: [], gagal: [] });
    expect(await lib.daftarKoleksi()).toEqual([]);
    expect(await lib.detailBuku(bukuId)).toMatchObject({ judul: "Pulang", eksemplar: [] });
  });

  it("hanya perubahan yang Gagal terkirim yang bisa dibuang", async () => {
    await bukuBaru();
    const [tertunda] = (await lib.daftarAntrean()).tertunda;

    await expect(lib.buang(tertunda.id)).rejects.toThrow(/Gagal terkirim/);
    await expect(lib.buang(crypto.randomUUID())).rejects.toThrow();
    expect((await lib.daftarAntrean()).tertunda).toHaveLength(2);
  });

  it("Eksemplar lain yang tidak bergantung tetap terkirim", async () => {
    const buruk = await bukuBaru("Buruk");
    await bukuBaru("Baik");
    const { transport, terkirim } = serverMenolak([]);
    // Hanya Buku "Buruk" yang ditolak.
    const menolakBuruk: SyncTransport = {
      pull: transport.pull,
      push: async (req) => {
        const res = await transport.push(req);
        return {
          hasil: res.hasil.map((h) => {
            const m = req.mutasi.find((x) => x.id === h.id)!;
            return m.jenis === "buku.tambah" && m.buku.id === buruk.bukuId
              ? { id: h.id, status: "ditolak" as const, alasan: "ditolak" }
              : h;
          }),
        };
      },
    };
    await lib.sinkronkan(menolakBuruk);
    const [gagal] = (await lib.daftarAntrean()).gagal;

    await lib.buang(gagal.id);

    expect((await lib.daftarKoleksi()).map((k) => k.judul)).toEqual(["Baik"]);
    expect(terkirim.filter((m) => m.jenis === "buku.tambah")).toHaveLength(2);
  });
});
