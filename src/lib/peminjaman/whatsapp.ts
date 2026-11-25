/**
 * Pengingat jatuh tempo lewat WhatsApp: aplikasi hanya membuka `wa.me` dengan
 * pesan yang sudah terisi; Pemilik yang menekan kirim. Tanpa denda, tanpa
 * pengiriman otomatis.
 */

/**
 * Nomor WhatsApp dalam bentuk internasional tanpa `+` (`6281234567890`), atau
 * null bila kontak bukan nomor telepon. Nomor Indonesia 08… / 8… / +62… / 62…
 * disamakan menjadi 628…; nomor dengan kode negara lain (+65…) dipakai apa adanya.
 */
export function normalisasiNomorWa(kontak: string | null | undefined): string | null {
  if (!kontak) return null;
  const teks = kontak.trim();
  // Hanya angka dan tanda baca nomor telepon; alamat email atau @akun bukan nomor.
  if (!/^\+?[\d\s().-]+$/.test(teks)) return null;
  const berPlus = teks.startsWith("+");
  const digit = teks.replace(/\D/g, "");
  let nomor: string;
  if (berPlus) nomor = digit;
  else if (digit.startsWith("62")) nomor = digit;
  else if (digit.startsWith("0")) nomor = `62${digit.slice(1)}`;
  else if (digit.startsWith("8")) nomor = `62${digit}`;
  else return null;
  // Nomor Indonesia: 62 + 8-13 digit; kode negara lain: sampai 15 digit (E.164).
  const panjangOk = nomor.startsWith("62")
    ? nomor.length >= 10 && nomor.length <= 15
    : nomor.length >= 8 && nomor.length <= 15;
  return panjangOk ? nomor : null;
}

const BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** `2026-12-09` -> `9 Desember 2026`. */
export function tanggalIndonesia(iso: string): string {
  const [t, b, h] = iso.split("-").map(Number);
  return `${h} ${BULAN[b - 1]} ${t}`;
}

export function pesanPengingat(input: { nama: string; judul: string; jatuhTempo: string; terlambat: boolean }): string {
  const tanggal = tanggalIndonesia(input.jatuhTempo);
  const waktu = input.terlambat ? `sudah lewat jatuh tempo (${tanggal})` : `jatuh tempo pada ${tanggal}`;
  return `Halo ${input.nama}, mengingatkan buku "${input.judul}" yang kamu pinjam ${waktu}. Mohon dikembalikan ya. Terima kasih!`;
}

/** Tautan `wa.me` dengan pesan terisi. */
export function tautanWhatsApp(nomor: string, pesan: string): string {
  return `https://wa.me/${nomor}?text=${encodeURIComponent(pesan)}`;
}
