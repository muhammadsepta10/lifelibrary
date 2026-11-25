"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { dariAngka, Field, inputCls, keAngka, Pilihan, tombolUtamaCls, useDetailBuku } from "@/components/app/form";
import { useLibrary } from "@/components/app/library-provider";
import { PageHeader } from "@/components/app/page-header";
import { LABEL_PERAN, PERAN, type Peran } from "@/lib/buku-fields";
import { ValidasiError, type DetailBuku } from "@/lib/local-library";

type BarisKontributor = { kunci: string; nama: string; peran: Peran; utama: boolean };

function FormUbahBuku({ detail }: { detail: DetailBuku }) {
  const { library } = useLibrary();
  const router = useRouter();
  const [f, setF] = useState({
    judul: detail.judul,
    penerbit: detail.penerbit ?? "",
    kota: detail.kota ?? "",
    tahun: dariAngka(detail.tahun),
    edisi: detail.edisi ?? "",
    seri: detail.seri ?? "",
    jilid: detail.jilid ?? "",
    bahasa: detail.bahasa ?? "",
    halaman: dariAngka(detail.halaman),
    kelasDdc: detail.kelasDdc ?? "",
    isbn13: detail.isbn13 ?? "",
    subjek: detail.subjek.join(", "),
    sinopsis: detail.sinopsis ?? "",
    sampul: detail.sampul ?? "",
  });
  const [kontributor, setKontributor] = useState<BarisKontributor[]>(
    detail.kontributor.map((k) => ({ kunci: `${k.id}-${k.peran}`, nama: k.nama, peran: k.peran, utama: k.utama })),
  );
  const [galat, setGalat] = useState<{ field: string; pesan: string } | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));
  const galatDi = (field: string) => (galat?.field === field ? galat.pesan : null);
  const ubahBaris = (kunci: string, p: Partial<BarisKontributor>) =>
    setKontributor((l) => l.map((b) => (b.kunci === kunci ? { ...b, ...p } : b)));

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!library) return;
    setGalat(null);
    setMenyimpan(true);
    try {
      await library.ubahBuku(detail.id, {
        judul: f.judul,
        penerbit: f.penerbit,
        kota: f.kota,
        tahun: keAngka(f.tahun),
        edisi: f.edisi,
        seri: f.seri,
        jilid: f.jilid,
        bahasa: f.bahasa,
        halaman: keAngka(f.halaman),
        kelasDdc: f.kelasDdc,
        isbn13: f.isbn13,
        subjek: f.subjek.split(",").map((s) => s.trim()).filter(Boolean),
        sinopsis: f.sinopsis,
        sampul: f.sampul,
        kontributor: kontributor.map(({ nama, peran, utama }) => ({ nama, peran, utama })),
      });
      router.push(`/buku?id=${detail.id}`);
    } catch (err) {
      if (err instanceof ValidasiError) setGalat({ field: err.field, pesan: err.pesan });
      else throw err;
    } finally {
      setMenyimpan(false);
    }
  }

  const teks = (id: keyof typeof f, label: string, extra?: { inputMode?: "numeric"; petunjuk?: string }) => (
    <Field id={id} label={label} galat={galatDi(id)} petunjuk={extra?.petunjuk}>
      <input
        id={id}
        className={inputCls}
        value={f[id]}
        onChange={set(id)}
        inputMode={extra?.inputMode}
        aria-invalid={!!galatDi(id)}
        autoComplete="off"
      />
    </Field>
  );

  return (
    <form onSubmit={simpan} noValidate className="flex flex-col gap-5 p-5">
      {teks("judul", "Judul")}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 text-sm font-medium">Kontributor</legend>
        {kontributor.map((k, i) => (
          <div key={k.kunci} className="flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,.08)]">
            <input
              aria-label={`Nama Kontributor ${i + 1}`}
              className={inputCls}
              value={k.nama}
              onChange={(e) => ubahBaris(k.kunci, { nama: e.target.value })}
              autoComplete="off"
            />
            <div className="flex items-center gap-3">
              <Pilihan
                id={`peran-${k.kunci}`}
                nilai={k.peran}
                onChange={(v) => ubahBaris(k.kunci, { peran: (v || "pengarang") as Peran })}
                pilihan={PERAN.map((p) => ({ nilai: p, label: LABEL_PERAN[p] }))}
                kosong={LABEL_PERAN.pengarang}
              />
              <label className="flex shrink-0 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="utama"
                  checked={k.utama}
                  onChange={() => setKontributor((l) => l.map((b) => ({ ...b, utama: b.kunci === k.kunci })))}
                  className="size-4 accent-forest"
                />
                Pengarang Utama
              </label>
              <button
                type="button"
                aria-label={`Hapus Kontributor ${i + 1}`}
                onClick={() => setKontributor((l) => l.filter((b) => b.kunci !== k.kunci))}
                className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted"
              >
                <Trash2 className="size-5" aria-hidden />
              </button>
            </div>
          </div>
        ))}
        {galatDi("kontributor") && (
          <p role="alert" className="text-sm text-bahaya">
            {galatDi("kontributor")}
          </p>
        )}
        <button
          type="button"
          onClick={() =>
            setKontributor((l) => [...l, { kunci: crypto.randomUUID(), nama: "", peran: "pengarang", utama: false }])
          }
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-input bg-white text-sm font-medium"
        >
          <Plus className="size-4" aria-hidden /> Tambah Kontributor
        </button>
      </fieldset>

      {teks("penerbit", "Penerbit")}
      {teks("kota", "Kota terbit")}
      {teks("tahun", "Tahun terbit", { inputMode: "numeric" })}
      {teks("edisi", "Edisi")}
      {teks("seri", "Seri")}
      {teks("jilid", "Jilid")}
      {teks("bahasa", "Bahasa")}
      {teks("halaman", "Jumlah halaman", { inputMode: "numeric" })}
      {teks("kelasDdc", "Kelas DDC", { petunjuk: "Mis. 155.24. Bukan Kategori." })}
      {teks("isbn13", "ISBN-13", { inputMode: "numeric" })}
      {teks("subjek", "Subjek", { petunjuk: "Pisahkan dengan koma" })}
      <Field id="sinopsis" label="Sinopsis" galat={galatDi("sinopsis")}>
        <textarea
          id="sinopsis"
          rows={5}
          className={`${inputCls} h-auto py-3`}
          value={f.sinopsis}
          onChange={set("sinopsis")}
        />
      </Field>
      {teks("sampul", "Sampul (alamat gambar)")}

      <button type="submit" disabled={!library || menyimpan} className={tombolUtamaCls}>
        {menyimpan ? "Menyimpan…" : "Simpan"}
      </button>
    </form>
  );
}

function Isi() {
  const id = useSearchParams().get("id");
  const detail = useDetailBuku(id);
  return (
    <>
      <PageHeader judul="Ubah Buku" keterangan="Tersimpan di perangkat, dikirim saat online" />
      <Link
        href={id ? `/buku?id=${id}` : "/koleksi"}
        className="inline-flex items-center gap-1 px-5 pt-4 text-sm font-medium text-forest-link"
      >
        <ArrowLeft className="size-4" aria-hidden /> Detail Buku
      </Link>
      {detail === undefined && <p className="p-5 text-sm text-ink-muted">Memuat…</p>}
      {detail === null && <p className="p-5 text-sm">Buku tidak ditemukan di perangkat ini.</p>}
      {detail && <FormUbahBuku key={detail.id} detail={detail} />}
    </>
  );
}

export default function UbahBukuPage() {
  return (
    <Suspense fallback={<p className="p-5 text-sm text-ink-muted">Memuat…</p>}>
      <Isi />
    </Suspense>
  );
}
