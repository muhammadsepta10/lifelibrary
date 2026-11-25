/**
 * Storage sampul aplikasi. Sampul diunduh di server lalu disimpan di sini,
 * tidak pernah di-hotlink. Implementasi: Vercel Blob (produksi), berkas lokal
 * (dev), memori (tes).
 */
export type SampulTersimpan = { bytes: Uint8Array; contentType: string };

export type CoverStore = {
  put(kunci: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Null bila tidak ada. */
  get(kunci: string): Promise<SampulTersimpan | null>;
};

/** Kunci sampul: nama berkas polos, tanpa folder, supaya aman dari path traversal. */
export const KUNCI_SAMPUL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export function periksaKunci(kunci: string): string {
  if (!KUNCI_SAMPUL.test(kunci) || kunci.includes("..")) throw new Error("Kunci sampul tidak sah");
  return kunci;
}

export function createMemoryCoverStore(): CoverStore {
  const isi = new Map<string, SampulTersimpan>();
  return {
    async put(kunci, bytes, contentType) {
      isi.set(periksaKunci(kunci), { bytes: new Uint8Array(bytes), contentType });
    },
    async get(kunci) {
      return isi.get(periksaKunci(kunci)) ?? null;
    },
  };
}
