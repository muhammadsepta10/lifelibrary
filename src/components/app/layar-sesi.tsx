"use client";

import { Camera, CameraOff, Loader2, Pencil, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DrafBuku } from "@/lib/draf-buku";
import { urlSampul } from "@/lib/draf-buku";
import {
  ValidasiError,
  type DataSesi,
  type HasilPindai,
  type KartuScan,
  type LokasiRow,
  type SesiPenerimaan,
} from "@/lib/local-library";
import { umpanBalikScan } from "@/lib/umpan-balik-scan";
import { cn } from "@/lib/utils";
import { DrafBukuForm } from "./draf-buku-form";
import { FormSesi, ringkasSesi } from "./form-sesi";
import { tombolSekunderCls, tombolUtamaCls } from "./form";
import { useLibrary } from "./library-provider";
import { KameraScanner } from "./kamera-scanner";
import { KotakPindai, useKotakPindai } from "./kotak-pindai";
import { PilihKategori } from "./pilih-kategori";

type Lembar =
  | { jenis: "tinjau"; kartuId: string }
  | { jenis: "duplikat"; hasil: Extract<HasilPindai, { jenis: "duplikat" }> }
  | { jenis: "sesi" };

type Pesan = { teks: string; galat: boolean };
type KeadaanKamera = "memulai" | "aktif" | "galat" | "mati";

const PESAN_MS = 5000;
const KILAT_MS = 300;

/**
 * Layar penuh Sesi Penerimaan (variant B): kamera menyala terus, hasil scan
 * menumpuk sebagai kartu di atasnya. Semua yang butuh layar lain (tinjau draf,
 * "Tambah eksemplar baru?", ubah data sesi) muncul sebagai lembar di dalam
 * halaman ini. Tidak ada navigasi rute selama kamera menyala: aliran kamera
 * iOS mode standalone bisa mati bila rute berpindah.
 */
