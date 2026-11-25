import { PESAN_SIMPAN_RUTE, RUTE_CANGKANG } from "@/lib/rute-cangkang";

/**
 * Menyuruh Service Worker menyimpan cangkang aplikasi (halaman statis) untuk
 * offline. Dipanggil saat aplikasi dibuka online; sekaligus memperbarui
 * cangkang lama sesudah deploy baru. Tanpa SW (dev, browser lama) tidak
 * melakukan apa-apa.
 */
export async function simpanCangkangOffline(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !navigator.onLine) return false;
  try {
    const registrasi = await navigator.serviceWorker.ready;
    const sw = registrasi.active;
    if (!sw) return false;
    sw.postMessage({ type: PESAN_SIMPAN_RUTE, urls: RUTE_CANGKANG });
    return true;
  } catch {
    return false;
  }
}
