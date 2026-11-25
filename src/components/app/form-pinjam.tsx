"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { normalisasiTeks, ValidasiError } from "@/lib/local-library";
import { tanggalIndonesia } from "@/lib/peminjaman/whatsapp";
import { cn } from "@/lib/utils";
import { hariIni } from "./form-sesi";
import { Field, inputCls, tombolSekunderCls, tombolUtamaCls } from "./form";
import { useLibrary } from "./library-provider";

/** `2026-11-25` + 14 hari = `2026-12-09` (kalender, tanpa zona waktu). */
export function tambahHari(iso: string, hari: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

const LAMA_PINJAM = [
  { hari: 7, label: "1 minggu" },
  { hari: 14, label: "2 minggu" },
  { hari: 30, label: "1 bulan" },
];

/**
 * Meminjamkan satu Eksemplar: pilih Peminjam lama atau isi Peminjam baru
 * (nama, kontak), lalu tanggal pinjam dan jatuh tempo. Disimpan di perangkat
 * dan dikirim saat online; tanpa denda. Dipakai di dalam lembar (tanpa
 * berpindah halaman) supaya kamera pemindai tidak terputus.
 */
export function FormPinjam({
  eksemplarId,
  judul,
  onSelesai,
  onBatal,
}: {
  eksemplarId: string;
  judul: string;
  onSelesai: () => void;
  onBatal: () => void;
}) {
  const { library, peminjam } = useLibrary();
  const lama = useMemo(() => peminjam ?? [], [peminjam]);
  const [mode, setMode] = useState<"lama" | "baru">(lama.length > 0 ? "lama" : "baru");
  const [cari, setCari] = useState("");
  const [pilihId, setPilihId] = useState("");
  const [nama, setNama] = useState("");
  const [kontak, setKontak] = useState("");
  const [tanggalPinjam, setTanggalPinjam] = useState(hariIni);
  const [jatuhTempo, setJatuhTempo] = useState(() => tambahHari(hariIni(), 14));
  const [galat, setGalat] = useState<{ field: string; pesan: string } | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);

  const terpilih = lama.find((p) => p.id === pilihId);
  const daftar = useMemo(() => {
    const kueri = normalisasiTeks(cari);
    return lama.filter((p) => !kueri || normalisasiTeks(`${p.nama} ${p.kontak ?? ""}`).includes(kueri));
  }, [lama, cari]);
  const di = (f: string) => (galat?.field === f ? galat.pesan : null);

  function pilih(id: string) {
    setPilihId(id);
    setKontak(lama.find((p) => p.id === id)?.kontak ?? "");
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!library) return;
    setGalat(null);
    setMenyimpan(true);
    try {
      if (mode === "lama") {
        if (!terpilih) throw new ValidasiError("peminjam", "Pilih Peminjam dulu, atau isi Peminjam baru");
        if ((terpilih.kontak ?? "") !== kontak.trim()) await library.ubahPeminjam(terpilih.id, { kontak });
        await library.pinjamkan({ eksemplarId, peminjam: { id: terpilih.id }, tanggalPinjam, jatuhTempo });
      } else {
        await library.pinjamkan({ eksemplarId, peminjam: { nama, kontak }, tanggalPinjam, jatuhTempo });
      }
      onSelesai();
    } catch (err) {
      if (err instanceof ValidasiError) setGalat({ field: err.field, pesan: err.pesan });
      else throw err;
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <form onSubmit={simpan} noValidate className="flex flex-col gap-5 p-5" aria-label={`Pinjamkan ${judul}`}>
      <p className="text-sm text-ink-muted">
        Meminjamkan <strong className="text-ink">{judul}</strong>. Tersimpan di perangkat, dikirim saat online.
      </p>

      <div role="tablist" aria-label="Peminjam" className="grid grid-cols-2 gap-1 rounded-full bg-white p-1 shadow-[0_1px_3px_rgba(0,0,0,.08)]">
        {(["lama", "baru"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setGalat(null);
            }}
            className={cn(
              "min-h-11 rounded-full text-sm font-semibold",
              mode === m ? "bg-forest text-paper" : "text-ink-muted",
            )}
          >
            {m === "lama" ? `Peminjam lama${lama.length ? ` (${lama.length})` : ""}` : "Peminjam baru"}
          </button>
        ))}
      </div>

      {mode === "lama" ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Pilih Peminjam lama</legend>
          {lama.length === 0 ? (
            <p className="text-sm text-ink-muted">Belum ada Peminjam. Pakai &quot;Peminjam baru&quot;.</p>
          ) : (
            <>
              <input
                type="search"
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder="Cari nama Peminjam"
                aria-label="Cari Peminjam"
                className={inputCls}
              />
              <ul className="flex max-h-60 flex-col gap-2 overflow-y-auto">
                {daftar.map((p) => (
                  <li key={p.id}>
                    <label
                      className={cn(
                        "flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,.08)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-forest-link",
                        pilihId === p.id && "ring-2 ring-forest",
                      )}
                    >
                      <input
                        type="radio"
                        name="peminjam-lama"
                        value={p.id}
                        checked={pilihId === p.id}
                        onChange={() => pilih(p.id)}
                        className="sr-only"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{p.nama}</span>
                        <span className="block truncate text-xs text-ink-muted">
                          {p.kontak ?? "Tanpa kontak"}
                          {p.sedangMeminjam > 0 && ` · meminjam ${p.sedangMeminjam} buku`}
                        </span>
                      </span>
                      {pilihId === p.id && <Check className="size-5 text-forest" aria-hidden />}
                    </label>
                  </li>
                ))}
                {daftar.length === 0 && <li className="text-sm text-ink-muted">Tidak ada Peminjam dengan nama itu.</li>}
              </ul>
            </>
          )}
          {di("peminjam") && (
            <p role="alert" className="text-sm text-bahaya">
              {di("peminjam")}
            </p>
          )}
          {terpilih && (
            <Field id="kontak-lama" label="Kontak (WhatsApp)" galat={di("kontak")} petunjuk="Ubah bila nomornya berganti">
              <input
                id="kontak-lama"
                inputMode="tel"
                className={inputCls}
                value={kontak}
                onChange={(e) => setKontak(e.target.value)}
              />
            </Field>
          )}
        </fieldset>
      ) : (
        <div className="flex flex-col gap-4">
          <Field id="nama-peminjam" label="Nama Peminjam" galat={di("nama")}>
            <input
              id="nama-peminjam"
              autoComplete="off"
              className={inputCls}
              value={nama}
              aria-invalid={!!di("nama")}
              onChange={(e) => setNama(e.target.value)}
            />
          </Field>
          <Field
            id="kontak-baru"
            label="Kontak (nomor WhatsApp)"
            galat={di("kontak")}
            petunjuk="Boleh kosong. Dipakai untuk pengingat lewat WhatsApp"
          >
            <input
              id="kontak-baru"
              inputMode="tel"
              autoComplete="off"
              className={inputCls}
              value={kontak}
              aria-invalid={!!di("kontak")}
              onChange={(e) => setKontak(e.target.value)}
            />
          </Field>
        </div>
      )}

      <Field id="tanggal-pinjam" label="Tanggal pinjam" galat={di("tanggalPinjam")}>
        <input
          id="tanggal-pinjam"
          type="date"
          className={inputCls}
          value={tanggalPinjam}
          aria-invalid={!!di("tanggalPinjam")}
          onChange={(e) => setTanggalPinjam(e.target.value)}
        />
      </Field>
      <div>
        <Field
          id="jatuh-tempo"
          label="Jatuh tempo"
          galat={di("jatuhTempo")}
          petunjuk={jatuhTempo ? tanggalIndonesia(jatuhTempo) : undefined}
        >
          <input
            id="jatuh-tempo"
            type="date"
            className={inputCls}
            value={jatuhTempo}
            aria-invalid={!!di("jatuhTempo")}
            onChange={(e) => setJatuhTempo(e.target.value)}
          />
        </Field>
        <div className="mt-2 flex flex-wrap gap-2">
          {LAMA_PINJAM.map(({ hari, label }) => (
            <button
              key={hari}
              type="button"
              className="min-h-9 rounded-full border border-input bg-white px-3.5 text-[13px] font-medium"
              onClick={() => tanggalPinjam && setJatuhTempo(tambahHari(tanggalPinjam, hari))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {di("eksemplarId") && (
        <p role="alert" className="text-sm text-bahaya">
          {di("eksemplarId")}
        </p>
      )}
      <button type="submit" disabled={!library || menyimpan} className={tombolUtamaCls}>
        {menyimpan ? "Menyimpan…" : "Pinjamkan"}
      </button>
      <button type="button" className={tombolSekunderCls} onClick={onBatal}>
        Batal
      </button>
    </form>
  );
}
