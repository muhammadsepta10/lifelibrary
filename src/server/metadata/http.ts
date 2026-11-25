export const USER_AGENT = "lifelibrary/0.1 (personal home library)";

/** Galat sumber dengan pesan yang aman ditampilkan (tidak memuat URL atau kunci API). */
export class GalatSumber extends Error {
  constructor(pesan: string) {
    super(pesan);
    this.name = "GalatSumber";
  }
}

export type Panggil = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Membungkus fetch dengan batas waktu per permintaan. Batas ditegakkan dengan
 * balapan (Promise.race), bukan hanya AbortSignal, supaya fetch yang
 * mengabaikan signal pun tidak menahan pencarian.
 */
export function buatPanggil(fetchImpl: typeof fetch, timeoutMs: number): Panggil {
  return async (url, init = {}) => {
    const kendali = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const habis = new Promise<never>((_, tolak) => {
      timer = setTimeout(() => {
        kendali.abort();
        tolak(new GalatSumber("Sumber terlalu lama menjawab (timeout)"));
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        fetchImpl(url, {
          ...init,
          headers: { "User-Agent": USER_AGENT, Accept: "*/*", ...init.headers },
          signal: kendali.signal,
        }),
        habis,
      ]);
    } catch (e) {
      if (e instanceof GalatSumber) throw e;
      throw new GalatSumber("Sumber tidak bisa dihubungi");
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Membatasi waktu satu pekerjaan sumber; lewat batas menjadi GalatSumber. */
export const dalamBatas = <T>(janji: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const habis = new Promise<never>((_, tolak) => {
    timer = setTimeout(() => tolak(new GalatSumber("Sumber terlalu lama menjawab (timeout)")), ms);
  });
  return Promise.race([janji, habis]).finally(() => clearTimeout(timer));
};

/** JSON dari sumber; null untuk 404 (tidak ada). Status galat lain melempar GalatSumber. */
export async function bacaJson(res: Response): Promise<unknown | null> {
  if (res.status === 404) return null;
  if (!res.ok) throw new GalatSumber(`Sumber membalas galat (HTTP ${res.status})`);
  try {
    return await res.json();
  } catch {
    throw new GalatSumber("Balasan sumber tidak bisa dibaca");
  }
}
