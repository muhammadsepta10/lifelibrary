import { z } from "zod";

/**
 * Template Label: tata letak lembar Label (ukuran kertas, ukuran sel Label,
 * margin, jarak). Semua ukuran dalam milimeter. Dipakai bersama klien
 * (Perpustakaan Lokal) dan server (API Kelola).
 */

export const KERTAS = {
  A4: { lebar: 210, tinggi: 297 },
  F4: { lebar: 215, tinggi: 330 },
} as const;
export type Kertas = keyof typeof KERTAS;

export const DAFTAR_KERTAS = Object.keys(KERTAS) as Kertas[];

export type TemplateLabel = {
  kertas: Kertas;
  /** Ukuran sel Label (satu Label Punggung + Label Barcode). */
  w: number;
  h: number;
  /** Margin atas dan kiri. */
  mt: number;
  ml: number;
  /** Jarak antar kolom dan antar baris. */
  gx: number;
  gy: number;
};

/** Desain B "Pasangan": sel 66 × 26 mm, 3 kolom × 11 baris di A4. */
export const TEMPLATE_LABEL_BAWAAN: TemplateLabel = {
  kertas: "A4",
  w: 66,
  h: 26,
  mt: 5.5,
  ml: 6,
  gx: 0,
  gy: 0,
};

const ukuran = (nama: string) =>
  z
    .number({ error: `${nama} harus berupa angka` })
    .finite(`${nama} harus berupa angka`)
    .gt(0, `${nama} harus lebih dari 0 mm`)
    .max(400, `${nama} terlalu besar`);
const jarak = (nama: string) =>
  z
    .number({ error: `${nama} harus berupa angka` })
    .finite(`${nama} harus berupa angka`)
    .min(0, `${nama} tidak boleh negatif`)
    .max(400, `${nama} terlalu besar`);

export const templateLabelSchema = z
  .object({
    kertas: z.enum(DAFTAR_KERTAS, { error: "Kertas harus A4 atau F4" }),
    w: ukuran("Lebar Label"),
    h: ukuran("Tinggi Label"),
    mt: jarak("Margin atas"),
    ml: jarak("Margin kiri"),
    gx: jarak("Jarak kolom"),
    gy: jarak("Jarak baris"),
  })
  .superRefine((t, ctx) => {
    const k = KERTAS[t.kertas];
    if (!k) return;
    if (t.ml + t.w > k.lebar) {
      ctx.addIssue({ code: "custom", path: ["w"], message: `Label lebih lebar dari kertas ${t.kertas}` });
    }
    if (t.mt + t.h > k.tinggi) {
      ctx.addIssue({ code: "custom", path: ["h"], message: `Label lebih tinggi dari kertas ${t.kertas}` });
    }
  });

export type GridTemplate = {
  kolom: number;
  baris: number;
  perLembar: number;
  lebarKertas: number;
  tinggiKertas: number;
};

/** Selisih kecil akibat bilangan desimal (mis. 5.5 mm) tidak boleh mengurangi satu kolom/baris. */
const EPS = 1e-9;

/**
 * Kolom × baris: `floor((PW - 2*ml + gx) / (w + gx))` dan
 * `floor((PH - 2*mt + gy) / (h + gy))`, minimal 1.
 */
export function hitungGrid(t: TemplateLabel): GridTemplate {
  const { lebar, tinggi } = KERTAS[t.kertas];
  const kolom = Math.max(1, Math.floor((lebar - 2 * t.ml + t.gx) / (t.w + t.gx) + EPS));
  const baris = Math.max(1, Math.floor((tinggi - 2 * t.mt + t.gy) / (t.h + t.gy) + EPS));
  return { kolom, baris, perLembar: kolom * baris, lebarKertas: lebar, tinggiKertas: tinggi };
}
