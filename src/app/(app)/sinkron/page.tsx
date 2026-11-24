"use client";

import Link from "next/link";
import { useLibrary } from "@/components/app/library-provider";
import { PageHeader } from "@/components/app/page-header";

export default function SinkronPage() {
  const { status, keadaan, sinkronkan, online } = useLibrary();

  const pesan = (() => {
    switch (keadaan.jenis) {
      case "berjalan":
        return "Menyinkronkan…";
      case "selesai":
        return `Terakhir tersinkron ${new Date(keadaan.pada).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
      case "perlu-login":
        return "Sesi berakhir. Data di perangkat aman; masuk lagi untuk melanjutkan Sinkronisasi.";
      case "gagal":
        return `Gagal: ${keadaan.pesan}. Dicoba lagi otomatis.`;
      default:
        return online ? "Belum disinkronkan di sesi ini" : "Offline — Sinkronisasi menunggu koneksi";
    }
  })();

  return (
    <>
      <PageHeader judul="Sinkronisasi" keterangan="Kirim perubahan dan ambil dari perangkat lain" />
      <section className="m-5 rounded-2xl bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,.08)]">
        <p className="text-sm text-ink-muted">Perubahan menunggu dikirim</p>
        <p className="font-mono text-3xl font-semibold" data-testid="jumlah-menunggu">
          {status?.menunggu ?? 0}
        </p>
        {!!status?.ditolak && (
          <p className="mt-2 text-sm text-bahaya">{status.ditolak} perubahan ditolak server.</p>
        )}
        <p role="status" className="mt-3 text-sm">
          {pesan}
        </p>
        {keadaan.jenis === "perlu-login" && (
          <Link href="/login" className="mt-3 inline-block text-sm font-semibold text-forest-link underline">
            Masuk lagi
          </Link>
        )}
        <button
          type="button"
          onClick={sinkronkan}
          disabled={keadaan.jenis === "berjalan"}
          className="mt-4 h-12 w-full rounded-2xl bg-forest text-sm font-semibold text-paper disabled:opacity-60"
        >
          Sinkronkan sekarang
        </button>
      </section>
    </>
  );
}
