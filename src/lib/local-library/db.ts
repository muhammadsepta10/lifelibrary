import Dexie, { type EntityTable } from "dexie";
import type { JenisAturan } from "@/lib/kelola-protocol";
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

export type BukuRow = {
  id: string;
  judul: string;
  penerbit: string | null;
  tahun: number | null;
  isbn13: string | null;
  kontributor: { id: string; nama: string; peran: "pengarang" | "penerjemah" | "editor"; utama: boolean }[];
};

export type EksemplarRow = {
  id: string;
  bukuId: string;
  kategoriId: string;
  /** Null sampai server memberi nomor (ADR 0004). */
  nomorInduk: string | null;
  /** ISO 8601 dengan offset zona perangkat. */
  waktuDicatat: string;
  status: "aktif" | "keluar";
  menungguSinkron: boolean;
};

export type OutboxRow = {
  seq?: number;
  id: string;
  mutasi: Mutasi;
  /** Alasan dari server bila mutasi ditolak permanen; tidak dikirim ulang. */
  ditolak?: string;
};

export type MetaRow = { key: string; value: string | null };

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
  }
}
