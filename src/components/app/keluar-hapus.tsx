"use client";

import { useState } from "react";
import { keluarAkun } from "@/lib/auth-client";
import {
  keluarDanHapusData,
  pesanKonfirmasiHapus,
  tandaiKeluarTertunda,
  type RingkasanDataPerangkat,
} from "@/lib/keluar-hapus-data";
import { tombolSekunderCls } from "./form";
import { useLibrary } from "./library-provider";

/**
 * "Keluar & hapus data di perangkat ini": konfirmasi menyebut jumlah perubahan
 * yang belum terkirim (ADR 0004). Sesudah dikonfirmasi: IndexedDB dan semua
 * cache dihapus, lalu keluar. Halaman dimuat ulang penuh ke /login karena
 * basis data yang dipakai halaman ini sudah dihapus.
 */
export function KeluarHapusData() {
  const { library } = useLibrary();
  const [ringkasan, setRingkasan] = useState<RingkasanDataPerangkat | null>(null);
  const [bekerja, setBekerja] = useState(false);

  async function buka() {
    if (!library) return;
    setRingkasan(await library.ringkasanDataPerangkat());
  }

  async function hapus() {
    if (!library) return;
    setBekerja(true);
    try {
      await keluarDanHapusData({
        library,
        cacheStorage: typeof caches === "undefined" ? undefined : caches,
        signOut: keluarAkun,
        tandaiKeluarTertunda,
      });
    } finally {
      window.location.replace("/login");
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={bekerja || !library}
        onClick={() => void buka()}
        className="h-12 rounded-2xl bg-white text-sm font-semibold text-bahaya shadow-[0_2px_8px_rgba(0,0,0,.08)] disabled:opacity-60"
      >
        Keluar & hapus data di perangkat ini
      </button>
      {ringkasan && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-5 sm:items-center">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="judul-hapus"
            aria-describedby="isi-hapus"
            className="w-full max-w-sm rounded-2xl bg-paper p-5 shadow-xl"
          >
            <h2 id="judul-hapus" className="font-heading text-lg font-semibold">
              Hapus data di perangkat ini?
            </h2>
            <p id="isi-hapus" data-testid="isi-konfirmasi-hapus" className="mt-2 text-sm">
              {pesanKonfirmasiHapus(ringkasan)}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={bekerja}
                onClick={() => void hapus()}
                className="h-12 rounded-2xl bg-bahaya text-sm font-semibold text-white disabled:opacity-60"
              >
                {bekerja ? "Menghapus…" : "Hapus dan keluar"}
              </button>
              <button type="button" disabled={bekerja} onClick={() => setRingkasan(null)} className={tombolSekunderCls}>
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
