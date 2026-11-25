import { beforeEach, describe, expect, it } from "vitest";
import { createLocalLibrary, type LocalLibrary } from "@/lib/local-library";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { drafKosong, type HasilPencarianMetadata } from "@/lib/draf-buku";
import { LoginDiperlukanError } from "@/lib/sync/fetch-transport";
import type { PullResponse } from "@/lib/sync-protocol";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;
const ISBN_A = "9786024246945";
const ISBN_B = "9786020633176";

const ditemukan = (isbn13: string, judul: string): HasilPencarianMetadata => ({
  ditemukan: true,
  draf: { ...drafKosong(isbn13), judul, pengarang: ["Penulis Uji"] },
  sumber: [{ sumber: "openlibrary", status: "ok" }],
});

/** fetch tanpa jaringan melempar TypeError. */
const offline = async (): Promise<HasilPencarianMetadata> => {
  throw new TypeError("Failed to fetch");
};
const online = async (isbn13: string) => ditemukan(isbn13, `Judul ${isbn13}`);

let dbName: string;
let lib: LocalLibrary;
const buka = () => createLocalLibrary({ dbName, now: () => new Date(2026, 10, 25, 9, 0, 0, 0) });

beforeEach(() => {
  dbName = `lifelibrary-test-${crypto.randomUUID()}`;
  lib = buka();
});

async function pindaiSelesai(sesi: Awaited<ReturnType<LocalLibrary["mulaiSesiPenerimaan"]>>, kode: string) {
  const hasil = await sesi.pindai(kode);
  if (hasil.jenis !== "kartu") throw new Error(`diharapkan kartu, dapat ${hasil.jenis}`);
  await hasil.selesai;
  return hasil.kartuId;
}

const kosong: PullResponse = { kursor: null, kategori: [], lokasi: [], aturanKategori: [], buku: [], eksemplar: [], templateLabel: null };

describe("scan offline menghasilkan draf 'menunggu data'", () => {
  it("tanpa koneksi, kartu berstatus Menunggu data dengan draf ber-ISBN", async () => {
    const sesi = await lib.mulaiSesiPenerimaan({ cariMetadata: offline });

    const kartuId = await pindaiSelesai(sesi, ISBN_A);

    const [kartu] = await sesi.kartu();
    expect(kartu).toMatchObject({
      id: kartuId,
      status: "menunggu-data",
      label: "Menunggu data",
      judul: "",
      draf: { isbn13: ISBN_A, judul: "" },
    });
    expect(kartu.catatan).toContain("online");
    expect(await lib.jumlahDrafMenunggu()).toBe(1);
  });

  it("sesi login habis juga menunggu data, dan catatannya meminta masuk lagi", async () => {
    const sesi = await lib.mulaiSesiPenerimaan({
      cariMetadata: async () => {
        throw new LoginDiperlukanError();
      },
    });

    await pindaiSelesai(sesi, ISBN_A);

    const [kartu] = await sesi.kartu();
    expect(kartu.status).toBe("menunggu-data");
    expect(kartu.catatan).toContain("Masuk lagi");
  });

  it("draf bertahan walau halaman dimuat ulang: sesi baru memuatnya lagi", async () => {
    const sesi = await lib.mulaiSesiPenerimaan({ cariMetadata: offline });
    await pindaiSelesai(sesi, ISBN_A);

    const sesudahMuatUlang = await buka().mulaiSesiPenerimaan({ cariMetadata: offline });

    expect(await sesudahMuatUlang.kartu()).toMatchObject([{ status: "menunggu-data", isbn13: ISBN_A }]);
  });

  it("ISBN yang sama dipindai lagi saat masih menunggu: tidak jadi kartu kedua", async () => {
    const sesi = await lib.mulaiSesiPenerimaan({ cariMetadata: offline });
    const kartuId = await pindaiSelesai(sesi, ISBN_A);
    const sesiBaru = await buka().mulaiSesiPenerimaan({ cariMetadata: offline });

    const hasil = await sesiBaru.pindai(ISBN_A);

    expect(hasil).toMatchObject({ jenis: "sudahDiDaftar", kartuId });
    expect(await lib.jumlahDrafMenunggu()).toBe(1);
  });

  it("sumber metadata galat padahal ada koneksi tetap seperti sebelumnya: Siap ditinjau + coba lagi", async () => {
    const sesi = await lib.mulaiSesiPenerimaan({
      cariMetadata: async () => {
        throw new Error("Pencarian gagal (500)");
      },
    });

    await pindaiSelesai(sesi, ISBN_A);

    expect(await sesi.kartu()).toMatchObject([{ status: "siap", bisaCobaLagi: true }]);
    expect(await lib.jumlahDrafMenunggu()).toBe(0);
  });
});

