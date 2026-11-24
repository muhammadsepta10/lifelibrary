import type { KelolaTransport } from "@/lib/kelola-protocol";
import type { Db } from "@/server/db/types";
import { aturanApi } from "./aturan";
import { kategoriApi } from "./kategori";
import { lokasiApi } from "./lokasi";

/**
 * Seam: API Kelola. Pengelolaan Kategori, Lokasi, dan Aturan Kategori lewat
 * endpoint biasa, hanya online (ADR 0004). Bentuknya sama dengan
 * `KelolaTransport`, jadi tes memakainya langsung sebagai transport.
 */
export function createKelolaApi(db: Db): KelolaTransport {
  return {
    kategori: kategoriApi(db),
    lokasi: lokasiApi(db),
    aturanKategori: aturanApi(db),
  };
}

export type KelolaApi = ReturnType<typeof createKelolaApi>;
