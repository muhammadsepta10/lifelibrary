"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, Printer, Settings2 } from "lucide-react";
import { CSS_CETAK, LembarCetak } from "@/components/app/label/lembar-cetak";
import { ButuhKoneksi, inputCls, kartuCls, tombolKecilCls, tombolUtamaCls } from "@/components/app/kelola";
import { useLibrary } from "@/components/app/library-provider";
import { PageHeader } from "@/components/app/page-header";
import {
  ButuhKoneksiError,
  type ItemAntreanCetak,
  type RencanaCetak,
  type TemplateLabelLengkap,
} from "@/lib/local-library";

/** Lebar pratinjau satu lembar di layar (px); ukuran cetak tetap mm sungguhan. */
const LEBAR_PRATINJAU_PX = 300;
const PX_PER_MM = 96 / 25.4;

export default function CetakPage() {
  const { library, online } = useLibrary();
  const [antrean, setAntrean] = useState<ItemAntreanCetak[]>();
  const [template, setTemplate] = useState<TemplateLabelLengkap>();
  /** Yang dicopot centangnya; Eksemplar baru di antrean otomatis terpilih. */
  const [dicopot, setDicopot] = useState<Set<string>>(new Set());
  const [posisiAwal, setPosisiAwal] = useState("1");
  const [rencana, setRencana] = useState<RencanaCetak>();
  const [untukCetak, setUntukCetak] = useState<RencanaCetak | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [bekerja, setBekerja] = useState(false);

  useEffect(() => {
    if (!library) return;
    const berhenti = [library.pantauAntreanCetak(setAntrean), library.pantauTemplateLabel(setTemplate)];
    return () => berhenti.forEach((f) => f());
  }, [library]);

  const terpilih = useMemo(
    () => (antrean ?? []).filter((i) => i.bisaDicetak && !dicopot.has(i.eksemplarId)).map((i) => i.eksemplarId),
    [antrean, dicopot],
  );
  const kunciPilihan = terpilih.join(",");
  const posisi = Number.parseInt(posisiAwal, 10);

  // Pratinjau selalu mengikuti pilihan, Template Label, dan posisi awal.
  useEffect(() => {
    if (!library || !template) return;
    let batal = false;
    void library
      .rencanaCetak({ eksemplarIds: kunciPilihan ? kunciPilihan.split(",") : [], posisiAwal: posisi })
      .then((r) => !batal && setRencana(r));
    return () => {
      batal = true;
    };
  }, [library, template, kunciPilihan, posisi]);

  // Cetak: setelah lembar cetak tampil di DOM, buka dialog print browser.
  useEffect(() => {
    if (!untukCetak) return;
    const selesai = () => setUntukCetak(null);
    window.addEventListener("afterprint", selesai, { once: true });
    const timer = setTimeout(() => window.print(), 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", selesai);
    };
  }, [untukCetak]);

  async function cetak(halamanUji: boolean) {
    if (!library) return;
    setGalat(null);
    setInfo(null);
    try {
      setUntukCetak(
        await library.siapkanCetak({
          eksemplarIds: terpilih,
          posisiAwal: Number.isFinite(posisi) ? posisi : 1,
          halamanUji,
          online,
        }),
      );
    } catch (e) {
      setGalat(e instanceof ButuhKoneksiError ? e.message : "Gagal menyiapkan cetak. Coba lagi");
    }
  }

  async function tandaiTercetak() {
    if (!library || terpilih.length === 0) return;
    setGalat(null);
    setBekerja(true);
    try {
      await library.tandaiTercetak(terpilih);
      setInfo(`${terpilih.length} Eksemplar ditandai sudah tercetak dan keluar dari antrean.`);
    } catch {
      setGalat("Gagal menandai. Coba lagi");
    } finally {
      setBekerja(false);
    }
  }

  function alihPilihan(id: string) {
    setDicopot((lama) => {
      const baru = new Set(lama);
      if (!baru.delete(id)) baru.add(id);
      return baru;
    });
  }

  const siap = (antrean ?? []).filter((i) => i.bisaDicetak);
  const menunggu = (antrean ?? []).filter((i) => !i.bisaDicetak);
  const tidakCetak = !online || terpilih.length === 0;

  return (
    <>
      <PageHeader
        judul="Cetak Label"
        keterangan={
          antrean &&
          `${siap.length} Label siap dicetak${menunggu.length ? ` · ${menunggu.length} menunggu Nomor Induk` : ""}`
        }
      />

      <section className="flex flex-col gap-5 p-5">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {template && (
            <p className="text-ink-muted">
              Kertas {template.kertas} · sel {template.w}×{template.h} mm ·{" "}
              <span className="font-mono">
                {template.kolom} × {template.baris} = {template.perLembar}
              </span>{" "}
              sel per lembar
            </p>
          )}
          <Link href="/cetak/template" className={`${tombolKecilCls} inline-flex items-center gap-1.5`}>
            <Settings2 className="size-4" aria-hidden /> Template Label
          </Link>
        </div>

        {antrean && antrean.length === 0 && (
          <p className={`${kartuCls} p-4 text-sm text-ink-muted`}>
            Antrean Cetak kosong. Eksemplar baru, atau yang Nomor Panggilnya berubah, akan muncul di sini.
          </p>
        )}

        {antrean && antrean.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <h2 className="font-heading text-xl font-semibold">Antrean Cetak</h2>
              <button type="button" className={tombolKecilCls} onClick={() => setDicopot(new Set())}>
                Pilih semua
              </button>
              <button
                type="button"
                className={tombolKecilCls}
                onClick={() => setDicopot(new Set(siap.map((i) => i.eksemplarId)))}
              >
                Kosongkan
              </button>
            </div>
            <ul className="flex flex-col gap-2">
              {antrean.map((i) => (
                <li key={i.eksemplarId} data-testid="antrean-item">
                  <label
                    className={`${kartuCls} flex items-center gap-3 p-3 ${i.bisaDicetak ? "" : "opacity-70"}`}
                  >
                    <input
                      type="checkbox"
                      className="size-5 accent-[#1F3A33]"
                      disabled={!i.bisaDicetak}
                      checked={i.bisaDicetak && !dicopot.has(i.eksemplarId)}
                      onChange={() => alihPilihan(i.eksemplarId)}
                    />
                    <span
                      className="size-3 shrink-0 rounded-[3px]"
                      style={{ background: i.kategori.warna }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{i.judul}</span>
                      <span className="block font-mono text-xs text-ink-muted">{i.nomorPanggil.teks}</span>
                      {!i.bisaDicetak && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-menunggu-fg">
                          <CircleAlert className="size-3.5" aria-hidden /> Belum bisa dicetak: {i.alasanTidakBisa}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-xs text-ink-muted">{i.nomorInduk ?? "——"}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="posisi" className="text-sm font-medium">
            Mulai dari posisi ke-
          </label>
          <input
            id="posisi"
            className={`${inputCls} max-w-32 font-mono`}
            type="number"
            inputMode="numeric"
            min={1}
            max={template?.perLembar}
            value={posisiAwal}
            onChange={(e) => setPosisiAwal(e.target.value)}
          />
          <p className="text-xs text-ink-muted">
            1 = sel kiri atas. Berguna untuk memakai sisa lembar stiker: posisi N melewati {`N-1`} sel pertama.
            Ketuk sel di pratinjau untuk memilih posisi awal.
          </p>
        </div>

        {rencana && (
          <div className="flex flex-col gap-3">
            <h2 className="font-heading text-xl font-semibold">Pratinjau</h2>
            <p className="text-sm" data-testid="ringkasan-cetak">
              {rencana.jumlahLabel} Label · {rencana.jumlahLembar} lembar {rencana.template.kertas} ·{" "}
              {rencana.jumlahDilewati} sel dilewati · {rencana.jumlahKosong} sel kosong
            </p>
            <Pratinjau rencana={rencana} onPilihPosisi={(n) => setPosisiAwal(String(n))} />
            <p className="text-xs text-ink-muted">
              Garis miring = sel yang dilewati (sudah terpakai). Garis putus-putus = sel kosong.
            </p>
          </div>
        )}

        <div className={`${kartuCls} flex flex-col gap-3 p-4`}>
          <p className="text-sm">
            Cetak dengan skala <strong>100% / Actual size</strong>. Jangan pilih &ldquo;Fit to page&rdquo; atau
            &ldquo;Sesuaikan ke halaman&rdquo;, atau ukuran Label bergeser. Cetak dulu halaman uji di kertas
            biasa dan tempelkan ke lembar stiker untuk memeriksa posisinya.
          </p>
          {rencana && rencana.tidakBisaDicetak.length > 0 && (
            <p role="alert" className="text-sm text-bahaya">
              {rencana.tidakBisaDicetak.length} Eksemplar tidak ikut dicetak: {rencana.tidakBisaDicetak[0].alasan}.
            </p>
          )}
          {galat && (
            <p role="alert" className="text-sm font-semibold text-bahaya">
              {galat}
            </p>
          )}
          {info && (
            <p role="status" className="text-sm font-medium text-sukses-fg">
              {info}
            </p>
          )}
          <button type="button" className={tombolUtamaCls} disabled={tidakCetak} onClick={() => void cetak(false)}>
            <Printer className="mr-2 inline size-4" aria-hidden />
            Cetak {terpilih.length} Label
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={tombolKecilCls} disabled={!online} onClick={() => void cetak(true)}>
              Cetak halaman uji
            </button>
            <button
              type="button"
              className={tombolKecilCls}
              disabled={bekerja || terpilih.length === 0}
              onClick={() => void tandaiTercetak()}
            >
              Tandai sudah tercetak ({terpilih.length})
            </button>
          </div>
          {!online && <ButuhKoneksi />}
        </div>
      </section>

      {untukCetak &&
        createPortal(
          <div data-cetak-root>
            <style>{CSS_CETAK}</style>
            <LembarCetak rencana={untukCetak} />
          </div>,
          document.body,
        )}
    </>
  );
}

/** Lembar-lembar rencana cetak diperkecil untuk layar; ukuran asli tetap mm di dalamnya. */
function Pratinjau({ rencana, onPilihPosisi }: { rencana: RencanaCetak; onPilihPosisi: (n: number) => void }) {
  const skala = LEBAR_PRATINJAU_PX / (rencana.lebarKertas * PX_PER_MM);
  const tinggi = rencana.tinggiKertas * PX_PER_MM * skala;
  return (
    <div
      className="flex flex-col gap-4"
      onClick={(e) => {
        const sel = (e.target as HTMLElement).closest<HTMLElement>("[data-indeks]");
        const lembar = sel?.closest<HTMLElement>("[data-lembar]");
        if (sel && lembar?.dataset.lembar === "1") onPilihPosisi(Number(sel.dataset.indeks) + 1);
      }}
    >
      {rencana.lembar.map((lembar) => (
        <figure key={lembar.nomor}>
          <div style={{ width: LEBAR_PRATINJAU_PX, height: tinggi, overflow: "hidden" }}>
            <div style={{ transform: `scale(${skala})`, transformOrigin: "top left", width: `${rencana.lebarKertas}mm` }}>
              <LembarCetak rencana={{ ...rencana, lembar: [lembar] }} pratinjau />
            </div>
          </div>
          <figcaption className="mt-1 text-xs text-ink-muted">
            Lembar {lembar.nomor} dari {rencana.jumlahLembar} · {rencana.template.kertas}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