describe("draf 'menunggu data' dilengkapi otomatis setelah online", () => {
  it("lengkapiDrafMenunggu mencari metadata dan kartu di sesi menjadi Siap ditinjau", async () => {
    const sesi = await lib.mulaiSesiPenerimaan({ cariMetadata: offline });
    await pindaiSelesai(sesi, ISBN_A);
    await pindaiSelesai(sesi, ISBN_B);

    const hasil = await lib.lengkapiDrafMenunggu(online);

    expect(hasil).toEqual({ lengkap: 2, masihMenunggu: 0 });
    expect(await sesi.kartu()).toMatchObject([
      { status: "siap", label: "Siap ditinjau", judul: `Judul ${ISBN_A}`, pengarang: "Penulis Uji", catatan: null },
      { status: "siap", judul: `Judul ${ISBN_B}` },
    ]);
  });

  it("kartu yang dipantau berubah sendiri tanpa tindakan Pemilik", async () => {
    const sesi = await lib.mulaiSesiPenerimaan({ cariMetadata: offline });
    await pindaiSelesai(sesi, ISBN_A);
    const dilihat: string[] = [];
    const berhenti = sesi.pantau((k) => dilihat.push(k.map((x) => x.status).join()));

    await lib.lengkapiDrafMenunggu(online);

    await expect.poll(() => dilihat.at(-1)).toBe("siap");
    berhenti();
  });

  it("masih offline: draf tetap menunggu dan tidak ada galat", async () => {
    const sesi = await lib.mulaiSesiPenerimaan({ cariMetadata: offline });
    await pindaiSelesai(sesi, ISBN_A);
    await pindaiSelesai(sesi, ISBN_B);

    const hasil = await lib.lengkapiDrafMenunggu(offline);

    expect(hasil).toEqual({ lengkap: 0, masihMenunggu: 2 });
    expect(await sesi.kartu()).toMatchObject([{ status: "menunggu-data" }, { status: "menunggu-data" }]);
  });

  it("login habis: tetap menunggu sampai masuk lagi", async () => {
    const sesi = await lib.mulaiSesiPenerimaan({ cariMetadata: offline });
    await pindaiSelesai(sesi, ISBN_A);

    const hasil = await lib.lengkapiDrafMenunggu(async () => {
      throw new LoginDiperlukanError();
    });

    expect(hasil).toEqual({ lengkap: 0, masihMenunggu: 1 });
  });

  it("ISBN yang memang tidak ada di sumber manapun: Siap ditinjau dengan draf kosong dan catatan", async () => {
    const sesi = await lib.mulaiSesiPenerimaan({ cariMetadata: offline });
    await pindaiSelesai(sesi, ISBN_A);

    await lib.lengkapiDrafMenunggu(async (isbn13) => ({
      ditemukan: false,
      isbn13,
      sumber: [{ sumber: "loc", status: "kosong" }],
      semuaGalat: false,
    }));

    const [kartu] = await sesi.kartu();
    expect(kartu).toMatchObject({ status: "siap", judul: "", draf: { isbn13: ISBN_A } });
    expect(kartu.catatan).toContain("belum ada");
  });

  it("semua sumber tak terjangkau: belum bisa disimpulkan, tetap menunggu", async () => {
    const sesi = await lib.mulaiSesiPenerimaan({ cariMetadata: offline });
    await pindaiSelesai(sesi, ISBN_A);

    const hasil = await lib.lengkapiDrafMenunggu(async (isbn13) => ({
      ditemukan: false,
      isbn13,
      sumber: [{ sumber: "google", status: "galat" }],
      semuaGalat: true,
    }));

    expect(hasil).toEqual({ lengkap: 0, masihMenunggu: 1 });
  });

  it("tanpa sesi terbuka: draf dilengkapi di Dexie dan muncul Siap ditinjau di sesi berikutnya", async () => {
    const sesi = await lib.mulaiSesiPenerimaan({ cariMetadata: offline });
    await pindaiSelesai(sesi, ISBN_A);

    await buka().lengkapiDrafMenunggu(online);

    const sesiBaru = await buka().mulaiSesiPenerimaan({ cariMetadata: offline });
    expect(await sesiBaru.kartu()).toMatchObject([{ status: "siap", judul: `Judul ${ISBN_A}` }]);
  });

  it("dua pemicu bersamaan (online + berkala) tidak mencari metadata dua kali", async () => {
    const sesi = await lib.mulaiSesiPenerimaan({ cariMetadata: offline });
    await pindaiSelesai(sesi, ISBN_A);
    let panggilan = 0;
    const hitung = async (isbn13: string) => (panggilan++, ditemukan(isbn13, "X"));

    await Promise.all([lib.lengkapiDrafMenunggu(hitung), lib.lengkapiDrafMenunggu(hitung)]);

    expect(panggilan).toBe(1);
  });

  it("menyimpan draf yang sudah lengkap menjadi Buku dan menghapus draf menunggu", async () => {
    const sesi = await lib.mulaiSesiPenerimaan({ cariMetadata: offline });
    const kartuId = await pindaiSelesai(sesi, ISBN_A);
    await lib.lengkapiDrafMenunggu(online);
    const [kartu] = await sesi.kartu();

    await sesi.simpan(kartuId, kartu.draf!, FIK.id);

    expect(await lib.jumlahDrafMenunggu()).toBe(0);
    expect((await lib.daftarKoleksi()).map((k) => k.judul)).toEqual([`Judul ${ISBN_A}`]);
    expect(await buka().mulaiSesiPenerimaan({ cariMetadata: offline }).then((s) => s.kartu())).toEqual([]);
  });

  it("membuang kartu menunggu menghapus drafnya", async () => {
    const sesi = await lib.mulaiSesiPenerimaan({ cariMetadata: offline });
    const kartuId = await pindaiSelesai(sesi, ISBN_A);

    sesi.buang(kartuId);

    await expect.poll(() => lib.jumlahDrafMenunggu()).toBe(0);
    expect((await lib.lengkapiDrafMenunggu(online)).lengkap).toBe(0);
  });
});

