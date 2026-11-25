"use client";

import { useState } from "react";
import { Bidang, ButuhKoneksi, inputCls, tombolKecilCls, useAksi } from "@/components/app/kelola";
import { useLibrary } from "@/components/app/library-provider";
import type { EksemplarDetail } from "@/lib/local-library";
import { JENIS_PENYIANGAN, LABEL_PENYIANGAN, type JenisPenyiangan } from "@/lib/penyiangan-protocol";

/** Tanggal hari ini menurut jam perangkat, `YYYY-MM-DD`. */
function hariIni() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Penyiangan sebuah Eksemplar: mengeluarkannya dari koleksi aktif. Hanya
 * online (ADR 0004): aksinya tetap terlihat dengan keterangan "Butuh koneksi".
 */
export function Penyiangan({ eksemplar }: { eksemplar: EksemplarDetail }) {
  const { penyiangan } = useLibrary();
  const aksi = useAksi();
  const [buka, setBuka] = useState(false);
  const [jenis, setJenis] = useState<JenisPenyiangan | "">("");
  const [tanggal, setTanggal] = useState(hariIni);
  const [alasan, setAlasan] = useState("");

  const kartu = "mx-5 mb-5 rounded-2xl bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,.08)]";

  if (eksemplar.status === "keluar") {
    const p = eksemplar.penyiangan;
    return (
      <section className={kartu} data-testid="penyiangan-catatan">
        <h2 className="font-heading text-lg font-semibold">Sudah keluar dari koleksi</h2>
        {p && (
          <p className="mt-1 text-sm text-ink-muted">
            {LABEL_PENYIANGAN[p.jenis]} pada {p.tanggal}
            {p.alasan && `. ${p.alasan}`}
          </p>
        )}
        <p className="mt-1 text-sm text-ink-muted">
          Tetap tercatat di Buku Induk. Nomor Induk tidak dipakai lagi.
        </p>
      </section>
    );
  }

  async function keluarkan(e: React.FormEvent) {
    e.preventDefault();
    if (!penyiangan) return;
    if (!confirm("Keluarkan Eksemplar ini dari koleksi? Eksemplar tetap tercatat di Buku Induk.")) return;
    const ok = await aksi.jalankan(() =>
      penyiangan.siangi(eksemplar.id, { jenis: (jenis || undefined) as JenisPenyiangan, tanggal, alasan: alasan || null }),
    );
    if (ok) setBuka(false);
  }

  return (
    <section className={kartu}>
      <h2 className="font-heading text-lg font-semibold">Penyiangan</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Keluarkan Eksemplar yang hilang, rusak, dihibahkan, atau dijual. Eksemplar tidak dihapus.
      </p>
      {eksemplar.menungguSinkron ? (
        <p className="mt-3 text-sm text-menunggu-fg">Sinkronkan dulu: Eksemplar ini belum diterima server.</p>
      ) : !buka ? (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            className={`${tombolKecilCls} text-bahaya`}
            disabled={aksi.nonaktif}
            onClick={() => {
              aksi.bersihkanGalat();
              setBuka(true);
            }}
          >
            Keluarkan dari koleksi
          </button>
          {!aksi.online && <ButuhKoneksi />}
        </div>
      ) : (
        <form onSubmit={keluarkan} noValidate className="mt-3 flex flex-col gap-4">
          <Bidang id="jenis" label="Alasan keluar" galat={aksi.galatDi("jenis")}>
            <select
              id="jenis"
              className={inputCls}
              value={jenis}
              aria-invalid={!!aksi.galatDi("jenis")}
              onChange={(e) => setJenis(e.target.value as JenisPenyiangan | "")}
            >
              <option value="">Pilih…</option>
              {JENIS_PENYIANGAN.map((j) => (
                <option key={j} value={j}>
                  {LABEL_PENYIANGAN[j]}
                </option>
              ))}
            </select>
          </Bidang>
          <Bidang id="tanggal" label="Tanggal" galat={aksi.galatDi("tanggal")}>
            <input
              id="tanggal"
              type="date"
              className={inputCls}
              value={tanggal}
              aria-invalid={!!aksi.galatDi("tanggal")}
              onChange={(e) => setTanggal(e.target.value)}
            />
          </Bidang>
          <Bidang id="alasan" label="Keterangan (boleh kosong)" galat={aksi.galatDi("alasan")}>
            <textarea
              id="alasan"
              rows={2}
              className={`${inputCls} h-auto py-3`}
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
            />
          </Bidang>
          {aksi.galatUmum && (
            <p role="alert" className="text-sm text-bahaya">
              {aksi.galatUmum}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={aksi.nonaktif}
              className="h-12 rounded-2xl bg-forest px-5 text-sm font-semibold text-paper disabled:opacity-60"
            >
              {aksi.bekerja ? "Menyimpan…" : "Keluarkan"}
            </button>
            <button type="button" className={tombolKecilCls} onClick={() => setBuka(false)}>
              Batal
            </button>
            {!aksi.online && <ButuhKoneksi />}
          </div>
        </form>
      )}
    </section>
  );
}
