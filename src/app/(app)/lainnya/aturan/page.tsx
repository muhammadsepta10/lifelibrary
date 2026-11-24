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
import type { JenisAturan } from "@/lib/kelola-protocol";
import type { AturanKategoriRow } from "@/lib/local-library";

type Sunting = {
  id: string | null;
  jenis: JenisAturan;
  pola: string;
  kategoriId: string;
  prioritas: string;
};

const JENIS: Record<JenisAturan, { label: string; contoh: string }> = {
  ddc: { label: "Kelas DDC", contoh: "2xx atau 155" },
  subjek: { label: "Kata kunci subjek", contoh: "novel" },
};

export default function AturanKategoriPage() {
  const { daftar, kategori, kelola } = useLibrary();
  const aksi = useAksi();
  const [sunting, setSunting] = useState<Sunting | null>(null);

  const kategoriById = new Map(daftar?.kategori.map((k) => [k.id, k]));

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!kelola || !sunting) return;
    const prioritas = sunting.prioritas.trim() === "" ? Number.NaN : Number(sunting.prioritas);
    const { id, jenis, pola, kategoriId } = sunting;
    const ok = await aksi.jalankan(() =>
      id
        ? kelola.aturanKategori.ubah(id, { pola, kategoriId, prioritas })
        : kelola.aturanKategori.buat({ jenis, pola, kategoriId, prioritas }),
    );
    if (ok) setSunting(null);
  }

  function hapus(a: AturanKategoriRow) {
    if (!kelola || !confirm(`Hapus aturan ${a.pola}?`)) return;
    void aksi.jalankan(() => kelola.aturanKategori.hapus(a.id));
  }

  return (
    <>
      <PageHeader judul="Aturan Kategori" keterangan="Menyarankan Kategori dari Kelas DDC atau subjek" />
      <KembaliKeLainnya />
      <section className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={tombolUtamaCls}
            disabled={aksi.nonaktif}
            onClick={() => {
              aksi.bersihkanGalat();
              setSunting({
                id: null,
                jenis: "ddc",
                pola: "",
                kategoriId: "",
                prioritas: String((daftar?.aturanKategori.at(-1)?.prioritas ?? 0) + 1),
              });
            }}
          >
            Tambah aturan
          </button>
          {!aksi.online && <ButuhKoneksi />}
        </div>

        {sunting && (
          <form onSubmit={simpan} noValidate className={`${kartuCls} flex flex-col gap-4 p-4`}>
            {sunting.id === null ? (
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">Jenis aturan</legend>
                <div className="flex gap-2">
                  {(Object.keys(JENIS) as JenisAturan[]).map((j) => (
                    <label
                      key={j}
                      className="inline-flex cursor-pointer items-center rounded-full border border-input bg-white px-3 py-2 text-[13px] font-medium has-[:checked]:border-forest has-[:checked]:bg-forest has-[:checked]:text-paper has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-forest-link"
                    >
                      <input
                        type="radio"
                        name="jenis"
                        value={j}
                        checked={sunting.jenis === j}
                        onChange={() => setSunting({ ...sunting, jenis: j })}
                        className="sr-only"
                      />
                      {JENIS[j].label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <p className="text-sm text-ink-muted">{JENIS[sunting.jenis].label}</p>
            )}
            <Bidang id="pola" label={sunting.jenis === "ddc" ? "Kelas DDC" : "Kata kunci"} galat={aksi.galatDi("pola")}>
              <input
                id="pola"
                className={`${inputCls} font-mono`}
                value={sunting.pola}
                placeholder={JENIS[sunting.jenis].contoh}
                autoComplete="off"
                aria-invalid={!!aksi.galatDi("pola")}
                onChange={(e) => setSunting({ ...sunting, pola: e.target.value })}
              />
            </Bidang>
            <Bidang id="kategoriId" label="Kategori" galat={aksi.galatDi("kategoriId")}>
              <select
                id="kategoriId"
                className={inputCls}
                value={sunting.kategoriId}
                aria-invalid={!!aksi.galatDi("kategoriId")}
                onChange={(e) => setSunting({ ...sunting, kategoriId: e.target.value })}
              >
                <option value="">Pilih Kategori</option>
                {kategori?.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.kode} · {k.nama}
                  </option>
                ))}
              </select>
            </Bidang>
            <Bidang id="prioritas" label="Prioritas (1 diperiksa paling dulu)" galat={aksi.galatDi("prioritas")}>
              <input
                id="prioritas"
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                className={inputCls}
                value={sunting.prioritas}
                aria-invalid={!!aksi.galatDi("prioritas")}
                onChange={(e) => setSunting({ ...sunting, prioritas: e.target.value })}
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

        {daftar && daftar.aturanKategori.length === 0 && (
          <p className="text-sm text-ink-muted">Belum ada aturan.</p>
        )}
        <ul className="flex flex-col gap-3">
          {daftar?.aturanKategori.map((a) => {
            const k = kategoriById.get(a.kategoriId);
            return (
              <li key={a.id} data-testid="aturan" className={`${kartuCls} flex flex-col gap-3 p-3.5`}>
                <div className="flex items-center gap-3">
                  <span className="w-7 shrink-0 text-center font-mono text-sm font-semibold text-ink-muted">
                    {a.prioritas}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink-muted">{JENIS[a.jenis].label}</p>
                    <p className="font-mono text-base font-semibold">{a.pola}</p>
                  </div>
                  {k && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-[13px] font-medium">
                      <span className="size-2.5 rounded-full" style={{ background: k.warna }} aria-hidden />
                      {k.nama}
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
                      setSunting({
                        id: a.id,
                        jenis: a.jenis,
                        pola: a.pola,
                        kategoriId: a.kategoriId,
                        prioritas: String(a.prioritas),
                      });
                    }}
                  >
                    Ubah
                  </button>
                  <button
                    type="button"
                    className={`${tombolKecilCls} text-bahaya`}
                    disabled={aksi.nonaktif}
                    onClick={() => hapus(a)}
                  >
                    Hapus
                  </button>
                  {!aksi.online && <ButuhKoneksi />}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
