import { modulCode128 } from "@/lib/label/code128";
import { hitungGrid, type GridTemplate, type TemplateLabel } from "@/lib/label/template-label";
import type { NomorPanggil } from "./nomor-panggil";

export const ALASAN_BELUM_PUNYA_NOMOR_INDUK = "belum punya Nomor Induk";

/** Eksemplar di Antrean Cetak. */
export type ItemAntreanCetak = {
  eksemplarId: string;
  bukuId: string;
  judul: string;
  pengarang: string;
  kategori: { kode: string; nama: string; warna: string };
  nomorInduk: string | null;
  nomorPanggil: NomorPanggil;
  waktuDicatat: string;
  /** Hanya Eksemplar dengan Nomor Induk yang bisa dicetak. */
  bisaDicetak: boolean;
  alasanTidakBisa: string | null;
};

export type JumlahAntreanCetak = {
  /** Semua Eksemplar yang Labelnya belum dicetak. */
  total: number;
  /** Yang sudah punya Nomor Induk: "Label siap dicetak". */
  siapDicetak: number;
  /** Yang Menunggu Sinkron: belum bisa dicetak. */
  menungguNomorInduk: number;
};

export type LabelCetak = {
  eksemplarId: string;
  nomorInduk: string;
  judul: string;
  kategori: { kode: string; nama: string; warna: string };
  nomorPanggil: NomorPanggil;
  /** Code 128 dari Nomor Induk sebagai deretan modul "1"/"0". */
  barcode: string;
};

/**
 * dilewati: sel yang sudah terpakai (posisi awal); label: berisi Label;
 * kosong: sel tersisa; uji: halaman uji, hanya garis tepi.
 */
export type JenisSel = "dilewati" | "label" | "kosong" | "uji";

export type SelCetak = {
  /** Urutan sel dalam lembar, dari 0 (kiri atas), baris demi baris. */
  indeks: number;
  kolom: number;
  baris: number;
  /** Posisi kiri-atas dan ukuran sel dalam mm. */
  x: number;
  y: number;
  lebar: number;
  tinggi: number;
  jenis: JenisSel;
  label?: LabelCetak;
};

export type LembarCetak = { nomor: number; sel: SelCetak[] };

export type TidakBisaDicetak = { eksemplarId: string; judul: string; alasan: string };

export type RencanaCetak = GridTemplate & {
  template: TemplateLabel;
  halamanUji: boolean;
  /** Posisi awal yang dipakai (1 = kiri atas), sudah dirapikan. */
  posisiAwal: number;
  jumlahDilewati: number;
  jumlahLabel: number;
  jumlahLembar: number;
  jumlahKosong: number;
  lembar: LembarCetak[];
  tidakBisaDicetak: TidakBisaDicetak[];
};

export type InputRencanaCetak = {
  eksemplarIds: string[];
  /** 1 = sel kiri atas; N melewati N-1 sel pertama di lembar pertama. */
  posisiAwal: number;
  /** Pratinjau Template Label yang belum disimpan; bawaannya yang tersimpan. */
  template?: TemplateLabel;
  /** Halaman uji: hanya garis tepi sel. */
  halamanUji?: boolean;
};

/** Eksemplar yang bisa dicetak: sudah punya Nomor Induk. */
type BahanLabel = Omit<LabelCetak, "barcode">;

/** Menyusun lembar: posisi sel dalam mm, sel dilewati, Label, dan sel kosong. */
export function susunRencanaCetak(
  template: TemplateLabel,
  input: { posisiAwal: number; halamanUji: boolean },
  bahan: BahanLabel[],
  tidakBisaDicetak: TidakBisaDicetak[],
): RencanaCetak {
  const grid = hitungGrid(template);
  const awal = Number.isFinite(input.posisiAwal) ? Math.trunc(input.posisiAwal) : 1;
  const posisiAwal = input.halamanUji ? 1 : Math.min(Math.max(1, awal), grid.perLembar);
  const dilewati = posisiAwal - 1;
  const label = input.halamanUji ? [] : bahan;
  const total = dilewati + label.length;
  const jumlahLembar = input.halamanUji ? 1 : Math.max(1, Math.ceil(total / grid.perLembar));

  const lembar: LembarCetak[] = [];
  for (let s = 0; s < jumlahLembar; s++) {
    const sel: SelCetak[] = [];
    for (let i = 0; i < grid.perLembar; i++) {
      const global = s * grid.perLembar + i;
      const kolom = i % grid.kolom;
      const baris = Math.floor(i / grid.kolom);
      const dasar = {
        indeks: i,
        kolom,
        baris,
        x: template.ml + kolom * (template.w + template.gx),
        y: template.mt + baris * (template.h + template.gy),
        lebar: template.w,
        tinggi: template.h,
      };
      if (input.halamanUji) {
        sel.push({ ...dasar, jenis: "uji" });
      } else if (global < dilewati) {
        sel.push({ ...dasar, jenis: "dilewati" });
      } else if (global < total) {
        const b = label[global - dilewati];
        sel.push({
          ...dasar,
          jenis: "label",
          label: {
            eksemplarId: b.eksemplarId,
            nomorInduk: b.nomorInduk,
            judul: b.judul,
            kategori: b.kategori,
            nomorPanggil: b.nomorPanggil,
            barcode: modulCode128(b.nomorInduk),
          },
        });
      } else {
        sel.push({ ...dasar, jenis: "kosong" });
      }
    }
    lembar.push({ nomor: s + 1, sel });
  }

  return {
    ...grid,
    template,
    halamanUji: input.halamanUji,
    posisiAwal,
    jumlahDilewati: input.halamanUji ? 0 : dilewati,
    jumlahLabel: label.length,
    jumlahLembar,
    jumlahKosong: input.halamanUji ? 0 : jumlahLembar * grid.perLembar - total,
    lembar,
    tidakBisaDicetak,
  };
}
