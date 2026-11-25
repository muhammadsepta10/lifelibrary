"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  createLocalLibrary,
  type DaftarLokal,
  type ItemKoleksi,
  type JumlahAntreanCetak,
  type KategoriRow,
  type LocalLibrary,
  type StatusSinkronisasi,
} from "@/lib/local-library";
import { fetchKelolaTransport } from "@/lib/sync/fetch-kelola-transport";
import { fetchTransport } from "@/lib/sync/fetch-transport";
import { buatPenjadwal, type KeadaanSinkron } from "@/lib/sync/penjadwal";

type Ctx = {
  library: LocalLibrary | null;
  koleksi: ItemKoleksi[] | undefined;
  status: StatusSinkronisasi | undefined;
  /** Pilihan Kategori (tanpa yang diarsipkan). */
  kategori: KategoriRow[] | undefined;
  /** Salinan lokal Kategori (termasuk arsip), Lokasi, dan Aturan Kategori. */
  daftar: DaftarLokal | undefined;
  /** Antrean Cetak: `siapDicetak` = "Label siap dicetak". */
  jumlahCetak: JumlahAntreanCetak | undefined;
  /** Perintah kelola; hanya berhasil saat online (ADR 0004). */
  kelola: ReturnType<LocalLibrary["kelola"]> | null;
  keadaan: KeadaanSinkron;
  online: boolean;
  sinkronkan: () => void;
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
  const [jumlahCetak, setJumlahCetak] = useState<JumlahAntreanCetak>();
  const [keadaan, setKeadaan] = useState<KeadaanSinkron>({ jenis: "diam" });
  const [online, setOnline] = useState(true);
  const penjadwal = useRef<ReturnType<typeof buatPenjadwal> | null>(null);

  useEffect(() => {
    const lib = library;
    if (!lib) return;
    const berhenti = [
      lib.pantauKoleksi(setKoleksi),
      lib.pantauStatus(setStatus),
      lib.pantauDaftar(setDaftar),
      lib.pantauJumlahAntreanCetak(setJumlahCetak),
    ];
    penjadwal.current = buatPenjadwal({ library: lib, transport: fetchTransport, onKeadaan: setKeadaan });

    const picu = () => void penjadwal.current?.picu();
    const perbaruiOnline = () => setOnline(navigator.onLine);
    perbaruiOnline();
    const onOnline = () => {
      perbaruiOnline();
      picu();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", perbaruiOnline);
    picu(); // saat aplikasi dibuka
    return () => {
      berhenti.forEach((f) => f());
      penjadwal.current?.berhenti();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", perbaruiOnline);
    };
  }, [library]);

  // Ada perubahan baru di outbox: kirim begitu online.
  const menunggu = status?.menunggu ?? 0;
  useEffect(() => {
    if (menunggu > 0) void penjadwal.current?.picu();
  }, [menunggu]);

  const kategori = useMemo(() => daftar?.kategori.filter((k) => !k.diarsipkan), [daftar]);
  const kelola = useMemo(() => library?.kelola(fetchKelolaTransport) ?? null, [library]);

  const sinkronkan = useCallback(() => void penjadwal.current?.picu(), []);

  const value = useMemo(
    () => ({ library, koleksi, status, kategori, daftar, jumlahCetak, kelola, keadaan, online, sinkronkan }),
    [library, koleksi, status, kategori, daftar, jumlahCetak, kelola, keadaan, online, sinkronkan],
  );
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary harus di dalam LibraryProvider");
  return ctx;
}
