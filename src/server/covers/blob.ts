import { get, put } from "@vercel/blob";
import { periksaKunci, type CoverStore } from "./store";

const AWALAN = "covers/";

/**
 * Sampul di Vercel Blob (private; hanya dilayani lewat rute aplikasi yang
 * meminta login Pemilik). Belum diuji terhadap Blob sungguhan: tes memakai
 * penyimpanan memori. Token dibaca dari BLOB_READ_WRITE_TOKEN oleh SDK.
 */
export function createBlobCoverStore(token: string): CoverStore {
  return {
    async put(kunci, bytes, contentType) {
      await put(`${AWALAN}${periksaKunci(kunci)}`, Buffer.from(bytes), {
        access: "private",
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        token,
      });
    },
    async get(kunci) {
      const hasil = await get(`${AWALAN}${periksaKunci(kunci)}`, { access: "private", token });
      if (!hasil || hasil.statusCode !== 200) return null;
      const bytes = new Uint8Array(await new Response(hasil.stream).arrayBuffer());
      return { bytes, contentType: hasil.blob.contentType };
    },
  };
}
