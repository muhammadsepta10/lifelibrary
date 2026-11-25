import { KelolaDitolakError } from "@/lib/kelola-protocol";

/** Sesi tidak ada atau kedaluwarsa (401). Data lokal tetap aman; Sinkronisasi menunggu login ulang. */
export class LoginDiperlukanError extends Error {
  constructor() {
    super("Masuk lagi untuk melanjutkan Sinkronisasi");
    this.name = "LoginDiperlukanError";
  }
}

/** Badan galat yang dikirim route API: pesan, dan (untuk penolakan Kelola) jenis serta field-nya. */
type Galat = { galat?: string; jenis?: KelolaDitolakError["jenis"]; field?: string | null };

/**
 * Pembaca respons tunggal untuk semua transport fetch: 401 menjadi
 * `LoginDiperlukanError`, penolakan Kelola menjadi `KelolaDitolakError`, galat lain
 * menjadi `Error` berpesan dari server (atau `gagal` + status bila tak ada).
 * Tanpa jaringan fetch sendiri melempar TypeError.
 */
export async function bacaRespons<T>(res: Response, gagal: string): Promise<T> {
  if (res.status === 401) throw new LoginDiperlukanError();
  if (res.ok) return (await res.json()) as T;
  const galat = (await res.json().catch(() => ({}))) as Galat;
  if (galat.jenis) throw new KelolaDitolakError(galat.jenis, galat.field ?? null, galat.galat ?? "Ditolak");
  throw new Error(galat.galat ?? `${gagal} (${res.status})`);
}
