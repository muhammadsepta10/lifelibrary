"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CloudOff } from "lucide-react";
import { KelolaDitolakError } from "@/lib/kelola-protocol";
import { ButuhKoneksiError, ValidasiError } from "@/lib/local-library";
import { LoginDiperlukanError } from "@/lib/sync/fetch-transport";
import { cn } from "@/lib/utils";
import { useLibrary } from "./library-provider";

export const inputCls =
  "h-12 w-full rounded-2xl border border-input bg-white px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-forest-link";
export const kartuCls = "rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,.08)]";
export const tombolUtamaCls =
  "h-12 rounded-2xl bg-forest px-5 text-sm font-semibold text-paper disabled:opacity-60";
export const tombolKecilCls =
  "h-9 rounded-full border border-input bg-white px-3.5 text-[13px] font-medium disabled:opacity-50";

/** Keterangan di samping aksi kelola yang tidak bisa dipakai tanpa koneksi (ADR 0004). */
export function ButuhKoneksi({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold text-ink-muted", className)}>
      <CloudOff className="size-3.5" aria-hidden /> Butuh koneksi
    </span>
  );
}

export function KembaliKeLainnya() {
  return (
    <Link href="/lainnya" className="inline-flex items-center gap-1 px-5 pt-4 text-sm font-medium text-forest-link">
      <ArrowLeft className="size-4" aria-hidden /> Lainnya
    </Link>
  );
}

/** Aksi kelola dibuat tidak aktif saat offline, tapi tetap terlihat dengan keterangannya. */
export function useAksi() {
  const { online } = useLibrary();
  const [bekerja, setBekerja] = useState(false);
  const [galat, setGalat] = useState<{ field: string | null; pesan: string } | null>(null);

  async function jalankan(fn: () => Promise<unknown>): Promise<boolean> {
    setGalat(null);
    setBekerja(true);
    try {
      await fn();
      return true;
    } catch (e) {
      if (e instanceof KelolaDitolakError) setGalat({ field: e.field, pesan: e.pesan });
      else if (e instanceof ValidasiError) setGalat({ field: e.field, pesan: e.pesan });
      else if (e instanceof ButuhKoneksiError) setGalat({ field: null, pesan: e.message });
      else if (e instanceof LoginDiperlukanError) setGalat({ field: null, pesan: e.message });
      else setGalat({ field: null, pesan: "Gagal menyimpan. Coba lagi" });
      return false;
    } finally {
      setBekerja(false);
    }
  }

  return {
    online,
    bekerja,
    /** Aksi tidak bisa dipakai: sedang bekerja atau offline. */
    nonaktif: bekerja || !online,
    galat,
    galatDi: (f: string) => (galat?.field === f ? galat.pesan : null),
    galatUmum: galat && galat.field === null ? galat.pesan : null,
    bersihkanGalat: () => setGalat(null),
    jalankan,
  };
}

export function Bidang({
  id,
  label,
  galat,
  children,
}: {
  id: string;
  label: string;
  galat?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {galat && (
        <p role="alert" className="mt-1 text-sm text-bahaya">
          {galat}
        </p>
      )}
    </div>
  );
}
