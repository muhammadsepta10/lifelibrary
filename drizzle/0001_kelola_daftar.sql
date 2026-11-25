CREATE TABLE "aturan_kategori" (
	"id" uuid PRIMARY KEY NOT NULL,
	"jenis" text NOT NULL,
	"pola" text NOT NULL,
	"kategori_id" uuid NOT NULL,
	"prioritas" integer NOT NULL,
	"dihapus" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lokasi" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nama" text NOT NULL,
	"dihapus" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kategori" DROP CONSTRAINT "kategori_kode_unique";--> statement-breakpoint
ALTER TABLE "kategori" ADD COLUMN "dihapus" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "aturan_kategori" ADD CONSTRAINT "aturan_kategori_kategori_id_kategori_id_fk" FOREIGN KEY ("kategori_id") REFERENCES "public"."kategori"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aturan_kategori_updated_at_idx" ON "aturan_kategori" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "lokasi_updated_at_idx" ON "lokasi" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "kategori_kode_aktif_uq" ON "kategori" USING btree ("kode") WHERE "kategori"."diarsipkan" = false and "kategori"."dihapus" = false;--> statement-breakpoint
CREATE INDEX "kategori_updated_at_idx" ON "kategori" USING btree ("updated_at");