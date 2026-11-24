"use client";

import Link from "next/link";
import { ClockArrowUp } from "lucide-react";
import { useLibrary } from "@/components/app/library-provider";
import { PageHeader } from "@/components/app/page-header";

export default function BerandaPage() {
  const { koleksi, status } = useLibrary();
  const total = koleksi?.length ?? 0;
  const menunggu = status?.menunggu ?? 0;

  return (
    <>
      <div className="bg-forest">
        <PageHeader
          judul="Rak kamu"
          keterangan={koleksi ? `${total} buku` : "Memuat…"}
        />
        {total > 0 && (
          <div className="flex h-[150px] items-end gap-[3px] overflow-hidden px-5" aria-hidden>
            {koleksi!.slice(0, 14).map((k, i) => (
              <div
                key={k.eksemplarId}
                className="relative flex shrink-0 justify-center rounded-t-[3px] py-2 font-heading text-[11px] font-semibold text-white shadow-[inset_-3px_0_0_rgba(0,0,0,.15)]"
                style={{
                  background: k.kategori.warna,
                  width: 24 + ((i * 7) % 15),
                  height: 110 + ((i * 13) % 39),
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                }}
              >
                <span className="line-clamp-1">{k.judul}</span>
                {k.menungguSinkron && (
                  <span className="absolute left-1/2 top-1.5 size-2 -translate-x-1/2 rounded-full bg-[#C9B8F0]" />
                )}
              </div>
            ))}
          </div>
        )}
        <div className="-mx-0 h-3.5 bg-gradient-to-b from-[#8B5E3C] to-[#6E4529] shadow-[0_6px_12px_rgba(0,0,0,.25)]" />
      </div>

      {menunggu > 0 && (
        <div className="flex gap-2 px-5 pb-1 pt-[18px]">
          <Link
            href="/sinkron"
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-[13px] font-medium text-menunggu-fg shadow-[0_1px_3px_rgba(0,0,0,.08)]"
          >
            <ClockArrowUp className="size-4" aria-hidden /> {menunggu} menunggu
          </Link>
        </div>
      )}

      <div className="flex items-baseline justify-between px-5 pb-3 pt-5">
        <h2 className="text-xl font-semibold">Koleksi</h2>
        <Link href="/koleksi" className="text-[13px] font-medium text-forest-link">
          Lihat semua
        </Link>
      </div>

      {koleksi && total === 0 ? (
        <div className="mx-5 rounded-2xl bg-white p-6 text-center shadow-[0_2px_8px_rgba(0,0,0,.08)]">
          <p className="font-heading text-lg font-semibold">Rak masih kosong</p>
          <p className="mt-1 text-sm text-ink-muted">Catat Buku pertamamu, nanti ia muncul di sini.</p>
          <Link
            href="/tambah"
            className="mt-4 inline-flex h-12 items-center rounded-2xl bg-forest px-6 text-sm font-semibold text-paper"
          >
            Tambah buku pertama
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-3.5 px-5">
          {koleksi?.slice(0, 9).map((k) => (
            <li key={k.eksemplarId}>
              <div
                className="relative flex aspect-[2/3] flex-col justify-between rounded-[6px] p-2 text-white shadow-[0_4px_10px_rgba(0,0,0,.18)]"
                style={{ background: k.kategori.warna }}
              >
                <span className="line-clamp-4 font-heading text-xs font-semibold leading-tight">{k.judul}</span>
                <span className="line-clamp-1 text-[9px] opacity-85">{k.pengarang}</span>
                {k.menungguSinkron && (
                  <span
                    className="absolute right-1.5 top-1.5 flex size-3 items-center justify-center rounded-full bg-menunggu"
                    title="Menunggu Sinkron"
                  >
                    <ClockArrowUp className="size-2 text-menunggu-fg" aria-hidden />
                  </span>
                )}
              </div>
              <p className="mt-1.5 line-clamp-1 text-xs font-medium">{k.judul}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
