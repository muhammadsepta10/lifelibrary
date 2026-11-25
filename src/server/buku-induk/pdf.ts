import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { BarisBukuInduk } from "@/lib/buku-induk";
import { KOLOM_BUKU_INDUK, selBukuInduk } from "./csv";

/**
 * PDF dengan pdf-lib: JavaScript murni, tanpa berkas font atau binari native,
 * jadi jalan di serverless Vercel tanpa pengaturan tambahan (PDFKit perlu
 * membaca berkas font dari disk yang sering tidak ikut ter-bundle).
 * Font standar PDF hanya mengenal Latin-1/WinAnsi; huruf lain diganti "?".
 */

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const MARGIN = 28;
const UKURAN = 8;
const TINGGI_BARIS = 13;
// Lebar kolom (pt) sesuai urutan KOLOM_BUKU_INDUK; jumlahnya = lebar halaman - 2 * MARGIN.
const LEBAR = [72, 190, 110, 62, 54, 40, 44, 36, 54, 52, 48];

/** Karakter yang dikenal font; aksen yang tidak ada dilepas, sisanya jadi "?". */
function amanFont(font: PDFFont, teks: string) {
  const dikenal = new Set(font.getCharacterSet());
  const ada = (c: string) => dikenal.has(c.codePointAt(0)!);
  return [...teks.normalize("NFC")]
    .map((c) => {
      if (ada(c)) return c;
      const dasar = c.normalize("NFD")[0];
      return ada(dasar) ? dasar : "?";
    })
    .join("");
}

function potong(font: PDFFont, teks: string, lebar: number) {
  const bersih = amanFont(font, teks);
  if (font.widthOfTextAtSize(bersih, UKURAN) <= lebar) return bersih;
  let s = bersih;
  while (s.length > 1 && font.widthOfTextAtSize(s + "...", UKURAN) > lebar) s = s.slice(0, -1);
  return s + "...";
}

export async function bukuIndukPdf(baris: BarisBukuInduk[], judul: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(judul);
  doc.setCreator("lifelibrary");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const tebal = await doc.embedFont(StandardFonts.HelveticaBold);

  let halaman = doc.addPage(A4_LANDSCAPE);
  let y = 0;
  const kepala = () => {
    y = A4_LANDSCAPE[1] - MARGIN;
    halaman.drawText(amanFont(tebal, judul), { x: MARGIN, y, size: 12, font: tebal });
    y -= 20;
    let x = MARGIN;
    KOLOM_BUKU_INDUK.forEach((k, i) => {
      halaman.drawText(k, { x, y, size: UKURAN, font: tebal });
      x += LEBAR[i];
    });
    y -= 4;
    halaman.drawLine({ start: { x: MARGIN, y }, end: { x: A4_LANDSCAPE[0] - MARGIN, y }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
    y -= TINGGI_BARIS - 2;
  };
  kepala();

  for (const b of baris) {
    if (y < MARGIN + 16) {
      halaman = doc.addPage(A4_LANDSCAPE);
      kepala();
    }
    let x = MARGIN;
    selBukuInduk(b).forEach((teks, i) => {
      halaman.drawText(potong(font, teks, LEBAR[i] - 4), { x, y, size: UKURAN, font });
      x += LEBAR[i];
    });
    y -= TINGGI_BARIS;
  }

  const total = doc.getPageCount();
  doc.getPages().forEach((p, i) => {
    p.drawText(`Halaman ${i + 1} dari ${total}`, { x: A4_LANDSCAPE[0] - MARGIN - 70, y: 14, size: 7, font });
  });
  return doc.save();
}
