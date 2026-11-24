"use client";

import { useState } from "react";
import {
  Bidang,
  ButuhKoneksi,
  KembaliKeLainnya,
  inputCls,
  kartuCls,
  tombolKecilCls,
  tombolUtamaCls,
  useAksi,
} from "@/components/app/kelola";
import { useLibrary } from "@/components/app/library-provider";
import { PageHeader } from "@/components/app/page-header";
import type { LokasiRow } from "@/lib/local-library";

type Sunting = { id: string | null; nama: string };

export default function LokasiPage() {
  const { daftar, kelola } = useLibrary();
  const aksi = useAksi();
  const [sunting, setSunting] = useState<Sunting | null>(null);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!kelola || !sunting) return;
    const ok = await aksi.jalankan(() =>
      sunting.id ? kelola.lokasi.ubah(sunting.id, { nama: sunting.nama }) : kelola.lokasi.buat({ nama: sunting.nama }),
    );
    if (ok) setSunting(null);
  }

  function hapus(l: LokasiRow) {
    if (!kelola || !confirm(`Hapus Lokasi ${l.nama}?`)) return;
    void aksi.jalankan(() => kelola.lokasi.hapus(l.id));
  }

  return (
    <>
      <PageHeader judul="Lokasi" keterangan="Tempat fisik menyimpan Eksemplar, misalnya Rak A, susun 2" />
      <KembaliKeLainnya />
      <section className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={tombolUtamaCls}
            disabled={aksi.nonaktif}
            onClick={() => {
              aksi.bersihkanGalat();
              setSunting({ id: null, nama: "" });
            }}
          >
            Tambah Lokasi
          </button>
          {!aksi.online && <ButuhKoneksi />}
        </div>

        {sunting && (
          <form onSubmit={simpan} noValidate className={`${kartuCls} flex flex-col gap-4 p-4`}>
            <Bidang id="nama" label="Nama Lokasi" galat={aksi.galatDi("nama")}>
              <input
                id="nama"
                className={inputCls}
                value={sunting.nama}
                autoComplete="off"
                aria-invalid={!!aksi.galatDi("nama")}
                onChange={(e) => setSunting({ ...sunting, nama: e.target.value })}
              />
            </Bidang>
            {aksi.galatUmum && (
              <p role="alert" className="text-sm text-bahaya">
                {aksi.galatUmum}
              </p>
            )}
            <div className="flex items-center gap-3">
              <button type="submit" className={tombolUtamaCls} disabled={aksi.nonaktif}>
                {aksi.bekerja ? "Menyimpan…" : "Simpan"}
              </button>
              <button type="button" className={tombolKecilCls} onClick={() => setSunting(null)}>
                Batal
              </button>
              {!aksi.online && <ButuhKoneksi />}
            </div>
          </form>
        )}

        {!sunting && aksi.galatUmum && (
          <p role="alert" className="text-sm text-bahaya">
            {aksi.galatUmum}
          </p>
        )}

        {daftar && daftar.lokasi.length === 0 && (
          <p className="text-sm text-ink-muted">Belum ada Lokasi.</p>
        )}
        <ul className="flex flex-col gap-3">
          {daftar?.lokasi.map((l) => (
            <li key={l.id} data-testid="lokasi" className={`${kartuCls} flex flex-col gap-3 p-3.5`}>
              <p className="font-heading text-base font-semibold">{l.nama}</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={tombolKecilCls}
                  disabled={aksi.nonaktif}
                  onClick={() => {
                    aksi.bersihkanGalat();
                    setSunting({ id: l.id, nama: l.nama });
                  }}
                >
                  Ubah
                </button>
                <button
                  type="button"
                  className={`${tombolKecilCls} text-bahaya`}
                  disabled={aksi.nonaktif}
                  onClick={() => hapus(l)}
                >
                  Hapus
                </button>
                {!aksi.online && <ButuhKoneksi />}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
