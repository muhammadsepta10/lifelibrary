CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buku" (
	"id" uuid PRIMARY KEY NOT NULL,
	"isbn13" text,
	"judul" text NOT NULL,
	"penerbit" text,
	"tahun" integer,
	"updated_at" timestamp (3) with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "buku_isbn13_unique" UNIQUE("isbn13")
);
--> statement-breakpoint
CREATE TABLE "buku_kontributor" (
	"buku_id" uuid NOT NULL,
	"kontributor_id" uuid NOT NULL,
	"peran" text NOT NULL,
	"urutan" integer NOT NULL,
	"utama" boolean DEFAULT false NOT NULL,
	CONSTRAINT "buku_kontributor_buku_id_kontributor_id_peran_pk" PRIMARY KEY("buku_id","kontributor_id","peran")
);
--> statement-breakpoint
CREATE TABLE "eksemplar" (
	"id" uuid PRIMARY KEY NOT NULL,
	"buku_id" uuid NOT NULL,
	"kategori_id" uuid NOT NULL,
	"nomor_induk" text,
	"kode_kategori_saat_dicatat" text NOT NULL,
	"tahun_pencatatan" integer NOT NULL,
	"waktu_dicatat_perangkat" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'aktif' NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "eksemplar_nomor_induk_unique" UNIQUE("nomor_induk")
);
--> statement-breakpoint
CREATE TABLE "kategori" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kode" text NOT NULL,
	"nama" text NOT NULL,
	"warna" text NOT NULL,
	"diarsipkan" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "kategori_kode_unique" UNIQUE("kode")
);
--> statement-breakpoint
CREATE TABLE "kontributor" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nama" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nomor_induk_counter" (
	"kode" text NOT NULL,
	"tahun" integer NOT NULL,
	"last" integer NOT NULL,
	CONSTRAINT "nomor_induk_counter_kode_tahun_pk" PRIMARY KEY("kode","tahun")
);
--> statement-breakpoint
CREATE TABLE "sync_mutasi" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hasil" jsonb NOT NULL,
	"diterima_pada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buku_kontributor" ADD CONSTRAINT "buku_kontributor_buku_id_buku_id_fk" FOREIGN KEY ("buku_id") REFERENCES "public"."buku"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buku_kontributor" ADD CONSTRAINT "buku_kontributor_kontributor_id_kontributor_id_fk" FOREIGN KEY ("kontributor_id") REFERENCES "public"."kontributor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eksemplar" ADD CONSTRAINT "eksemplar_buku_id_buku_id_fk" FOREIGN KEY ("buku_id") REFERENCES "public"."buku"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eksemplar" ADD CONSTRAINT "eksemplar_kategori_id_kategori_id_fk" FOREIGN KEY ("kategori_id") REFERENCES "public"."kategori"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "buku_updated_at_idx" ON "buku" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "eksemplar_updated_at_idx" ON "eksemplar" USING btree ("updated_at");