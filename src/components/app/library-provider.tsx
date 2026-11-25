"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  createLocalLibrary,
  type DaftarLokal,
  type DaftarAntrean,
  type ItemKoleksi,
  type KategoriRow,
  type LocalLibrary,
  type LogRow,
  type PemberitahuanDitimpa,
  type StatusSinkronisasi,
} from "@/lib/local-library";
import { fetchKelolaTransport } from "@/lib/sync/fetch-kelola-transport";
import { fetchTransport } from "@/lib/sync/fetch-transport";
import { buatPenjadwal, type KeadaanSinkron } from "@/lib/sync/penjadwal";
import { Toaster } from "./toaster";

const TOAST_MS = 7_000;

type Ctx = {
  library: LocalLibrary | null;
  koleksi: ItemKoleksi[] | undefined;
  status: StatusSinkronisasi | undefined;
  /** Pilihan Kategori (tanpa yang diarsipkan). */
  kategori: KategoriRow[] | undefined;
  /** Salinan lokal Kategori (termasuk arsip), Lokasi, dan Aturan Kategori. */
  daftar: DaftarLokal | undefined;
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

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const library = useSyncExternalStore(noopSubscribe, getLibrary, () => null);
  const [koleksi, setKoleksi] = useState<ItemKoleksi[]>();
  const [status, setStatus] = useState<StatusSinkronisasi>();
  const [daftar, setDaftar] = useState<DaftarLokal>();
  const [keadaan, setKeadaan] = useState<KeadaanSinkron>({ jenis: "diam" });
  const [online, setOnline] = useState(true);
  const [antrean, setAntrean] = useState<DaftarAntrean>();
  const [log, setLog] = useState<LogRow[]>();
  const [toasts, setToasts] = useState<PemberitahuanDitimpa[]>([]);
  const penjadwal = useRef<ReturnType<typeof buatPenjadwal> | null>(null);

  const tutupToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  useEffect(() => {
    const lib = library;
    if (!lib) return;
    const berhenti = [
      lib.pantauKoleksi(setKoleksi),
      lib.pantauStatus(setStatus),
      lib.pantauDaftar(setDaftar),
      lib.pantauAntrean(setAntrean),
      lib.pantauLog(setLog),
    ];
    const timerToast = new Set<ReturnType<typeof setTimeout>>();
    const p = buatPenjadwal({
      library: lib,
      transport: fetchTransport,
      onKeadaan: setKeadaan,
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

    const perbaruiOnline = () => setOnline(navigator.onLine);
    perbaruiOnline();
    window.addEventListener("online", perbaruiOnline);
    window.addEventListener("offline", perbaruiOnline);
    void p.mulai(); // saat aplikasi dibuka; juga memasang event `online` dan pemicu berkala
    return () => {
      berhenti.forEach((f) => f());
      p.berhenti();
      timerToast.forEach(clearTimeout);
      window.removeEventListener("online", perbaruiOnline);
      window.removeEventListener("offline", perbaruiOnline);
    };
  }, [library, tutupToast]);

  // Ada perubahan baru di outbox: kirim begitu online.
  const menunggu = status?.menunggu ?? 0;
  useEffect(() => {
    if (menunggu > 0) void penjadwal.current?.picu();
  }, [menunggu]);

  const kategori = useMemo(() => daftar?.kategori.filter((k) => !k.diarsipkan), [daftar]);
  const kelola = useMemo(() => library?.kelola(fetchKelolaTransport) ?? null, [library]);

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
      library, koleksi, status, kategori, daftar, kelola, keadaan, online, antrean, log, sinkronkan, cobaLagi,
    }),
    [library, koleksi, status, kategori, daftar, kelola, keadaan, online, antrean, log, sinkronkan, cobaLagi],
  );
  return (
    <LibraryContext.Provider value={value}>
      {children}
      <Toaster daftar={toasts} onTutup={tutupToast} />
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary harus di dalam LibraryProvider");
  return ctx;
}
