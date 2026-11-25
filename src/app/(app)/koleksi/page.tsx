"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClockArrowUp, LayoutGrid, List, Search } from "lucide-react";
import { inputCls } from "@/components/app/kelola";
import { useLibrary } from "@/components/app/library-provider";
import { PageHeader } from "@/components/app/page-header";
import { StatusChip } from "@/components/app/status-chip";
import {
  LABEL_STATUS_KOLEKSI,
  saringKoleksi,
  STATUS_KOLEKSI,
  type ItemKoleksi,
  type StatusKoleksi,
} from "@/lib/local-library";
import { cn } from "@/lib/utils";

const selectCls = `${inputCls} h-11 text-sm`;

function Sampul({ k }: { k: ItemKoleksi }) {
  return (
    <div
      className={cn(
        "relative flex aspect-[2/3] flex-col justify-between overflow-hidden rounded-[6px] p-2 text-white shadow-[0_4px_10px_rgba(0,0,0,.18)]",
        k.status === "keluar" && "opacity-60 saturate-50",
      )}
      style={{ background: k.kategori.warna }}
    >
      {k.sampul ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={k.sampul} alt={`Sampul ${k.judul}`} className="absolute inset-0 size-full object-cover" />
      ) : (
        <>
          <span className="line-clamp-4 font-heading text-xs font-semibold leading-tight">{k.judul}</span>
          <span className="line-clamp-1 text-[9px] opacity-85">{k.pengarang}</span>
        </>
      )}
      {k.menungguSinkron && (
        <span
          className="absolute right-1.5 top-1.5 flex size-3 items-center justify-center rounded-full bg-menunggu"
          title="Menunggu Sinkron"
        >
          <ClockArrowUp className="size-2 text-menunggu-fg" aria-hidden />
        </span>
      )}
      {k.status === "keluar" && (
        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-ink">
          Keluar
        </span>
      )}
      {k.dipinjam && (
        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-ink">
          Dipinjam
        </span>
      )}
    </div>
  );
}

export default function KoleksiPage() {
  const { koleksiSemua, daftar } = useLibrary();
  const [q, setQ] = useState("");
  const [kategoriId, setKategoriId] = useState("");
  const [lokasiId, setLokasiId] = useState("");
  const [status, setStatus] = useState<StatusKoleksi | "">("");
  const [tampilan, setTampilan] = useState<"grid" | "daftar">("grid");

  const hasil = useMemo(
    () => (koleksiSemua ? saringKoleksi(koleksiSemua, { q, kategoriId, lokasiId, status: status || null }) : undefined),
    [koleksiSemua, q, kategoriId, lokasiId, status],
  );
  const aktifSemua = koleksiSemua?.filter((k) => k.status === "aktif").length ?? 0;
  const disaring = q.trim() !== "" || kategoriId !== "" || lokasiId !== "" || status !== "";

  return (
    <>
      <PageHeader
        judul="Koleksi"
        keterangan={
          hasil ? (disaring ? `${hasil.length} Eksemplar cocok` : `${aktifSemua} Eksemplar`) : "Memuat…"
        }
      >
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari judul, pengarang, ISBN, atau nomor"
            aria-label="Cari Koleksi"
            className={`${inputCls} pl-12 text-ink`}
          />
        </div>
      </PageHeader>

      <div className="flex flex-col gap-2.5 px-5 pt-4">
        <div className="grid grid-cols-3 gap-2">
          <select aria-label="Kategori" className={selectCls} value={kategoriId} onChange={(e) => setKategoriId(e.target.value)}>
            <option value="">Semua Kategori</option>
            {daftar?.kategori.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}
              </option>
            ))}
          </select>
          <select aria-label="Lokasi" className={selectCls} value={lokasiId} onChange={(e) => setLokasiId(e.target.value)}>
            <option value="">Semua Lokasi</option>
            {daftar?.lokasi.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nama}
              </option>
            ))}
          </select>
          <select
            aria-label="Status"
            className={selectCls}
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusKoleksi | "")}
          >
            <option value="">Semua aktif</option>
            {STATUS_KOLEKSI.map((s) => (
              <option key={s} value={s}>
                {LABEL_STATUS_KOLEKSI[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between">
          {disaring ? (
            <button
              type="button"
              className="text-[13px] font-medium text-forest-link underline"
              onClick={() => {
                setQ("");
                setKategoriId("");
                setLokasiId("");
                setStatus("");
              }}
            >
              Hapus pencarian dan filter
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-1" role="group" aria-label="Tampilan">
            {(
              [
                ["grid", LayoutGrid, "Tampilan grid sampul"],
                ["daftar", List, "Tampilan daftar"],
              ] as const
            ).map(([nilai, Ikon, label]) => (
              <button
                key={nilai}
                type="button"
                aria-label={label}
                aria-pressed={tampilan === nilai}
                onClick={() => setTampilan(nilai)}
                className={cn(
                  "flex size-10 items-center justify-center rounded-full",
                  tampilan === nilai ? "bg-forest text-paper" : "bg-white text-ink-muted",
                )}
              >
                <Ikon className="size-5" aria-hidden />
              </button>
            ))}
          </div>
        </div>
      </div>

      {koleksiSemua && aktifSemua === 0 && !disaring && (
        <p className="px-5 pt-6 text-sm text-ink-muted">
          Belum ada Eksemplar.{" "}
          <Link href="/tambah" className="font-semibold text-forest-link underline">
            Tambah Buku
          </Link>
        </p>
      )}
      {hasil && hasil.length === 0 && disaring && (
        <p className="px-5 pt-6 text-sm text-ink-muted" role="status">
          Tidak ada Eksemplar yang cocok.
        </p>
      )}

      {tampilan === "grid" ? (
        <ul className="grid grid-cols-3 gap-3.5 p-5 md:grid-cols-5 lg:grid-cols-6">
          {hasil?.map((k) => (
            <li key={k.eksemplarId} data-testid="eksemplar">
              <Link
                href={`/buku?id=${k.bukuId}`}
                aria-label={`${k.judul}, ${k.pengarang}`}
                className="block focus-visible:ring-2 focus-visible:ring-forest-link"
              >
                <Sampul k={k} />
                <p className="mt-1.5 line-clamp-1 text-xs font-medium">{k.judul}</p>
                <p className="font-mono text-[10px] text-ink-muted" data-testid="nomor-induk">
                  {k.nomorIndukTampil}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-3 p-5">
          {hasil?.map((k) => (
            <li key={k.eksemplarId} data-testid="eksemplar">
              <Link
                href={`/buku?id=${k.bukuId}`}
                className="flex gap-3 rounded-2xl bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,.08)] focus-visible:ring-2 focus-visible:ring-forest-link"
              >
                <div className="h-[72px] w-12 shrink-0 rounded" style={{ background: k.kategori.warna }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-heading text-base font-semibold leading-snug">{k.judul}</p>
                  <p className="text-[13px] text-ink-muted">{k.pengarang}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-paper px-2 py-0.5 text-[13px] font-medium text-kategori-fg">
                      {k.kategori.nama}
                    </span>
                    <span className="font-mono text-[15px] font-semibold" data-testid="nomor-induk">
                      {k.nomorIndukTampil}
                    </span>
                    {k.status === "keluar" ? (
                      <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-semibold">Keluar</span>
                    ) : (
                      <StatusChip menungguSinkron={k.menungguSinkron} />
                    )}
                  </div>
                  <p className="mt-1.5 font-mono text-xs text-ink-muted" data-testid="nomor-panggil">
                    {k.nomorPanggil.teks}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
