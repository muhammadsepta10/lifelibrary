"use client";

import { useEffect, useRef, useState } from "react";
import { locateFileZxing } from "@/lib/zxing-lokal";

/**
 * Format barcode yang dikenali pemindai. Tiket ini hanya `ean_13` (ISBN);
 * Code 128 (Nomor Induk pada Label Barcode) ditambahkan tiket Cetak Label/Peminjaman
 * dengan memberi `formats={["ean_13", "code_128"]}`.
 */
export type FormatBarcode = "ean_13" | "code_128";
export const FORMAT_ISBN: FormatBarcode[] = ["ean_13"];

const JEDA_DETEKSI_MS = 120;

type Detektor = { detect(sumber: HTMLVideoElement): Promise<{ rawValue: string; format: string }[]> };

/** Pemindai ZXing (WASM) lewat paket `barcode-detector`: satu jalur kode di semua browser, termasuk iOS. */
async function buatDetektor(formats: FormatBarcode[]): Promise<Detektor> {
  const { BarcodeDetector, setZXingModuleOverrides } = await import("barcode-detector/ponyfill");
  // WASM dari aplikasi sendiri (precache Service Worker), bukan jsDelivr: scan harus jalan offline.
  setZXingModuleOverrides({ locateFile: locateFileZxing });
  return new BarcodeDetector({ formats }) as Detektor;
}

function pesanKamera(e: unknown): string {
  const nama = e instanceof DOMException || e instanceof Error ? e.name : "";
  if (nama === "NotAllowedError" || nama === "SecurityError") {
    return "Kamera belum diizinkan. Izinkan akses kamera di pengaturan browser, lalu nyalakan kamera lagi. Sementara itu ISBN tetap bisa diketik.";
  }
  if (nama === "NotFoundError" || nama === "OverconstrainedError") return "Kamera tidak ditemukan. ISBN tetap bisa diketik.";
  if (nama === "NotReadableError") return "Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu, lalu nyalakan kamera lagi.";
  return "Kamera tidak bisa dinyalakan. ISBN tetap bisa diketik.";
}

/**
 * Lapisan tipis di atas kamera: menyalakan aliran video, membaca barcode, dan
 * melaporkan teksnya lewat `onBaca`. Tidak tahu apa-apa soal ISBN, Sesi, atau
 * kartu; semua keputusan ada di Perpustakaan Lokal. Aliran kamera dimatikan
 * hanya saat komponen dilepas, tidak saat `jeda` (halaman tidak boleh
 * berpindah rute selama kamera menyala: bug kamera iOS mode standalone).
 */
export function KameraScanner({
  formats = FORMAT_ISBN,
  jeda = false,
  onBaca,
  onKeadaan,
}: {
  formats?: FormatBarcode[];
  /** Berhenti membaca barcode (kamera tetap menyala), mis. selama layar tinjau terbuka. */
  jeda?: boolean;
  onBaca: (teks: string, format: string) => void;
  /** Dilaporkan ke UI: kamera sedang dinyalakan, aktif, atau gagal (dengan pesan ramah). */
  onKeadaan?: (k: { jenis: "memulai" } | { jenis: "aktif" } | { jenis: "galat"; pesan: string }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Nilai terbaru tanpa memulai ulang kamera.
  const jedaRef = useRef(jeda);
  const onBacaRef = useRef(onBaca);
  const onKeadaanRef = useRef(onKeadaan);
  const kunciFormat = formats.join(",");
  useEffect(() => {
    jedaRef.current = jeda;
    onBacaRef.current = onBaca;
    onKeadaanRef.current = onKeadaan;
  });

  const [pemindaiGalat, setPemindaiGalat] = useState(false);

  useEffect(() => {
    let batal = false;
    const elemenVideo = videoRef.current;
    let aliran: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const lapor = (k: Parameters<NonNullable<typeof onKeadaan>>[0]) => onKeadaanRef.current?.(k);

    async function mulai() {
      lapor({ jenis: "memulai" });
      try {
        aliran = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch (e) {
        if (!batal) lapor({ jenis: "galat", pesan: pesanKamera(e) });
        return;
      }
      if (batal) {
        aliran.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = aliran;
      try {
        await video.play();
      } catch {
        // pemutaran otomatis bisa ditolak; aliran tetap terpasang
      }
      lapor({ jenis: "aktif" });

      let detektor: Detektor;
      try {
        detektor = await buatDetektor(kunciFormat.split(",") as FormatBarcode[]);
      } catch {
        // WASM pemindai belum bisa dimuat (mis. offline sebelum pernah dibuka online): kamera tetap tampil, ketik ISBN.
        if (!batal) setPemindaiGalat(true);
        return;
      }

      const putaran = async () => {
        if (batal) return;
        if (!jedaRef.current && video.readyState >= 2) {
          try {
            const hasil = await detektor.detect(video);
            const pertama = hasil.find((h) => h.rawValue);
            if (pertama && !batal && !jedaRef.current) onBacaRef.current(pertama.rawValue, pertama.format);
          } catch {
            // bingkai gagal dibaca: lanjut bingkai berikutnya
          }
        }
        if (!batal) timer = setTimeout(putaran, JEDA_DETEKSI_MS);
      };
      void putaran();
    }

    void mulai();
    return () => {
      batal = true;
      clearTimeout(timer);
      aliran?.getTracks().forEach((t) => t.stop());
      if (elemenVideo) elemenVideo.srcObject = null;
    };
  }, [kunciFormat]);

  return (
    <>
      <video
        ref={videoRef}
        data-testid="video-kamera"
        className="absolute inset-0 size-full object-cover"
        playsInline
        muted
        autoPlay
        aria-label="Pratinjau kamera"
      />
      {pemindaiGalat && (
        <p role="status" className="absolute inset-x-4 top-24 rounded-2xl bg-black/70 p-3 text-center text-sm text-white">
          Pemindai belum bisa dimuat (butuh koneksi untuk pertama kali). Ketik ISBN di bawah.
        </p>
      )}
    </>
  );
}
