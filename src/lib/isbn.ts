/**
 * Logika murni ISBN, dipakai klien (isian dan scanner USB) dan server
 * (pencarian metadata). Pesan siap ditampilkan ke Pemilik.
 */

export type HasilIsbn = { ok: true; isbn13: string } | { ok: false; pesan: string };

const tolak = (pesan: string): HasilIsbn => ({ ok: false, pesan });

function digitPemeriksa13(duaBelas: string): number {
  let jumlah = 0;
  for (let i = 0; i < 12; i++) jumlah += Number(duaBelas[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (jumlah % 10)) % 10;
}

function isbn10Sah(kode: string): boolean {
  let jumlah = 0;
  for (let i = 0; i < 10; i++) {
    const c = kode[i];
    const nilai = c === "X" ? 10 : Number(c);
    jumlah += nilai * (10 - i);
  }
  return jumlah % 11 === 0;
}

/**
 * Menormalkan isian ISBN ke ISBN-13. ISBN-10 diubah (awalan 978); kode 13
 * digit hanya diterima bila berawalan 978/979, karena barcode lain (harga,
 * produk) bisa ikut terbaca scanner.
 */
export function normalisasiIsbn(masukan: string): HasilIsbn {
  const bersih = masukan
    .trim()
    .replace(/^isbn(-1[03])?:?\s*/i, "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
  if (bersih === "") return tolak("Ketik atau scan ISBN dulu");

  if (bersih.length === 10) {
    if (!/^\d{9}[\dX]$/.test(bersih)) return tolak("ISBN-10 hanya berisi angka (X boleh di akhir)");
    if (!isbn10Sah(bersih)) return tolak("Digit pemeriksa ISBN-10 tidak cocok. Periksa lagi angkanya");
    const dasar = `978${bersih.slice(0, 9)}`;
    return { ok: true, isbn13: `${dasar}${digitPemeriksa13(dasar)}` };
  }

  if (bersih.length === 13) {
    if (!/^\d{13}$/.test(bersih)) return tolak("ISBN-13 hanya berisi angka");
    if (!/^97[89]/.test(bersih)) {
      return tolak(`Kode ${bersih} bukan ISBN: ISBN selalu berawalan 978 atau 979. Mungkin ini barcode lain di buku`);
    }
    if (digitPemeriksa13(bersih.slice(0, 12)) !== Number(bersih[12])) {
      return tolak("Digit pemeriksa ISBN-13 tidak cocok. Periksa lagi angkanya");
    }
    return { ok: true, isbn13: bersih };
  }

  return tolak("ISBN harus 10 atau 13 digit");
}
