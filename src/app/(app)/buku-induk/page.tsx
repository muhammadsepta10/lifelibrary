"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { ButuhKoneksi, KembaliKeLainnya, inputCls, tombolKecilCls } from "@/components/app/kelola";
import { useLibrary } from "@/components/app/library-provider";
import { PageHeader } from "@/components/app/page-header";
import { LABEL_ASAL } from "@/lib/buku-fields";
import { NOMOR_INDUK_KOSONG, type BarisBukuInduk } from "@/lib/local-library";
import { LABEL_PENYIANGAN } from "@/lib/penyiangan-protocol";

type Hasil = { baris: BarisBukuInduk[]; tahun: number[] };

const rupiah = (n: number | null) => (n === null ? "—" : `Rp${n.toLocaleString("id-ID")}`);

export default function BukuIndukPage() {
  const { library, online } = useLibrary();
  const [tahun, setTahun] = useState("");
  const [hasil, setHasil] = useState<Hasil>();
  const [mengunduh, setMengunduh] = useState<"csv" | "pdf" | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    if (!library) return;
    return library.pantauBukuInduk({ tahun: tahun ? Number(tahun) : null }, setHasil);
  }, [library, tahun]);

  /** Ekspor dibuat server, jadi hanya online (ADR 0004). */
  async function ekspor(format: "csv" | "pdf") {
    setGalat(null);
    setMengunduh(format);
    try {
      const res = await fetch(`/api/buku-induk/ekspor?format=${format}${tahun ? `&tahun=${tahun}` : ""}`);
      if (res.status === 401) throw new Error("Sesi berakhir. Masuk lagi untuk mengekspor");
      if (!res.ok) throw new Error("Gagal membuat ekspor. Coba lagi");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `buku-induk${tahun ? `-${tahun}` : ""}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setGalat(e instanceof TypeError ? "Butuh koneksi" : e instanceof Error ? e.message : "Gagal mengekspor");
    } finally {
      setMengunduh(null);
    }
  }

  const belumTersinkron = hasil?.baris.filter((b) => b.menungguSinkron).length ?? 0;

  return (
    <>
      <PageHeader
        judul="Buku Induk"
        keterangan={hasil ? `${hasil.baris.length} Eksemplar, termasuk yang sudah keluar` : "Memuat…"}
      />
      <KembaliKeLainnya />
      <section className="flex flex-col gap-3 px-5 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="tahun" className="text-sm font-medium">
            Tahun pencatatan
          </label>
          <select
            id="tahun"
            className={`${inputCls} h-11 w-auto min-w-32 text-sm`}
            value={tahun}
            onChange={(e) => setTahun(e.target.value)}
          >
            <option value="">Semua tahun</option>
            {hasil?.tahun.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["csv", "pdf"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`${tombolKecilCls} inline-flex items-center gap-1.5`}
              disabled={!online || mengunduh !== null}
              onClick={() => void ekspor(f)}
            >
              <Download className="size-4" aria-hidden />
              {mengunduh === f ? "Menyiapkan…" : `Ekspor ${f.toUpperCase()}`}
            </button>
          ))}
          {!online && <ButuhKoneksi />}
        </div>
        {galat && (
          <p role="alert" className="text-sm text-bahaya">
            {galat}
          </p>
        )}
        {belumTersinkron > 0 && (
          <p className="text-[13px] text-ink-muted">
            {belumTersinkron} Eksemplar masih Menunggu Sinkron: tampil di akhir tanpa Nomor Induk, dan belum ikut
            ekspor.
          </p>
        )}
      </section>

      {hasil && hasil.baris.length === 0 && <p className="px-5 pt-6 text-sm text-ink-muted">Belum ada Eksemplar.</p>}
      {hasil && hasil.baris.length > 0 && (
        <div className="mt-4 overflow-x-auto px-5">
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-[13px] text-ink-muted">
                {["Nomor Induk", "Judul", "Tanggal masuk", "Asal", "Harga", "Status"].map((h) => (
                  <th key={h} className="border-b border-input px-2 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((b) => (
                <tr key={b.eksemplarId} data-testid="baris-buku-induk" className={b.status === "keluar" ? "text-ink-muted" : ""}>
                  <td className="border-b border-input px-2 py-2.5 font-mono font-semibold">
                    {b.nomorInduk ?? NOMOR_INDUK_KOSONG}
                  </td>
                  <td className="border-b border-input px-2 py-2.5">
                    <p className="font-medium text-ink">{b.judul}</p>
                    <p className="text-xs">{b.pengarang}</p>
                  </td>
                  <td className="border-b border-input px-2 py-2.5">{b.tanggalMasuk ?? "—"}</td>
                  <td className="border-b border-input px-2 py-2.5">{b.asal ? LABEL_ASAL[b.asal] : "—"}</td>
                  <td className="border-b border-input px-2 py-2.5">{rupiah(b.harga)}</td>
                  <td className="border-b border-input px-2 py-2.5">
                    {b.status === "keluar" && b.penyiangan ? (
                      <>
                        Keluar: {LABEL_PENYIANGAN[b.penyiangan.jenis]}
                        <span className="block text-xs">{b.penyiangan.tanggal}</span>
                      </>
                    ) : b.menungguSinkron ? (
                      "Menunggu Sinkron"
                    ) : (
                      "Aktif"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
