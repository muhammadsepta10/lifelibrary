"use client";

import { useState } from "react";
import type { PinjamanAktif } from "@/lib/local-library";
import { tanggalIndonesia } from "@/lib/peminjaman/whatsapp";
import { cn } from "@/lib/utils";
import { AksiPinjaman, LembarPinjam } from "./aksi-pinjaman";

/** Chip status pinjam: Dipinjam, atau Terlambat bila lewat jatuh tempo. */
export function ChipPinjam({ pinjaman }: { pinjaman: Pick<PinjamanAktif, "terlambat" | "hariTerlambat"> }) {
  return (
    <span
      data-testid="chip-pinjam"
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
        pinjaman.terlambat ? "bg-[#F7E1DD] text-[#A63D2F]" : "bg-paper text-ink",
      )}
    >
      {pinjaman.terlambat ? `Terlambat ${pinjaman.hariTerlambat} hari` : "Dipinjam"}
    </span>
  );
}

/**
 * Peminjaman satu Eksemplar: tersedia -> tombol Pinjamkan; sedang dipinjam ->
 * siapa, sampai kapan, Kembalikan, dan pengingat WhatsApp. Lembar formulir
 * terbuka di dalam halaman.
 */
export function PanelPinjaman({
  eksemplar,
}: {
  eksemplar: { id: string; judul: string; status: "aktif" | "keluar"; dipinjam: PinjamanAktif | null };
}) {
  const [buka, setBuka] = useState(false);
  const kartu = "mx-5 mb-5 rounded-2xl bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,.08)]";
  const p = eksemplar.dipinjam;

  if (eksemplar.status === "keluar") return null;

  return (
    <section className={kartu} aria-labelledby="judul-peminjaman" data-testid="panel-pinjaman">
      <h2 id="judul-peminjaman" className="font-heading text-lg font-semibold">
        Peminjaman
      </h2>
      {p ? (
        <div className="mt-2 flex flex-col gap-3">
          <p className="text-sm">
            Dipinjam <strong>{p.peminjam.nama}</strong> sejak {tanggalIndonesia(p.tanggalPinjam)}. Jatuh tempo{" "}
            <strong>{tanggalIndonesia(p.jatuhTempo)}</strong>.
          </p>
          <div>
            <ChipPinjam pinjaman={p} />
          </div>
          <AksiPinjaman peminjamanId={p.peminjamanId} jatuhTempo={p.jatuhTempo} tautanPengingat={p.tautanPengingat} />
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-muted">Eksemplar ini ada di rak. Catat bila dipinjam teman atau keluarga.</p>
          <button
            type="button"
            onClick={() => setBuka(true)}
            className="mt-3 h-12 rounded-2xl bg-forest px-5 text-sm font-semibold text-paper"
          >
            Pinjamkan
          </button>
        </>
      )}
      {buka && <LembarPinjam eksemplarId={eksemplar.id} judul={eksemplar.judul} onTutup={() => setBuka(false)} />}
    </section>
  );
}
