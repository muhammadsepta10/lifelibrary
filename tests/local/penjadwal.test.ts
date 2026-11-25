import { describe, expect, it, vi } from "vitest";
import { createLocalLibrary } from "@/lib/local-library";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import type { PullResponse, SyncTransport } from "@/lib/sync-protocol";
import { LoginDiperlukanError } from "@/lib/sync/fetch-transport";
import { buatPenjadwal, type Jam, type KeadaanSinkron } from "@/lib/sync/penjadwal";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;
const KOSONG: PullResponse = { kursor: null, kategori: [], lokasi: [], aturanKategori: [], templateLabel: null, buku: [], eksemplar: [] };

/** Jam buatan: waktu hanya maju lewat `maju`, timer yang jatuh tempo dijalankan berurutan. */
function jamBuatan() {
  let sekarang = 1_000_000;
  let timers: { at: number; fn: () => void | Promise<void> }[] = [];
  const jam: Jam = {
    sekarang: () => sekarang,
    atur(fn, ms) {
      const t = { at: sekarang + ms, fn };
      timers.push(t);
      return () => {
        timers = timers.filter((x) => x !== t);
      };
    },
  };
  async function maju(ms: number) {
    const tujuan = sekarang + ms;
    for (;;) {
      const berikut = timers.filter((t) => t.at <= tujuan).sort((a, b) => a.at - b.at)[0];
      if (!berikut) break;
      timers = timers.filter((t) => t !== berikut);
      sekarang = berikut.at;
      await berikut.fn();
    }
    sekarang = tujuan;
  }
  return { jam, maju, jumlahTimer: () => timers.length };
}

