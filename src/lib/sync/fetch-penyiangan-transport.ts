import { KelolaDitolakError } from "@/lib/kelola-protocol";
import type { PenyianganTransport } from "@/lib/penyiangan-protocol";
import type { EksemplarDto } from "@/lib/sync-protocol";
import { LoginDiperlukanError } from "./fetch-transport";

type Galat = { galat?: string; jenis?: KelolaDitolakError["jenis"]; field?: string | null };

/** Transport nyata: memanggil route API Penyiangan. Tanpa jaringan fetch melempar TypeError. */
export const fetchPenyianganTransport: PenyianganTransport = {
  async siangi(eksemplarId, input) {
    const res = await fetch(`/api/penyiangan/${eksemplarId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.status === 401) throw new LoginDiperlukanError();
    if (res.ok) return (await res.json()) as EksemplarDto;
    const galat = (await res.json().catch(() => ({}))) as Galat;
    if (galat.jenis) throw new KelolaDitolakError(galat.jenis, galat.field ?? null, galat.galat ?? "Ditolak");
    throw new Error(galat.galat ?? `Gagal menyimpan (${res.status})`);
  },
};
