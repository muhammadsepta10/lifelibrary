"use client";

import { useEffect, useState } from "react";
import type { DetailBuku } from "@/lib/local-library";
import { cn } from "@/lib/utils";
import { useLibrary } from "./library-provider";

export const inputCls =
  "h-12 w-full rounded-2xl border border-input bg-white px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-forest-link aria-[invalid=true]:border-bahaya";
export const tombolUtamaCls =
  "flex h-[52px] w-full items-center justify-center rounded-2xl bg-forest text-base font-semibold text-paper disabled:opacity-60";
export const tombolSekunderCls =
  "flex h-12 items-center justify-center rounded-2xl border border-input bg-white px-5 text-sm font-semibold disabled:opacity-60";

export function Field({
  id,
  label,
  galat,
  petunjuk,
  children,
}: {
  id: string;
  label: React.ReactNode;
  galat?: string | null;
  petunjuk?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {petunjuk && !galat && <p className="mt-1 text-xs text-ink-muted">{petunjuk}</p>}
      {galat && (
        <p role="alert" className="mt-1 text-sm text-bahaya">
          {galat}
        </p>
      )}
    </div>
  );
}

export function Pilihan<T extends string>({
  id,
  nilai,
  onChange,
  pilihan,
  kosong = "Tidak diisi",
}: {
  id: string;
  nilai: T | "";
  onChange: (v: T | "") => void;
  pilihan: { nilai: T; label: string }[];
  kosong?: string;
}) {
  return (
    <select
      id={id}
      value={nilai}
      onChange={(e) => onChange(e.target.value as T | "")}
      className={cn(inputCls, "appearance-auto")}
    >
      <option value="">{kosong}</option>
      {pilihan.map((p) => (
        <option key={p.nilai} value={p.nilai}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

/** Detail Buku dari salinan lokal, diperbarui otomatis. `undefined` = memuat, `null` = tidak ada. */
export function useDetailBuku(bukuId: string | null) {
  const { library } = useLibrary();
  const [detail, setDetail] = useState<DetailBuku | null | undefined>(undefined);
  useEffect(() => {
    if (!library || !bukuId) return;
    return library.pantauDetailBuku(bukuId, setDetail);
  }, [library, bukuId]);
  return bukuId ? detail : null;
}

/** Angka dari isian teks; kosong = null, bukan angka = NaN (ditolak validasi). */
export const keAngka = (s: string): number | null => (s.trim() === "" ? null : Number(s));
export const dariAngka = (n: number | null | undefined) => (n == null ? "" : String(n));
