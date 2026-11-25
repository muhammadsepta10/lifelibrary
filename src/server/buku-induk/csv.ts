import { LABEL_ASAL } from "@/lib/buku-fields";
import type { BarisBukuInduk } from "@/lib/buku-induk";
import { LABEL_PENYIANGAN } from "@/lib/penyiangan-protocol";

export const KOLOM_BUKU_INDUK = [
  "Nomor Induk",
  "Judul",
  "Pengarang Utama",
  "Kategori",
  "Tanggal Masuk",
  "Asal",
  "Harga",
  "Status",
  "Tanggal Keluar",
  "Jenis Keluar",
  "Alasan Keluar",
] as const;

/** Satu baris Buku Induk sebagai teks per kolom; dipakai CSV dan PDF. */
export function selBukuInduk(b: BarisBukuInduk): string[] {
  return [
    b.nomorInduk ?? "",
    b.judul,
    b.pengarang,
    b.kategori.nama,
    b.tanggalMasuk ?? "",
    b.asal ? LABEL_ASAL[b.asal] : "",
    b.harga === null ? "" : String(b.harga),
    b.status === "keluar" ? "Keluar" : "Aktif",
    b.penyiangan?.tanggal ?? "",
    b.penyiangan ? LABEL_PENYIANGAN[b.penyiangan.jenis] : "",
    b.penyiangan?.alasan ?? "",
  ];
}

/** Awalan yang dibaca spreadsheet sebagai rumus; diberi petik di depan. */
const AWALAN_RUMUS = /^[=+\-@\t\r]/;

function sel(nilai: string, kolom: number) {
  // Kolom Harga berisi angka (bisa tampak seperti rumus bila negatif); sisanya teks bebas.
  const aman = kolom !== 6 && AWALAN_RUMUS.test(nilai) ? `'${nilai}` : nilai;
  return /[",\r\n]/.test(aman) ? `"${aman.replaceAll('"', '""')}"` : aman;
}

/** CSV UTF-8 dengan BOM (supaya Excel membaca aksen) dan akhir baris CRLF. */
export function bukuIndukCsv(baris: BarisBukuInduk[]): string {
  const semua = [[...KOLOM_BUKU_INDUK], ...baris.map(selBukuInduk)];
  return "﻿" + semua.map((r) => r.map(sel).join(",")).join("\r\n") + "\r\n";
}
