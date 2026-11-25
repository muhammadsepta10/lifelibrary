import { KelolaDitolakError, type KelolaTransport } from "@/lib/kelola-protocol";
import { LoginDiperlukanError } from "./fetch-transport";

type Galat = { galat?: string; jenis?: KelolaDitolakError["jenis"]; field?: string | null };

async function kirim<T>(method: string, path: string, body?: unknown): Promise<T> {
  // Tanpa jaringan fetch melempar TypeError; Perpustakaan Lokal mengubahnya jadi "Butuh koneksi".
  const res = await fetch(`/api/kelola/${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) throw new LoginDiperlukanError();
  if (res.ok) return (await res.json()) as T;
  const galat = (await res.json().catch(() => ({}))) as Galat;
  if (galat.jenis) throw new KelolaDitolakError(galat.jenis, galat.field ?? null, galat.galat ?? "Ditolak");
  throw new Error(galat.galat ?? `Gagal menyimpan (${res.status})`);
}

const perintah = (resource: string) => ({
  buat: (input: unknown) => kirim(`POST`, resource, input),
  ubah: (id: string, perubahan: unknown) => kirim("PATCH", `${resource}/${id}`, perubahan),
  hapus: (id: string) => kirim("DELETE", `${resource}/${id}`),
});

/** Transport nyata: memanggil route API Kelola di server. */
export const fetchKelolaTransport = {
  kategori: perintah("kategori"),
  lokasi: perintah("lokasi"),
  aturanKategori: perintah("aturan-kategori"),
  templateLabel: { simpan: (input: unknown) => kirim("PUT", "template-label", input) },
} as KelolaTransport;
