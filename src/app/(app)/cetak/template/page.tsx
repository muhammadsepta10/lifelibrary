"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  Bidang,
  ButuhKoneksi,
  inputCls,
  kartuCls,
  tombolKecilCls,
  tombolUtamaCls,
  useAksi,
} from "@/components/app/kelola";
import { useLibrary } from "@/components/app/library-provider";
import { PageHeader } from "@/components/app/page-header";
import {
  DAFTAR_KERTAS,
  hitungGrid,
  KERTAS,
  templateLabelSchema,
  TEMPLATE_LABEL_BAWAAN,
  type Kertas,
} from "@/lib/label/template-label";

type Isian = Record<"w" | "h" | "mt" | "ml" | "gx" | "gy", string>;

const BIDANG: { kunci: keyof Isian; label: string }[] = [
  { kunci: "w", label: "Lebar Label (mm)" },
  { kunci: "h", label: "Tinggi Label (mm)" },
  { kunci: "mt", label: "Margin atas (mm)" },
  { kunci: "ml", label: "Margin kiri (mm)" },
  { kunci: "gx", label: "Jarak kolom (mm)" },
  { kunci: "gy", label: "Jarak baris (mm)" },
];

const keIsian = (t: typeof TEMPLATE_LABEL_BAWAAN): Isian => ({
  w: String(t.w),
  h: String(t.h),
  mt: String(t.mt),
  ml: String(t.ml),
  gx: String(t.gx),
  gy: String(t.gy),
});

/** Isian teks (boleh koma desimal) menjadi angka; kosong atau bukan angka = NaN, ditolak validasi. */
const keAngka = (s: string) => (s.trim() === "" ? Number.NaN : Number(s.replace(",", ".")));

export default function TemplateLabelPage() {
  const { library, kelola } = useLibrary();
  const aksi = useAksi();
  const [kertas, setKertas] = useState<Kertas>(TEMPLATE_LABEL_BAWAAN.kertas);
  const [isian, setIsian] = useState<Isian>(keIsian(TEMPLATE_LABEL_BAWAAN));
  const [tersimpan, setTersimpan] = useState(false);
  const terisi = useRef(false);

  // Isian awal = Template Label yang tersimpan di perangkat; sesudahnya Pemilik yang mengubah.
  useEffect(() => {
    if (!library) return;
    return library.pantauTemplateLabel((t) => {
      if (terisi.current) return;
      terisi.current = true;
      setKertas(t.kertas);
      setIsian(keIsian(t));
    });
  }, [library]);

  const hasil = useMemo(
    () =>
      templateLabelSchema.safeParse({
        kertas,
        ...Object.fromEntries(BIDANG.map(({ kunci }) => [kunci, keAngka(isian[kunci])])),
      }),
    [kertas, isian],
  );
  const galatField = (f: string) =>
    hasil.success ? null : (hasil.error.issues.find((i) => i.path[0] === f)?.message ?? null);
  const grid = hasil.success ? hitungGrid(hasil.data) : null;
  const sisa =
    hasil.success && grid
      ? {
          kanan: grid.lebarKertas - hasil.data.ml - grid.kolom * hasil.data.w - (grid.kolom - 1) * hasil.data.gx,
          bawah: grid.tinggiKertas - hasil.data.mt - grid.baris * hasil.data.h - (grid.baris - 1) * hasil.data.gy,
        }
      : null;

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!kelola || !hasil.success) return;
    setTersimpan(false);
    const ok = await aksi.jalankan(() => kelola.templateLabel.simpan(hasil.data));
    setTersimpan(ok);
  }

  return (
    <>
      <PageHeader judul="Template Label" keterangan="Ukuran kertas, ukuran sel Label, margin, dan jarak" />
      <Link href="/cetak" className="inline-flex items-center gap-1 px-5 pt-4 text-sm font-medium text-forest-link">
        <ArrowLeft className="size-4" aria-hidden /> Cetak Label
      </Link>
      <form onSubmit={simpan} noValidate className="flex flex-col gap-5 p-5">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Kertas</legend>
          <div className="flex gap-2" role="radiogroup" aria-label="Kertas">
            {DAFTAR_KERTAS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kertas === k}
                onClick={() => {
                  setKertas(k);
                  setTersimpan(false);
                }}
                className={`h-12 flex-1 rounded-2xl border text-sm font-semibold ${
                  kertas === k ? "border-forest bg-forest text-paper" : "border-input bg-white"
                }`}
              >
                {k} · {KERTAS[k].lebar}×{KERTAS[k].tinggi} mm
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          {BIDANG.map(({ kunci, label }) => (
            <Bidang key={kunci} id={kunci} label={label} galat={galatField(kunci) ?? aksi.galatDi(kunci)}>
              <input
                id={kunci}
                className={`${inputCls} font-mono`}
                inputMode="decimal"
                autoComplete="off"
                value={isian[kunci]}
                aria-invalid={!!galatField(kunci)}
                onChange={(e) => {
                  setIsian({ ...isian, [kunci]: e.target.value });
                  setTersimpan(false);
                }}
              />
            </Bidang>
          ))}
        </div>

        <div className={`${kartuCls} p-4 text-sm`} data-testid="ringkasan-grid">
          {grid && sisa ? (
            <>
              <p className="font-mono text-base font-semibold">
                {grid.kolom} kolom × {grid.baris} baris = {grid.perLembar} sel per lembar
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Sisa kertas: kanan {sisa.kanan.toFixed(1)} mm · bawah {sisa.bawah.toFixed(1)} mm
              </p>
            </>
          ) : (
            <p className="text-ink-muted">Isi ukuran yang valid untuk melihat jumlah kolom dan baris.</p>
          )}
        </div>

        {aksi.galatUmum && (
          <p role="alert" className="text-sm text-bahaya">
            {aksi.galatUmum}
          </p>
        )}
        {tersimpan && (
          <p role="status" className="text-sm font-medium text-sukses-fg">
            Template Label tersimpan.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={tombolUtamaCls} disabled={aksi.nonaktif || !hasil.success}>
            {aksi.bekerja ? "Menyimpan…" : "Simpan"}
          </button>
          <button
            type="button"
            className={tombolKecilCls}
            onClick={() => {
              setKertas(TEMPLATE_LABEL_BAWAAN.kertas);
              setIsian(keIsian(TEMPLATE_LABEL_BAWAAN));
              setTersimpan(false);
            }}
          >
            Kembalikan ke bawaan
          </button>
          {!aksi.online && <ButuhKoneksi />}
        </div>
      </form>
    </>
  );
}
