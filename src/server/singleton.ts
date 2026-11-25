/**
 * Satu instans per proses, disimpan di `globalThis` supaya HMR dev tidak
 * membuat ulang layanan (mis. membuka PGlite berkali-kali).
 */
export function singletonGlobal<T>(kunci: string, buat: () => T): T {
  const g = globalThis as Record<string, unknown>;
  return (g[kunci] ??= buat()) as T;
}