describe("cek duplikat ISBN dan saran Kategori berjalan offline dari data lokal", () => {
  it("ISBN yang sudah ada: 'Tambah eksemplar baru?' tanpa memanggil pencarian metadata dan tanpa draf menunggu", async () => {
    const pertama = await lib.mulaiSesiPenerimaan({ cariMetadata: online });
    const id = await pindaiSelesai(pertama, ISBN_A);
    await pertama.simpan(id, { ...drafKosong(ISBN_A), judul: "Sudah Ada", pengarang: ["Penulis Uji"] }, FIK.id);
    let dicari = 0;
    const sesi = await lib.mulaiSesiPenerimaan({
      cariMetadata: async () => {
        dicari++;
        throw new TypeError("Failed to fetch");
      },
    });

    const hasil = await sesi.pindai(ISBN_A);

    expect(hasil).toMatchObject({ jenis: "duplikat", isbn13: ISBN_A, buku: { judul: "Sudah Ada", jumlahEksemplar: 1 } });
    expect(dicari).toBe(0);
    expect(await lib.jumlahDrafMenunggu()).toBe(0);
  });

  it("saran Kategori memakai Aturan Kategori dan Buku di perangkat, tanpa jaringan", async () => {
    await lib.sinkronkan({
      push: async () => ({ hasil: [] }),
      pull: async () => ({
        ...kosong,
        aturanKategori: [{ id: crypto.randomUUID(), jenis: "ddc", pola: "8xx", kategoriId: FIK.id, prioritas: 1, dihapus: false }],
      }),
    });

    const sesi = await lib.mulaiSesiPenerimaan({ cariMetadata: offline });
    const id = await pindaiSelesai(sesi, ISBN_A);
    await sesi.simpan(id, { ...drafKosong(ISBN_A), judul: "Laut", pengarang: ["Leila S. Chudori"] }, FIK.id);

    const dariAturan = await lib.sarankanKategori({ kelasDdc: "899.2", subjek: [], pengarang: [], seri: null });
    const dariPengarang = await lib.sarankanKategori({ kelasDdc: null, subjek: [], pengarang: ["Leila S. Chudori"], seri: null });

    expect(dariAturan).toMatchObject({ kode: "FIK", sumber: "ddc" });
    expect(dariPengarang).toMatchObject({ kode: "FIK", sumber: "pengarang" });
  });
});
