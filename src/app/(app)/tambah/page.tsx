"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLibrary } from "@/components/app/library-provider";
import { PageHeader } from "@/components/app/page-header";
import { ValidasiError } from "@/lib/local-library";
import { cn } from "@/lib/utils";

const inputCls =
  "h-12 w-full rounded-2xl border border-input bg-white px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-forest-link";

export default function TambahPage() {
  const { library, kategori } = useLibrary();
  const router = useRouter();
  const [judul, setJudul] = useState("");
  const [pengarang, setPengarang] = useState("");
  const [kategoriId, setKategoriId] = useState("");
  const [galat, setGalat] = useState<{ field: string; pesan: string } | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!library) return;
    setGalat(null);
    setMenyimpan(true);
    try {
      await library.tambahBukuManual({ judul, pengarang, kategoriId });
      router.push("/koleksi");
    } catch (err) {
      if (err instanceof ValidasiError) setGalat({ field: err.field, pesan: err.pesan });
      else throw err;
    } finally {
      setMenyimpan(false);
    }
  }

  const galatDi = (f: string) => (galat?.field === f ? galat.pesan : null);

  return (
    <>
      <PageHeader judul="Tambah Buku" keterangan="Tersimpan di perangkat, dikirim saat online" />
      <form onSubmit={simpan} noValidate className="flex flex-col gap-5 p-5">
        <div>
          <label htmlFor="judul" className="mb-1.5 block text-sm font-medium">
            Judul
          </label>
          <input
            id="judul"
            className={inputCls}
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            aria-invalid={!!galatDi("judul")}
            autoComplete="off"
          />
          {galatDi("judul") && <p className="mt-1 text-sm text-bahaya">{galatDi("judul")}</p>}
        </div>
        <div>
          <label htmlFor="pengarang" className="mb-1.5 block text-sm font-medium">
            Pengarang
          </label>
          <input
            id="pengarang"
            className={inputCls}
            value={pengarang}
            onChange={(e) => setPengarang(e.target.value)}
            aria-invalid={!!galatDi("pengarang")}
            autoComplete="off"
          />
          {galatDi("pengarang") && <p className="mt-1 text-sm text-bahaya">{galatDi("pengarang")}</p>}
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Kategori</legend>
          <div className="flex flex-wrap gap-2">
            {kategori?.map((k) => (
              <label
                key={k.id}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-2 rounded-full border border-input bg-white px-3 py-2 text-[13px] font-medium has-[:checked]:border-forest has-[:checked]:bg-forest has-[:checked]:text-paper has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-forest-link",
                )}
              >
                <input
                  type="radio"
                  name="kategori"
                  value={k.id}
                  checked={kategoriId === k.id}
                  onChange={() => setKategoriId(k.id)}
                  className="sr-only"
                />
                <span className="size-3 rounded-full" style={{ background: k.warna }} aria-hidden />
                <span className="font-mono text-xs">{k.kode}</span> {k.nama}
              </label>
            ))}
          </div>
          {galatDi("kategoriId") && (
            <p role="alert" className="mt-2 text-sm text-bahaya">
              {galatDi("kategoriId")}
            </p>
          )}
        </fieldset>
        <button
          type="submit"
          disabled={!library || menyimpan}
          className="h-[52px] rounded-2xl bg-forest text-base font-semibold text-paper disabled:opacity-60"
        >
          {menyimpan ? "Menyimpan…" : "Simpan"}
        </button>
      </form>
    </>
  );
}
