"use client";

import { useCallback, useEffect, useReducer } from "react";
import { KOTAK_MATI, ubahKotak, warnaKotak, type KeadaanKotak, type WarnaKotak } from "@/lib/kotak-pindai";
import { cn } from "@/lib/utils";

const DETAK_MS = 250;

/**
 * Menjalankan mesin keadaan kotak bidik dengan jam nyata. `aktif` = kamera
 * menyala dan tidak dijeda. Panggil `terbaca` untuk setiap barcode yang
 * dibaca kamera, lalu `berhasil` atau `ditolak` sesuai hasilnya.
 */
export function useKotakPindai(aktif: boolean) {
  const [keadaan, kirim] = useReducer(ubahKotak, KOTAK_MATI);

  useEffect(() => {
    kirim(aktif ? { jenis: "aktif", waktu: Date.now() } : { jenis: "nonaktif" });
  }, [aktif]);

  const berjalan = keadaan.jenis !== "mati" && keadaan.jenis !== "belumTerbaca";
  useEffect(() => {
    if (!berjalan) return;
    const id = setInterval(() => kirim({ jenis: "detak", waktu: Date.now() }), DETAK_MS);
    return () => clearInterval(id);
  }, [berjalan]);

  const terbaca = useCallback(() => kirim({ jenis: "terbaca", waktu: Date.now() }), []);
  const berhasil = useCallback(() => kirim({ jenis: "berhasil", waktu: Date.now() }), []);
  const ditolak = useCallback(() => kirim({ jenis: "ditolak", waktu: Date.now() }), []);

  return { keadaan, terbaca, berhasil, ditolak };
}

const KELAS_WARNA: Record<WarnaKotak, string> = {
  putih: "border-white/80",
  hijau: "border-emerald-400",
  merah: "border-bahaya",
};

/** Kotak bidik dan keterangan di bawahnya. */
export function KotakPindai({
  keadaan,
  memulai,
  arahan,
  saranBelumTerbaca,
  paksaHijau = false,
}: {
  keadaan: KeadaanKotak;
  memulai: boolean;
  arahan: string;
  saranBelumTerbaca: string;
  /** Mis. kartu hasil sedang tampil (kamera dijeda) di layar Pindai Label. */
  paksaHijau?: boolean;
}) {
  const warna = paksaHijau ? "hijau" : warnaKotak(keadaan);
  const keterangan = memulai
    ? "Menyalakan kamera…"
    : keadaan.jenis === "belumTerbaca"
      ? saranBelumTerbaca
      : keadaan.jenis === "ditolak"
        ? "Barcode terbaca, tapi ditolak. Lihat pesan di bawah."
        : arahan;
  const merah = warna === "merah" && !memulai;

  return (
    <>
      <div
        aria-hidden
        data-testid="kotak-pindai"
        data-warna={warna}
        className={cn("aspect-[16/9] w-full max-w-sm rounded-2xl border-[3px] transition-colors duration-300", KELAS_WARNA[warna])}
      />
      <p
        role="status"
        className={cn("mt-3 max-w-sm rounded-2xl px-4 py-1.5 text-center text-sm", merah ? "bg-bahaya font-medium text-white" : "bg-black/50")}
      >
        {keterangan}
      </p>
    </>
  );
}
