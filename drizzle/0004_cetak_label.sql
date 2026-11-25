CREATE TABLE "template_label" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kertas" text NOT NULL,
	"w" double precision NOT NULL,
	"h" double precision NOT NULL,
	"mt" double precision NOT NULL,
	"ml" double precision NOT NULL,
	"gx" double precision NOT NULL,
	"gy" double precision NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eksemplar" ALTER COLUMN "perlu_cetak" SET DEFAULT true;--> statement-breakpoint
-- Sebelum Cetak Label ada, tidak ada Eksemplar yang pernah dicetak: semuanya masuk Antrean Cetak.
-- updated_at ikut dimajukan supaya perangkat menerima perubahannya lewat pull.
UPDATE "eksemplar" SET "perlu_cetak" = true, "updated_at" = clock_timestamp() WHERE "perlu_cetak" = false;