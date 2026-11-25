import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { createLocalLibrary, susunChipBeranda, type LocalLibrary } from "@/lib/local-library";
import type { SyncTransport } from "@/lib/sync-protocol";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;
const AGM = PRESET_KATEGORI.find((k) => k.kode === "AGM")!;

let jam: Date;
let lib: LocalLibrary;
const maju = () => (jam = new Date(jam.getTime() + 60_000));

beforeEach(() => {
  jam = new Date(2026, 10, 25, 9, 0, 0, 0);
  lib = createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}`, now: () => jam });
});

describe("Perpustakaan Lokal: ringkasan Beranda", () => {
  it("koleksi kosong: semua jumlah nol dan tidak ada Buku terbaru", async () => {
    expect(await lib.ringkasanBeranda()).toEqual({
      jumlahBuku: 0,
      jumlahEksemplar: 0,
      jumlahDipinjam: 0,
      terbaru: [],
    });
  });

  it("menghitung Buku (judul berbeda) terpisah dari Eksemplar (fisik) dan yang sedang dipinjam", async () => {
    const laut = await lib.tambahBukuManual({ judul: "Laut Bercerita", pengarang: "Leila S. Chudori", kategoriId: FIK.id });
    maju();
    await lib.catatEksemplar({ bukuId: laut.bukuId, kategoriId: FIK.id });
    maju();
    await lib.tambahBukuManual({ judul: "Sirah Nabawiyah", pengarang: "Mubarakfuri", kategoriId: AGM.id });
    await lib.pinjamkan({ eksemplarId: laut.eksemplarId, peminjam: { nama: "Rina" }, jatuhTempo: "2026-12-09" });

    const r = await lib.ringkasanBeranda();

    expect(r).toMatchObject({ jumlahBuku: 2, jumlahEksemplar: 3, jumlahDipinjam: 1 });
  });

  it("Eksemplar yang sudah keluar (Penyiangan) tidak dihitung; Buku tanpa Eksemplar aktif pun tidak", async () => {
    const usang = await lib.tambahBukuManual({ judul: "Usang", pengarang: "A", kategoriId: FIK.id });
    await lib.tambahBukuManual({ judul: "Baru", pengarang: "B", kategoriId: FIK.id });
    const server: SyncTransport = {
      push: async ({ mutasi }) => ({
        hasil: mutasi.map((m, i) =>
          m.jenis === "eksemplar.catat"
            ? { id: m.id, status: "diterima" as const, eksemplarId: m.eksemplar.id, nomorInduk: `FIK-00${i + 1}/2026` }
            : { id: m.id, status: "diterima" as const },
        ),
      }),
      pull: async () => ({
        kursor: null, kategori: [], lokasi: [], aturanKategori: [], templateLabel: null, buku: [], eksemplar: [],
      }),
    };
    await lib.sinkronkan(server);
    const siangi = async () => ({
      status: "keluar" as const,
      penyiangan: { jenis: "hilang" as const, tanggal: "2026-11-25", alasan: null },
    });

    await lib.penyiangan({ siangi: siangi as never }).siangi(usang.eksemplarId, { jenis: "hilang", tanggal: "2026-11-25" });

    expect(await lib.ringkasanBeranda()).toMatchObject({ jumlahBuku: 1, jumlahEksemplar: 1 });
  });

  it("terbaru: satu entri per Buku, dicatat paling akhir dulu, warna dari Kategori, penanda Menunggu Sinkron", async () => {
    const laut = await lib.tambahBukuManual({ judul: "Laut Bercerita", pengarang: "Leila S. Chudori", kategoriId: FIK.id });
    maju();
    await lib.tambahBukuManual({ judul: "Sirah Nabawiyah", pengarang: "Mubarakfuri", kategoriId: AGM.id });
    maju();
    await lib.catatEksemplar({ bukuId: laut.bukuId, kategoriId: FIK.id });

    const { terbaru } = await lib.ringkasanBeranda();

    expect(terbaru.map((b) => b.judul)).toEqual(["Laut Bercerita", "Sirah Nabawiyah"]);
    expect(terbaru[0]).toMatchObject({ bukuId: laut.bukuId, pengarang: "Leila S. Chudori", warna: FIK.warna, menungguSinkron: true });
    expect(terbaru[1].warna).toBe(AGM.warna);
  });

  it("pemantau memberi ringkasan baru begitu Eksemplar disimpan", async () => {
    const cb = vi.fn();
    const berhenti = lib.pantauRingkasanBeranda(cb);
    await vi.waitFor(() => expect(cb.mock.lastCall?.[0].jumlahEksemplar).toBe(0));

    await lib.tambahBukuManual({ judul: "Laut Bercerita", pengarang: "Leila S. Chudori", kategoriId: FIK.id });

    await vi.waitFor(() => expect(cb.mock.lastCall?.[0]).toMatchObject({ jumlahBuku: 1, jumlahEksemplar: 1 }));
    berhenti();
  });
});

describe("Chip status Beranda", () => {
  const nol = { terlambat: 0, labelSiapDicetak: 0, menungguSinkron: 0, gagalTerkirim: 0 };

  it("tidak ada chip bila semua jumlahnya nol atau belum dimuat", () => {
    expect(susunChipBeranda(nol)).toEqual([]);
    expect(
      susunChipBeranda({ terlambat: undefined, labelSiapDicetak: undefined, menungguSinkron: undefined, gagalTerkirim: undefined }),
    ).toEqual([]);
  });

  it("hanya yang jumlahnya lebih dari nol yang tampil, masing-masing menautkan ke halamannya", () => {
    const chip = susunChipBeranda({ terlambat: 2, labelSiapDicetak: 0, menungguSinkron: 3, gagalTerkirim: 1 });

    expect(chip).toEqual([
      { kunci: "terlambat", jumlah: 2, teks: "2 terlambat", href: "/peminjaman?tab=terlambat" },
      { kunci: "menunggu", jumlah: 3, teks: "3 perubahan menunggu sinkron", href: "/sinkron" },
      { kunci: "gagal", jumlah: 1, teks: "1 gagal terkirim", href: "/sinkron" },
    ]);
  });

  it("Label siap dicetak menaut ke /cetak", () => {
    expect(susunChipBeranda({ ...nol, labelSiapDicetak: 5 })).toEqual([
      { kunci: "label", jumlah: 5, teks: "5 label siap dicetak", href: "/cetak" },
    ]);
  });
});
