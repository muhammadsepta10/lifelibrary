"use client";

import { useEffect, useMemo, useState } from "react";
import { LABEL_SUMBER, urlSampul, type DrafBuku, type FieldDraf, type StatusSumber } from "@/lib/draf-buku";
import { bisaSimpanDraf, type SaranKategori } from "@/lib/local-library";
import { Field, inputCls, keAngka, tombolSekunderCls, tombolUtamaCls } from "./form";
import { useLibrary } from "./library-provider";
import { PilihKategori } from "./pilih-kategori";

type Isian = {
  judul: string;
  pengarang: string[];
  penerbit: string;
  kota: string;
  tahun: string;
  halaman: string;
  bahasa: string;
  sinopsis: string;
  kelasDdc: string;
  subjek: string;
};

const dariDraf = (d: DrafBuku): Isian => ({
  judul: d.judul,
  pengarang: d.pengarang.length ? d.pengarang : [""],
  penerbit: d.penerbit ?? "",
  kota: d.kota ?? "",
  tahun: d.tahun == null ? "" : String(d.tahun),
  halaman: d.halaman == null ? "" : String(d.halaman),
  bahasa: d.bahasa ?? "",
  sinopsis: d.sinopsis ?? "",
  kelasDdc: d.kelasDdc ?? "",
  subjek: d.subjek.join(", "),
});

const pecahSubjek = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
const bersihPengarang = (p: string[]) => p.map((n) => n.trim()).filter(Boolean);

const KETERANGAN_STATUS: Record<StatusSumber["status"], string> = {
  ok: "dipakai",
  kosong: "tidak ada data",
  galat: "gagal",
  dilewati: "dilewati",
};

/** Lencana sumber sebuah field; "diedit" bila Pemilik sudah mengubah nilainya. */
function Sumber({ draf, field, diedit }: { draf: DrafBuku; field: FieldDraf; diedit: boolean }) {
  const asal = draf.sumber[field];
  if (!asal?.length) return null;
  return (
    <span className="ml-2 rounded-full bg-menunggu px-2 py-0.5 align-middle text-[11px] font-semibold text-menunggu-fg">
      {diedit ? "diedit" : asal.map((s) => LABEL_SUMBER[s]).join(" + ")}
    </span>
  );
}

/**
 * Layar tinjau draf Buku: field bisa diedit, sumber tiap field tampil, Saran
 * Kategori sudah terpilih lengkap dengan alasannya, dan tombol simpan baru
 * aktif setelah Kategori dikonfirmasi.
 */