export function LayarSesi({
  sesi,
  lokasi,
  onSelesai,
}: {
  sesi: SesiPenerimaan;
  lokasi: LokasiRow[] | undefined;
  /** Dipanggil setelah kamera dimatikan; induk boleh berpindah halaman. */
  onSelesai: () => void;
}) {
  const { kategori } = useLibrary();
  const [kartu, setKartu] = useState<KartuScan[]>([]);
  const [data, setData] = useState<DataSesi>(() => sesi.data());
  const [kameraDiinginkan, setKameraDiinginkan] = useState(true);
  const [kamera, setKamera] = useState<KeadaanKamera>("memulai");
  const [pesanKamera, setPesanKamera] = useState<string | null>(null);
  const [lembar, setLembar] = useState<Lembar | null>(null);
  const [pesan, setPesan] = useState<Pesan | null>(null);
  const [kilat, setKilat] = useState(false);
  const [isbn, setIsbn] = useState("");
  const [galatSimpan, setGalatSimpan] = useState<{ field: string; pesan: string } | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [kategoriEksemplar, setKategoriEksemplar] = useState("");
  const timerPesan = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const timerKilat = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { keadaan: keadaanKotak, terbaca: kotakTerbaca, berhasil: kotakBerhasil, ditolak: kotakDitolak } = useKotakPindai(kameraDiinginkan && kamera === "aktif" && lembar === null);

  useEffect(() => sesi.pantau(setKartu), [sesi]);
  useEffect(
    () => () => {
      clearTimeout(timerPesan.current);
      clearTimeout(timerKilat.current);
    },
    [],
  );

  const tampilkanPesan = useCallback((teks: string, galat = false) => {
    clearTimeout(timerPesan.current);
    setPesan({ teks, galat });
    timerPesan.current = setTimeout(() => setPesan(null), PESAN_MS);
  }, []);

  const kilatkan = useCallback(() => {
    clearTimeout(timerKilat.current);
    setKilat(true);
    timerKilat.current = setTimeout(() => setKilat(false), KILAT_MS);
  }, []);

  /** Satu jalur untuk bacaan kamera dan isian ISBN (scanner USB = ketikan + Enter). */
  const tangani = useCallback(
    async (kode: string, dariKamera: boolean) => {
      if (dariKamera) kotakTerbaca();
      const hasil = await sesi.pindai(kode);
      if (dariKamera && hasil.jenis !== "diabaikan") {
        if (hasil.jenis === "ditolak" || hasil.jenis === "sudahDiDaftar") kotakDitolak();
        else kotakBerhasil();
      }
      switch (hasil.jenis) {
        case "diabaikan":
          return;
        case "ditolak":
          umpanBalikScan("tolak");
          tampilkanPesan(hasil.pesan, true);
          return;
        case "sudahDiDaftar":
          umpanBalikScan("tolak");
          tampilkanPesan("ISBN ini sudah ada di daftar sesi. Ketuk kartunya untuk meninjau.", true);
          return;
        case "duplikat":
          umpanBalikScan("berhasil");
          kilatkan();
          setKategoriEksemplar(hasil.buku.kategoriId ?? "");
          setGalatSimpan(null);
          setLembar({ jenis: "duplikat", hasil });
          return;
        case "kartu":
          umpanBalikScan("berhasil");
          if (dariKamera) kilatkan();
          setIsbn("");
          return;
      }
    },
    [sesi, tampilkanPesan, kilatkan, kotakTerbaca, kotakBerhasil, kotakDitolak],
  );

  function kirimIsbn(e: React.FormEvent) {
    e.preventDefault();
    void tangani(isbn, false);
  }

  function isiManual() {
    const { kartuId } = sesi.isiManual();
    setGalatSimpan(null);
    setLembar({ jenis: "tinjau", kartuId });
  }

  async function simpanDraf(kartuId: string, draf: DrafBuku, kategoriId: string) {
    setGalatSimpan(null);
    setMenyimpan(true);
    try {
      await sesi.simpan(kartuId, draf, kategoriId);
      setLembar(null);
    } catch (err) {
      if (err instanceof ValidasiError) setGalatSimpan({ field: err.field, pesan: err.pesan });
      else throw err;
    } finally {
      setMenyimpan(false);
    }
  }

  async function tambahEksemplar(hasil: Extract<HasilPindai, { jenis: "duplikat" }>) {
    setGalatSimpan(null);
    setMenyimpan(true);
    try {
      await sesi.tambahEksemplar(hasil, kategoriEksemplar);
      setLembar(null);
    } catch (err) {
      if (err instanceof ValidasiError) setGalatSimpan({ field: err.field, pesan: err.pesan });
      else throw err;
    } finally {
      setMenyimpan(false);
    }
  }

  const kartuTinjau = lembar?.jenis === "tinjau" ? kartu.find((k) => k.id === lembar.kartuId) : undefined;
  const terbuka = lembar !== null;
  const kartuTerbaruDulu = [...kartu].reverse();

  return (
    <div
      role="dialog"
      aria-label="Sesi Penerimaan"
      data-testid="layar-sesi"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black text-white"
    >
      {kameraDiinginkan && (
        <KameraScanner
          jeda={terbuka}
          onBaca={(teks) => void tangani(teks, true)}
          onKeadaan={(k) => {
            setKamera(k.jenis);
            setPesanKamera(k.jenis === "galat" ? k.pesan : null);
          }}
        />
      )}

      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0 bg-white/40 opacity-0 transition-opacity duration-300", kilat && "opacity-100")}
      />

      <header className="relative z-10 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => setLembar({ jenis: "sesi" })}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-black/50 px-4 text-left text-sm font-medium"
          aria-label="Ubah data sesi"
        >
          <span className="truncate" data-testid="ringkasan-sesi">
            {ringkasSesi(data, lokasi)}
          </span>
          <Pencil className="size-4 shrink-0" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setKameraDiinginkan((v) => !v)}
          className="flex size-11 items-center justify-center rounded-full bg-black/50"
          aria-label={kameraDiinginkan ? "Matikan kamera" : "Nyalakan kamera"}
        >
          {kameraDiinginkan ? <Camera className="size-5" aria-hidden /> : <CameraOff className="size-5" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => {
            // Matikan kamera lebih dulu, baru induk boleh berpindah halaman.
            setKameraDiinginkan(false);
            setTimeout(onSelesai, 0);
          }}
          className="min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-white"
        >
          Selesai
        </button>
      </header>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        {kameraDiinginkan && kamera !== "galat" && (
          <KotakPindai
            keadaan={keadaanKotak}
            memulai={kamera === "memulai"}
            arahan="Arahkan barcode ISBN ke dalam kotak"
            saranBelumTerbaca="Barcode belum terbaca. Jauhkan HP sedikit, hindari pantulan cahaya, atau ketik ISBN di bawah."
          />
        )}
        {kameraDiinginkan && pesanKamera && (
          <p role="status" className="max-w-sm rounded-2xl bg-black/70 p-4 text-center text-sm">
            {pesanKamera}
          </p>
        )}
        {!kameraDiinginkan && (
          <p className="max-w-sm rounded-2xl bg-black/60 p-4 text-center text-sm">
            Kamera mati. Ketik ISBN atau pakai scanner USB di bawah, atau nyalakan kamera lagi.
          </p>
        )}
      </div>

      <div className="relative z-10 flex max-h-[62%] flex-col gap-2 bg-gradient-to-t from-black/85 via-black/70 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
        {pesan && (
          <p
            role="alert"
            className={cn("rounded-2xl px-4 py-3 text-sm font-medium", pesan.galat ? "bg-bahaya text-white" : "bg-white text-ink")}
          >
            {pesan.teks}
          </p>
        )}

        {kartuTerbaruDulu.length > 0 && (
          <ul aria-label="Hasil scan" className="flex flex-col gap-2 overflow-y-auto">
            {kartuTerbaruDulu.map((k) => (
              <KartuHasil
                key={k.id}
                kartu={k}
                onTinjau={() => {
                  setGalatSimpan(null);
                  setLembar({ jenis: "tinjau", kartuId: k.id });
                }}
                onBuang={() => sesi.buang(k.id)}
              />
            ))}
          </ul>
        )}

        <form onSubmit={kirimIsbn} className="flex gap-2" noValidate>
          <label htmlFor="isbn-sesi" className="sr-only">
            ISBN
          </label>
          <input
            id="isbn-sesi"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            inputMode="text"
            autoComplete="off"
            placeholder="Ketik ISBN lalu Enter"
            className="h-12 min-w-0 flex-1 rounded-2xl border-0 bg-white px-4 text-base text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
          <button
            type="submit"
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-forest text-paper"
            aria-label="Cari ISBN"
          >
            <Search className="size-5" aria-hidden />
          </button>
        </form>
        <button type="button" onClick={isiManual} className="min-h-11 rounded-2xl bg-white/15 text-sm font-semibold">
          Tanpa ISBN? Isi manual
        </button>
      </div>

      {lembar && (
        <div role="dialog" aria-modal="true" aria-label={judulLembar(lembar)} className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-paper text-ink">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-forest px-5 py-3 text-paper">
            <h2 className="font-heading text-lg font-bold">{judulLembar(lembar)}</h2>
            <button
              type="button"
              onClick={() => setLembar(null)}
              className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-semibold"
            >
              <X className="size-4" aria-hidden /> Kembali ke kamera
            </button>
          </div>

          {lembar.jenis === "sesi" && (
            <div className="p-5">
              <FormSesi
                awal={data}
                lokasi={lokasi}
                labelTombol="Terapkan ke Eksemplar berikutnya"
                onSimpan={async (d) => {
                  await sesi.ubah(d);
                  setData(sesi.data());
                  setLembar(null);
                }}
              />
              <p className="mt-3 text-xs text-ink-muted">Eksemplar yang sudah tersimpan tidak ikut berubah.</p>
            </div>
          )}

          {lembar.jenis === "tinjau" && kartuTinjau?.draf && kartuTinjau.status !== "tersimpan" && (
            <>
              {kartuTinjau.catatan && (
                <div role="status" className="mx-5 mt-5 rounded-2xl bg-white p-4 text-sm">
                  <p>{kartuTinjau.catatan}</p>
                  {kartuTinjau.bisaCobaLagi && (
                    <button
                      type="button"
                      className={`${tombolSekunderCls} mt-3`}
                      onClick={() => {
                        setLembar(null);
                        void sesi.cobaLagi(kartuTinjau.id);
                      }}
                    >
                      Coba lagi
                    </button>
                  )}
                </div>
              )}
              <DrafBukuForm
                key={`${kartuTinjau.id}-${kartuTinjau.draf.judul}-${kartuTinjau.sumber.map((s) => s.status).join()}`}
                draf={kartuTinjau.draf}
                statusSumber={kartuTinjau.sumber}
                onSimpan={(d, kategoriId) => void simpanDraf(kartuTinjau.id, d, kategoriId)}
                menyimpan={menyimpan}
                galat={galatSimpan}
              />
              <div className="px-5 pb-8">
                <button
                  type="button"
                  className={tombolSekunderCls}
                  onClick={() => {
                    sesi.buang(kartuTinjau.id);
                    setLembar(null);
                  }}
                >
                  Buang kartu ini
                </button>
              </div>
            </>
          )}

          {lembar.jenis === "duplikat" && (
            <div className="flex flex-col gap-4 p-5">
              <div role="alertdialog" aria-labelledby="judul-duplikat" className="rounded-2xl bg-white p-4">
                <h3 id="judul-duplikat" className="text-lg font-semibold">
                  Tambah eksemplar baru?
                </h3>
                <p className="mt-2 text-sm">
                  ISBN {lembar.hasil.isbn13} sudah ada di koleksi: <strong>{lembar.hasil.buku.judul}</strong>
                  {lembar.hasil.buku.pengarang && <> karya {lembar.hasil.buku.pengarang}</>} (
                  {lembar.hasil.buku.jumlahEksemplar} Eksemplar).
                </p>
              </div>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">Kategori Eksemplar baru</legend>
                <PilihKategori nama="kategori-eksemplar-sesi" kategori={kategori} nilai={kategoriEksemplar} onPilih={setKategoriEksemplar} />
                {galatSimpan?.field === "kategoriId" && (
                  <p role="alert" className="mt-2 text-sm text-bahaya">
                    {galatSimpan.pesan}
                  </p>
                )}
              </fieldset>
              <button
                type="button"
                className={tombolUtamaCls}
                disabled={menyimpan || !kategoriEksemplar}
                onClick={() => void tambahEksemplar(lembar.hasil)}
              >
                {menyimpan ? "Menyimpan…" : "Ya, tambah Eksemplar"}
              </button>
              <button type="button" className={tombolSekunderCls} onClick={() => setLembar(null)}>
                Batal
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function judulLembar(l: Lembar) {
  return l.jenis === "tinjau" ? "Tinjau draf Buku" : l.jenis === "duplikat" ? "ISBN sudah ada" : "Data sesi";
}

function KartuHasil({ kartu, onTinjau, onBuang }: { kartu: KartuScan; onTinjau: () => void; onBuang: () => void }) {
  const judul = kartu.judul || (kartu.status === "mencari" ? `ISBN ${kartu.isbn13}` : kartu.isbn13 ? `ISBN ${kartu.isbn13}` : "Buku tanpa ISBN");
  const bisaDiketuk = kartu.status === "siap";
  const isi = (
    <>
      <span className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-ink/10">
        {kartu.draf?.sampul && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlSampul(kartu.draf.sampul)} alt="" className="size-full object-cover" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{judul}</span>
        <span className="block truncate text-xs text-ink-muted">
          {kartu.pengarang ||
            (kartu.status === "menunggu-data"
              ? "Metadata dicari otomatis saat online"
              : kartu.status === "siap" && !kartu.judul
                ? "Data belum ada, isi manual"
                : "")}
          {kartu.isbn13 && kartu.judul ? ` · ${kartu.isbn13}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 text-xs font-semibold">
        <span
          data-testid="status-kartu"
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-1",
            kartu.status === "tersimpan" ? "bg-sukses text-sukses-fg" : "bg-menunggu text-menunggu-fg",
          )}
        >
          {kartu.status === "mencari" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {kartu.label}
        </span>
        {kartu.status === "tersimpan" && (
          <span data-testid="nomor-induk-kartu" className="font-mono text-[11px] text-ink">
            {kartu.nomorIndukTampil}
          </span>
        )}
      </span>
    </>
  );

  return (
    <li className="flex items-center gap-2 rounded-2xl bg-white/95 text-ink shadow-lg" data-status={kartu.status}>
      {bisaDiketuk ? (
        <button type="button" onClick={onTinjau} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 p-2 text-left" aria-label={`Tinjau draf ${judul}`}>
          {isi}
        </button>
      ) : (
        <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 p-2">{isi}</div>
      )}
      {kartu.status !== "tersimpan" && (
        <button type="button" onClick={onBuang} aria-label={`Buang kartu ${judul}`} className="flex size-11 shrink-0 items-center justify-center text-ink-muted">
          <X className="size-4" aria-hidden />
        </button>
      )}
    </li>
  );
}
