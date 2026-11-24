"use client";

import Link from "next/link";
import { useLibrary } from "@/components/app/library-provider";
import { PageHeader } from "@/components/app/page-header";
import { StatusChip } from "@/components/app/status-chip";

export default function KoleksiPage() {
  const { koleksi } = useLibrary();

  return (
    <>
      <PageHeader judul="Koleksi" keterangan={koleksi ? `${koleksi.length} Eksemplar` : "Memuat…"} />
      {koleksi && koleksi.length === 0 && (
        <p className="px-5 pt-6 text-sm text-ink-muted">
          Belum ada Eksemplar.{" "}
          <Link href="/tambah" className="font-semibold text-forest-link underline">
            Tambah Buku
          </Link>
        </p>
      )}
      <ul className="flex flex-col gap-3 p-5">
        {koleksi?.map((k) => (
          <li
            key={k.eksemplarId}
            data-testid="eksemplar"
            className="flex gap-3 rounded-2xl bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,.08)]"
          >
            <div
              className="h-[72px] w-12 shrink-0 rounded"
              style={{ background: k.kategori.warna }}
              aria-hidden
            />
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
                <StatusChip menungguSinkron={k.menungguSinkron} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