function siapkan(opts: { gagal?: boolean } = {}) {
  const lib = createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}` });
  const keadaan: KeadaanSinkron[] = [];
  const kondisi = { gagal: opts.gagal ?? false };
  const pull = vi.fn(async () => {
    if (kondisi.gagal) throw new Error("jaringan putus");
    return KOSONG;
  });
  const transport: SyncTransport = { push: async () => ({ hasil: [] }), pull };
  const online = new EventTarget();
  const { jam, maju, jumlahTimer } = jamBuatan();
  const penjadwal = buatPenjadwal({
    library: lib,
    transport,
    onKeadaan: (k) => keadaan.push(k),
    jam,
    target: online,
    periodeMs: 60_000,
  });
  return { lib, penjadwal, pull, kondisi, online, maju, keadaan, jumlahTimer };
}

describe("Penjadwal Sinkronisasi", () => {
  it("menyinkronkan saat aplikasi dibuka", async () => {
    const { penjadwal, pull, keadaan } = siapkan();

    await penjadwal.mulai();

    expect(pull).toHaveBeenCalledTimes(1);
    expect(keadaan.at(-1)).toMatchObject({ jenis: "selesai" });
    penjadwal.berhenti();
  });

  it("menyinkronkan saat event online", async () => {
    const { penjadwal, pull, online } = siapkan();
    await penjadwal.mulai();

    online.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(2));
    penjadwal.berhenti();
  });

  it("menyinkronkan secara berkala", async () => {
    const { penjadwal, pull, maju } = siapkan();
    await penjadwal.mulai();

    await maju(59_000);
    expect(pull).toHaveBeenCalledTimes(1);
    await maju(1_000);
    expect(pull).toHaveBeenCalledTimes(2);
    await maju(60_000);
    expect(pull).toHaveBeenCalledTimes(3);
    penjadwal.berhenti();
  });

  it("berhenti total setelah dihentikan: tidak ada timer maupun listener tersisa", async () => {
    const { penjadwal, pull, online, maju, jumlahTimer } = siapkan();
    await penjadwal.mulai();

    penjadwal.berhenti();
    online.dispatchEvent(new Event("online"));
    await maju(10 * 60_000);

    expect(pull).toHaveBeenCalledTimes(1);
    expect(jumlahTimer()).toBe(0);
  });

  it("backoff eksponensial: percobaan ulang berjarak 2, 4, 8 detik, bukan beruntun", async () => {
    const { penjadwal, pull, kondisi, maju, keadaan } = siapkan({ gagal: true });

    await penjadwal.mulai(); // t=0 gagal
    expect(pull).toHaveBeenCalledTimes(1);
    expect(keadaan.at(-1)).toMatchObject({ jenis: "gagal", cobaLagiDalamMs: 2_000 });

    await maju(1_999);
    expect(pull).toHaveBeenCalledTimes(1);
    await maju(1); // t=2s
    expect(pull).toHaveBeenCalledTimes(2);
    expect(keadaan.at(-1)).toMatchObject({ jenis: "gagal", cobaLagiDalamMs: 4_000 });

    await maju(3_999);
    expect(pull).toHaveBeenCalledTimes(2);
    await maju(1); // t=6s
    expect(pull).toHaveBeenCalledTimes(3);
    expect(keadaan.at(-1)).toMatchObject({ cobaLagiDalamMs: 8_000 });

    // Pulih: berhasil, backoff kembali ke awal.
    kondisi.gagal = false;
    await maju(8_000);
    expect(pull).toHaveBeenCalledTimes(4);
    expect(keadaan.at(-1)).toMatchObject({ jenis: "selesai" });
    kondisi.gagal = true;
    await maju(46_000); // sampai pemicu berkala berikutnya (t=60 dtk)
    expect(keadaan.at(-1)).toMatchObject({ jenis: "gagal", cobaLagiDalamMs: 2_000 });
    penjadwal.berhenti();
  });

  it("pemicu berkala dan perubahan lokal tidak melewati backoff, tapi tombol Sinkronkan sekarang boleh", async () => {
    const { penjadwal, pull } = siapkan({ gagal: true });
    await penjadwal.mulai();
    expect(pull).toHaveBeenCalledTimes(1);

    await penjadwal.picu();
    await penjadwal.picu();
    expect(pull).toHaveBeenCalledTimes(1);

    await penjadwal.picu({ paksa: true });
    expect(pull).toHaveBeenCalledTimes(2);
    penjadwal.berhenti();
  });

  it("event online menganggap koneksi pulih: percobaan langsung, tanpa menunggu backoff", async () => {
    const { penjadwal, pull, kondisi, online } = siapkan({ gagal: true });
    await penjadwal.mulai();
    kondisi.gagal = false;

    online.dispatchEvent(new Event("online"));

    await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(2));
    penjadwal.berhenti();
  });

  it("memberi tahu jumlah perubahan yang terkirim hanya bila ada yang terkirim", async () => {
    const lib = createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}` });
    const transport: SyncTransport = {
      push: async (req) => ({ hasil: req.mutasi.map((m) => ({ id: m.id, status: "diterima" as const })) }),
      pull: async () => KOSONG,
    };
    const dikirim = vi.fn();
    const { jam } = jamBuatan();
    const penjadwal = buatPenjadwal({
      library: lib,
      transport,
      onKeadaan: () => {},
      onDikirim: dikirim,
      jam,
      target: new EventTarget(),
    });

    await penjadwal.mulai();
    expect(dikirim).not.toHaveBeenCalled(); // tidak ada yang dikirim: tidak ada toast

    await lib.tambahBuku({
      judul: "Laut Bercerita",
      kontributor: [{ nama: "Leila S. Chudori", utama: true }],
      eksemplar: { kategoriId: FIK.id },
    });
    await penjadwal.picu();

    expect(dikirim).toHaveBeenCalledExactlyOnceWith(2); // Buku + Eksemplar
    penjadwal.berhenti();
  });

  it("memberi tahu pemberitahuan field yang ditimpa dari hasil Sinkronisasi", async () => {
    const lib = createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}` });
    const { bukuId } = await lib.tambahBuku({
      judul: "Laut Bercerita",
      kontributor: [{ nama: "Leila S. Chudori", utama: true }],
      eksemplar: { kategoriId: FIK.id },
    });
    await lib.ubahBuku(bukuId, { penerbit: "KPG" });
    const mutasiUbah = (await lib.daftarAntrean()).tertunda.length;
    expect(mutasiUbah).toBe(3);
    const transport: SyncTransport = {
      // Server menerima semuanya, tapi melaporkan penerbit kalah dari perangkat lain.
      push: async (req) => ({
        hasil: req.mutasi.map((m) =>
          m.jenis === "buku.ubah"
            ? { id: m.id, status: "diterima" as const, ditimpa: [{ field: "penerbit", nilai: "Gramedia" }] }
            : { id: m.id, status: "diterima" as const },
        ),
      }),
      pull: async () => KOSONG,
    };
    const ditimpa = vi.fn();
    const { jam } = jamBuatan();
    const penjadwal = buatPenjadwal({
      library: lib,
      transport,
      onKeadaan: () => {},
      onDitimpa: ditimpa,
      jam,
      target: new EventTarget(),
    });

    await penjadwal.mulai();

    expect(ditimpa).toHaveBeenCalledTimes(1);
    expect(ditimpa.mock.calls[0][0]).toMatchObject([
      { pesan: "Penerbit di Laut Bercerita diperbarui dari perangkat lain" },
    ]);
    penjadwal.berhenti();
  });

  describe("sesi login kedaluwarsa", () => {
    function siapkanLogin() {
      const lib = createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}` });
      const keadaan: KeadaanSinkron[] = [];
      const kondisi = { sesiHabis: true };
      const push = vi.fn(async (req: { mutasi: { id: string }[] }) => {
        if (kondisi.sesiHabis) throw new LoginDiperlukanError();
        return { hasil: req.mutasi.map((m) => ({ id: m.id, status: "diterima" as const })) };
      });
      const pull = vi.fn(async () => {
        if (kondisi.sesiHabis) throw new LoginDiperlukanError();
        return KOSONG;
      });
      const target = new EventTarget();
      const { jam, maju } = jamBuatan();
      const penjadwal = buatPenjadwal({
        library: lib,
        transport: { push, pull } as SyncTransport,
        onKeadaan: (k) => keadaan.push(k),
        jam,
        target,
        periodeMs: 60_000,
      });
      return { lib, penjadwal, push, pull, kondisi, keadaan, maju };
    }

    it("data lokal tetap bisa dibuka dan diedit, perubahan menunggu di outbox", async () => {
      const { lib, penjadwal, keadaan } = siapkanLogin();
      await penjadwal.mulai();
      expect(keadaan.at(-1)).toEqual({ jenis: "perlu-login" });

      await lib.tambahBukuManual({ judul: "Ditulis Saat Login Habis", pengarang: "Penulis", kategoriId: FIK.id });

      expect((await lib.daftarKoleksi()).map((k) => k.judul)).toEqual(["Ditulis Saat Login Habis"]);
      expect((await lib.statusSinkronisasi()).menunggu).toBeGreaterThan(0);
      penjadwal.berhenti();
    });

    it("Sinkronisasi menunggu sampai login ulang: pemicu otomatis tidak lagi memanggil server", async () => {
      const { lib, penjadwal, push, pull, maju } = siapkanLogin();
      await penjadwal.mulai();
      await lib.tambahBukuManual({ judul: "Buku", pengarang: "Penulis", kategoriId: FIK.id });
      const panggilanAwal = push.mock.calls.length + pull.mock.calls.length;

      await penjadwal.picu(); // perubahan lokal baru
      await maju(5 * 60_000); // pemicu berkala berkali-kali

      expect(push.mock.calls.length + pull.mock.calls.length).toBe(panggilanAwal);
    });

    it("setelah login ulang (aplikasi dibuka lagi), outbox terkirim dan keadaan perlu-login hilang", async () => {
      const { lib, penjadwal, kondisi, keadaan } = siapkanLogin();
      await penjadwal.mulai();
      await lib.tambahBukuManual({ judul: "Buku", pengarang: "Penulis", kategoriId: FIK.id });
      penjadwal.berhenti();

      kondisi.sesiHabis = false;
      await penjadwal.mulai();

      expect(keadaan.at(-1)).toMatchObject({ jenis: "selesai" });
      expect((await lib.statusSinkronisasi()).menunggu).toBe(0);
      penjadwal.berhenti();
    });

    it("'Sinkronkan sekarang' mencoba lagi walau sedang menunggu login", async () => {
      const { penjadwal, kondisi, keadaan } = siapkanLogin();
      await penjadwal.mulai();

      kondisi.sesiHabis = false;
      await penjadwal.picu({ paksa: true });

      expect(keadaan.at(-1)).toMatchObject({ jenis: "selesai" });
      penjadwal.berhenti();
    });
  });
});
