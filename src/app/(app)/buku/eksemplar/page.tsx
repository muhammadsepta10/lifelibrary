"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  dariAngka,
  Field,
  inputCls,
  keAngka,
  Pilihan,
  tombolSekunderCls,
  tombolUtamaCls,
  useDetailBuku,
} from "@/components/app/form";
import { useLibrary } from "@/components/app/library-provider";
import { Penyiangan } from "@/components/app/penyiangan";
import { PageHeader } from "@/components/app/page-header";
import { ASAL, KONDISI, LABEL_ASAL, LABEL_KONDISI, type Asal, type Kondisi } from "@/lib/buku-fields";
import { hitungNomorPanggil, ValidasiError, type DetailBuku, type EksemplarDetail } from "@/lib/local-library";
import { cn } from "@/lib/utils";

function useGalat() {
  const [galat, setGalat] = useState<{ field: string; pesan: string } | null>(null);
  return {
    galat,
    setGalat,
    di: (field: string) => (galat?.field === field ? galat.pesan : null),
    tangani(err: unknown) {
      if (err instanceof ValidasiError) setGalat({ field: err.field, pesan: err.pesan });
      else throw err;
    },
  };
}

function FormEksemplar({ buku, eksemplar }: { buku: DetailBuku; eksemplar: EksemplarDetail | null }) {
  const { library, daftar, kategori } = useLibrary();
  const router = useRouter();
  const [f, setF] = useState({
    tanggalMasuk: eksemplar?.tanggalMasuk ?? "",
    asal: (eksemplar?.asal ?? "") as Asal | "",
    harga: dariAngka(eksemplar?.harga),
    kondisi: (eksemplar?.kondisi ?? "") as Kondisi | "",
    lokasiId: eksemplar?.lokasi?.id ?? "",
  });
  const [kategoriId, setKategoriId] = useState(buku.eksemplar[0]?.kategori.id ?? "");
  const { di, setGalat, tangani } = useGalat();
  const [menyimpan, setMenyimpan] = useState(false);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!library) return;
    setGalat(null);
    setMenyimpan(true);
    try {
      const isian = {
        tanggalMasuk: f.tanggalMasuk,
        asal: f.asal || null,
        harga: keAngka(f.harga),
        kondisi: f.kondisi || null,
        lokasiId: f.lokasiId || null,
      };
      if (eksemplar) await library.ubahEksemplar(eksemplar.id, isian);
      else await library.catatEksemplar({ bukuId: buku.id, kategoriId, ...isian });
      router.push(`/buku?id=${buku.id}`);
    } catch (err) {
      tangani(err);
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <form onSubmit={simpan} noValidate className="flex flex-col gap-5 p-5">
      {!eksemplar && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Kategori</legend>
          <div className="flex flex-wrap gap-2">
            {kategori?.map((k) => (
              <label
                key={k.id}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-input bg-white px-3 py-2 text-[13px] font-medium has-[:checked]:border-forest has-[:checked]:bg-forest has-[:checked]:text-paper has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-forest-link"
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
          {di("kategoriId") && (
            <p role="alert" className="mt-2 text-sm text-bahaya">
              {di("kategoriId")}
            </p>
          )}
        </fieldset>
      )}

      <Field id="tanggalMasuk" label="Tanggal masuk" galat={di("tanggalMasuk")} petunjuk="Boleh dikosongkan">
        <input
          id="tanggalMasuk"
          type="date"
          className={inputCls}
          value={f.tanggalMasuk}
          onChange={(e) => setF((s) => ({ ...s, tanggalMasuk: e.target.value }))}
          aria-invalid={!!di("tanggalMasuk")}
        />
      </Field>
      <Field id="asal" label="Asal" galat={di("asal")}>
        <Pilihan
          id="asal"
          nilai={f.asal}
          onChange={(v) => setF((s) => ({ ...s, asal: v }))}
          pilihan={ASAL.map((a) => ({ nilai: a, label: LABEL_ASAL[a] }))}
        />
      </Field>
      <Field id="harga" label="Harga (Rp)" galat={di("harga")}>
        <input
          id="harga"
          inputMode="numeric"
          className={inputCls}
          value={f.harga}
          onChange={(e) => setF((s) => ({ ...s, harga: e.target.value }))}
          aria-invalid={!!di("harga")}
        />
      </Field>
      <Field id="kondisi" label="Kondisi" galat={di("kondisi")}>
        <Pilihan
          id="kondisi"
          nilai={f.kondisi}
          onChange={(v) => setF((s) => ({ ...s, kondisi: v }))}
          pilihan={KONDISI.map((k) => ({ nilai: k, label: LABEL_KONDISI[k] }))}
        />
      </Field>
      <Field
        id="lokasi"
        label="Lokasi"
        galat={di("lokasiId")}
        petunjuk={daftar && daftar.lokasi.length === 0 ? "Belum ada Lokasi. Tambahkan di Lainnya, saat online" : undefined}
      >
        <Pilihan
          id="lokasi"
          nilai={f.lokasiId}
          onChange={(v) => setF((s) => ({ ...s, lokasiId: v }))}
          pilihan={(daftar?.lokasi ?? []).map((l) => ({ nilai: l.id, label: l.nama }))}
          kosong="Belum diisi"
        />
      </Field>

      <button type="submit" disabled={!library || menyimpan} className={tombolUtamaCls}>
        {menyimpan ? "Menyimpan…" : eksemplar ? "Simpan" : "Tambah eksemplar"}
      </button>
    </form>
  );
}

/** Koreksi Kategori: Nomor Panggil ikut berubah, Nomor Induk tetap (ADR 0001). */
function KoreksiKategori({ buku, eksemplar }: { buku: DetailBuku; eksemplar: EksemplarDetail }) {
  const { library, kategori } = useLibrary();
  const [pilih, setPilih] = useState<string>("");
  const [selesai, setSelesai] = useState<string | null>(null);
  const { di, setGalat, tangani } = useGalat();

  const baru = kategori?.find((k) => k.id === pilih);
  const nomorPanggilBaru =
    baru &&
    hitungNomorPanggil({
      kodeKategori: baru.kode,
      pengarangUtama: buku.pengarangUtama?.nama ?? "",
      judul: buku.judul,
    }).teks;

  async function terapkan() {
    if (!library || !baru) return;
    setGalat(null);
    try {
      await library.koreksiKategori(eksemplar.id, baru.id);
      setSelesai(`Kategori diubah. Nomor Panggil sekarang ${nomorPanggilBaru}. Nomor Induk tetap.`);
      setPilih("");
    } catch (err) {
      tangani(err);
    }
  }

  return (
    <section className="mx-5 mb-5 rounded-2xl bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,.08)]">
      <h2 className="font-heading text-lg font-semibold">Koreksi Kategori</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Kategori saat ini: {eksemplar.kategori.nama}. Nomor Panggil{" "}
        <span className="font-mono">{eksemplar.nomorPanggil.teks}</span>.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {kategori
          ?.filter((k) => k.id !== eksemplar.kategori.id)
          .map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => {
                setPilih(k.id);
                setSelesai(null);
              }}
              aria-pressed={pilih === k.id}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-input bg-white px-3 py-2 text-[13px] font-medium",
                pilih === k.id && "border-forest bg-forest text-paper",
              )}
            >
              <span className="size-3 rounded-full" style={{ background: k.warna }} aria-hidden />
              <span className="font-mono text-xs">{k.kode}</span> {k.nama}
            </button>
          ))}
      </div>
      {baru && (
        <div role="alertdialog" aria-label="Konfirmasi koreksi Kategori" className="mt-4 rounded-xl bg-paper p-3 text-sm">
          <p>
            Nomor Panggil berubah menjadi <span className="font-mono font-semibold">{nomorPanggilBaru}</span>.{" "}
            {eksemplar.nomorInduk ? (
              <>
                Nomor Induk <span className="font-mono">{eksemplar.nomorInduk}</span> tetap.
              </>
            ) : (
              "Nomor Induk akan diberikan saat tersinkron dan tidak ikut berubah."
            )}{" "}
            Label perlu dicetak ulang.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={terapkan} className="h-11 flex-1 rounded-2xl bg-forest text-sm font-semibold text-paper">
              Ubah Kategori
            </button>
            <button type="button" onClick={() => setPilih("")} className={tombolSekunderCls}>
              Batal
            </button>
          </div>
        </div>
      )}
      {di("kategoriId") && (
        <p role="alert" className="mt-2 text-sm text-bahaya">
          {di("kategoriId")}
        </p>
      )}
      {selesai && (
        <p role="status" className="mt-3 text-sm font-medium text-sukses-fg">
          {selesai}
        </p>
      )}
    </section>
  );
}

