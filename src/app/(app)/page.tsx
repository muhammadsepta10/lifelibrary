"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlarmClock, ClockArrowUp, ScanBarcode, Tag, TriangleAlert, type LucideIcon } from "lucide-react";
import { useLibrary } from "@/components/app/library-provider";
import { PageHeader } from "@/components/app/page-header";
import {
  susunChipBeranda,
  type BukuTerbaru,
  type ChipBeranda,
  type RingkasanBeranda,
} from "@/lib/local-library";
import { cn } from "@/lib/utils";

const SESI = "/tambah/sesi";
const IKON_CHIP: Record<ChipBeranda["kunci"], { Ikon: LucideIcon; warna: string }> = {
  terlambat: { Ikon: AlarmClock, warna: "text-bahaya" },
  label: { Ikon: Tag, warna: "text-ink" },
  menunggu: { Ikon: ClockArrowUp, warna: "text-menunggu-fg" },
  gagal: { Ikon: TriangleAlert, warna: "text-bahaya" },
};

/** Ringkasan dari data lokal (Dexie), jadi Beranda tetap jalan offline. `undefined` selama belum terbaca. */
function useRingkasan() {
  const { library } = useLibrary();
  const [ringkasan, setRingkasan] = useState<RingkasanBeranda>();
  useEffect(() => library?.pantauRingkasanBeranda(setRingkasan), [library]);
  return ringkasan;
}

/** Ukuran punggung bervariasi tetapi tetap sama untuk Buku yang sama. */
function ukuranPunggung(bukuId: string) {
  let h = 0;
  for (const c of bukuId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { width: 24 + (h % 15), height: 110 + ((h >>> 4) % 39) };
}

function Punggung({ buku }: { buku: BukuTerbaru }) {
  return (
    <div
      className="relative flex shrink-0 justify-center rounded-t-[3px] py-2 font-heading text-[11px] font-semibold text-white shadow-[inset_-3px_0_0_rgba(0,0,0,.15)]"
      style={{
        background: buku.warna,
        ...ukuranPunggung(buku.bukuId),
        writingMode: "vertical-rl",
        transform: "rotate(180deg)",
      }}
    >
      <span className="line-clamp-1">{buku.judul}</span>
      {buku.menungguSinkron && (
        <span
          data-testid="penanda-menunggu"
          className="absolute bottom-1.5 left-1/2 size-2 -translate-x-1/2 rounded-full bg-[#C9B8F0]"
        />
      )}
    </div>
  );
}

function Sampul({ buku, className }: { buku: BukuTerbaru; className?: string }) {
  return (
    <li className={className}>
      <Link href={`/buku?id=${buku.bukuId}`} className="block">
        <div
          className="relative flex aspect-[2/3] flex-col justify-between overflow-hidden rounded-[6px] p-2 text-white shadow-[0_4px_10px_rgba(0,0,0,.18)]"
          style={{ background: buku.warna }}
        >
          {buku.sampul ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={buku.sampul} alt={`Sampul ${buku.judul}`} className="absolute inset-0 size-full object-cover" />
          ) : (
            <>
              <span className="line-clamp-4 font-heading text-xs font-semibold leading-tight">{buku.judul}</span>
              <span className="line-clamp-1 text-[9px] opacity-85">{buku.pengarang}</span>
            </>
          )}
          {buku.menungguSinkron && (
            <span
              data-testid="penanda-menunggu"
              title="Menunggu Sinkron"
              className="absolute right-1.5 top-1.5 flex size-3 items-center justify-center rounded-full bg-menunggu"
            >
              <ClockArrowUp className="size-2 text-menunggu-fg" aria-hidden />
            </span>
          )}
        </div>
        <p className="mt-1.5 line-clamp-1 text-xs font-medium">{buku.judul}</p>
      </Link>
    </li>
  );
}

export default function BerandaPage() {
  const { status, jumlahCetak, jumlahTerlambat } = useLibrary();
  const ringkasan = useRingkasan();

  const chip = useMemo(
    () =>
      susunChipBeranda({
        terlambat: jumlahTerlambat,
        labelSiapDicetak: jumlahCetak?.siapDicetak,
        menungguSinkron: status?.menunggu,
        gagalTerkirim: status?.ditolak,
      }),
    [jumlahTerlambat, jumlahCetak, status],
  );
  const kosong = ringkasan?.jumlahEksemplar === 0;

  return (
    <>
      <div className="bg-forest">
        <PageHeader
          judul="Rak kamu"
          keterangan={
            ringkasan
              ? `${ringkasan.jumlahBuku} buku · ${ringkasan.jumlahEksemplar} eksemplar · ${ringkasan.jumlahDipinjam} dipinjam`
              : "Memuat…"
          }
        />
        {ringkasan && !kosong && (
          <div data-testid="rak-punggung" className="flex h-[150px] items-end gap-[3px] overflow-hidden px-5" aria-hidden>
            {ringkasan.terbaru.slice(0, 30).map((b) => (
              <Punggung key={b.bukuId} buku={b} />
            ))}
          </div>
        )}
        <div className="h-3.5 bg-gradient-to-b from-[#8B5E3C] to-[#6E4529] shadow-[0_6px_12px_rgba(0,0,0,.25)]" />
      </div>

      {chip.length > 0 && (
        <ul aria-label="Perlu perhatian" className="flex flex-wrap gap-2 px-5 pb-1 pt-[18px]">
          {chip.map((c) => {
            const { Ikon, warna } = IKON_CHIP[c.kunci];
            return (
              <li key={c.kunci}>
                <Link
                  href={c.href}
                  data-testid={`chip-${c.kunci}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-[13px] font-medium shadow-[0_1px_3px_rgba(0,0,0,.08)]",
                    warna,
                  )}
                >
                  <Ikon className="size-4" aria-hidden /> {c.teks}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {ringkasan && !kosong && (
        <div className="px-5 pt-[18px]">
          <Link
            href={SESI}
            className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-forest text-sm font-semibold text-paper lg:inline-flex lg:px-8"
          >
            <ScanBarcode className="size-5" strokeWidth={1.9} aria-hidden /> Mulai Sesi Penerimaan
          </Link>
        </div>
      )}

      <div className="flex items-baseline justify-between px-5 pb-3 pt-5">
        <h2 className="text-xl font-semibold">Baru ditambahkan</h2>
        <Link href="/koleksi" className="text-[13px] font-medium text-forest-link">
          Lihat semua
        </Link>
      </div>

      {kosong ? (
        <div data-testid="beranda-kosong" className="mx-5 rounded-2xl bg-white p-6 text-center shadow-[0_2px_8px_rgba(0,0,0,.08)]">
          <p className="font-heading text-lg font-semibold">Rak masih kosong…</p>
          <p className="mt-1 text-sm text-ink-muted">Scan Buku pertamamu, nanti ia muncul di sini.</p>
          <Link
            href={SESI}
            className="mt-4 inline-flex h-12 items-center gap-2 rounded-2xl bg-forest px-6 text-sm font-semibold text-paper"
          >
            <ScanBarcode className="size-5" strokeWidth={1.9} aria-hidden /> Scan buku pertama
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-3.5 px-5 lg:grid-cols-6">
          {ringkasan?.terbaru.slice(0, 12).map((b, i) => (
            <Sampul key={b.bukuId} buku={b} className={cn(i >= 9 && "hidden lg:block")} />
          ))}
        </ul>
      )}
    </>
  );
}
