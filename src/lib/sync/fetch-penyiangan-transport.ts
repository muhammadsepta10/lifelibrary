import type { PenyianganTransport } from "@/lib/penyiangan-protocol";
import type { EksemplarDto } from "@/lib/sync-protocol";
import { bacaRespons } from "./baca-respons";

/** Transport nyata: memanggil route API Penyiangan. Tanpa jaringan fetch melempar TypeError. */
export const fetchPenyianganTransport: PenyianganTransport = {
  async siangi(eksemplarId, input) {
    const res = await fetch(`/api/penyiangan/${eksemplarId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return bacaRespons<EksemplarDto>(res, "Gagal menyimpan");
  },
};
