ALTER TABLE "buku" ADD COLUMN "kota" text;--> statement-breakpoint
ALTER TABLE "buku" ADD COLUMN "edisi" text;--> statement-breakpoint
ALTER TABLE "buku" ADD COLUMN "seri" text;--> statement-breakpoint
ALTER TABLE "buku" ADD COLUMN "jilid" text;--> statement-breakpoint
ALTER TABLE "buku" ADD COLUMN "bahasa" text;--> statement-breakpoint
ALTER TABLE "buku" ADD COLUMN "halaman" integer;--> statement-breakpoint
ALTER TABLE "buku" ADD COLUMN "sinopsis" text;--> statement-breakpoint
ALTER TABLE "buku" ADD COLUMN "sampul" text;--> statement-breakpoint
ALTER TABLE "buku" ADD COLUMN "subjek" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "buku" ADD COLUMN "kelas_ddc" text;--> statement-breakpoint
ALTER TABLE "buku" ADD COLUMN "field_waktu" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "eksemplar" ADD COLUMN "lokasi_id" uuid;--> statement-breakpoint
ALTER TABLE "eksemplar" ADD COLUMN "tanggal_masuk" date;--> statement-breakpoint
ALTER TABLE "eksemplar" ADD COLUMN "asal" text;--> statement-breakpoint
ALTER TABLE "eksemplar" ADD COLUMN "harga" integer;--> statement-breakpoint
ALTER TABLE "eksemplar" ADD COLUMN "kondisi" text;--> statement-breakpoint
ALTER TABLE "eksemplar" ADD COLUMN "perlu_cetak" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "eksemplar" ADD COLUMN "field_waktu" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "kontributor" ADD COLUMN "nama_normal" text;--> statement-breakpoint
-- Kontributor yang sudah ada: hampiran SQL dari normalisasiNama (huruf kecil, tanda baca jadi spasi).
-- Beda aksen tidak ikut dinormalkan di sini; Kontributor baru memakai normalisasi lengkap dari aplikasi.
UPDATE "kontributor" SET "nama_normal" = btrim(regexp_replace(lower("nama"), '[^[:alnum:]]+', ' ', 'g'));--> statement-breakpoint
ALTER TABLE "kontributor" ALTER COLUMN "nama_normal" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "eksemplar" ADD CONSTRAINT "eksemplar_lokasi_id_lokasi_id_fk" FOREIGN KEY ("lokasi_id") REFERENCES "public"."lokasi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eksemplar_lokasi_idx" ON "eksemplar" USING btree ("lokasi_id");--> statement-breakpoint
CREATE INDEX "kontributor_nama_normal_idx" ON "kontributor" USING btree ("nama_normal");