"use client";

import { Camera, CameraOff, ScanBarcode, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HasilCariEksemplar } from "@/lib/local-library";
import { tanggalIndonesia } from "@/lib/peminjaman/whatsapp";
import { umpanBalikScan } from "@/lib/umpan-balik-scan";
import { AksiPinjaman, LembarPinjam } from "./aksi-pinjaman";
import { KameraScanner } from "./kamera-scanner";
import { KotakPindai, useKotakPindai } from "./kotak-pindai";
import { useLibrary } from "./library-provider";
import { ChipPinjam } from "./panel-pinjaman";

const PESAN_MS = 5000;

/**
 * Layar penuh pemindai Label Barcode (Code 128 berisi Nomor Induk): hasilnya
 * membuka Eksemplar yang sesuai sebagai kartu di dalam layar ini, lengkap
 * dengan Pinjamkan atau Kembalikan. Tidak ada navigasi rute selama kamera
 * menyala (bug kamera iOS mode standalone); "Buka Eksemplar" mematikan kamera
 * lebih dulu baru berpindah halaman.
 */
export function LayarPindaiLabel({
  onTutup,
  onBukaEksemplar,
}: {
  onTutup: () => void;
  onBukaEksemplar: (bukuId: string, eksemplarId: string) => void;
}) {
  const { library, peminjaman } = useLibrary();
  const [kameraDiinginkan, setKameraDiinginkan] = useState(true);
  const [kamera, setKamera] = useState<"memulai" | "aktif" | "galat">("memulai");
  const [pesanKamera, setPesanKamera] = useState<string | null>(null);
  const [hasil, setHasil] = useState<HasilCariEksemplar | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [nomor, setNomor] = useState("");
  const [pinjam, setPinjam] = useState(false);
  const timerPesan = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { keadaan: keadaanKotak, terbaca: kotakTerbaca, berhasil: kotakBerhasil, ditolak: kotakDitolak } = useKotakPindai(kameraDiinginkan && kamera === "aktif" && hasil === null && !pinjam);

  useEffect(() => () => clearTimeout(timerPesan.current), []);

  const tampilkanPesan = useCallback((teks: string) => {
    clearTimeout(timerPesan.current);
    setPesan(teks);
    timerPesan.current = setTimeout(() => setPesan(null), PESAN_MS);
  }, []);

  const tangani = useCallback(
    async (teks: string, dariKamera = false) => {
      if (!library) return;
      if (dariKamera) kotakTerbaca();
      const h = await library.cariDariPindai(teks);
      if (h.jenis === "eksemplar") {
        if (dariKamera) kotakBerhasil();
        umpanBalikScan("berhasil");
        setPesan(null);
        setHasil(h.eksemplar);
        setNomor("");
      } else {
        if (dariKamera) kotakDitolak();
        umpanBalikScan("tolak");
        tampilkanPesan(h.pesan);
      }
    },
    [library, tampilkanPesan, kotakTerbaca, kotakBerhasil, kotakDitolak],
  );

  // Setelah Pinjamkan/Kembalikan daftar Peminjaman berubah: muat ulang kartu hasil.
  const nomorHasil = hasil?.nomorInduk;
  useEffect(() => {
    if (!library || !nomorHasil) return;
    let batal = false;
    void library.cariDariPindai(nomorHasil).then((h) => {
      if (!batal && h.jenis === "eksemplar") setHasil(h.eksemplar);
    });
    return () => {
      batal = true;
    };
  }, [library, nomorHasil, peminjaman]);

  const terbuka = hasil !== null || pinjam;
  const p = hasil?.dipinjam ?? null;

  return (
    <div
      role="dialog"
      aria-label="Pindai Label Barcode"
      data-testid="layar-pindai-label"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black text-white"
    >
      {kameraDiinginkan && (
        <KameraScanner
          formats={["ean_13", "code_128"]}
          jeda={terbuka}
          onBaca={(teks) => void tangani(teks, true)}
          onKeadaan={(k) => {
            setKamera(k.jenis === "memulai" ? "memulai" : k.jenis === "aktif" ? "aktif" : "galat");
            setPesanKamera(k.jenis === "galat" ? k.pesan : null);
          }}
        />
      )}

      <header className="relative z-10 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-black/50 px-4 text-sm font-medium">
          <ScanBarcode className="size-4 shrink-0" aria-hidden /> Pindai Label Barcode
        </p>
        <button
          type="button"
          onClick={() => setKameraDiinginkan((v) => !v)}
          className="flex size-11 items-center justify-center rounded-full bg-black/50"
          aria-label={kameraDiinginkan ? "Matikan kamera" : "Nyalakan kamera"}
        >
          {kameraDiinginkan ? <Camera className="size-5" aria-hidden /> : <CameraOff className="size-5" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => {
            // Matikan kamera lebih dulu, baru induk boleh menutup layar.
            setKameraDiinginkan(false);
            setTimeout(onTutup, 0);
          }}
          className="min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-white"
        >
          Selesai
        </button>
      </header>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        {kameraDiinginkan && kamera !== "galat" && (
          <KotakPindai
            keadaan={keadaanKotak}
            memulai={kamera === "memulai"}
            arahan="Arahkan barcode di Label ke dalam kotak"
            saranBelumTerbaca="Barcode belum terbaca. Jauhkan HP sedikit, hindari pantulan cahaya, atau ketik Nomor Induk di bawah."
            paksaHijau={hasil !== null}
          />
        )}
        {kameraDiinginkan && pesanKamera && (
          <p role="status" className="max-w-sm rounded-2xl bg-black/70 p-4 text-center text-sm">
            {pesanKamera.replace("ISBN tetap bisa diketik.", "Nomor Induk tetap bisa diketik.")}
          </p>
        )}
        {!kameraDiinginkan && (
          <p className="max-w-sm rounded-2xl bg-black/60 p-4 text-center text-sm">
            Kamera mati. Ketik Nomor Induk atau pakai scanner USB di bawah, atau nyalakan kamera lagi.
          </p>
        )}
      </div>

      <div className="relative z-10 flex max-h-[62%] flex-col gap-2 bg-gradient-to-t from-black/85 via-black/70 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
        {pesan && (
          <p role="alert" className="rounded-2xl bg-bahaya px-4 py-3 text-sm font-medium text-white">
            {pesan}
          </p>
        )}

        {hasil && (
          <section
            aria-label="Eksemplar hasil pindai"
            data-testid="hasil-pindai"
            className="flex flex-col gap-3 overflow-y-auto rounded-2xl bg-white p-4 text-ink shadow-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[15px] font-semibold" data-testid="nomor-induk-hasil">
                  {hasil.nomorInduk}
                </p>
                <p className="mt-0.5 truncate font-heading text-lg font-semibold">{hasil.judul}</p>
                {hasil.pengarang && <p className="truncate text-sm text-ink-muted">{hasil.pengarang}</p>}
              </div>
              <button
                type="button"
                onClick={() => setHasil(null)}
                aria-label="Tutup kartu"
                className="flex size-11 shrink-0 items-center justify-center text-ink-muted"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            {hasil.status === "keluar" ? (
              <p className="text-sm text-ink-muted">Eksemplar ini sudah keluar dari koleksi, jadi tidak bisa dipinjamkan.</p>
            ) : p ? (
              <>
                <p className="text-sm">
                  Dipinjam <strong>{p.peminjam.nama}</strong>. Jatuh tempo <strong>{tanggalIndonesia(p.jatuhTempo)}</strong>.
                </p>
                <div>
                  <ChipPinjam pinjaman={p} />
                </div>
                <AksiPinjaman peminjamanId={p.peminjamanId} jatuhTempo={p.jatuhTempo} tautanPengingat={p.tautanPengingat} />
              </>
            ) : (
              <>
                <p className="text-sm text-ink-muted">Tersedia di rak.</p>
                <button
                  type="button"
                  onClick={() => setPinjam(true)}
                  className="h-12 rounded-2xl bg-forest text-sm font-semibold text-paper"
                >
                  Pinjamkan
                </button>
              </>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="min-h-11 flex-1 rounded-2xl border border-input bg-white text-sm font-semibold"
                onClick={() => {
                  setKameraDiinginkan(false);
                  const { bukuId, eksemplarId } = hasil;
                  setTimeout(() => onBukaEksemplar(bukuId, eksemplarId), 0);
                }}
              >
                Buka Eksemplar
              </button>
              <button
                type="button"
                className="min-h-11 flex-1 rounded-2xl border border-input bg-white text-sm font-semibold"
                onClick={() => setHasil(null)}
              >
                Pindai lagi
              </button>
            </div>
          </section>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void tangani(nomor.trim().toUpperCase());
          }}
          className="flex gap-2"
          noValidate
        >
          <label htmlFor="nomor-induk-ketik" className="sr-only">
            Nomor Induk
          </label>
          <input
            id="nomor-induk-ketik"
            value={nomor}
            onChange={(e) => setNomor(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="Ketik Nomor Induk, mis. FIK-014/2026"
            className="h-12 min-w-0 flex-1 rounded-2xl border-0 bg-white px-4 text-base text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
          <button type="submit" className="h-12 shrink-0 rounded-2xl bg-forest px-4 text-sm font-semibold text-paper">
            Buka
          </button>
        </form>
      </div>

      {pinjam && hasil && (
        <LembarPinjam eksemplarId={hasil.eksemplarId} judul={hasil.judul} onTutup={() => setPinjam(false)} />
      )}
    </div>
  );
}
