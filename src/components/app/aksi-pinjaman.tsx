"use client";

import { useState } from "react";
import { MessageCircle, Undo2, X } from "lucide-react";
import { ValidasiError } from "@/lib/local-library";
import { cn } from "@/lib/utils";
import { FormPinjam } from "./form-pinjam";
import { inputCls, tombolSekunderCls } from "./form";
import { useLibrary } from "./library-provider";

/** Lembar dalam halaman (tanpa berpindah rute, supaya kamera pemindai tidak terputus). */
export function Lembar({ judul, onTutup, children }: { judul: string; onTutup: () => void; children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={judul}
      className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-paper text-ink"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-forest px-5 py-3 text-paper">
        <h2 className="font-heading text-lg font-bold">{judul}</h2>
        <button
          type="button"
          onClick={onTutup}
          className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-semibold"
        >
          <X className="size-4" aria-hidden /> Tutup
        </button>
      </div>
      {children}
    </div>
  );
}

/** "Pinjamkan": lembar formulir untuk satu Eksemplar. */
export function LembarPinjam({
  eksemplarId,
  judul,
  onTutup,
}: {
  eksemplarId: string;
  judul: string;
  onTutup: () => void;
}) {
  return (
    <Lembar judul="Pinjamkan Eksemplar" onTutup={onTutup}>
      <FormPinjam eksemplarId={eksemplarId} judul={judul} onSelesai={onTutup} onBatal={onTutup} />
    </Lembar>
  );
}

export const tombolWaCls =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 text-sm font-semibold text-[#06361b]";

/**
 * Aksi untuk Peminjaman yang masih aktif: Kembalikan, Kirim pengingat via
 * WhatsApp (membuka `wa.me` dengan pesan terisi; Pemilik yang menekan kirim),
 * dan ubah jatuh tempo. Tanpa denda.
 */
export function AksiPinjaman({
  peminjamanId,
  jatuhTempo,
  tautanPengingat,
  kompak = false,
}: {
  peminjamanId: string;
  jatuhTempo: string;
  tautanPengingat: string | null;
  kompak?: boolean;
}) {
  const { library } = useLibrary();
  const [ubahTempo, setUbahTempo] = useState(false);
  const [tempo, setTempo] = useState(jatuhTempo);
  const [galat, setGalat] = useState<string | null>(null);

  async function jalankan(fn: () => Promise<void>) {
    setGalat(null);
    try {
      await fn();
    } catch (err) {
      if (err instanceof ValidasiError) setGalat(err.pesan);
      else throw err;
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={cn("flex flex-wrap gap-2", kompak && "gap-1.5")}>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-forest px-4 text-sm font-semibold text-paper"
          onClick={() => void jalankan(() => library!.kembalikan(peminjamanId))}
        >
          <Undo2 className="size-4" aria-hidden /> Kembalikan
        </button>
        {tautanPengingat ? (
          <a href={tautanPengingat} target="_blank" rel="noopener noreferrer" className={tombolWaCls}>
            <MessageCircle className="size-4" aria-hidden /> Kirim pengingat via WhatsApp
          </a>
        ) : (
          <span className="inline-flex min-h-11 items-center text-xs text-ink-muted">
            Tambahkan nomor WhatsApp Peminjam untuk mengirim pengingat
          </span>
        )}
        <button type="button" className={tombolSekunderCls} onClick={() => setUbahTempo((v) => !v)} aria-expanded={ubahTempo}>
          Ubah jatuh tempo
        </button>
      </div>
      {ubahTempo && (
        <div className="flex items-center gap-2">
          <label htmlFor={`tempo-${peminjamanId}`} className="sr-only">
            Jatuh tempo baru
          </label>
          <input
            id={`tempo-${peminjamanId}`}
            type="date"
            className={cn(inputCls, "flex-1")}
            value={tempo}
            onChange={(e) => setTempo(e.target.value)}
          />
          <button
            type="button"
            className="h-12 rounded-2xl bg-forest px-4 text-sm font-semibold text-paper"
            onClick={() =>
              void jalankan(async () => {
                await library!.ubahJatuhTempo(peminjamanId, tempo);
                setUbahTempo(false);
              })
            }
          >
            Simpan
          </button>
        </div>
      )}
      {galat && (
        <p role="alert" className="text-sm text-bahaya">
          {galat}
        </p>
      )}
    </div>
  );
}
