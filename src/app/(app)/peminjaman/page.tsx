"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ScanBarcode } from "lucide-react";
import { AksiPinjaman } from "@/components/app/aksi-pinjaman";
import { LayarPindaiLabel } from "@/components/app/layar-pindai-label";
import { useLibrary } from "@/components/app/library-provider";
import { PageHeader } from "@/components/app/page-header";
import type { ItemPeminjaman } from "@/lib/local-library";
import { tanggalIndonesia } from "@/lib/peminjaman/whatsapp";
import { siapkanBunyi } from "@/lib/umpan-balik-scan";
import { cn } from "@/lib/utils";

type Tab = "aktif" | "terlambat" | "riwayat";
const JUDUL_TAB: Record<Tab, string> = { aktif: "Aktif", terlambat: "Terlambat", riwayat: "Riwayat" };
const KOSONG: Record<Tab, string> = {
  aktif: "Tidak ada buku yang sedang dipinjam.",
  terlambat: "Tidak ada yang terlambat. Semua masih dalam jatuh tempo.",
  riwayat: "Belum ada Peminjaman yang dikembalikan.",
};

function Baris({ p, tab }: { p: ItemPeminjaman; tab: Tab }) {
  return (
    <li
      data-testid="baris-peminjaman"
      className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,.08)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/buku?id=${p.bukuId}`}
            className="block truncate font-heading text-base font-semibold focus-visible:ring-2 focus-visible:ring-forest-link"
          >
            {p.judul}
          </Link>
          <p className="truncate text-sm text-ink-muted">
            {p.peminjam.nama} <span className="font-mono text-xs">· {p.nomorIndukTampil}</span>
          </p>
        </div>
        {p.terlambat && (
          <span className="shrink-0 rounded-full bg-[#F7E1DD] px-2 py-1 text-xs font-semibold text-[#A63D2F]">
            Terlambat {p.hariTerlambat} hari
          </span>
        )}
      </div>
      <p className="text-[13px] text-ink-muted">
        {tab === "riwayat" ? (
          <>
            Dipinjam {tanggalIndonesia(p.tanggalPinjam)} · kembali {tanggalIndonesia(p.tanggalKembali!)}
          </>
        ) : (
          <>
            Dipinjam {tanggalIndonesia(p.tanggalPinjam)} · jatuh tempo{" "}
            <strong className={cn("font-semibold", p.terlambat ? "text-bahaya" : "text-ink")}>
              {tanggalIndonesia(p.jatuhTempo)}
            </strong>
          </>
        )}
      </p>
      {tab !== "riwayat" && (
        <AksiPinjaman peminjamanId={p.id} jatuhTempo={p.jatuhTempo} tautanPengingat={p.tautanPengingat} />
      )}
    </li>
  );
}

function Isi() {
  const router = useRouter();
  const param = useSearchParams().get("tab");
  const tab: Tab = param === "terlambat" || param === "riwayat" ? param : "aktif";
  const { peminjaman } = useLibrary();
  const [pindai, setPindai] = useState(false);

  const daftar = peminjaman?.[tab];
  const jumlah = (t: Tab) => peminjaman?.[t].length ?? 0;

  return (
    <>
      <PageHeader
        judul="Peminjaman"
        keterangan={
          peminjaman
            ? `${jumlah("aktif")} sedang dipinjam${jumlah("terlambat") ? ` · ${jumlah("terlambat")} terlambat` : ""}`
            : "Memuat…"
        }
      />

      <div className="flex flex-col gap-3 px-5 pt-4">
        <button
          type="button"
          onClick={() => {
            siapkanBunyi();
            setPindai(true);
          }}
          className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-forest text-base font-semibold text-paper"
        >
          <ScanBarcode className="size-5" aria-hidden /> Pindai Label Barcode
        </button>
        <p className="text-xs text-ink-muted">
          Pindai Label di buku untuk membukanya, lalu pinjamkan atau kembalikan. Atau buka Eksemplar dari{" "}
          <Link href="/koleksi" className="font-medium text-forest-link underline">
            Koleksi
          </Link>
          .
        </p>
        <div role="tablist" aria-label="Daftar Peminjaman" className="grid grid-cols-3 gap-1 rounded-full bg-white p-1 shadow-[0_1px_3px_rgba(0,0,0,.08)]">
          {(Object.keys(JUDUL_TAB) as Tab[]).map((t) => (
            <Link
              key={t}
              role="tab"
              aria-selected={tab === t}
              href={t === "aktif" ? "/peminjaman" : `/peminjaman?tab=${t}`}
              replace
              className={cn(
                "flex min-h-11 items-center justify-center gap-1.5 rounded-full text-sm font-semibold",
                tab === t ? "bg-forest text-paper" : "text-ink-muted",
              )}
            >
              {JUDUL_TAB[t]}
              <span
                data-testid={`jumlah-${t}`}
                className={cn(
                  "font-mono text-xs",
                  t === "terlambat" && jumlah(t) > 0 && tab !== t && "rounded-full bg-bahaya px-1.5 text-white",
                )}
              >
                {jumlah(t)}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <ul className="flex flex-col gap-3 p-5" aria-label={`Peminjaman ${JUDUL_TAB[tab].toLowerCase()}`}>
        {daftar?.map((p) => <Baris key={p.id} p={p} tab={tab} />)}
        {daftar?.length === 0 && (
          <li className="rounded-2xl bg-white p-6 text-center text-sm text-ink-muted shadow-[0_2px_8px_rgba(0,0,0,.08)]">
            {KOSONG[tab]}
          </li>
        )}
      </ul>

      {pindai && (
        <LayarPindaiLabel
          onTutup={() => setPindai(false)}
          onBukaEksemplar={(bukuId, eksemplarId) => router.push(`/buku/eksemplar?buku=${bukuId}&id=${eksemplarId}`)}
        />
      )}
    </>
  );
}

export default function PeminjamanPage() {
  return (
    <Suspense fallback={<p className="p-5 text-sm text-ink-muted">Memuat…</p>}>
      <Isi />
    </Suspense>
  );
}
