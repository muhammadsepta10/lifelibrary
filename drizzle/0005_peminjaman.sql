CREATE TABLE "peminjam" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nama" text NOT NULL,
	"kontak" text,
	"field_waktu" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "peminjaman" (
	"id" uuid PRIMARY KEY NOT NULL,
	"eksemplar_id" uuid NOT NULL,
	"peminjam_id" uuid NOT NULL,
	"tanggal_pinjam" date NOT NULL,
	"jatuh_tempo" date NOT NULL,
	"tanggal_kembali" date,
	"field_waktu" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "peminjaman" ADD CONSTRAINT "peminjaman_eksemplar_id_eksemplar_id_fk" FOREIGN KEY ("eksemplar_id") REFERENCES "public"."eksemplar"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peminjaman" ADD CONSTRAINT "peminjaman_peminjam_id_peminjam_id_fk" FOREIGN KEY ("peminjam_id") REFERENCES "public"."peminjam"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "peminjam_updated_at_idx" ON "peminjam" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "peminjaman_eksemplar_aktif_uq" ON "peminjaman" USING btree ("eksemplar_id") WHERE "peminjaman"."tanggal_kembali" is null;--> statement-breakpoint
CREATE INDEX "peminjaman_peminjam_idx" ON "peminjaman" USING btree ("peminjam_id");--> statement-breakpoint
CREATE INDEX "peminjaman_updated_at_idx" ON "peminjaman" USING btree ("updated_at");