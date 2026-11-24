"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, PencilLine, Plus } from "lucide-react";
import { useDetailBuku } from "@/components/app/form";
import { StatusChip } from "@/components/app/status-chip";
import { LABEL_ASAL, LABEL_KONDISI, LABEL_PERAN } from "@/lib/buku-fields";
import type { EksemplarDetail } from "@/lib/local-library";

function Tiket({ bukuId, e }: { bukuId: string; e: EksemplarDetail }) {
  return (
    <li className="min-w-[210px] snap-start">
      <Link
        href={`/buku/eksemplar?buku=${bukuId}&id=${e.id}`}
        data-testid="eksemplar-tiket"
        className="block h-full rounded-2xl bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,.08)] focus-visible:ring-2 focus-visible:ring-forest-link"
      >
        <p className="font-mono text-[15px] font-semibold" data-testid="nomor-induk">
          {e.nomorIndukTampil}
        </p>
        <p className="mt-1.5 text-[13px] text-ink-muted">{e.lokasi?.nama ?? "Lokasi belum diisi"}</p>
        <p className="mt-1 font-mono text-xs text-ink-muted" data-testid="nomor-panggil">
          {e.nomorPanggil.teks}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {e.status === "keluar" ? (
            <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-semibold">Keluar</span>
          ) : (
            <StatusChip menungguSinkron={e.menungguSinkron} />
          )}
          {e.kondisi && (
            <span className="rounded-full bg-paper px-2 py-1 text-xs font-medium">{LABEL_KONDISI[e.kondisi]}</span>
          )}
        </div>
        {e.perluCetak && <p className="mt-2 text-xs font-medium text-kategori-fg">Label perlu dicetak ulang</p>}
      </Link>
    </li>
  );
}

function DetailBukuIsi() {
  const id = useSearchParams().get("id");
  const detail = useDetailBuku(id);

  if (detail === undefined) return <p className="p-5 text-sm text-ink-muted">Memuat…</p>;
  if (detail === null) {
    return (
      <div className="p-5">
        <p className="text-sm">Buku tidak ditemukan di perangkat ini.</p>
        <Link href="/koleksi" className="mt-2 inline-block text-sm font-semibold text-forest-link underline">
          Kembali ke Koleksi
        </Link>
      </div>
    );
  }

  const pertama = detail.eksemplar[0];
  const warna = pertama?.kategori.warna ?? "#5C625E";
  const subjudul = [detail.pengarangUtama?.nama, detail.penerbit, detail.tahun].filter(Boolean).join(" · ");
  const tentang = [
    detail.isbn13 && `ISBN ${detail.isbn13}`,
    detail.kelasDdc && `DDC ${detail.kelasDdc}`,
    detail.halaman && `${detail.halaman} halaman`,
    detail.bahasa,
  ].filter(Boolean);
  const lainnya = [
    ["Kota terbit", detail.kota],
    ["Edisi", detail.edisi],
    ["Seri", detail.seri],
    ["Jilid", detail.jilid],
    ["Subjek", detail.subjek.join(", ")],
  ].filter(([, v]) => v);

  return (
    <>
      <section className="relative flex h-[330px] flex-col items-center px-5 pt-4" style={{ background: warna }}>
        <div
          className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.45))]"
          aria-hidden
        />
        <div className="relative flex w-full items-center justify-between text-white">
          <Link
            href="/koleksi"
            aria-label="Kembali ke Koleksi"
            className="flex size-10 items-center justify-center rounded-full bg-black/25"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <Link
            href={`/buku/ubah?id=${detail.id}`}
            aria-label="Ubah Buku"
            className="flex size-10 items-center justify-center rounded-full bg-black/25"
          >
            <PencilLine className="size-5" aria-hidden />
          </Link>
        </div>
        <div
          className="relative mt-4 flex h-[195px] w-[130px] flex-col justify-between overflow-hidden rounded-md border border-white/25 p-2.5 text-white shadow-[0_14px_30px_rgba(0,0,0,.45)]"
          style={{ background: warna, filter: "saturate(.9)" }}
        >
          {detail.sampul ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={detail.sampul} alt={`Sampul ${detail.judul}`} className="absolute inset-0 size-full object-cover" />
          ) : (
            <>
              <span className="font-heading text-sm font-semibold leading-tight">{detail.judul}</span>
              <span className="text-[10px] opacity-85">{detail.pengarangUtama?.nama}</span>
            </>
          )}
        </div>
      </section>

      <div className="px-5 pb-2 pt-4 text-center">
        <h1 className="font-heading text-[26px] font-bold leading-tight" data-testid="judul-buku">
          {detail.judul}
        </h1>
        {subjudul && <p className="mt-1 text-sm text-ink-muted">{subjudul}</p>}
        {pertama && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-[13px] font-medium text-kategori-fg shadow-[0_1px_3px_rgba(0,0,0,.08)]">
              {pertama.kategori.nama}
            </span>
            <span className="rounded-full bg-white px-3 py-1 font-mono text-xs shadow-[0_1px_3px_rgba(0,0,0,.08)]">
              {pertama.nomorPanggil.teks}
            </span>
          </div>
        )}
      </div>

      <h2 className="px-5 pb-3 pt-5 font-heading text-xl font-semibold">Eksemplar {detail.eksemplar.length}</h2>
      <ul className="flex snap-x gap-3 overflow-x-auto px-5 pb-5 pt-1" aria-label="Eksemplar">
        {detail.eksemplar.map((e) => (
          <Tiket key={e.id} bukuId={detail.id} e={e} />
        ))}
      </ul>

      <Link
        href={`/buku/eksemplar?buku=${detail.id}`}
        className="mx-5 flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-forest font-semibold text-paper"
      >
        <Plus className="size-5" aria-hidden /> Tambah eksemplar
      </Link>

      <h2 className="px-5 pb-2 pt-6 font-heading text-xl font-semibold">Tentang buku</h2>
      <div className="flex flex-col gap-3 px-5 text-sm text-ink-muted">
        {tentang.length > 0 && <p>{tentang.join(" · ")}</p>}
        {detail.sinopsis && <p className="whitespace-pre-line text-ink">{detail.sinopsis}</p>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {detail.kontributor.map((k) => (
            <div key={`${k.id}-${k.peran}`} className="contents">
              <dt>{LABEL_PERAN[k.peran]}</dt>
              <dd className="text-ink">
                {k.nama}
                {k.utama && " (Pengarang Utama)"}
              </dd>
            </div>
          ))}
          {lainnya.map(([label, nilai]) => (
            <div key={label} className="contents">
              <dt>{label}</dt>
              <dd className="text-ink">{nilai}</dd>
            </div>
          ))}
        </dl>
        {pertama?.asal && (
          <p>
            Eksemplar pertama: {LABEL_ASAL[pertama.asal]}
            {pertama.harga != null && ` · Rp${pertama.harga.toLocaleString("id-ID")}`}
            {pertama.tanggalMasuk && ` · masuk ${pertama.tanggalMasuk}`}
          </p>
        )}
      </div>
    </>
  );
}

export default function DetailBukuPage() {
  return (
    <Suspense fallback={<p className="p-5 text-sm text-ink-muted">Memuat…</p>}>
      <DetailBukuIsi />
    </Suspense>
  );
}
