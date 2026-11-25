"use client";

import { X } from "lucide-react";
import type { PemberitahuanDitimpa } from "@/lib/local-library";
import { PesanDitimpa } from "./pesan-ditimpa";

/** Notifikasi singkat di atas navigasi; bukan layar resolusi konflik (ADR 0004). */
export function Toaster({
  daftar,
  onTutup,
}: {
  daftar: PemberitahuanDitimpa[];
  onTutup: (id: string) => void;
}) {
  if (daftar.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-5 bottom-28 z-30 mx-auto flex max-w-md flex-col gap-2 lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0"
    >
      {daftar.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-paper shadow-[0_10px_30px_rgba(0,0,0,.3)]"
        >
          <p className="flex-1">
            <PesanDitimpa item={t} />
          </p>
          <button
            type="button"
            aria-label="Tutup pemberitahuan"
            onClick={() => onTutup(t.id)}
            className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-full opacity-70 hover:opacity-100"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
