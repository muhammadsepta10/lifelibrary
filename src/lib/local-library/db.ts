import Dexie, { type EntityTable } from "dexie";
import type { JenisAturan } from "@/lib/kelola-protocol";
import type { FieldBuku, FieldEksemplar, KontributorDto } from "@/lib/buku-fields";
import type { Mutasi } from "@/lib/sync-protocol";

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
  menungguSinkron: boolean;
  /**
   * Label perlu dicetak: benar sejak Eksemplar dicatat (belum pernah dicetak) dan
   * saat Nomor Panggil berubah; salah setelah Pemilik menandai tercetak.
   * Antrean Cetak membacanya.
   */
  perluCetak: boolean;
};

export type OutboxRow = {
  seq?: number;
  id: string;
  mutasi: Mutasi;
  /** Alasan dari server bila mutasi ditolak permanen; tidak dikirim ulang. */
  ditolak?: string;
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
  }
}
