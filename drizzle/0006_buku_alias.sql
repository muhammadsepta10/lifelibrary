CREATE TABLE "buku_alias" (
	"id" uuid PRIMARY KEY NOT NULL,
	"buku_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buku_alias" ADD CONSTRAINT "buku_alias_buku_id_buku_id_fk" FOREIGN KEY ("buku_id") REFERENCES "public"."buku"("id") ON DELETE no action ON UPDATE no action;