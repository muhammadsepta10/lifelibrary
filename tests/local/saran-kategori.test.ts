import { beforeEach, describe, expect, it } from "vitest";
import type { AturanBaru, KelolaTransport } from "@/lib/kelola-protocol";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { createLocalLibrary } from "@/lib/local-library";

const kat = (kode: string) => PRESET_KATEGORI.find((k) => k.kode === kode)!;
const FIL = kat("FIL");
const FIK = kat("FIK");
const SAS = kat("SAS");
const AGM = kat("AGM");

let lib: ReturnType<typeof createLocalLibrary>;

beforeEach(() => {
  lib = createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}` });
});

/** Server palsu: menerima aturan seperti API Kelola (DDC dinormalkan huruf kecil). */
const server: KelolaTransport = {
  kategori: { buat: nope, ubah: nope, hapus: nope },
  lokasi: { buat: nope, ubah: nope, hapus: nope },
  aturanKategori: {
    buat: async (i: AturanBaru) => ({
      id: crypto.randomUUID(),
      ...i,
      pola: i.jenis === "ddc" ? i.pola.toLowerCase() : i.pola,
      dihapus: false,
    }),
    ubah: nope,
    hapus: nope,
  },
  templateLabel: { simpan: nope },
};
function nope(): never {
  throw new Error("tidak dipakai");
}
const aturan = (a: AturanBaru) => lib.kelola(server).aturanKategori.buat(a);

const kosong = { kelasDdc: null, subjek: [], pengarang: [], seri: null };

describe("Perpustakaan Lokal: Saran Kategori", () => {
  it("tanpa aturan dan tanpa Buku lain, tidak ada saran (Pemilik memilih sendiri)", async () => {
    expect(await lib.sarankanKategori({ ...kosong, kelasDdc: "155.24" })).toBeNull();
  });

  it("Aturan Kategori DDC: 155.24 cocok dengan aturan 155, 15x, dan 1xx; alasan menyebut aturannya", async () => {
    await aturan({ jenis: "ddc", pola: "15x", kategoriId: FIL.id, prioritas: 10 });

    const saran = await lib.sarankanKategori({ ...kosong, kelasDdc: "155.24" });

    expect(saran).toMatchObject({ kategoriId: FIL.id, kode: "FIL", nama: FIL.nama, sumber: "ddc" });
    expect(saran?.alasan).toBe('Kelas DDC 155.24 cocok dengan aturan "15x"');
  });

  it("pola 2xx mencakup 200-299 dan tidak 300; huruf besar pola tidak masalah", async () => {
    await aturan({ jenis: "ddc", pola: "2XX", kategoriId: AGM.id, prioritas: 1 });

    expect((await lib.sarankanKategori({ ...kosong, kelasDdc: "297.8" }))?.kode).toBe("AGM");
    expect((await lib.sarankanKategori({ ...kosong, kelasDdc: "200" }))?.kode).toBe("AGM");
    expect(await lib.sarankanKategori({ ...kosong, kelasDdc: "300" })).toBeNull();
  });

  it("prioritas rendah menang bila beberapa aturan DDC cocok", async () => {
    await aturan({ jenis: "ddc", pola: "1xx", kategoriId: FIK.id, prioritas: 50 });
    await aturan({ jenis: "ddc", pola: "155", kategoriId: FIL.id, prioritas: 5 });

    expect((await lib.sarankanKategori({ ...kosong, kelasDdc: "155.24" }))?.kode).toBe("FIL");
  });

  it("aturan DDC didahulukan atas kata kunci subjek, walau prioritas subjek lebih kecil", async () => {
    await aturan({ jenis: "subjek", pola: "habit", kategoriId: FIK.id, prioritas: 1 });
    await aturan({ jenis: "ddc", pola: "155", kategoriId: FIL.id, prioritas: 999 });

    const saran = await lib.sarankanKategori({ ...kosong, kelasDdc: "155.24", subjek: ["Habit"] });

    expect(saran).toMatchObject({ kode: "FIL", sumber: "ddc" });
  });

  it("kata kunci subjek: tidak peduli huruf besar-kecil, dan boleh bagian dari subjek; alasan menyebut subjek dan kata kuncinya", async () => {
    await aturan({ jenis: "subjek", pola: "Novel", kategoriId: FIK.id, prioritas: 1 });

    const saran = await lib.sarankanKategori({ ...kosong, subjek: ["Politik", "NOVEL sejarah"] });

    expect(saran).toMatchObject({ kode: "FIK", sumber: "subjek" });
    expect(saran?.alasan).toBe('Subjek "NOVEL sejarah" mengandung kata kunci "Novel"');
  });

  it("tanpa Kelas DDC (buku asli Indonesia) saran jatuh ke kata kunci subjek", async () => {
    await aturan({ jenis: "ddc", pola: "8xx", kategoriId: SAS.id, prioritas: 1 });
    await aturan({ jenis: "subjek", pola: "fiction", kategoriId: FIK.id, prioritas: 1 });

    const saran = await lib.sarankanKategori({ ...kosong, subjek: ["Fiction"] });

    expect(saran).toMatchObject({ kode: "FIK", sumber: "subjek" });
  });

  it("aturan menuju Kategori yang diarsipkan dilewati", async () => {
    await aturan({ jenis: "ddc", pola: "155", kategoriId: FIL.id, prioritas: 1 });
    await aturan({ jenis: "ddc", pola: "1xx", kategoriId: FIK.id, prioritas: 2 });
    const arsip: KelolaTransport = {
      ...server,
      kategori: {
        ...server.kategori,
        ubah: async () => ({ ...FIL, diarsipkan: true, dihapus: false }),
      },
    };
    await lib.kelola(arsip).kategori.arsipkan(FIL.id);

    expect((await lib.sarankanKategori({ ...kosong, kelasDdc: "155.24" }))?.kode).toBe("FIK");
  });

  describe("dari Buku lain dengan pengarang atau seri yang sama", () => {
    it("memakai Kategori Buku lain karya pengarang yang sama (nama dinormalkan); alasan menyebut pengarangnya", async () => {
      await lib.tambahBukuManual({ judul: "Atomic Habits", pengarang: "James Clear", kategoriId: FIL.id });

      const saran = await lib.sarankanKategori({ ...kosong, pengarang: ["james  CLEAR"] });

      expect(saran).toMatchObject({ kode: "FIL", sumber: "pengarang" });
      expect(saran?.alasan).toBe("Buku lain karya james  CLEAR berkategori FIL");
    });

    it("pengarang paling banyak dipakai untuk Kategori yang sama menang", async () => {
      await lib.tambahBukuManual({ judul: "A", pengarang: "Tere Liye", kategoriId: FIK.id });
      await lib.tambahBukuManual({ judul: "B", pengarang: "Tere Liye", kategoriId: FIK.id });
      await lib.tambahBukuManual({ judul: "C", pengarang: "Tere Liye", kategoriId: SAS.id });

      expect((await lib.sarankanKategori({ ...kosong, pengarang: ["Tere Liye"] }))?.kode).toBe("FIK");
    });

    it("seri yang sama didahulukan atas pengarang yang sama", async () => {
      await lib.tambahBuku({
        judul: "Bumi",
        seri: "Bumi",
        kontributor: [{ nama: "Tere Liye", utama: true }],
        eksemplar: { kategoriId: FIK.id },
      });
      await lib.tambahBukuManual({ judul: "Rembulan", pengarang: "Tere Liye", kategoriId: SAS.id });
      await lib.tambahBukuManual({ judul: "Hujan", pengarang: "Tere Liye", kategoriId: SAS.id });

      const saran = await lib.sarankanKategori({ ...kosong, pengarang: ["Tere Liye"], seri: "bumi" });

      expect(saran).toMatchObject({ kode: "FIK", sumber: "seri" });
      expect(saran?.alasan).toBe('Buku lain dalam seri "bumi" berkategori FIK');
    });

    it("aturan subjek didahulukan atas pengarang", async () => {
      await lib.tambahBukuManual({ judul: "A", pengarang: "Tere Liye", kategoriId: SAS.id });
      await aturan({ jenis: "subjek", pola: "novel", kategoriId: FIK.id, prioritas: 1 });

      const saran = await lib.sarankanKategori({ ...kosong, pengarang: ["Tere Liye"], subjek: ["Novel"] });

      expect(saran?.sumber).toBe("subjek");
    });

    it("pengarang yang belum pernah tercatat tidak menghasilkan saran", async () => {
      await lib.tambahBukuManual({ judul: "A", pengarang: "Tere Liye", kategoriId: FIK.id });

      expect(await lib.sarankanKategori({ ...kosong, pengarang: ["Orang Lain"] })).toBeNull();
    });
  });
});
