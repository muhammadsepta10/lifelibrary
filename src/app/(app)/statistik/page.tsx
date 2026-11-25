"use client";

import { useEffect, useState } from "react";
import { KembaliKeLainnya, kartuCls } from "@/components/app/kelola";
import { useLibrary } from "@/components/app/library-provider";
import { PageHeader } from "@/components/app/page-header";
import type { Statistik } from "@/lib/local-library";

const rupiah = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const namaBulan = (b: string) => `${NAMA_BULAN[Number(b.slice(5, 7)) - 1]} ${b.slice(0, 4)}`;

export default function StatistikPage() {
  const { library } = useLibrary();
  const [s, setS] = useState<Statistik>();

  useEffect(() => {
    if (!library) return;
    return library.pantauStatistik(setS);
  }, [library]);

  const maksKategori = Math.max(1, ...(s?.perKategori.map((k) => k.jumlah) ?? []));
  const maksBulan = Math.max(1, ...(s?.perBulan.map((b) => b.jumlah) ?? []));

  return (
    <>
      <PageHeader judul="Statistik" keterangan={s ? `${s.totalEksemplar} Eksemplar aktif` : "Memuat…"} />
      <KembaliKeLainnya />
      {s && (
        <div className="flex flex-col gap-4 p-5">
          <section className={`${kartuCls} p-4`}>
            <h2 className="text-[13px] font-medium text-ink-muted">Total nilai koleksi</h2>
            <p className="mt-1 font-heading text-[28px] font-bold" data-testid="total-nilai">
              {rupiah(s.totalNilai)}
            </p>
            {s.tanpaHarga > 0 && (
              <p className="mt-1 text-xs text-ink-muted">{s.tanpaHarga} Eksemplar belum berharga, tidak ikut dihitung.</p>
            )}
          </section>

          <section className={`${kartuCls} p-4`}>
            <h2 className="font-heading text-lg font-semibold">Per Kategori</h2>
            {s.perKategori.length === 0 && <p className="mt-2 text-sm text-ink-muted">Belum ada Eksemplar.</p>}
            <ul className="mt-3 flex flex-col gap-2.5">
              {s.perKategori.map((k) => (
                <li key={k.kategoriId} data-testid="statistik-kategori" className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 truncate">{k.nama}</span>
                  <span className="h-3 rounded-full" style={{ background: k.warna, width: `${(k.jumlah / maksKategori) * 100}%` }} aria-hidden />
                  <span className="font-mono font-semibold">{k.jumlah}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={`${kartuCls} p-4`}>
            <h2 className="font-heading text-lg font-semibold">Buku masuk per bulan</h2>
            {s.perBulan.length === 0 && <p className="mt-2 text-sm text-ink-muted">Belum ada tanggal masuk yang tercatat.</p>}
            <ul className="mt-3 flex flex-col gap-2.5">
              {s.perBulan.map((b) => (
                <li key={b.bulan} data-testid="statistik-bulan" className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0">{namaBulan(b.bulan)}</span>
                  <span className="h-3 rounded-full bg-forest" style={{ width: `${(b.jumlah / maksBulan) * 100}%` }} aria-hidden />
                  <span className="font-mono font-semibold">{b.jumlah}</span>
                </li>
              ))}
            </ul>
            {s.tanpaTanggalMasuk > 0 && (
              <p className="mt-3 text-xs text-ink-muted">
                {s.tanpaTanggalMasuk} Eksemplar tanpa tanggal masuk tidak ikut dihitung.
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
