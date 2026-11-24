"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  createLocalLibrary,
  type ItemKoleksi,
  type KategoriRow,
  type LocalLibrary,
  type StatusSinkronisasi,
} from "@/lib/local-library";
import { fetchTransport } from "@/lib/sync/fetch-transport";
import { buatPenjadwal, type KeadaanSinkron } from "@/lib/sync/penjadwal";

type Ctx = {
  library: LocalLibrary | null;
  koleksi: ItemKoleksi[] | undefined;
  status: StatusSinkronisasi | undefined;
  kategori: KategoriRow[] | undefined;
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
  const [kategori, setKategori] = useState<KategoriRow[]>();
  const [keadaan, setKeadaan] = useState<KeadaanSinkron>({ jenis: "diam" });
  const [online, setOnline] = useState(true);
  const penjadwal = useRef<ReturnType<typeof buatPenjadwal> | null>(null);

  useEffect(() => {
    const lib = library;
    if (!lib) return;
    void lib.daftarKategori().then(setKategori);
    const berhenti = [lib.pantauKoleksi(setKoleksi), lib.pantauStatus(setStatus)];
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

  // Kategori ikut diperbarui setelah pull.
  useEffect(() => {
    if (keadaan.jenis === "selesai") void library?.daftarKategori().then(setKategori);
  }, [keadaan, library]);

  const sinkronkan = useCallback(() => void penjadwal.current?.picu(), []);

  const value = useMemo(
    () => ({ library, koleksi, status, kategori, keadaan, online, sinkronkan }),
    [library, koleksi, status, kategori, keadaan, online, sinkronkan],
  );
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary harus di dalam LibraryProvider");
  return ctx;
}
