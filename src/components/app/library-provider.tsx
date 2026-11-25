"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  createLocalLibrary,
  type DaftarLokal,
  type DaftarAntrean,
  type DaftarPeminjaman,
  type ItemPeminjam,
  tanggalLokal,
  type ItemKoleksi,
  type JumlahAntreanCetak,
  type KategoriRow,
  type LocalLibrary,
  type LogRow,
  type PemberitahuanDitimpa,
  type StatusSinkronisasi,
} from "@/lib/local-library";
import { adaKeluarTertunda, bersihkanKeluarTertunda } from "@/lib/keluar-hapus-data";
import { keluarAkun } from "@/lib/auth-client";
import { cariMetadataIsbn } from "@/lib/sync/fetch-metadata";
import { simpanCangkangOffline } from "@/lib/sw/simpan-cangkang";
import { fetchKelolaTransport } from "@/lib/sync/fetch-kelola-transport";
import { fetchPenyianganTransport } from "@/lib/sync/fetch-penyiangan-transport";
import { fetchTransport } from "@/lib/sync/fetch-transport";
import { buatPenjadwal, type KeadaanSinkron } from "@/lib/sync/penjadwal";
import { Toaster, type PesanToast } from "./toaster";

const TOAST_MS = 7_000;
/** Draf scan "menunggu data": dicoba lagi sesering ini selama masih ada. */
const PERIODE_DRAF_MS = 30_000;

type Ctx = {
  library: LocalLibrary | null;
  koleksi: ItemKoleksi[] | undefined;
  /** Semua Eksemplar termasuk yang keluar; disaring layar Koleksi dengan `saringKoleksi`. */
  koleksiSemua: ItemKoleksi[] | undefined;
  /** Penyiangan; hanya berhasil saat online (ADR 0004). */
  penyiangan: ReturnType<LocalLibrary["penyiangan"]> | null;
  status: StatusSinkronisasi | undefined;
  /** Pilihan Kategori (tanpa yang diarsipkan). */
  kategori: KategoriRow[] | undefined;
  /** Salinan lokal Kategori (termasuk arsip), Lokasi, dan Aturan Kategori. */
  daftar: DaftarLokal | undefined;
  /** Antrean Cetak: `siapDicetak` = "Label siap dicetak". */
  jumlahCetak: JumlahAntreanCetak | undefined;
  /** Jumlah draf scan yang menunggu metadata (dilengkapi otomatis saat online). */
  jumlahDrafMenunggu: number;
  /** Peminjaman aktif, terlambat, riwayat; terlambat dihitung ulang saat tanggal berganti. */
  peminjaman: DaftarPeminjaman | undefined;
  /** Jumlah Peminjaman terlambat: badge di nav, chip di Beranda. */
  jumlahTerlambat: number | undefined;
  /** Peminjam yang tersalin di perangkat ("Pilih Peminjam lama"). */
  peminjam: ItemPeminjam[] | undefined;
  /** Perintah kelola; hanya berhasil saat online (ADR 0004). */
  kelola: ReturnType<LocalLibrary["kelola"]> | null;
  keadaan: KeadaanSinkron;
  online: boolean;
  /** Perubahan menunggu dikirim dan yang Gagal terkirim (halaman Sinkronisasi). */
  antrean: DaftarAntrean | undefined;
  /** Log "Perubahan dari perangkat lain", terbaru dulu. */
  log: LogRow[] | undefined;
  /** Sinkron sekarang, mengabaikan backoff. */
  sinkronkan: () => void;
  /** Kirim ulang perubahan yang Gagal terkirim (satu, atau semuanya). */
  cobaLagi: (id?: string) => void;
};

const LibraryContext = createContext<Ctx | null>(null);

let singleton: LocalLibrary | null = null;
function getLibrary() {
  if (typeof indexedDB === "undefined") return null;
  singleton ??= createLocalLibrary();
  return singleton;
}

const noopSubscribe = () => () => {};

function langgananOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Status koneksi menurut browser; benar saat browser dimulai offline (tanpa kedip "online"). */
function useOnline() {
  return useSyncExternalStore(
    langgananOnline,
    () => navigator.onLine,
    () => true,
  );
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const library = useSyncExternalStore(noopSubscribe, getLibrary, () => null);
  const [koleksiSemua, setKoleksiSemua] = useState<ItemKoleksi[]>();
  const [status, setStatus] = useState<StatusSinkronisasi>();
  const [daftar, setDaftar] = useState<DaftarLokal>();
  const [jumlahCetak, setJumlahCetak] = useState<JumlahAntreanCetak>();
  const [keadaan, setKeadaan] = useState<KeadaanSinkron>({ jenis: "diam" });
  const online = useOnline();
  const [jumlahDrafMenunggu, setJumlahDrafMenunggu] = useState(0);
  const [antrean, setAntrean] = useState<DaftarAntrean>();
  const [log, setLog] = useState<LogRow[]>();
  const [peminjaman, setPeminjaman] = useState<DaftarPeminjaman>();
  const [jumlahTerlambat, setJumlahTerlambat] = useState<number>();
  const [peminjam, setPeminjam] = useState<ItemPeminjam[]>();
  // Berganti saat tanggal perangkat berganti: pembaca terlambat dipasang ulang (tanggal bukan data di Dexie).
  const [hari, setHari] = useState(() => tanggalLokal(new Date()));
  const [toasts, setToasts] = useState<PemberitahuanDitimpa[]>([]);
  const [infoToasts, setInfoToasts] = useState<PesanToast[]>([]);
  const penjadwal = useRef<ReturnType<typeof buatPenjadwal> | null>(null);

  useEffect(() => {
    const periksa = () => setHari(tanggalLokal(new Date()));
    const timer = setInterval(periksa, 60_000);
    document.addEventListener("visibilitychange", periksa);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", periksa);
    };
  }, []);

  useEffect(() => {
    if (!library) return;
    const berhenti = [
      library.pantauPeminjaman(setPeminjaman),
      library.pantauJumlahTerlambat(setJumlahTerlambat),
      library.pantauPeminjam(setPeminjam),
    ];
    return () => berhenti.forEach((f) => f());
  }, [library, hari]);

  const tutupToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    setInfoToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  useEffect(() => {
    const lib = library;
    if (!lib) return;
    const berhenti = [
      lib.pantauKoleksiSemua(setKoleksiSemua),
      lib.pantauStatus(setStatus),
      lib.pantauDaftar(setDaftar),
      lib.pantauAntrean(setAntrean),
      lib.pantauLog(setLog),
      lib.pantauJumlahAntreanCetak(setJumlahCetak),
      lib.pantauJumlahDrafMenunggu(setJumlahDrafMenunggu),
    ];
    const timerToast = new Set<ReturnType<typeof setTimeout>>();
    const p = buatPenjadwal({
      library: lib,
      transport: fetchTransport,
      onKeadaan: setKeadaan,
      onDikirim: (jumlah) => {
        const id = crypto.randomUUID();
        setInfoToasts((t) => [...t, { id, teks: `${jumlah} perubahan terkirim` }]);
        const timer = setTimeout(() => {
          timerToast.delete(timer);
          tutupToast(id);
        }, TOAST_MS);
        timerToast.add(timer);
      },
      onDitimpa: (daftar) => {
        setToasts((t) => [...t, ...daftar]);
        for (const n of daftar) {
          const timer = setTimeout(() => {
            timerToast.delete(timer);
            tutupToast(n.id);
          }, TOAST_MS);
          timerToast.add(timer);
        }
      },
    });
    penjadwal.current = p;

    void p.mulai(); // saat aplikasi dibuka; juga memasang event `online` dan pemicu berkala
    return () => {
      berhenti.forEach((f) => f());
      p.berhenti();
      timerToast.forEach(clearTimeout);
    };
  }, [library, tutupToast]);

  // Online (dibuka online, atau koneksi pulih): simpan cangkang aplikasi untuk offline, dan
  // selesaikan "Keluar & hapus data" yang tertunda karena tadi offline.
  useEffect(() => {
    if (!online) return;
    void simpanCangkangOffline();
    if (adaKeluarTertunda()) {
      void keluarAkun()
        .then(() => {
          bersihkanKeluarTertunda();
          window.location.replace("/login");
        })
        .catch(() => {});
    }
  }, [online]);

  // Draf scan "menunggu data": dilengkapi lewat Pencarian Metadata begitu online, dan dicoba berkala
  // selama masih ada yang menunggu.
  useEffect(() => {
    if (!library || !online || jumlahDrafMenunggu === 0) return;
    const jalan = () => void library.lengkapiDrafMenunggu(cariMetadataIsbn);
    jalan();
    const timer = setInterval(jalan, PERIODE_DRAF_MS);
    return () => clearInterval(timer);
  }, [library, online, jumlahDrafMenunggu]);

  // Ada perubahan baru di outbox: kirim begitu online.
  const menunggu = status?.menunggu ?? 0;
  useEffect(() => {
    if (menunggu > 0) void penjadwal.current?.picu();
  }, [menunggu]);

  const kategori = useMemo(() => daftar?.kategori.filter((k) => !k.diarsipkan), [daftar]);
  const kelola = useMemo(() => library?.kelola(fetchKelolaTransport) ?? null, [library]);

  const penyiangan = useMemo(() => library?.penyiangan(fetchPenyianganTransport) ?? null, [library]);
  const koleksi = useMemo(() => koleksiSemua?.filter((k) => k.status === "aktif"), [koleksiSemua]);

  const sinkronkan = useCallback(() => void penjadwal.current?.picu({ paksa: true }), []);
  const cobaLagi = useCallback(
    (id?: string) => {
      if (!library) return;
      void library.cobaLagi(id).then(() => penjadwal.current?.picu({ paksa: true }));
    },
    [library],
  );

  const value = useMemo(
    () => ({
      library, koleksi, koleksiSemua, penyiangan, status, kategori, daftar, jumlahCetak, jumlahDrafMenunggu, kelola, keadaan, online, antrean, log,
      sinkronkan, cobaLagi, peminjaman, jumlahTerlambat, peminjam,
    }),
    [
      library, koleksi, koleksiSemua, penyiangan, status, kategori, daftar, jumlahCetak, jumlahDrafMenunggu, kelola, keadaan, online, antrean, log,
      sinkronkan, cobaLagi, peminjaman, jumlahTerlambat, peminjam,
    ],
  );
  return (
    <LibraryContext.Provider value={value}>
      {children}
      <Toaster daftar={toasts} info={infoToasts} onTutup={tutupToast} />
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary harus di dalam LibraryProvider");
  return ctx;
}
