import type { PullResponse, PushResponse, SyncTransport } from "@/lib/sync-protocol";

/** Sesi tidak ada atau kedaluwarsa (401). Data lokal tetap aman; Sinkronisasi menunggu login ulang. */
export class LoginDiperlukanError extends Error {
  constructor() {
    super("Masuk lagi untuk melanjutkan Sinkronisasi");
    this.name = "LoginDiperlukanError";
  }
}

async function baca<T>(res: Response): Promise<T> {
  if (res.status === 401) throw new LoginDiperlukanError();
  if (!res.ok) throw new Error(`Sinkronisasi gagal (${res.status})`);
  return (await res.json()) as T;
}

/** Transport nyata: memanggil route API Sinkronisasi di server. */
export const fetchTransport: SyncTransport = {
  async push(req) {
    const res = await fetch("/api/sync/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    return baca<PushResponse>(res);
  },
  async pull(kursor) {
    const q = kursor ? `?kursor=${encodeURIComponent(kursor)}` : "";
    return baca<PullResponse>(await fetch(`/api/sync/pull${q}`));
  },
};
