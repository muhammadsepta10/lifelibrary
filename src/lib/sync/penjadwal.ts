import type { LocalLibrary, PemberitahuanDitimpa } from "@/lib/local-library";
import type { SyncTransport } from "@/lib/sync-protocol";
import { LoginDiperlukanError } from "./fetch-transport";

export type KeadaanSinkron =
  | { jenis: "diam" }
  | { jenis: "berjalan" }
  | { jenis: "selesai"; pada: number }
  | { jenis: "perlu-login" }
  | { jenis: "gagal"; pesan: string; cobaLagiDalamMs: number };

/** Jam yang bisa diganti di tes. `atur` mengembalikan fungsi pembatal. */
export type Jam = {
  sekarang(): number;
  atur(fn: () => void | Promise<void>, ms: number): () => void;
};

const jamNyata: Jam = {
  sekarang: () => Date.now(),
  atur(fn, ms) {
    const t = setTimeout(() => void fn(), ms);
    return () => clearTimeout(t);
  },
};

export const BACKOFF_AWAL_MS = 2_000;
export const BACKOFF_MAKS_MS = 5 * 60_000;
export const PERIODE_MS = 60_000;

type Target = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/**
 * Penjadwal Sinkronisasi: satu proses sinkron pada satu waktu. Dipicu saat
 * aplikasi dibuka (`mulai`), saat event `online`, berkala, dan oleh perubahan
 * lokal (`picu`). Setelah gagal, percobaan berikutnya menunggu dengan backoff
 * eksponensial (2 dtk, 4 dtk, ... maks 5 menit); pemicu otomatis tidak
 * melewatinya. Sesi login yang habis (401) menghentikan semua pemicu otomatis,
 * data lokal tetap bisa dipakai, sampai aplikasi dibuka lagi setelah login
 * ulang. Hanya `picu({ paksa: true })` (tombol "Sinkronkan sekarang") dan
 * event `online` (koneksi pulih) yang boleh mendahului.
 */
export function buatPenjadwal(opts: {
  library: LocalLibrary;
  transport: SyncTransport;
  onKeadaan: (k: KeadaanSinkron) => void;
  /** Dipanggil bila ada field yang ditimpa perubahan dari perangkat lain. */
  onDitimpa?: (daftar: PemberitahuanDitimpa[]) => void;
  jam?: Jam;
  target?: Target;
  periodeMs?: number;
}) {
  const jam = opts.jam ?? jamNyata;
  const target = opts.target ?? (typeof window !== "undefined" ? window : undefined);
  const periodeMs = opts.periodeMs ?? PERIODE_MS;

  let berjalan = false;
  let berhenti = true;
  let gagalBerturut = 0;
  let tidakSebelum = 0;
  /** Sesi login habis: pemicu otomatis diam sampai login ulang (aplikasi dibuka lagi) atau dipicu paksa. */
  let menungguLogin = false;
  let batalCobaLagi: (() => void) | undefined;
  let batalBerkala: (() => void) | undefined;

  async function picu({ paksa = false }: { paksa?: boolean } = {}) {
    if (berjalan) return;
    if (!paksa && (menungguLogin || jam.sekarang() < tidakSebelum)) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    batalCobaLagi?.();
    berjalan = true;
    opts.onKeadaan({ jenis: "berjalan" });
    try {
      const hasil = await opts.library.sinkronkan(opts.transport);
      gagalBerturut = 0;
      tidakSebelum = 0;
      menungguLogin = false;
      opts.onKeadaan({ jenis: "selesai", pada: jam.sekarang() });
      if (hasil.ditimpa.length > 0) opts.onDitimpa?.(hasil.ditimpa);
    } catch (e) {
      if (e instanceof LoginDiperlukanError) {
        menungguLogin = true;
        opts.onKeadaan({ jenis: "perlu-login" });
      } else {
        gagalBerturut++;
        const tunggu = Math.min(BACKOFF_AWAL_MS * 2 ** (gagalBerturut - 1), BACKOFF_MAKS_MS);
        tidakSebelum = jam.sekarang() + tunggu;
        opts.onKeadaan({
          jenis: "gagal",
          pesan: e instanceof Error ? e.message : "Sinkronisasi gagal",
          cobaLagiDalamMs: tunggu,
        });
        if (!berhenti) batalCobaLagi = jam.atur(() => picu({ paksa: true }), tunggu);
      }
    } finally {
      berjalan = false;
    }
  }

  const onOnline = () => {
    // Koneksi pulih: backoff sebelumnya tidak berlaku lagi.
    tidakSebelum = 0;
    batalCobaLagi?.();
    void picu({ paksa: true });
  };

  function jadwalkanBerkala() {
    batalBerkala = jam.atur(async () => {
      await picu();
      if (!berhenti) jadwalkanBerkala();
    }, periodeMs);
  }

  /** Pasang pemicu dan langsung sinkron (aplikasi dibuka). */
  async function mulai() {
    if (!berhenti) return;
    berhenti = false;
    menungguLogin = false; // aplikasi dibuka lagi: mungkin sudah login ulang
    target?.addEventListener("online", onOnline);
    jadwalkanBerkala();
    await picu();
  }

  function hentikan() {
    berhenti = true;
    target?.removeEventListener("online", onOnline);
    batalCobaLagi?.();
    batalBerkala?.();
  }

  return { picu, mulai, berhenti: hentikan };
}
