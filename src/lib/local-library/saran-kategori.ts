import { normalisasiNama } from "@/lib/kontributor";
import type { AturanKategoriRow, BukuRow, EksemplarRow, KategoriRow } from "./db";

export type MasukanSaran = {
  kelasDdc: string | null;
  subjek: string[];
  /** Nama pengarang pada draf. */
  pengarang: string[];
  seri: string | null;
};

export type SaranKategori = {
  kategoriId: string;
  kode: string;
  nama: string;
  warna: string;
  sumber: "ddc" | "subjek" | "seri" | "pengarang";
  /** Kalimat untuk Pemilik: kenapa Kategori ini disarankan. */
  alasan: string;
};

type Data = {
  kategori: KategoriRow[];
  aturan: AturanKategoriRow[];
  buku: BukuRow[];
  eksemplar: EksemplarRow[];
};

/** Pola DDC (`155`, `15x`, `2xx`) dibandingkan dengan tiga digit pertama Kelas DDC. */
function cocokDdc(pola: string, kelasDdc: string): boolean {
  const tiga = kelasDdc.slice(0, 3);
  const p = pola.toLowerCase();
  return /^\d{3}$/.test(tiga) && /^[\dx]{3}$/.test(p) && [...p].every((c, i) => c === "x" || c === tiga[i]);
}

/**
 * Urutan sumber saran (ADR 0003): Aturan Kategori DDC, kata kunci subjek,
 * lalu Kategori Buku lain dengan seri atau pengarang yang sama. Hanya Kategori
 * yang tidak diarsipkan yang disarankan. Tidak ada saran = null.
 */
export function hitungSaranKategori(masukan: MasukanSaran, data: Data): SaranKategori | null {
  const aktif = new Map(data.kategori.filter((k) => !k.diarsipkan).map((k) => [k.id, k]));
  const bentuk = (kategoriId: string, sumber: SaranKategori["sumber"], alasan: string): SaranKategori | null => {
    const k = aktif.get(kategoriId);
    return k ? { kategoriId: k.id, kode: k.kode, nama: k.nama, warna: k.warna, sumber, alasan } : null;
  };
  const urut = (jenis: AturanKategoriRow["jenis"]) =>
    data.aturan
      .filter((a) => a.jenis === jenis && aktif.has(a.kategoriId))
      .sort((a, b) => a.prioritas - b.prioritas || a.pola.localeCompare(b.pola));

  if (masukan.kelasDdc) {
    const ddc = masukan.kelasDdc;
    const aturan = urut("ddc").find((a) => cocokDdc(a.pola, ddc));
    if (aturan) return bentuk(aturan.kategoriId, "ddc", `Kelas DDC ${ddc} cocok dengan aturan "${aturan.pola}"`);
  }

  for (const aturan of urut("subjek")) {
    const kunci = aturan.pola.toLowerCase();
    const subjek = masukan.subjek.find((s) => s.toLowerCase().includes(kunci));
    if (subjek) {
      return bentuk(aturan.kategoriId, "subjek", `Subjek "${subjek}" mengandung kata kunci "${aturan.pola}"`);
    }
  }

  // Kategori sebuah Buku = Kategori Eksemplar yang paling akhir dicatat.
  const kategoriBuku = new Map<string, string>();
  for (const e of [...data.eksemplar].sort((a, b) => a.waktuDicatat.localeCompare(b.waktuDicatat))) {
    kategoriBuku.set(e.bukuId, e.kategoriId);
  }
  const terbanyak = (bukuCocok: BukuRow[]) => {
    const hitung = new Map<string, number>();
    for (const b of bukuCocok) {
      const k = kategoriBuku.get(b.id);
      if (k && aktif.has(k)) hitung.set(k, (hitung.get(k) ?? 0) + 1);
    }
    return [...hitung.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };

  const seri = masukan.seri?.trim();
  if (seri) {
    const kunci = seri.toLowerCase();
    const k = terbanyak(data.buku.filter((b) => b.seri?.trim().toLowerCase() === kunci));
    if (k) return bentuk(k, "seri", `Buku lain dalam seri "${seri}" berkategori ${aktif.get(k)!.kode}`);
  }

  for (const nama of masukan.pengarang) {
    const kunci = normalisasiNama(nama);
    if (!kunci) continue;
    const k = terbanyak(data.buku.filter((b) => b.kontributor.some((c) => normalisasiNama(c.nama) === kunci)));
    if (k) return bentuk(k, "pengarang", `Buku lain karya ${nama} berkategori ${aktif.get(k)!.kode}`);
  }
  return null;
}
