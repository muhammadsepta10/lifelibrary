"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DrafBukuForm } from "@/components/app/draf-buku-form";
import { ButuhKoneksi } from "@/components/app/kelola";
import { Field, inputCls, tombolSekunderCls, tombolUtamaCls } from "@/components/app/form";
import { useLibrary } from "@/components/app/library-provider";
import { PageHeader } from "@/components/app/page-header";
import { PilihKategori } from "@/components/app/pilih-kategori";
import { drafKosong, type DrafBuku, type StatusSumber } from "@/lib/draf-buku";
import { normalisasiIsbn, ValidasiError, type BukuDuplikat } from "@/lib/local-library";
import { cariMetadataIsbn } from "@/lib/sync/fetch-metadata";
import { LoginDiperlukanError } from "@/lib/sync/fetch-transport";

type Tahap =
  | { jenis: "cari" }
  | { jenis: "mencari"; isbn13: string }
  | { jenis: "duplikat"; isbn13: string; buku: BukuDuplikat }
  | {
      jenis: "tinjau";
      draf: DrafBuku;
      sumber: StatusSumber[];
      /** Pesan ramah di atas form: tidak ditemukan, atau sumber tak terjangkau. */
      catatan: string | null;
      bisaCobaLagi: boolean;
    };

export default function TambahIsbnPage() {
  const { library, kategori, online } = useLibrary();
  const router = useRouter();
  const [tahap, setTahap] = useState<Tahap>({ jenis: "cari" });
  const [isbn, setIsbn] = useState("");
  const [galatIsbn, setGalatIsbn] = useState<string | null>(null);
  const [galatSimpan, setGalatSimpan] = useState<{ field: string; pesan: string } | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [kategoriEksemplar, setKategoriEksemplar] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tahap.jenis === "cari") inputRef.current?.focus();
  }, [tahap.jenis]);

  async function cari(isbn13: string) {
    if (!library) return;
    setTahap({ jenis: "mencari", isbn13 });
    try {
      const hasil = await cariMetadataIsbn(isbn13);
      if (hasil.ditemukan) {
        setTahap({ jenis: "tinjau", draf: hasil.draf, sumber: hasil.sumber, catatan: null, bisaCobaLagi: false });
        return;
      }
      setTahap({
        jenis: "tinjau",
        draf: drafKosong(isbn13),
        sumber: hasil.sumber,
        bisaCobaLagi: hasil.semuaGalat,
        catatan: hasil.semuaGalat
          ? "Sumber metadata tidak bisa dihubungi. Coba lagi sebentar lagi, atau isi datanya manual."
          : `ISBN ${isbn13} belum ada di Open Library, Google Books, maupun Library of Congress. Isi datanya manual, ISBN sudah terisi.`,
      });
    } catch (e) {
      const offline = e instanceof TypeError;
      setTahap({
        jenis: "tinjau",
        draf: drafKosong(isbn13),
        sumber: [],
        bisaCobaLagi: true,
        catatan: e instanceof LoginDiperlukanError
          ? "Sesi login habis. Masuk lagi untuk mencari metadata, atau isi datanya manual."
          : offline
            ? "Tidak ada koneksi, jadi metadata belum bisa dicari. Isi datanya manual atau coba lagi saat online."
            : "Pencarian metadata gagal. Coba lagi, atau isi datanya manual.",
      });
    }
  }

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (!library) return;
    const hasil = normalisasiIsbn(isbn);
    if (!hasil.ok) {
      setGalatIsbn(hasil.pesan);
      return;
    }
    setGalatIsbn(null);
    setGalatSimpan(null);
    const duplikat = await library.cariBukuByIsbn(hasil.isbn13);
    if (duplikat) {
      setKategoriEksemplar(duplikat.kategoriId ?? "");
      setTahap({ jenis: "duplikat", isbn13: hasil.isbn13, buku: duplikat });
      return;
    }
    await cari(hasil.isbn13);
  }

  function ulang() {
    setIsbn("");
    setGalatSimpan(null);
    setTahap({ jenis: "cari" });
  }

  async function simpanDraf(draf: DrafBuku, kategoriId: string) {
    if (!library) return;
    setGalatSimpan(null);
    setMenyimpan(true);
    try {
      const { bukuId } = await library.simpanDraf(draf, { kategoriId });
      router.push(`/buku?id=${bukuId}`);
    } catch (err) {
      if (err instanceof ValidasiError) setGalatSimpan({ field: err.field, pesan: err.pesan });
      else throw err;
    } finally {
      setMenyimpan(false);
    }
  }

  async function tambahEksemplar(buku: BukuDuplikat) {
    if (!library) return;
    setGalatSimpan(null);
    setMenyimpan(true);
    try {
      await library.catatEksemplar({ bukuId: buku.bukuId, kategoriId: kategoriEksemplar });
      router.push(`/buku?id=${buku.bukuId}`);
    } catch (err) {
      if (err instanceof ValidasiError) setGalatSimpan({ field: err.field, pesan: err.pesan });
      else throw err;
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <>
      <PageHeader judul="Tambah lewat ISBN" keterangan="Ketik ISBN atau scan dengan scanner USB, lalu tekan Enter" />

      {(tahap.jenis === "cari" || tahap.jenis === "mencari") && (
        <form onSubmit={kirim} noValidate className="flex flex-col gap-4 p-5">
          <Field id="isbn" label="ISBN" galat={galatIsbn} petunjuk="10 atau 13 digit; ISBN-10 diubah ke ISBN-13">
            <input
              id="isbn"
              ref={inputRef}
              className={inputCls}
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              aria-invalid={!!galatIsbn}
              inputMode="text"
              autoComplete="off"
              autoFocus
              disabled={tahap.jenis === "mencari"}
            />
          </Field>
          <button type="submit" disabled={!library || tahap.jenis === "mencari"} className={tombolUtamaCls}>
            {tahap.jenis === "mencari" ? "Mencari metadata…" : "Cari"}
          </button>
          {!online && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <ButuhKoneksi /> untuk mencari metadata. Cek duplikat tetap jalan, dan datanya bisa diisi manual.
            </p>
          )}
          <Link href="/tambah" className="text-center text-sm font-medium text-forest-link underline">
            Isi manual tanpa ISBN
          </Link>
        </form>
      )}

      {tahap.jenis === "duplikat" && (
        <div className="flex flex-col gap-4 p-5">
          <div role="alertdialog" aria-labelledby="judul-duplikat" className="rounded-2xl bg-white p-4">
            <h2 id="judul-duplikat" className="text-lg font-semibold">
              Tambah eksemplar baru?
            </h2>
            <p className="mt-2 text-sm">
              ISBN {tahap.isbn13} sudah ada di koleksi: <strong>{tahap.buku.judul}</strong>
              {tahap.buku.pengarang && <> karya {tahap.buku.pengarang}</>} ({tahap.buku.jumlahEksemplar} Eksemplar).
            </p>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Kategori Eksemplar baru</legend>
            <PilihKategori
              nama="kategori-eksemplar"
              kategori={kategori}
              nilai={kategoriEksemplar}
              onPilih={setKategoriEksemplar}
            />
            {galatSimpan?.field === "kategoriId" && (
              <p role="alert" className="mt-2 text-sm text-bahaya">
                {galatSimpan.pesan}
              </p>
            )}
          </fieldset>
          <button
            type="button"
            className={tombolUtamaCls}
            disabled={!library || menyimpan || !kategoriEksemplar}
            onClick={() => void tambahEksemplar(tahap.buku)}
          >
            {menyimpan ? "Menyimpan…" : "Ya, tambah Eksemplar"}
          </button>
          <button type="button" className={tombolSekunderCls} onClick={ulang}>
            Batal
          </button>
        </div>
      )}

      {tahap.jenis === "tinjau" && (
        <>
          {tahap.catatan && (
            <div role="status" className="mx-5 mt-5 rounded-2xl bg-white p-4 text-sm">
              <p>{tahap.catatan}</p>
              {tahap.bisaCobaLagi && (
                <button type="button" className={`${tombolSekunderCls} mt-3`} onClick={() => void cari(tahap.draf.isbn13)}>
                  Coba lagi
                </button>
              )}
            </div>
          )}
          <DrafBukuForm
            // Draf baru (coba lagi, ISBN lain) memulai isian dari awal.
            key={`${tahap.draf.isbn13}-${tahap.draf.judul}-${tahap.sumber.map((s) => s.status).join()}`}
            draf={tahap.draf}
            statusSumber={tahap.sumber}
            onSimpan={(d, k) => void simpanDraf(d, k)}
            menyimpan={menyimpan}
            galat={galatSimpan}
          />
          <div className="px-5 pb-8">
            <button type="button" className={tombolSekunderCls} onClick={ulang}>
              Cari ISBN lain
            </button>
          </div>
        </>
      )}
    </>
  );
}
