"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleAlert, ClockArrowUp, GitMerge } from "lucide-react";
import { useLibrary } from "@/components/app/library-provider";
import { PageHeader } from "@/components/app/page-header";
import { PesanDitimpa } from "@/components/app/pesan-ditimpa";

const kartu = "mx-5 mt-5 rounded-2xl bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,.08)]";

const waktuLog = (pada: number) =>
  new Date(pada).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function SinkronPage() {
  const { library, status, keadaan, sinkronkan, cobaLagi, antrean, log, online } = useLibrary();
  /** Perubahan yang sedang dikonfirmasi untuk dibuang, beserta yang ikut hilang. */
  const [konfirmasi, setKonfirmasi] = useState<{ id: string; hilang: string[] } | null>(null);
  const [galatBuang, setGalatBuang] = useState<string | null>(null);

  async function mintaBuang(id: string) {
    if (!library) return;
    setGalatBuang(null);
    try {
      setKonfirmasi({ id, hilang: await library.pratinjauBuang(id) });
    } catch (e) {
      setGalatBuang(e instanceof Error ? e.message : "Tidak bisa membuang perubahan ini");
    }
  }

  async function buang(id: string) {
    if (!library) return;
    try {
      await library.buang(id);
      setKonfirmasi(null);
      // Ambil ulang data server supaya salinan di perangkat kembali sama dengan server.
      sinkronkan();
    } catch (e) {
      setGalatBuang(e instanceof Error ? e.message : "Tidak bisa membuang perubahan ini");
    }
  }

  const pesan = (() => {
    switch (keadaan.jenis) {
      case "berjalan":
        return "Menyinkronkan…";
      case "selesai":
        return `Terakhir tersinkron ${new Date(keadaan.pada).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
      case "perlu-login":
        return "Sesi berakhir. Data di perangkat aman; masuk lagi untuk melanjutkan Sinkronisasi.";
      case "gagal":
        return `Gagal: ${keadaan.pesan}. Dicoba lagi otomatis dalam ${Math.ceil(keadaan.cobaLagiDalamMs / 1000)} detik.`;
      default:
        return online ? "Belum disinkronkan di sesi ini" : "Offline — Sinkronisasi menunggu koneksi";
    }
  })();

  const tertunda = antrean?.tertunda ?? [];
  const gagal = antrean?.gagal ?? [];

  return (
    <>
      <PageHeader judul="Sinkronisasi" keterangan="Kirim perubahan dan ambil dari perangkat lain" />
      <section className={kartu}>
        <p className="text-sm text-ink-muted">Perubahan menunggu dikirim</p>
        <p className="font-mono text-3xl font-semibold" data-testid="jumlah-menunggu">
          {status?.menunggu ?? 0}
        </p>
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

      {gagal.length > 0 && (
        <section className={kartu} aria-labelledby="judul-gagal">
          <div className="flex items-center justify-between gap-3">
            <h2 id="judul-gagal" className="flex items-center gap-2 text-base font-semibold text-bahaya">
              <CircleAlert className="size-5" aria-hidden /> Gagal terkirim
            </h2>
            {gagal.length > 1 && (
              <button type="button" onClick={() => cobaLagi()} className="text-sm font-semibold text-forest-link underline">
                Coba lagi semua
              </button>
            )}
          </div>
          <ul className="mt-3 divide-y divide-black/10" data-testid="daftar-gagal">
            {gagal.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{item.ringkasan}</p>
                  <p className="mt-0.5 text-sm text-bahaya">{item.alasan}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => cobaLagi(item.id)}
                    aria-label={`Coba lagi: ${item.ringkasan}`}
                    className="h-10 rounded-xl border border-forest px-3 text-sm font-semibold text-forest-link"
                  >
                    Coba lagi
                  </button>
                  <button
                    type="button"
                    onClick={() => void mintaBuang(item.id)}
                    aria-label={`Buang: ${item.ringkasan}`}
                    className="h-10 rounded-xl border border-bahaya px-3 text-sm font-semibold text-bahaya"
                  >
                    Buang
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {galatBuang && (
            <p role="alert" className="mt-3 text-sm text-bahaya">
              {galatBuang}
            </p>
          )}
          {konfirmasi && (
            <div role="alertdialog" aria-labelledby="judul-buang" className="mt-4 rounded-2xl border border-bahaya p-4" data-testid="konfirmasi-buang">
              <h3 id="judul-buang" className="text-sm font-semibold text-bahaya">
                Buang perubahan ini?
              </h3>
              <p className="mt-1 text-sm">
                Perubahan di bawah ini dibuang dari perangkat dan tidak akan dikirim ke server. Data di perangkat dikembalikan
                sama dengan server. Tindakan ini tidak bisa dibatalkan.
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm" data-testid="daftar-hilang">
                {konfirmasi.hilang.map((teks, i) => (
                  <li key={i}>{teks}</li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void buang(konfirmasi.id)}
                  className="h-10 rounded-xl bg-bahaya px-4 text-sm font-semibold text-paper"
                >
                  Ya, buang
                </button>
                <button
                  type="button"
                  onClick={() => setKonfirmasi(null)}
                  className="h-10 rounded-xl border border-input px-4 text-sm font-semibold"
                >
                  Batal
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className={kartu} aria-labelledby="judul-tertunda">
        <h2 id="judul-tertunda" className="flex items-center gap-2 text-base font-semibold">
          <ClockArrowUp className="size-5" aria-hidden /> Menunggu Sinkron
        </h2>
        {tertunda.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Tidak ada perubahan yang menunggu.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/10" data-testid="daftar-tertunda">
            {tertunda.map((item) => (
              <li key={item.id} className="py-3 text-sm">
                {item.ringkasan}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${kartu} mb-5`} aria-labelledby="judul-log">
        <h2 id="judul-log" className="flex items-center gap-2 text-base font-semibold">
          <GitMerge className="size-5" aria-hidden /> Perubahan dari perangkat lain
        </h2>
        {!log || log.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            Belum ada. Bila field yang sama diubah di dua perangkat, perubahan terakhir yang menang dan dicatat di sini.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-black/10" data-testid="log-perubahan">
            {log.map((item) => (
              <li key={item.id} className="py-3 text-sm">
                <PesanDitimpa item={item} />
                <span className="mt-0.5 block text-xs text-ink-muted">{waktuLog(item.pada)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
