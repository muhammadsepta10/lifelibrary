import type { LabelCetak, RencanaCetak, SelCetak } from "@/lib/local-library";

/**
 * Lembar Label dalam ukuran mm sungguhan (desain B "Pasangan"). Murni
 * presentasi tanpa hook, jadi bisa dirender di klien (pratinjau dan cetak)
 * maupun di server (pemeriksaan PDF). Gayanya ikut dalam komponen supaya
 * keduanya memakai CSS yang sama.
 */

/** Deretan modul "1"/"0" menjadi batang SVG; satu modul = satu satuan lebar. */
export function BarcodeSvg({ modul }: { modul: string }) {
  let d = "";
  for (let i = 0; i < modul.length; ) {
    if (modul[i] !== "1") {
      i++;
      continue;
    }
    let j = i;
    while (modul[j] === "1") j++;
    d += `M${i} 0h${j - i}v1h-${j - i}z`;
    i = j;
  }
  return (
    <svg
      className="lb-barcode"
      viewBox={`0 0 ${modul.length} 1`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <path d={d} fill="#000" />
    </svg>
  );
}

/** Satu sel: Label Punggung | garis gunting | Label Barcode. */
export function IsiLabel({ label }: { label: LabelCetak }) {
  const { kategori, nomorPanggil } = label;
  return (
    <div className="lb">
      <div className="lb-spine">
        <div className="lb-band" style={{ background: kategori.warna }}>
          {kategori.nama.toUpperCase()}
        </div>
        <div className="lb-stack">
          <div>{nomorPanggil.kode}</div>
          <div>{nomorPanggil.pengarang}</div>
          <div className="lb-l3">{nomorPanggil.judul}</div>
        </div>
      </div>
      <div className="lb-bcpart">
        <div className="lb-top">
          <span className="lb-brand">lifelibrary</span>
          <span className="lb-title">{label.judul}</span>
        </div>
        <BarcodeSvg modul={label.barcode} />
        <div className="lb-no">{label.nomorInduk}</div>
      </div>
    </div>
  );
}

function Sel({ sel }: { sel: SelCetak }) {
  return (
    <div
      className={`lb-cell lb-${sel.jenis}`}
      data-jenis={sel.jenis}
      data-indeks={sel.indeks}
      style={{ left: `${sel.x}mm`, top: `${sel.y}mm`, width: `${sel.lebar}mm`, height: `${sel.tinggi}mm` }}
    >
      {sel.label && <IsiLabel label={sel.label} />}
    </div>
  );
}

const TANDA_TEBAL = 0.2;
const TANDA_PANJANG = 3;

/** Posisi (mm) tiap batas sel sepanjang satu sumbu; batas yang berimpit (jarak 0) hanya dihitung sekali. */
function batasSel(awal: number, ukuran: number, jarak: number, jumlah: number) {
  const hasil = new Set<number>();
  for (let k = 0; k < jumlah; k++) {
    const kiri = awal + k * (ukuran + jarak);
    hasil.add(Math.round(kiri * 1000) / 1000);
    hasil.add(Math.round((kiri + ukuran) * 1000) / 1000);
  }
  return [...hasil];
}

/**
 * Pemandu potong: tanda pendek di margin kertas pada setiap batas sel, supaya
 * lembar bisa digunting lurus (ke samping lewat tanda kiri-kanan, ke bawah lewat
 * tanda atas-bawah). Hanya di margin, jadi tidak mengenai Label.
 */
function PemanduPotong({ rencana }: { rencana: RencanaCetak }) {
  const { template: t, kolom, baris, lebarKertas, tinggiKertas } = rencana;
  const sisi = (margin: number, ukuranKertas: number) => {
    const panjang = Math.min(TANDA_PANJANG, margin - 1);
    if (panjang <= 0) return [];
    const tengah = margin / 2;
    return [tengah, ukuranKertas - tengah].map((p) => ({ p, panjang }));
  };
  const tandaBaris = (m: { p: number; panjang: number }, y: number) => (
    <span
      key={`b-${m.p}-${y}`}
      className="lb-tanda"
      style={{ left: `${m.p - m.panjang / 2}mm`, top: `${y - TANDA_TEBAL / 2}mm`, width: `${m.panjang}mm`, height: `${TANDA_TEBAL}mm` }}
    />
  );
  const tandaKolom = (m: { p: number; panjang: number }, x: number) => (
    <span
      key={`k-${m.p}-${x}`}
      className="lb-tanda"
      style={{ top: `${m.p - m.panjang / 2}mm`, left: `${x - TANDA_TEBAL / 2}mm`, height: `${m.panjang}mm`, width: `${TANDA_TEBAL}mm` }}
    />
  );
  const ys = batasSel(t.mt, t.h, t.gy, baris);
  const xs = batasSel(t.ml, t.w, t.gx, kolom);
  return (
    <div aria-hidden data-pemandu-potong>
      {sisi(t.ml, lebarKertas).flatMap((m) => ys.map((y) => tandaBaris(m, y)))}
      {sisi(t.mt, tinggiKertas).flatMap((m) => xs.map((x) => tandaKolom(m, x)))}
    </div>
  );
}

/**
 * CSS lembar: ukuran mm sungguhan. `@page` (ukuran kertas Template Label, tanpa
 * margin) hanya ikut pada versi cetak, bukan pratinjau layar.
 */
export function cssLembar(r: Pick<RencanaCetak, "lebarKertas" | "tinggiKertas">, denganPage = true) {
  return `
${denganPage ? `@page { size: ${r.lebarKertas}mm ${r.tinggiKertas}mm; margin: 0; }` : ""}
.lb-sheets { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.lb-sheet { position: relative; width: ${r.lebarKertas}mm; height: ${r.tinggiKertas}mm; overflow: hidden; background: #fff; break-after: page; page-break-after: always; }
.lb-sheet:last-child { break-after: auto; page-break-after: auto; }
.lb-cell { position: absolute; overflow: hidden; box-sizing: border-box; }
.lb-tanda { position: absolute; background: #6b716d; }
.lb-uji { outline: .3mm solid #E76F51; outline-offset: -.3mm; }
.lb { width: 100%; height: 100%; display: flex; background: #fff; color: #1E2420; }
.lb-spine { width: 17mm; display: flex; flex-direction: column; border-right: .3mm dashed #9aa19d; box-sizing: border-box; }
.lb-band { height: 5mm; color: #fff; font: 700 4.6pt var(--font-inter, Inter, system-ui, sans-serif); letter-spacing: .04em; white-space: nowrap; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.lb-stack { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; font: 800 11pt/1.15 var(--font-literata, Literata, ui-serif, Georgia, serif); }
.lb-l3 { font-weight: 600; }
.lb-bcpart { flex: 1; padding: 2mm 3mm; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.lb-top { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; }
.lb-brand { font: 700 5.5pt var(--font-literata, Literata, ui-serif, Georgia, serif); color: #1F3A33; white-space: nowrap; }
.lb-title { font: 500 5.5pt var(--font-inter, Inter, system-ui, sans-serif); color: #5c625e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lb-barcode { display: block; width: 42mm; height: 10mm; }
.lb-no { font: 700 7.5pt var(--font-jetbrains-mono, 'JetBrains Mono', ui-monospace, monospace); text-align: center; }
`;
}

/**
 * Saat mencetak, hanya lembar (`[data-cetak-root]`, anak langsung body) yang
 * tampil: cangkang aplikasi disembunyikan supaya tidak ikut mencetak.
 */
export const CSS_CETAK = `@media print { html, body { background: #fff !important; } body > *:not([data-cetak-root]) { display: none !important; } }`;

/** CSS tambahan hanya untuk pratinjau layar: sel dilewati dan kosong diberi tanda. */
export const CSS_PRATINJAU = `
.lb-pratinjau .lb-sheet { box-shadow: 0 10px 30px rgba(0,0,0,.15); }
.lb-pratinjau .lb-dilewati { outline: 1px dashed #c7c0b2; outline-offset: -1px; background: repeating-linear-gradient(45deg, #f3f0ea 0 2mm, #fff 2mm 4mm); }
.lb-pratinjau .lb-kosong { outline: 1px dashed #d6d0c4; outline-offset: -1px; }
`;

/**
 * Semua lembar rencana cetak. `pratinjau` hanya menambah kelas penanda; skala
 * pratinjau diatur pembungkusnya (transform), bukan di sini, supaya ukuran
 * cetak tetap mm sungguhan.
 */
export function LembarCetak({ rencana, pratinjau = false }: { rencana: RencanaCetak; pratinjau?: boolean }) {
  return (
    <div className={`lb-sheets${pratinjau ? " lb-pratinjau" : ""}`}>
      <style>{cssLembar(rencana, !pratinjau) + (pratinjau ? CSS_PRATINJAU : "")}</style>
      {rencana.lembar.map((lembar) => (
        <div key={lembar.nomor} className="lb-sheet" data-lembar={lembar.nomor}>
          <PemanduPotong rencana={rencana} />
          {lembar.sel.map((sel) => (
            <Sel key={sel.indeks} sel={sel} />
          ))}
        </div>
      ))}
    </div>
  );
}