export function DrafBukuForm({
  draf,
  statusSumber,
  onSimpan,
  menyimpan,
  galat,
}: {
  draf: DrafBuku;
  statusSumber: StatusSumber[];
  onSimpan: (draf: DrafBuku, kategoriId: string) => void;
  menyimpan: boolean;
  galat: { field: string; pesan: string } | null;
}) {
  const { library, kategori } = useLibrary();
  const awal = useMemo(() => dariDraf(draf), [draf]);
  const [isi, setIsi] = useState<Isian>(awal);
  const [saran, setSaran] = useState<SaranKategori | null>(null);
  const [kat, setKat] = useState({ id: "", dikonfirmasi: false, manual: false });

  const ubah = <K extends keyof Isian>(k: K, v: Isian[K]) => setIsi((s) => ({ ...s, [k]: v }));
  const diedit = (k: Exclude<keyof Isian, "pengarang" | "subjek">) => isi[k] !== awal[k];
  const pengarangDiedit = JSON.stringify(bersihPengarang(isi.pengarang)) !== JSON.stringify(bersihPengarang(awal.pengarang));

  // Saran dihitung ulang dari data lokal tiap kali masukannya berubah (Kelas DDC, subjek, pengarang).
  const kunciSaran = JSON.stringify([isi.kelasDdc.trim(), pecahSubjek(isi.subjek), bersihPengarang(isi.pengarang)]);
  useEffect(() => {
    if (!library) return;
    let batal = false;
    const [kelasDdc, subjek, pengarang] = JSON.parse(kunciSaran) as [string, string[], string[]];
    void library.sarankanKategori({ kelasDdc: kelasDdc || null, subjek, pengarang, seri: null }).then((s) => {
      if (batal) return;
      setSaran(s);
      // Saran menggantikan pilihan hanya selama Pemilik belum memilih sendiri; konfirmasi diulang bila saran berganti.
      setKat((k) => (k.manual ? k : { id: s?.kategoriId ?? "", dikonfirmasi: k.id === s?.kategoriId && k.dikonfirmasi, manual: false }));
    });
    return () => {
      batal = true;
    };
  }, [library, kunciSaran]);

  const galatDi = (f: string) => (galat?.field === f ? galat.pesan : null);
  const bisaSimpan = bisaSimpanDraf({ kategoriId: kat.id, dikonfirmasi: kat.dikonfirmasi });

  function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!bisaSimpan) return;
    onSimpan(
      {
        ...draf,
        judul: isi.judul,
        pengarang: bersihPengarang(isi.pengarang),
        penerbit: isi.penerbit,
        kota: isi.kota,
        tahun: keAngka(isi.tahun),
        halaman: keAngka(isi.halaman),
        bahasa: isi.bahasa,
        sinopsis: isi.sinopsis,
        kelasDdc: isi.kelasDdc,
        subjek: pecahSubjek(isi.subjek),
      },
      kat.id,
    );
  }

  const teks = (id: Exclude<keyof Isian, "pengarang" | "sinopsis" | "subjek">, label: string, opsi: { field?: FieldDraf; petunjuk?: string; inputMode?: "numeric" } = {}) => (
    <Field
      id={id}
      label={
        <>
          {label}
          {opsi.field && <Sumber draf={draf} field={opsi.field} diedit={diedit(id)} />}
        </>
      }
      galat={galatDi(id)}
      petunjuk={opsi.petunjuk}
    >
      <input
        id={id}
        className={inputCls}
        value={isi[id]}
        onChange={(e) => ubah(id, e.target.value)}
        aria-invalid={!!galatDi(id)}
        inputMode={opsi.inputMode}
        autoComplete="off"
      />
    </Field>
  );

  return (
    <form onSubmit={simpan} noValidate className="flex flex-col gap-5 p-5">
      <ul aria-label="Status sumber" className="rounded-2xl bg-white p-3 text-xs text-ink-muted">
        {statusSumber.map((s) => (
          <li key={s.sumber}>
            <span className="font-semibold">{LABEL_SUMBER[s.sumber]}</span>: {KETERANGAN_STATUS[s.status]}
            {s.pesan ? ` (${s.pesan})` : ""}
          </li>
        ))}
      </ul>

      {draf.sampul && (
        // Sampul disajikan dari storage aplikasi, bukan hotlink.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urlSampul(draf.sampul)} alt={`Sampul ${draf.judul || "buku"}`} className="h-40 w-auto self-start rounded-xl border border-input" />
      )}

      {draf.isbn13 ? <p className="font-mono text-sm">ISBN {draf.isbn13}</p> : <p className="text-sm text-ink-muted">Buku tanpa ISBN</p>}

      {teks("judul", "Judul", { field: "judul" })}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">
          Pengarang
          <Sumber draf={draf} field="pengarang" diedit={pengarangDiedit} />
        </legend>
        {isi.pengarang.map((nama, i) => (
          <div key={i} className="flex gap-2">
            <input
              aria-label={i === 0 ? "Pengarang Utama" : `Pengarang ${i + 1}`}
              className={inputCls}
              value={nama}
              onChange={(e) => ubah("pengarang", isi.pengarang.map((n, j) => (j === i ? e.target.value : n)))}
              autoComplete="off"
            />
            {isi.pengarang.length > 1 && (
              <button type="button" className={tombolSekunderCls} onClick={() => ubah("pengarang", isi.pengarang.filter((_, j) => j !== i))}>
                Hapus
              </button>
            )}
          </div>
        ))}
        <p className="text-xs text-ink-muted">Yang pertama menjadi Pengarang Utama.</p>
        {galatDi("pengarang") && (
          <p role="alert" className="text-sm text-bahaya">
            {galatDi("pengarang")}
          </p>
        )}
        <button type="button" className={`${tombolSekunderCls} self-start`} onClick={() => ubah("pengarang", [...isi.pengarang, ""])}>
          Tambah pengarang
        </button>
      </fieldset>

      {teks("penerbit", "Penerbit", { field: "penerbit" })}
      {teks("kota", "Kota terbit", { field: "kota" })}
      {teks("tahun", "Tahun terbit", { field: "tahun", inputMode: "numeric" })}
      {teks("halaman", "Halaman", { field: "halaman", inputMode: "numeric" })}
      {teks("bahasa", "Bahasa", { field: "bahasa" })}
      {teks("kelasDdc", "Kelas DDC", {
        field: "kelasDdc",
        petunjuk: "Boleh diketik dari KDT di balik halaman judul, misalnya 155.24",
      })}

      <Field
        id="subjek"
        label={
          <>
            Subjek
            <Sumber draf={draf} field="subjek" diedit={isi.subjek !== awal.subjek} />
          </>
        }
        petunjuk="Pisahkan dengan koma"
        galat={galatDi("subjek")}
      >
        <input id="subjek" className={inputCls} value={isi.subjek} onChange={(e) => ubah("subjek", e.target.value)} autoComplete="off" />
      </Field>

      <Field id="sinopsis" label="Sinopsis" galat={galatDi("sinopsis")}>
        <textarea
          id="sinopsis"
          rows={4}
          className="w-full rounded-2xl border border-input bg-white px-4 py-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-forest-link"
          value={isi.sinopsis}
          onChange={(e) => ubah("sinopsis", e.target.value)}
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Kategori</legend>
        {saran ? (
          <p className="mb-2 rounded-2xl bg-white p-3 text-sm" data-testid="saran-kategori">
            <span className="font-semibold">
              Saran: {saran.kode} {saran.nama}
            </span>
            <br />
            <span className="text-ink-muted">{saran.alasan}</span>
          </p>
        ) : (
          <p className="mb-2 text-sm text-ink-muted">Tidak ada saran untuk buku ini. Pilih Kategori sendiri.</p>
        )}
        <PilihKategori
          nama="kategori-draf"
          kategori={kategori}
          nilai={kat.id}
          disarankan={saran?.kategoriId}
          onPilih={(id) => setKat({ id, dikonfirmasi: true, manual: true })}
        />
        {kat.id && !kat.dikonfirmasi && (
          <button type="button" className={`${tombolSekunderCls} mt-3`} onClick={() => setKat((k) => ({ ...k, dikonfirmasi: true }))}>
            Pakai Kategori ini
          </button>
        )}
        {galatDi("kategoriId") && (
          <p role="alert" className="mt-2 text-sm text-bahaya">
            {galatDi("kategoriId")}
          </p>
        )}
      </fieldset>

      {!bisaSimpan && <p className="text-xs text-ink-muted">Konfirmasi Kategori dulu untuk menyimpan.</p>}
      <button type="submit" disabled={!library || menyimpan || !bisaSimpan} className={tombolUtamaCls}>
        {menyimpan ? "Menyimpan…" : "Simpan"}
      </button>
    </form>
  );
}
