import type { LocalLibrary } from "@/lib/local-library";
import type { SyncTransport } from "@/lib/sync-protocol";
import { LoginDiperlukanError } from "./fetch-transport";

export type KeadaanSinkron =
  | { jenis: "diam" }
  | { jenis: "berjalan" }
  | { jenis: "selesai"; pada: number }
  | { jenis: "perlu-login" }
  | { jenis: "gagal"; pesan: string; cobaLagiDalamMs: number };

const BACKOFF_AWAL_MS = 2_000;
const BACKOFF_MAKS_MS = 5 * 60_000;

/**
 * Penjadwal Sinkronisasi: satu proses sinkron pada satu waktu, dengan backoff
 * eksponensial bila gagal. Pemicunya (app dibuka, event `online`, perubahan
 * lokal) dipasang oleh UI lewat `picu()`.
 */
export function buatPenjadwal(opts: {
  library: LocalLibrary;
  transport: SyncTransport;
  onKeadaan: (k: KeadaanSinkron) => void;
}) {
  let berjalan = false;
  let gagalBerturut = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function picu() {
    if (berjalan) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    clearTimeout(timer);
    berjalan = true;
    opts.onKeadaan({ jenis: "berjalan" });
    try {
      await opts.library.sinkronkan(opts.transport);
      gagalBerturut = 0;
      opts.onKeadaan({ jenis: "selesai", pada: Date.now() });
    } catch (e) {
      if (e instanceof LoginDiperlukanError) {
        opts.onKeadaan({ jenis: "perlu-login" });
      } else {
        gagalBerturut++;
        const tunggu = Math.min(BACKOFF_AWAL_MS * 2 ** (gagalBerturut - 1), BACKOFF_MAKS_MS);
        opts.onKeadaan({
          jenis: "gagal",
          pesan: e instanceof Error ? e.message : "Sinkronisasi gagal",
          cobaLagiDalamMs: tunggu,
        });
        timer = setTimeout(() => void picu(), tunggu);
      }
    } finally {
      berjalan = false;
    }
  }

  return { picu, berhenti: () => clearTimeout(timer) };
}
