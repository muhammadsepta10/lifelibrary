import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { CSS_CETAK, LembarCetak } from "@/components/app/label/lembar-cetak";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { createLocalLibrary, type RencanaCetak, type TemplateLabel } from "@/lib/local-library";

/**
 * Pemeriksaan fisik hasil cetak: komponen lembar dirender ke HTML, dicetak ke
 * PDF oleh Chrome headless, lalu ukuran halaman dan posisi sel diperiksa dari
 * PDF itu sendiri (pdfinfo untuk ukuran, pdftoppm untuk piksel pada 10 px/mm).
 * Dilewati bila Chrome atau poppler tidak ada. Jalankan: `pnpm test:pdf`.
 */

const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
const punyaPoppler = (() => {
  try {
    execFileSync("pdftoppm", ["-v"], { stdio: "ignore" });
    execFileSync("pdfinfo", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;
const PX_PER_MM = 10;
const DPI = 25.4 * PX_PER_MM;

const kerja = mkdtempSync(join(tmpdir(), "lifelibrary-pdf-"));

/**
 * `denganCangkang`: meniru halaman aplikasi, yaitu cangkang tinggi (sidebar, isi,
 * navigasi) di body bersama `[data-cetak-root]` seperti yang dipasang halaman Cetak.
 */
function cetakKePdf(nama: string, rencana: RencanaCetak, denganCangkang = false) {
  const lembar = renderToStaticMarkup(<LembarCetak rencana={rencana} />);
  const isi = denganCangkang
    ? `<div id="app"><aside style="height:900px">Sidebar</aside><main style="height:3000px">Cetak Label</main><nav>Navigasi</nav></div><div data-cetak-root><style>${CSS_CETAK}</style>${lembar}</div>`
    : lembar;
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${nama}</title><style>html,body{margin:0;padding:0}</style></head><body>${isi}</body></html>`;
  const berkasHtml = join(kerja, `${nama}.html`);
  const berkasPdf = join(kerja, `${nama}.pdf`);
  writeFileSync(berkasHtml, html);
  execFileSync(
    CHROME!,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-pdf-header-footer",
      `--user-data-dir=${join(kerja, `profil-${nama}`)}`,
      `--print-to-pdf=${berkasPdf}`,
      `file://${berkasHtml}`,
    ],
    { stdio: "ignore", timeout: 45000 },
  );
  return berkasPdf;
}

/**
 * Meniru dialog cetak browser dengan "Background graphics" mati (bawaan Chrome
 * dan Safari): latar belakang tidak dicetak kecuali CSS meminta `print-color-adjust: exact`.
 */
async function cetakTanpaLatar(nama: string, rencana: RencanaCetak) {
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}</style></head><body><div data-cetak-root><style>${CSS_CETAK}</style>${renderToStaticMarkup(<LembarCetak rencana={rencana} />)}</div></body></html>`;
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    const berkasPdf = join(kerja, `${nama}.pdf`);
    await page.pdf({ path: berkasPdf, preferCSSPageSize: true, printBackground: false });
    return berkasPdf;
  } finally {
    await browser.close();
  }
}

function infoPdf(pdf: string) {
  const teks = execFileSync("pdfinfo", [pdf]).toString();
  const ukuran = teks.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/)!;
  const halaman = Number(teks.match(/Pages:\s+(\d+)/)![1]);
  const mm = (pt: string) => (Number(pt) / 72) * 25.4;
  return { lebarMm: mm(ukuran[1]), tinggiMm: mm(ukuran[2]), halaman };
}

type Gambar = { lebar: number; tinggi: number; piksel: Buffer };
/** Rasterisasi satu halaman pada 10 px/mm ke PPM (P6) lalu dibaca sebagai piksel RGB. */
function rasterisasi(pdf: string, halaman: number): Gambar {
  // -singlefile menghindari akhiran nomor halaman pada nama berkas.
  const ppmPath = join(kerja, `p-${Math.random().toString(36).slice(2)}`);
  execFileSync("pdftoppm", ["-r", String(DPI), "-f", String(halaman), "-l", String(halaman), "-singlefile", pdf, ppmPath]);
  const data = readFileSync(`${ppmPath}.ppm`);
  // Header P6: "P6\nW H\n255\n"
  let pos = 0;
  const token = () => {
    while (data[pos] === 0x0a || data[pos] === 0x20) pos++;
    let s = "";
    while (data[pos] !== 0x0a && data[pos] !== 0x20) s += String.fromCharCode(data[pos++]);
    return s;
  };
  expect(token()).toBe("P6");
  const lebar = Number(token());
  const tinggi = Number(token());
  token();
  pos++;
  return { lebar, tinggi, piksel: data.subarray(pos) };
}

const rgb = (g: Gambar, x: number, y: number): [number, number, number] => {
  const i = (y * g.lebar + x) * 3;
  return [g.piksel[i], g.piksel[i + 1], g.piksel[i + 2]];
};
/** Oranye #E76F51, dengan toleransi anti-aliasing. */
const oranye = ([r, g, b]: [number, number, number]) => r > 200 && g > 80 && g < 160 && b > 50 && b < 130;
const gelap = ([r, g, b]: [number, number, number]) => r < 80 && g < 80 && b < 80;
const putih = ([r, g, b]: [number, number, number]) => r > 245 && g > 245 && b > 245;

/** Pusat (mm) tiap garis oranye di sepanjang satu baris/kolom piksel. */
function garisOranye(g: Gambar, sumbu: "x" | "y", tetap: number): number[] {
  const panjang = sumbu === "x" ? g.lebar : g.tinggi;
  const pusat: number[] = [];
  let awal = -1;
  for (let i = 0; i <= panjang; i++) {
    const ya = i < panjang && oranye(sumbu === "x" ? rgb(g, i, tetap) : rgb(g, tetap, i));
    if (ya && awal < 0) awal = i;
    if (!ya && awal >= 0) {
      pusat.push(((awal + i) / 2) / PX_PER_MM);
      awal = -1;
    }
  }
  return pusat;
}

const seMm = (a: number[], b: number[], toleransi = 0.3) =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= toleransi);

async function rencana(opsi: { template?: TemplateLabel; jumlah?: number; posisiAwal?: number; halamanUji?: boolean }) {
  const lib = createLocalLibrary({ dbName: `lifelibrary-test-${crypto.randomUUID()}` });
  for (let i = 0; i < (opsi.jumlah ?? 0); i++) {
    await lib.tambahBukuManual({ judul: `Laut Bercerita ${i + 1}`, pengarang: "Leila S. Chudori", kategoriId: FIK.id });
  }
  await lib.sinkronkan({
    push: async (req) => ({
      hasil: req.mutasi.map((m, i) =>
        m.jenis === "eksemplar.catat"
          ? { id: m.id, status: "diterima" as const, eksemplarId: m.eksemplar.id, nomorInduk: `FIK-${String(i + 1).padStart(3, "0")}/2026` }
          : { id: m.id, status: "diterima" as const },
      ),
    }),
    pull: async () => ({ kursor: null, kategori: [], lokasi: [], aturanKategori: [], templateLabel: null, buku: [], eksemplar: [] }),
  });
  const ids = (await lib.antreanCetak()).map((i) => i.eksemplarId);
  return lib.rencanaCetak({ eksemplarIds: ids, posisiAwal: opsi.posisiAwal ?? 1, template: opsi.template, halamanUji: opsi.halamanUji });
}

describe.skipIf(!CHROME || !punyaPoppler)("PDF hasil cetak dari browser", () => {
  beforeAll(() => {
    console.info(`Berkas PDF pemeriksaan ada di ${kerja}`);
  });

  it.each([
    ["A4", 210, 297, 33],
    ["F4", 215, 330, 36],
  ] as const)("halaman uji %s: PDF berukuran %i × %i mm, satu halaman, garis tepi %i sel tepat di posisi mm-nya", async (kertas, lebar, tinggi, perLembar) => {
    const template: TemplateLabel = { kertas, w: 66, h: 26, mt: 5.5, ml: 6, gx: 0, gy: 0 };
    const r = await rencana({ template, halamanUji: true });
    expect(r.perLembar).toBe(perLembar);

    const pdf = cetakKePdf(`uji-${kertas}`, r);

    const info = infoPdf(pdf);
    expect(info.halaman).toBe(1);
    expect(info.lebarMm).toBeCloseTo(lebar, 0);
    expect(info.tinggiMm).toBeCloseTo(tinggi, 0);

    const g = rasterisasi(pdf, 1);
    expect(g.lebar / PX_PER_MM).toBeCloseTo(lebar, 0);
    expect(g.tinggi / PX_PER_MM).toBeCloseTo(tinggi, 0);
    // Garis vertikal di x = ml + k*w (kiri & kanan tiap kolom), diukur di tengah baris pertama.
    const yTengah = Math.round((5.5 + 13) * PX_PER_MM);
    expect(seMm(garisOranye(g, "x", yTengah), [6.15, 72, 138, 203.85])).toBe(true);
    // Garis horizontal di y = mt + k*h, diukur di tengah kolom pertama.
    const xTengah = Math.round((6 + 33) * PX_PER_MM);
    const baris = r.baris;
    const harapan = [5.65, ...Array.from({ length: baris - 1 }, (_, k) => 5.5 + (k + 1) * 26), 5.5 + baris * 26 - 0.15];
    expect(seMm(garisOranye(g, "y", xTengah), harapan)).toBe(true);
    // Hanya garis tepi: tidak ada tinta gelap (teks/barcode) di mana pun pada halaman uji.
    let gelapDitemukan = 0;
    for (let y = 0; y < g.tinggi; y += 7) for (let x = 0; x < g.lebar; x += 7) if (gelap(rgb(g, x, y))) gelapDitemukan++;
    expect(gelapDitemukan).toBe(0);
  });

  it("di dalam cangkang aplikasi: hanya lembar yang tercetak (satu halaman A4), posisi garis tetap tepat", async () => {
    const r = await rencana({ halamanUji: true });

    const pdf = cetakKePdf("uji-cangkang", r, true);

    const info = infoPdf(pdf);
    expect(info.halaman).toBe(1);
    expect(info.lebarMm).toBeCloseTo(210, 0);
    expect(info.tinggiMm).toBeCloseTo(297, 0);
    const g = rasterisasi(pdf, 1);
    expect(seMm(garisOranye(g, "x", Math.round(18.5 * PX_PER_MM)), [6.15, 72, 138, 203.85])).toBe(true);
    let gelapDitemukan = 0;
    for (let y = 0; y < g.tinggi; y += 7) for (let x = 0; x < g.lebar; x += 7) if (gelap(rgb(g, x, y))) gelapDitemukan++;
    expect(gelapDitemukan).toBe(0); // teks cangkang ("Sidebar", "Cetak Label") tidak ikut tercetak
  });

  it("jarak dan margin kustom: posisi garis mengikuti ml + k*(w+gx) dan mt + k*(h+gy)", async () => {
    const template: TemplateLabel = { kertas: "A4", w: 60, h: 30, mt: 10, ml: 5, gx: 2, gy: 3 };
    const r = await rencana({ template, halamanUji: true });
    expect([r.kolom, r.baris]).toEqual([3, 8]);

    const g = rasterisasi(cetakKePdf("uji-kustom", r), 1);

    // Kolom k: kiri = 5 + k*62 (+0.15), kanan = 65 + k*62 (-0.15).
    const x = [5.15, 64.85, 67.15, 126.85, 129.15, 188.85];
    expect(seMm(garisOranye(g, "x", Math.round(25 * PX_PER_MM)), x)).toBe(true);
    // Baris k: atas = 10 + k*33, bawah = 40 + k*33.
    const y = Array.from({ length: 8 }, (_, k) => [10.15 + k * 33, 39.85 + k * 33]).flat();
    expect(seMm(garisOranye(g, "y", Math.round(35 * PX_PER_MM)), y)).toBe(true);
  });

  it("Label: posisi awal 2 melewati sel pertama (kosong), pita Kategori dan barcode jatuh di dalam sel; lembar kedua muncul tanpa halaman kosong", async () => {
    const r = await rencana({ jumlah: 33, posisiAwal: 2 }); // 1 dilewati + 33 Label = 34 sel -> 2 lembar
    expect(r).toMatchObject({ jumlahLembar: 2, jumlahDilewati: 1 });

    const pdf = cetakKePdf("label", r);

    const info = infoPdf(pdf);
    expect(info.halaman).toBe(2);
    expect(info.lebarMm).toBeCloseTo(210, 0);
    expect(info.tinggiMm).toBeCloseTo(297, 0);

    const g = rasterisasi(pdf, 1);
    const adaIsi = (x0: number, y0: number, x1: number, y1: number, uji: (p: [number, number, number]) => boolean) => {
      for (let y = Math.round(y0 * PX_PER_MM); y < y1 * PX_PER_MM; y += 3)
        for (let x = Math.round(x0 * PX_PER_MM); x < x1 * PX_PER_MM; x += 3) if (uji(rgb(g, x, y))) return true;
      return false;
    };
    // Sel 1 (6..72 x 5.5..31.5) dilewati: tetap putih.
    expect(adaIsi(6, 5.5, 72, 31.5, (p) => !putih(p))).toBe(false);
    // Sel 2 (72..138): pita oranye FIK di 5 mm teratas Label Punggung (17 mm), tinta gelap barcode di sisi kanan.
    expect(adaIsi(73, 6, 88, 10, oranye)).toBe(true);
    expect(adaIsi(90, 14, 134, 25, gelap)).toBe(true);
    // Pita tidak bocor ke luar Label Punggung (kolom 90..138 bagian atas bebas oranye).
    expect(adaIsi(90, 6, 137, 10, oranye)).toBe(false);
    // Lembar kedua berisi tepat 1 Label (Label ke-34 = sel pertama), sisanya kosong.
    const g2 = rasterisasi(pdf, 2);
    const tinta = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = Math.round(y0 * PX_PER_MM); y < y1 * PX_PER_MM; y += 3)
        for (let x = Math.round(x0 * PX_PER_MM); x < x1 * PX_PER_MM; x += 3) if (!putih(rgb(g2, x, y))) return true;
      return false;
    };
    expect(tinta(6, 5.5, 72, 31.5)).toBe(true);
    expect(tinta(72, 5.5, 204, 291.5)).toBe(false);
    expect(tinta(6, 31.5, 72, 291.5)).toBe(false);
  });

  it("dialog cetak tanpa Background graphics: pita Kategori tetap berwarna seperti di pratinjau", async () => {
    const r = await rencana({ jumlah: 1 });

    const g = rasterisasi(await cetakTanpaLatar("tanpa-latar", r), 1);

    // Sel 1 (6..72 x 5.5..31.5): pita FIK oranye di 5 mm teratas Label Punggung (17 mm).
    let oranyeDitemukan = 0;
    for (let y = 6 * PX_PER_MM; y < 10 * PX_PER_MM; y += 3)
      for (let x = 7 * PX_PER_MM; x < 22 * PX_PER_MM; x += 3) if (oranye(rgb(g, Math.round(x), Math.round(y)))) oranyeDitemukan++;
    expect(oranyeDitemukan).toBeGreaterThan(100);
  });

  it("pemandu potong: tanda di margin kiri dan kanan pada setiap batas baris, tanda di margin atas dan bawah pada setiap batas kolom", async () => {
    const r = await rencana({ jumlah: 1 });
    const g = rasterisasi(await cetakTanpaLatar("pemandu", r), 1);
    const tidakPutih = (x: number, y: number) => !putih(rgb(g, Math.round(x * PX_PER_MM), Math.round(y * PX_PER_MM)));
    const pusat = (sumbu: "x" | "y", tetap: number) => {
      const panjang = (sumbu === "x" ? g.lebar : g.tinggi) / PX_PER_MM;
      const hasil: number[] = [];
      let awal = -1;
      for (let i = 0; i <= panjang * PX_PER_MM; i++) {
        const mm = i / PX_PER_MM;
        const ya = mm < panjang && (sumbu === "x" ? tidakPutih(mm, tetap) : tidakPutih(tetap, mm));
        if (ya && awal < 0) awal = mm;
        if (!ya && awal >= 0) {
          hasil.push((awal + mm) / 2);
          awal = -1;
        }
      }
      return hasil;
    };
    // Batas baris: y = 5.5 + k*26 (k = 0..11). Margin kiri 0..6 mm dan kanan 204..210 mm bebas dari isi Label.
    const batasBaris = Array.from({ length: 12 }, (_, k) => 5.5 + k * 26);
    expect(seMm(pusat("y", 3), batasBaris, 0.4)).toBe(true);
    expect(seMm(pusat("y", 207), batasBaris, 0.4)).toBe(true);
    // Batas kolom: x = 6 + k*66 (k = 0..3). Margin atas 0..5.5 mm dan bawah 291.5..297 mm.
    const batasKolom = [6, 72, 138, 204];
    expect(seMm(pusat("x", 2.75), batasKolom, 0.4)).toBe(true);
    expect(seMm(pusat("x", 294.25), batasKolom, 0.4)).toBe(true);
  });
});
