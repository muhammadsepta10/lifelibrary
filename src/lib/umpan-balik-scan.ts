/**
 * Umpan balik saat barcode terbaca: bunyi dan getar (kilatan digambar UI).
 * Semuanya bonus yang diam-diam dilewati bila tidak didukung (iOS tidak
 * punya `navigator.vibrate`; AudioContext bisa diblokir sampai ada sentuhan).
 * Tidak ada logika keputusan di sini, jadi tidak ada tesnya selain uji perangkat.
 */

type JenisBunyi = "berhasil" | "tolak";

let konteks: AudioContext | null = null;

/** Panggil dari sentuhan Pemilik (mis. tombol Mulai) supaya browser mengizinkan bunyi nanti. */
export function siapkanBunyi() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    konteks ??= new Ctor();
    if (konteks.state === "suspended") void konteks.resume();
  } catch {
    // tanpa bunyi
  }
}

function bunyi(jenis: JenisBunyi) {
  if (!konteks) return;
  try {
    const osc = konteks.createOscillator();
    const gain = konteks.createGain();
    const mulai = konteks.currentTime;
    osc.type = "sine";
    osc.frequency.value = jenis === "berhasil" ? 1040 : 220;
    gain.gain.setValueAtTime(0.0001, mulai);
    gain.gain.exponentialRampToValueAtTime(0.25, mulai + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, mulai + (jenis === "berhasil" ? 0.12 : 0.28));
    osc.connect(gain).connect(konteks.destination);
    osc.start(mulai);
    osc.stop(mulai + 0.3);
  } catch {
    // tanpa bunyi
  }
}

function getar(pola: number | number[]) {
  try {
    navigator.vibrate?.(pola);
  } catch {
    // tanpa getar
  }
}

export function umpanBalikScan(jenis: JenisBunyi) {
  bunyi(jenis);
  getar(jenis === "berhasil" ? 60 : [80, 60, 80]);
}
