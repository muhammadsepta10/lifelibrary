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
import type { KategoriRow } from "@/lib/local-library";

type Sunting = { id: string | null; kode: string; nama: string; warna: string };
const BARU: Sunting = { id: null, kode: "", nama: "", warna: "#1F3A33" };

export default function KategoriPage() {
  const { daftar, kelola } = useLibrary();
  const aksi = useAksi();
  const [sunting, setSunting] = useState<Sunting | null>(null);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!kelola || !sunting) return;
    const { id, ...isi } = sunting;
    const ok = await aksi.jalankan(() => (id ? kelola.kategori.ubah(id, isi) : kelola.kategori.buat(isi)));
    if (ok) setSunting(null);
  }

  function hapus(k: KategoriRow) {
    if (!kelola || !confirm(`Hapus Kategori ${k.nama}?`)) return;
    void aksi.jalankan(() => kelola.kategori.hapus(k.id));
  }

  return (
    <>
      <PageHeader judul="Kategori" keterangan="Kode dipakai di Nomor Induk dan Nomor Panggil" />
      <KembaliKeLainnya />
      <section className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={tombolUtamaCls}
            disabled={aksi.nonaktif}
            onClick={() => {
              aksi.bersihkanGalat();
              setSunting(BARU);
            }}
          >
            Tambah Kategori
          </button>
          {!aksi.online && <ButuhKoneksi />}
        </div>

        {sunting && (
          <form onSubmit={simpan} noValidate className={`${kartuCls} flex flex-col gap-4 p-4`}>
            <Bidang id="kode" label="Kode" galat={aksi.galatDi("kode")}>
              <input
                id="kode"
                className={`${inputCls} font-mono uppercase`}
                value={sunting.kode}
                maxLength={5}
                autoComplete="off"
                aria-invalid={!!aksi.galatDi("kode")}
                onChange={(e) => setSunting({ ...sunting, kode: e.target.value })}
              />
            </Bidang>
            <Bidang id="nama" label="Nama" galat={aksi.galatDi("nama")}>
              <input
                id="nama"
                className={inputCls}
                value={sunting.nama}
                autoComplete="off"
                aria-invalid={!!aksi.galatDi("nama")}
                onChange={(e) => setSunting({ ...sunting, nama: e.target.value })}
              />
            </Bidang>
            <Bidang id="warna" label="Warna" galat={aksi.galatDi("warna")}>
              <input
                id="warna"
                type="color"
                className="h-12 w-24 rounded-2xl border border-input bg-white p-1"
                value={sunting.warna}
                onChange={(e) => setSunting({ ...sunting, warna: e.target.value })}
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

        <ul className="flex flex-col gap-3">
          {daftar?.kategori.map((k) => (
            <li
              key={k.id}
              data-testid="kategori"
              className={`${kartuCls} flex flex-col gap-3 p-3.5 ${k.diarsipkan ? "opacity-70" : ""}`}
            >
              <div className="flex items-center gap-3">
                <span className="size-8 shrink-0 rounded-full" style={{ background: k.warna }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-heading text-base font-semibold">{k.nama}</p>
                  <p className="font-mono text-[13px] text-ink-muted">{k.kode}</p>
                </div>
                {k.diarsipkan && (
                  <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-ink-muted">
                    Diarsipkan
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={tombolKecilCls}
                  disabled={aksi.nonaktif}
                  onClick={() => {
                    aksi.bersihkanGalat();
                    setSunting({ id: k.id, kode: k.kode, nama: k.nama, warna: k.warna });
                  }}
                >
                  Ubah
                </button>
                <button
                  type="button"
                  className={tombolKecilCls}
                  disabled={aksi.nonaktif}
                  onClick={() =>
                    kelola &&
                    void aksi.jalankan(() => (k.diarsipkan ? kelola.kategori.pulihkan(k.id) : kelola.kategori.arsipkan(k.id)))
                  }
                >
                  {k.diarsipkan ? "Pulihkan" : "Arsipkan"}
                </button>
                <button
                  type="button"
                  className={`${tombolKecilCls} text-bahaya`}
                  disabled={aksi.nonaktif}
                  onClick={() => hapus(k)}
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
