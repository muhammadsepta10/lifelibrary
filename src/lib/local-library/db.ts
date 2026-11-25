import Dexie, { type EntityTable } from "dexie";
import type { JenisAturan } from "@/lib/kelola-protocol";
import type { FieldBuku, FieldEksemplar, KontributorDto } from "@/lib/buku-fields";
import type { PenyianganDto } from "@/lib/penyiangan-protocol";
import type { PeminjamanDto, PeminjamDto } from "@/lib/peminjaman-protocol";
import type { Mutasi } from "@/lib/sync-protocol";
import type { DrafBuku, StatusSumber } from "@/lib/draf-buku";

export type KategoriRow = {
  id: string;
  kode: string;
  nama: string;
  warna: string;
  diarsipkan: boolean;
};

export type LokasiRow = { id: string; nama: string };

export type AturanKategoriRow = {
  id: string;
  jenis: JenisAturan;
  pola: string;
  kategoriId: string;
  prioritas: number;
};

export type BukuRow = FieldBuku & {
  id: string;
  kontributor: KontributorDto[];
};

export type EksemplarRow = FieldEksemplar & {
  id: string;
  bukuId: string;
  kategoriId: string;
  /** Null sampai server memberi nomor (ADR 0004). */
  nomorInduk: string | null;
  /** ISO 8601 dengan offset zona perangkat. */
  waktuDicatat: string;
  status: "aktif" | "keluar";
  /** Catatan Penyiangan; kosong (atau tidak ada pada baris lama) selama aktif. */
  penyiangan?: PenyianganDto | null;
  menungguSinkron: boolean;
  /**
   * Label perlu dicetak: benar sejak Eksemplar dicatat (belum pernah dicetak) dan
   * saat Nomor Panggil berubah; salah setelah Pemilik menandai tercetak.
   * Antrean Cetak membacanya.
   */
  perluCetak: boolean;
};

export type PeminjamRow = PeminjamDto;
export type PeminjamanRow = PeminjamanDto;

export type OutboxRow = {
  seq?: number;
  id: string;
  mutasi: Mutasi;
  /** Alasan dari server bila mutasi ditolak permanen; tidak dikirim ulang. */
  ditolak?: string;
};

/** Catatan field yang ditimpa perubahan dari perangkat lain (log halaman Sinkronisasi). */
export type LogRow = {
  id: string;
  /** Epoch milidetik, jam perangkat. */
  pada: number;
  bukuId: string;
  eksemplarId: string | null;
  judul: string;
  field: string;
  label: string;
  /** Teks polos, mis. "Penerbit di Laut Bercerita diperbarui dari perangkat lain". */
  pesan: string;
};

/**
 * Draf hasil scan ISBN yang metadatanya belum bisa dicari (offline, atau sesi
 * login habis). Tersimpan di perangkat sampai Pencarian Metadata berhasil
 * ("siap": menunggu ditinjau Pemilik) dan sampai Pemilik menyimpan atau
 * membuangnya (ADR 0004). Bukan bagian outbox: belum ada yang dikirim ke server.
 */
export type DrafMenungguRow = {
  /** Id kartu di Sesi Penerimaan. */
  id: string;
  isbn13: string;
  status: "menunggu-data" | "siap";
  draf: DrafBuku;
  sumber: StatusSumber[];
  catatan: string | null;
  bisaCobaLagi: boolean;
  /** Cadangan judul boleh ditawarkan; tidak ada pada draf yang tersimpan sebelum fitur ini. */
  cadanganJudul?: boolean;
  /** Epoch milidetik, jam perangkat; urutan kartu saat dimuat ulang. */
  dicatat: number;
};

export type MetaRow = { key: string; value: string | null };

export const bukuKosong = (): Omit<FieldBuku, "judul"> => ({
  penerbit: null,
  kota: null,
  tahun: null,
  edisi: null,
  seri: null,
  jilid: null,
  bahasa: null,
  halaman: null,
  sinopsis: null,
  sampul: null,
  subjek: [],
  kelasDdc: null,
  isbn13: null,
});

export const eksemplarKosong = (): FieldEksemplar & { perluCetak: boolean } => ({
  tanggalMasuk: null,
  asal: null,
  harga: null,
  kondisi: null,
  lokasiId: null,
  // Eksemplar baru belum pernah dicetak: langsung masuk Antrean Cetak.
  perluCetak: true,
});

export class LocalDb extends Dexie {
  kategori!: EntityTable<KategoriRow, "id">;
  lokasi!: EntityTable<LokasiRow, "id">;
  aturanKategori!: EntityTable<AturanKategoriRow, "id">;
  buku!: EntityTable<BukuRow, "id">;
  eksemplar!: EntityTable<EksemplarRow, "id">;
  outbox!: EntityTable<OutboxRow, "seq">;
  meta!: EntityTable<MetaRow, "key">;
  log!: EntityTable<LogRow, "id">;
  drafMenunggu!: EntityTable<DrafMenungguRow, "id">;
  peminjam!: EntityTable<PeminjamRow, "id">;
  peminjaman!: EntityTable<PeminjamanRow, "id">;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      kategori: "id, kode",
      buku: "id, isbn13",
      eksemplar: "id, bukuId, kategoriId, waktuDicatat",
      outbox: "++seq, &id",
      meta: "key",
    });
    this.version(2).stores({
      lokasi: "id",
      aturanKategori: "id, kategoriId",
    });
    // Field Buku/Eksemplar bertambah (tanpa kunci baru, kecuali lokasiId). Baris lama
    // dilengkapi dengan nilai kosong supaya bentuknya sama dengan hasil pull.
    this.version(3)
      .stores({ eksemplar: "id, bukuId, kategoriId, lokasiId, waktuDicatat" })
      .upgrade(async (tx) => {
        await tx
          .table("buku")
          .toCollection()
          .modify((b) => Object.assign(b, bukuKosong(), { ...b }));
        await tx
          .table("eksemplar")
          .toCollection()
          .modify((e) => Object.assign(e, eksemplarKosong(), { ...e }));
      });
    this.version(4).stores({ log: "id, pada" });
    // Peminjaman (tiket #10). `tanggalKembali` tidak diindeks (null tidak bisa jadi kunci IndexedDB).
    this.version(5).stores({
      peminjam: "id, nama",
      peminjaman: "id, eksemplarId, peminjamId, jatuhTempo",
    });
    this.version(6).stores({ drafMenunggu: "id, isbn13, status, dicatat" });
  }
}
