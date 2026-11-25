"use client";

import { useEffect, useRef, useState } from "react";
import { LABEL_SUMBER, type HasilKandidat, type Kandidat } from "@/lib/draf-buku";
import { masukanKandidat, type MasukanKandidat } from "@/lib/judul-kandidat";
import { pencarianPerluMenunggu } from "@/lib/local-library/keadaan-metadata";
import { cariKandidat } from "@/lib/sync/fetch-metadata";

/** Jeda setelah ketikan terakhir sebelum pencarian judul berjalan. */
export const JEDA_PENCARIAN_MS = 800;

type Keadaan =
  | { status: "mencari" }
  | { status: "ada"; kandidat: Kandidat[] }
  | { status: "kosong" }
  | { status: "galat" };

/** Kunci pasangan (judul, pengarang) yang sudah dirapikan; null bila judul terlalu pendek. */
export const kunciKandidat = (m: MasukanKandidat | null) => (m ? JSON.stringify([m.judul, m.pengarang ?? ""]) : null);

/**
 * Pencarian cadangan lewat judul (ADR 0007) untuk satu layar tinjau. Mencari
 * otomatis setelah jeda ketikan (`segera()` melewati jeda), membatalkan
 * permintaan lama, dan menyimpan hasil per pasangan (judul, pengarang) selama
 * layar terbuka. Offline atau login habis: diam, tanpa galat. Setelah Pemilik
 * memilih Kandidat, `tutup(kunci)` menyembunyikan daftar sampai masukan berubah.
 */
export function useKandidat({ aktif, judul, pengarang }: { aktif: boolean; judul: string; pengarang: string }) {
  const masukan = aktif ? masukanKandidat(judul, pengarang) : null;
  const kunci = kunciKandidat(masukan);
  const [hasil, setHasil] = useState<{ kunci: string; keadaan: Keadaan | null } | null>(null);
  const [ditutup, setDitutup] = useState<string | null>(null);
  // Daftar yang ditutup muncul lagi hanya bila judul atau pengarang berubah; kembali ke pasangan lama pun dihitung berubah.
  if (ditutup !== null && ditutup !== kunci) setDitutup(null);
  const [segeraUntuk, setSegeraUntuk] = useState<string | null>(null);
  const cache = useRef(new Map<string, HasilKandidat>());

  useEffect(() => {
    if (!kunci || kunci === ditutup) return;
    const [j, p] = JSON.parse(kunci) as [string, string];
    const cari: MasukanKandidat = { judul: j, pengarang: p || undefined };
    const dicache = cache.current.get(kunci);
    if (dicache) {
      setHasil({ kunci, keadaan: keadaanDari(dicache) });
      return;
    }
    // Offline: tidak ada permintaan dan tidak ada pesan; Pemilik mengisi manual.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setHasil({ kunci, keadaan: null });
      return;
    }
    const kendali = new AbortController();
    const jalan = async () => {
      setHasil({ kunci, keadaan: { status: "mencari" } });
      try {
        const h = await cariKandidat(cari, kendali.signal);
        if (kendali.signal.aborted) return;
        const keadaan = keadaanDari(h);
        // Sumber gagal tidak disimpan: mengetik ulang pasangan yang sama boleh mencoba lagi.
        if (keadaan.status !== "galat") cache.current.set(kunci, h);
        setHasil({ kunci, keadaan });
      } catch (e) {
        if (kendali.signal.aborted) return;
        // Offline atau login habis: diam saja, Pemilik mengisi manual.
        setHasil({ kunci, keadaan: pencarianPerluMenunggu(e) ? null : { status: "galat" } });
      }
    };
    const timer = setTimeout(() => void jalan(), segeraUntuk === kunci ? 0 : JEDA_PENCARIAN_MS);
    return () => {
      clearTimeout(timer);
      kendali.abort();
    };
  }, [kunci, ditutup, segeraUntuk]);

  const keadaan = kunci && kunci !== ditutup && hasil?.kunci === kunci ? hasil.keadaan : null;
  return {
    keadaan,
    /** Memicu pencarian tanpa menunggu jeda (Enter di field judul). */
    segera: () => setSegeraUntuk(kunci),
    /** Menyembunyikan daftar sampai judul atau pengarang berubah (bawaan: masukan saat ini). */
    tutup: (judulBaru = judul, pengarangBaru = pengarang) => setDitutup(kunciKandidat(aktif ? masukanKandidat(judulBaru, pengarangBaru) : null)),
  };
}

const keadaanDari = (h: HasilKandidat): Keadaan => {
  if (h.kandidat.length) return { status: "ada", kandidat: h.kandidat };
  // Tidak ada Kandidat karena ada sumber yang gagal berbeda dari "tidak ada yang cocok": bukunya belum tentu tidak ada.
  return h.sumber.some((s) => s.status === "galat") ? { status: "galat" } : { status: "kosong" };
};

/** Daftar Kandidat di bawah field judul. Status diumumkan lewat `aria-live`. */
export function DaftarKandidat({
  keadaan,
  onPilih,
  onTutup,
}: {
  keadaan: Keadaan | null;
  onPilih: (kandidat: Kandidat) => void;
  onTutup: () => void;
}) {
  return (
    <section aria-labelledby="judul-kandidat" className="flex flex-col gap-2" data-testid="kandidat-judul">
      <h2 id="judul-kandidat" className="text-sm font-medium">
        Cari lewat judul
      </h2>
      <p role="status" aria-live="polite" className="text-sm text-ink-muted">
        {keadaan?.status === "mencari" && "Mencari…"}
        {keadaan?.status === "ada" && "Mungkin edisi lain dari buku ini. Ketuk satu untuk melengkapi field yang masih kosong."}
        {keadaan?.status === "kosong" && "Tidak ada data yang cocok, isi manual saja."}
        {keadaan?.status === "galat" && "Pencarian judul gagal karena sumber tidak bisa dihubungi. Itu bukan berarti bukunya tidak ada."}
        {!keadaan && "Ketik judul (minimal 3 huruf) untuk mencari data buku ini di edisi lain."}
      </p>
      {keadaan?.status === "ada" && (
        <ul aria-labelledby="judul-kandidat" className="flex flex-col gap-2">
          {keadaan.kandidat.map((k) => (
            <li key={k.id}>
              <button
                type="button"
                onClick={() => onPilih(k)}
                className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-input bg-white px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-forest-link"
              >
                {k.sampulUrl && (
                  // Pratinjau langsung dari situs sumber; sampul yang dipakai nanti diunduh server.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={k.sampulUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-14 w-10 shrink-0 rounded-md border border-input object-cover"
                    data-testid="sampul-kandidat"
                  />
                )}
                <span className="flex min-w-0 flex-col items-start">
                  <span className="text-sm font-semibold">{k.judul}</span>
                  <span className="text-xs text-ink-muted">
                    {[k.pengarang?.[0], k.penerbit, k.tahun].filter(Boolean).join(" · ") || "Tanpa keterangan lain"}
                  </span>
                  <span className="text-[11px] text-ink-muted">{LABEL_SUMBER[k.sumber]}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {keadaan?.status === "ada" && (
        <button
          type="button"
          onClick={onTutup}
          className="min-h-12 w-full rounded-2xl px-4 py-3 text-left text-sm font-medium text-ink-muted underline focus-visible:ring-2 focus-visible:ring-forest-link"
        >
          Bukan salah satunya
        </button>
      )}
    </section>
  );
}