function Isi() {
  const params = useSearchParams();
  const bukuId = params.get("buku");
  const eksemplarId = params.get("id");
  const buku = useDetailBuku(bukuId);
  const eksemplar = eksemplarId ? (buku?.eksemplar.find((e) => e.id === eksemplarId) ?? null) : null;

  return (
    <>
      <PageHeader
        judul={eksemplarId ? "Ubah Eksemplar" : "Tambah eksemplar"}
        keterangan={buku ? buku.judul : "Tersimpan di perangkat, dikirim saat online"}
      />
      <Link
        href={bukuId ? `/buku?id=${bukuId}` : "/koleksi"}
        className="inline-flex items-center gap-1 px-5 pt-4 text-sm font-medium text-forest-link"
      >
        <ArrowLeft className="size-4" aria-hidden /> Detail Buku
      </Link>
      {buku === undefined && <p className="p-5 text-sm text-ink-muted">Memuat…</p>}
      {buku === null && <p className="p-5 text-sm">Buku tidak ditemukan di perangkat ini.</p>}
      {buku && eksemplarId && !eksemplar && <p className="p-5 text-sm">Eksemplar tidak ditemukan.</p>}
      {buku && (!eksemplarId || eksemplar) && (
        <>
          {eksemplar && (
            <p className="px-5 pt-4 text-sm text-ink-muted">
              Nomor Induk <span className="font-mono font-semibold text-ink">{eksemplar.nomorIndukTampil}</span>
            </p>
          )}
          <FormEksemplar key={eksemplarId ?? "baru"} buku={buku} eksemplar={eksemplar} />
          {eksemplar && <KoreksiKategori buku={buku} eksemplar={eksemplar} />}
          {eksemplar && <Penyiangan eksemplar={eksemplar} />}
        </>
      )}
    </>
  );
}

export default function EksemplarPage() {
  return (
    <Suspense fallback={<p className="p-5 text-sm text-ink-muted">Memuat…</p>}>
      <Isi />
    </Suspense>
  );
}
