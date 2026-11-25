import type { Asal } from "./buku-fields";
import type { PenyianganDto } from "./penyiangan-protocol";

/**
 * Buku Induk: daftar seluruh Eksemplar yang pernah dicatat, urut Nomor Induk,
 * termasuk yang sudah keluar (Penyiangan). Dipakai bersama oleh Perpustakaan
 * Lokal (halaman Buku Induk, offline) dan server (ekspor CSV/PDF), supaya
 * urutan dan filter tahunnya selalu sama.
 */
export type BarisBukuInduk = {
  eksemplarId: string;
  bukuId: string;
  /** Null selama Menunggu Sinkron; baris seperti itu diletakkan paling akhir. */
  nomorInduk: string | null;
  judul: string;
  pengarang: string;
  kategori: { kode: string; nama: string };
  /** Tahun pencatatan (tahun pada Nomor Induk), bukan tahun tanggal masuk. */
  tahunPencatatan: number;
  /** ISO 8601 waktu dicatat di perangkat; mengurutkan baris yang belum bernomor. */
  waktuDicatat: string;
  tanggalMasuk: string | null;
  asal: Asal | null;
  /** Rupiah utuh. */
  harga: number | null;
  status: "aktif" | "keluar";
  menungguSinkron: boolean;
  penyiangan: PenyianganDto | null;
};

const POLA = /^([A-Z0-9]+)-(\d+)\/(\d{4})$/;

/** `FIK-014/2026` -> kode, urut, tahun; null bila bukan Nomor Induk yang dikenal. */
export function uraiNomorInduk(nomor: string) {
  const m = POLA.exec(nomor);
  return m ? { kode: m[1], urut: Number(m[2]), tahun: Number(m[3]) } : null;
}

/**
 * Urutan Nomor Induk: kode Kategori, lalu tahun pencatatan, lalu nomor urut
 * (angka, bukan teks, jadi `FIK-010` sesudah `FIK-009` dan nomor lebih dari
 * 999 tetap benar).
 */
function bandingkan(a: string, b: string) {
  const x = uraiNomorInduk(a);
  const y = uraiNomorInduk(b);
  if (!x || !y) return a.localeCompare(b);
  return x.kode.localeCompare(y.kode) || x.tahun - y.tahun || x.urut - y.urut;
}

export function susunBukuInduk(baris: BarisBukuInduk[], opsi: { tahun?: number | null } = {}) {
  const tahun = [...new Set(baris.map((b) => b.tahunPencatatan))].sort((a, b) => b - a);
  const terpilih = opsi.tahun ? baris.filter((b) => b.tahunPencatatan === opsi.tahun) : baris;
  const urut = [...terpilih].sort((a, b) => {
    if (a.nomorInduk && b.nomorInduk) return bandingkan(a.nomorInduk, b.nomorInduk);
    if (a.nomorInduk) return -1;
    if (b.nomorInduk) return 1;
    return a.waktuDicatat.localeCompare(b.waktuDicatat) || a.eksemplarId.localeCompare(b.eksemplarId);
  });
  return { baris: urut, tahun };
}
