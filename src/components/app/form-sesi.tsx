"use client";

import { useState } from "react";
import { ASAL, LABEL_ASAL, type Asal } from "@/lib/buku-fields";
import { ValidasiError, type DataSesi, type LokasiRow } from "@/lib/local-library";
import { Field, inputCls, Pilihan, tombolUtamaCls } from "./form";

/** Hari ini sebagai `YYYY-MM-DD` menurut jam perangkat. */
export function hariIni(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Ringkasan sesi, mis. "Hari ini · Beli · Rak A". */
export function ringkasSesi(data: DataSesi, lokasi: LokasiRow[] | undefined): string {
  const tanggal = data.tanggalMasuk
    ? data.tanggalMasuk === hariIni()
      ? "Hari ini"
      : new Date(`${data.tanggalMasuk}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
    : "Tanpa tanggal masuk";
  const asal = data.asal ? LABEL_ASAL[data.asal] : "Asal belum diisi";
  const tempat = lokasi?.find((l) => l.id === data.lokasiId)?.nama ?? "Tanpa Lokasi";
  return `${tanggal} · ${asal} · ${tempat}`;
}

/**
 * Isian data Sesi Penerimaan: tanggal masuk, asal, dan Lokasi. Dipakai untuk
 * memulai sesi dan untuk mengubahnya di tengah sesi.
 */
export function FormSesi({
  awal,
  lokasi,
  labelTombol,
  onSimpan,
}: {
  awal: DataSesi;
  lokasi: LokasiRow[] | undefined;
  labelTombol: string;
  onSimpan: (data: DataSesi) => Promise<void>;
}) {
  const [tanggal, setTanggal] = useState(awal.tanggalMasuk ?? "");
  const [asal, setAsal] = useState<Asal | "">(awal.asal ?? "");
  const [lokasiId, setLokasiId] = useState(awal.lokasiId ?? "");
  const [galat, setGalat] = useState<{ field: string; pesan: string } | null>(null);
  const [bekerja, setBekerja] = useState(false);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setGalat(null);
    setBekerja(true);
    try {
      await onSimpan({ tanggalMasuk: tanggal || null, asal: asal || null, lokasiId: lokasiId || null });
    } catch (err) {
      if (err instanceof ValidasiError) setGalat({ field: err.field, pesan: err.pesan });
      else throw err;
    } finally {
      setBekerja(false);
    }
  }

  return (
    <form onSubmit={kirim} noValidate className="flex flex-col gap-5">
      <Field
        id="sesi-tanggal"
        label="Tanggal masuk"
        galat={galat?.field === "tanggalMasuk" ? galat.pesan : null}
        petunjuk="Kosongkan untuk koleksi lama yang tanggal masuknya tidak diketahui"
      >
        <input
          id="sesi-tanggal"
          type="date"
          className={inputCls}
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
        />
      </Field>
      <Field id="sesi-asal" label="Asal" galat={galat?.field === "asal" ? galat.pesan : null}>
        <Pilihan
          id="sesi-asal"
          nilai={asal}
          onChange={setAsal}
          pilihan={ASAL.map((a) => ({ nilai: a, label: LABEL_ASAL[a] }))}
          kosong="Belum diisi"
        />
      </Field>
      <Field
        id="sesi-lokasi"
        label="Lokasi"
        galat={galat?.field === "lokasiId" ? galat.pesan : null}
        petunjuk={lokasi?.length === 0 ? "Belum ada Lokasi. Tambahkan di Lainnya > Lokasi (butuh koneksi)." : undefined}
      >
        <Pilihan
          id="sesi-lokasi"
          nilai={lokasiId}
          onChange={setLokasiId}
          pilihan={(lokasi ?? []).map((l) => ({ nilai: l.id, label: l.nama }))}
          kosong="Tanpa Lokasi"
        />
      </Field>
      <button type="submit" disabled={bekerja} className={tombolUtamaCls}>
        {bekerja ? "Memproses…" : labelTombol}
      </button>
    </form>
  );
}
