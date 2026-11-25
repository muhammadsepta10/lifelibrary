import type { PullResponse, PushResponse, SyncTransport } from "@/lib/sync-protocol";
import { bacaRespons } from "./baca-respons";

export { LoginDiperlukanError } from "./baca-respons";

/** Transport nyata: memanggil route API Sinkronisasi di server. */
export const fetchTransport: SyncTransport = {
  async push(req) {
    const res = await fetch("/api/sync/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    return bacaRespons<PushResponse>(res, "Sinkronisasi gagal");
  },
  async pull(kursor) {
    const q = kursor ? `?kursor=${encodeURIComponent(kursor)}` : "";
    return bacaRespons<PullResponse>(await fetch(`/api/sync/pull${q}`), "Sinkronisasi gagal");
  },
};
