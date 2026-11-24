import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Waktu server untuk kursor pull. clock_timestamp() (bukan now()) supaya
// berbeda antar pernyataan di dalam satu transaksi.
const serverTime = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date", precision: 3 })
    .default(sql`clock_timestamp()`)
    .notNull();

export const kategori = pgTable(
  "kategori",
  {
    id: uuid("id").primaryKey(),
    kode: text("kode").notNull(),
    nama: text("nama").notNull(),
    warna: text("warna").notNull(),
    diarsipkan: boolean("diarsipkan").notNull().default(false),
    /** Penanda hapus supaya pull bisa menyampaikannya ke perangkat. */
    dihapus: boolean("dihapus").notNull().default(false),
    updatedAt: serverTime("updated_at"),
  },
  (t) => [
    // Kode hanya harus unik di antara Kategori aktif: kode Kategori yang
    // diarsipkan atau dihapus boleh dipakai lagi.
    uniqueIndex("kategori_kode_aktif_uq")
      .on(t.kode)
      .where(sql`${t.diarsipkan} = false and ${t.dihapus} = false`),
    index("kategori_updated_at_idx").on(t.updatedAt),
  ],
);

export const lokasi = pgTable(
  "lokasi",
  {
    id: uuid("id").primaryKey(),
    nama: text("nama").notNull(),
    dihapus: boolean("dihapus").notNull().default(false),
    updatedAt: serverTime("updated_at"),
  },
  (t) => [index("lokasi_updated_at_idx").on(t.updatedAt)],
);

export const aturanKategori = pgTable(
  "aturan_kategori",
  {
    id: uuid("id").primaryKey(),
    jenis: text("jenis").notNull(),
    pola: text("pola").notNull(),
    kategoriId: uuid("kategori_id")
      .notNull()
      .references(() => kategori.id),
    prioritas: integer("prioritas").notNull(),
    dihapus: boolean("dihapus").notNull().default(false),
    updatedAt: serverTime("updated_at"),
  },
  (t) => [index("aturan_kategori_updated_at_idx").on(t.updatedAt)],
);

export const buku = pgTable(
  "buku",
  {
    id: uuid("id").primaryKey(),
    isbn13: text("isbn13").unique(),
    judul: text("judul").notNull(),
    penerbit: text("penerbit"),
    tahun: integer("tahun"),
    kota: text("kota"),
    edisi: text("edisi"),
    seri: text("seri"),
    jilid: text("jilid"),
    bahasa: text("bahasa"),
    halaman: integer("halaman"),
    sinopsis: text("sinopsis"),
    sampul: text("sampul"),
    subjek: jsonb("subjek").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    kelasDdc: text("kelas_ddc"),
    /**
     * Waktu terakhir tiap field diubah Pemilik di perangkat (UTC ISO, kunci = nama
     * field). Dasar penyelesaian konflik per field (tiket #5); belum dipakai
     * untuk menolak perubahan.
     */
    fieldWaktu: jsonb("field_waktu").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    updatedAt: serverTime("updated_at"),
  },
  (t) => [index("buku_updated_at_idx").on(t.updatedAt)],
);

export const kontributor = pgTable(
  "kontributor",
  {
    id: uuid("id").primaryKey(),
    nama: text("nama").notNull(),
    /** Nama dinormalkan (`normalisasiNama`); nama sama = Kontributor yang sama. */
    namaNormal: text("nama_normal").notNull(),
  },
  (t) => [index("kontributor_nama_normal_idx").on(t.namaNormal)],
);

export const bukuKontributor = pgTable(
  "buku_kontributor",
  {
    bukuId: uuid("buku_id")
      .notNull()
      .references(() => buku.id),
    kontributorId: uuid("kontributor_id")
      .notNull()
      .references(() => kontributor.id),
    peran: text("peran").notNull(),
    urutan: integer("urutan").notNull(),
    utama: boolean("utama").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.bukuId, t.kontributorId, t.peran] })],
);

export const eksemplar = pgTable(
  "eksemplar",
  {
    id: uuid("id").primaryKey(),
    bukuId: uuid("buku_id")
      .notNull()
      .references(() => buku.id),
    kategoriId: uuid("kategori_id")
      .notNull()
      .references(() => kategori.id),
    /** Null sampai tersinkron; setelah diberikan tidak pernah berubah (ADR 0001). */
    nomorInduk: text("nomor_induk").unique(),
    kodeKategoriSaatDicatat: text("kode_kategori_saat_dicatat").notNull(),
    tahunPencatatan: integer("tahun_pencatatan").notNull(),
    waktuDicatatPerangkat: timestamp("waktu_dicatat_perangkat", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    status: text("status").notNull().default("aktif"),
    lokasiId: uuid("lokasi_id").references(() => lokasi.id),
    /** Boleh kosong: koleksi lama sering tidak diketahui tanggal masuknya. */
    tanggalMasuk: date("tanggal_masuk", { mode: "string" }),
    asal: text("asal"),
    /** Rupiah utuh. */
    harga: integer("harga"),
    kondisi: text("kondisi"),
    /** Label perlu dicetak (ulang), mis. setelah koreksi Kategori. Dibaca Antrean Cetak. */
    perluCetak: boolean("perlu_cetak").notNull().default(false),
    /** Lihat `buku.fieldWaktu`. */
    fieldWaktu: jsonb("field_waktu").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    updatedAt: serverTime("updated_at"),
  },
  (t) => [index("eksemplar_updated_at_idx").on(t.updatedAt), index("eksemplar_lokasi_idx").on(t.lokasiId)],
);

/** Penghitung Nomor Induk per (kode Kategori, tahun pencatatan). */
export const nomorIndukCounter = pgTable(
  "nomor_induk_counter",
  {
    kode: text("kode").notNull(),
    tahun: integer("tahun").notNull(),
    last: integer("last").notNull(),
  },
  (t) => [primaryKey({ columns: [t.kode, t.tahun] })],
);

/** Catatan mutasi yang sudah diproses; dasar idempotensi push. */
export const syncMutasi = pgTable("sync_mutasi", {
  id: uuid("id").primaryKey(),
  hasil: jsonb("hasil").notNull(),
  diterimaPada: timestamp("diterima_pada", { withTimezone: true }).defaultNow().notNull(),
});
