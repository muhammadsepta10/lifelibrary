# lifelibrary

Pengelola perpustakaan pribadi di rumah: mencatat koleksi buku ala perpustakaan, lengkap dengan penomoran, kategori, dan peminjaman. PWA Next.js, offline-first (lihat `docs/adr/`).

## Menjalankan lokal

```bash
pnpm install
cp .env.example .env.local   # isi AUTH_SECRET, OWNER_EMAIL, OWNER_PASSWORD; DATABASE_URL boleh kosong
pnpm db:migrate              # tanpa DATABASE_URL: PGlite di .data/pglite
pnpm db:seed-owner           # membuat satu akun Pemilik
pnpm dev
```

Tes tidak butuh rahasia apa pun: `pnpm test` (Perpustakaan Lokal dengan `fake-indexeddb`, API Sinkronisasi dengan PGlite), `pnpm typecheck`, `pnpm lint`.

## Deploy ke Vercel (free tier)

1. Impor repo GitHub ke Vercel. Framework: Next.js, package manager: pnpm.
2. Buat database Neon dan salin connection string **role pemilik database** (bukan role `authenticator` milik Data API; role itu tidak boleh membuat tabel).
3. Isi environment variable di Vercel: `DATABASE_URL`, `AUTH_SECRET` (`openssl rand -base64 32`), `BETTER_AUTH_URL` (URL produksi).
4. Dari mesin lokal dengan `DATABASE_URL` yang sama: `pnpm db:migrate` lalu `pnpm db:seed-owner` (dengan `OWNER_EMAIL` dan `OWNER_PASSWORD` pilihanmu).
