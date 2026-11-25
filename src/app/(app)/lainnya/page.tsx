"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { ButuhKoneksi, kartuCls } from "@/components/app/kelola";
import { PageHeader } from "@/components/app/page-header";
import { useLibrary } from "@/components/app/library-provider";
import { KeluarHapusData } from "@/components/app/keluar-hapus";
import { PasangAplikasi } from "@/components/app/pasang-aplikasi";
import { authClient, keluarAkun } from "@/lib/auth-client";

export default function LainnyaPage() {
  const router = useRouter();
  const { daftar, online, jumlahCetak } = useLibrary();
  const { data: sesi } = authClient.useSession();
  const [bekerja, setBekerja] = useState(false);

  async function keluar() {
    setBekerja(true);
    try {
      await keluarAkun();
    } catch {
      // offline: keluar butuh server; tetap di aplikasi, data lokal aman
      setBekerja(false);
      return;
    }
    router.replace("/login");
  }

  return (
    <>
      <PageHeader judul="Lainnya" keterangan={sesi?.user.email} />
      <section className="flex flex-col gap-3 p-5 pb-0">
        <h2 className="font-heading text-xl font-semibold">Pengelolaan</h2>
        {[
          { href: "/lainnya/kategori", label: "Kategori", jumlah: daftar?.kategori.filter((k) => !k.diarsipkan).length },
          { href: "/lainnya/lokasi", label: "Lokasi", jumlah: daftar?.lokasi.length },
          { href: "/lainnya/aturan", label: "Aturan Kategori", jumlah: daftar?.aturanKategori.length },
        ].map(({ href, label, jumlah }) => (
          <Link key={href} href={href} className={`${kartuCls} flex h-14 items-center gap-3 px-4 text-sm font-semibold`}>
            {label}
            {jumlah !== undefined && <span className="font-mono text-[13px] text-ink-muted">{jumlah}</span>}
            {!online && <ButuhKoneksi className="ml-auto" />}
            <ChevronRight className={`size-5 text-ink-muted ${online ? "ml-auto" : ""}`} aria-hidden />
          </Link>
        ))}
      </section>
      <section className="flex flex-col gap-3 p-5 pb-0">
        <h2 className="font-heading text-xl font-semibold">Label</h2>
        <Link href="/cetak" className={`${kartuCls} flex h-14 items-center gap-3 px-4 text-sm font-semibold`}>
          Cetak Label
          {jumlahCetak !== undefined && (
            <span className="font-mono text-[13px] text-ink-muted" data-testid="jumlah-cetak">
              {jumlahCetak.siapDicetak}
            </span>
          )}
          <ChevronRight className="ml-auto size-5 text-ink-muted" aria-hidden />
        </Link>
      </section>
      <section className="flex flex-col gap-3 p-5 pb-0">
        <h2 className="font-heading text-xl font-semibold">Laporan</h2>
        {[
          { href: "/buku-induk", label: "Buku Induk", butuhKoneksi: true },
          { href: "/statistik", label: "Statistik", butuhKoneksi: false },
        ].map(({ href, label, butuhKoneksi }) => (
          <Link key={href} href={href} className={`${kartuCls} flex h-14 items-center gap-3 px-4 text-sm font-semibold`}>
            {label}
            {butuhKoneksi && !online && <ButuhKoneksi className="ml-auto" />}
            <ChevronRight className={`size-5 text-ink-muted ${butuhKoneksi && !online ? "" : "ml-auto"}`} aria-hidden />
          </Link>
        ))}
      </section>
      <PasangAplikasi />
      <section className="flex flex-col gap-3 p-5">
        <button
          type="button"
          disabled={bekerja}
          onClick={() => void keluar()}
          className="h-12 rounded-2xl bg-white text-sm font-semibold shadow-[0_2px_8px_rgba(0,0,0,.08)] disabled:opacity-60"
        >
          Keluar
        </button>
        <KeluarHapusData />
      </section>
    </>
  );
}
