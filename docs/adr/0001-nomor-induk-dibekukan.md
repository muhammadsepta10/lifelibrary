# Nomor Induk dibekukan saat Eksemplar diterima

Nomor Induk berformat `{KODE_KATEGORI}-{urut}/{tahun}` (misalnya `FIK-001/2026`), dengan nomor urut per kategori per **tahun pencatatan**. Tahun yang dipakai adalah tahun pencatatan, bukan tahun dari tanggal masuk, supaya nomor urut selalu naik walaupun koleksi lama dicatat belakangan atau tanggal masuknya tidak diketahui. Kategori bisa dikoreksi belakangan (auto-kategori dari ISBN bisa salah), tapi Nomor Induk **tidak ikut berubah**: kode kategorinya berarti "kategori saat diterima", meniru buku induk perpustakaan yang permanen. Letak rak yang terkini diwakili Nomor Panggil, yang memang boleh berubah. Nomor Induk dari Eksemplar yang sudah keluar tidak dipakai ulang. Kalau kode Kategori diganti, perubahan itu hanya berlaku untuk Nomor Induk baru. Nomor Induk hanya diberikan server saat Sinkronisasi, tidak pernah di perangkat (ADR 0004). Tahun pencatatan adalah waktu Eksemplar dicatat di perangkat, bukan waktu server menerimanya. Contoh: Eksemplar yang dicatat offline 31 Desember 2026 dan tersinkron 2 Januari 2027 tetap bernomor `…/2026`, menyambung urutan 2026.

## Considered Options

- Nomor urut global tanpa kode kategori (`0001/PERPUS/2026`): paling aman dari mismatch, tapi Pemilik ingin nomor yang langsung menunjukkan kategori.
- Nomor Induk dibuat ulang setiap kali kategori berubah: ditolak karena label fisik yang sudah tertempel jadi salah dan riwayat jadi rusak.
