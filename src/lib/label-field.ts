/** Nama field Buku dan Eksemplar sebagaimana ditampilkan ke Pemilik (kunci = nama field di protokol). */
export const LABEL_FIELD: Record<string, string> = {
  // Buku
  judul: "Judul",
  penerbit: "Penerbit",
  kota: "Kota",
  tahun: "Tahun",
  edisi: "Edisi",
  seri: "Seri",
  jilid: "Jilid",
  bahasa: "Bahasa",
  halaman: "Halaman",
  sinopsis: "Sinopsis",
  sampul: "Sampul",
  subjek: "Subjek",
  kelasDdc: "Kelas DDC",
  isbn13: "ISBN",
  kontributor: "Kontributor",
  // Eksemplar
  tanggalMasuk: "Tanggal masuk",
  asal: "Asal",
  harga: "Harga",
  kondisi: "Kondisi",
  lokasiId: "Lokasi",
  kategoriId: "Kategori",
  // Peminjaman dan Peminjam
  jatuhTempo: "Jatuh tempo",
  tanggalKembali: "Tanggal kembali",
  nama: "Nama",
  kontak: "Kontak",
};

export const labelField = (field: string) => LABEL_FIELD[field] ?? field;
