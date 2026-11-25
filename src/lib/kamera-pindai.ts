/**
 * Membuka kamera untuk scan barcode.
 *
 * `facingMode: "environment"` saja tidak cukup: di HP berkamera belakang
 * banyak (mis. Galaxy A33) browser bisa memilih kamera berfokus tetap
 * (ultrawide/makro) yang membuat garis barcode selalu kabur, sehingga ZXing
 * gagal tanpa galat. Jadi kita memilih kamera belakang yang punya autofokus
 * "continuous", meminta resolusi tinggi, dan sedikit zoom supaya HP bisa
 * dipegang di atas jarak fokus minimum.
 */

/** Batasan getUserMedia: kamera belakang, resolusi tinggi bila tersedia. */
export const BATASAN_VIDEO_PINDAI: MediaTrackConstraints = {
  facingMode: "environment",
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};

/** Zoom bawaan: HP bisa dipegang ~2x lebih jauh dengan barcode tetap besar. */
const ZOOM_PINDAI = 2;
const KUNCI_KAMERA = "lifelibrary:kamera-pindai";

type Kemampuan = { facingMode?: string[]; focusMode?: string[]; zoom?: { min?: number; max?: number } };

type TrekKamera = {
  getCapabilities?: () => unknown;
  applyConstraints: (c: MediaTrackConstraints) => Promise<void>;
};

type PerangkatMedia = Pick<MediaDevices, "getUserMedia" | "enumerateDevices">;
type Simpanan = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function kemampuan(trek: TrekKamera | undefined): Kemampuan {
  try {
    return (trek?.getCapabilities?.() ?? {}) as Kemampuan;
  } catch {
    return {};
  }
}

const autofokus = (k: Kemampuan) => k.focusMode?.includes("continuous") ?? false;
const hentikan = (a: MediaStream) => a.getTracks().forEach((t) => t.stop());

/**
 * Menyalakan fokus terus-menerus dan sedikit zoom bila kamera mendukung.
 * Browser yang tidak mendukung dilewati diam-diam.
 */
export async function aturKameraPindai(trek: TrekKamera): Promise<void> {
  const k = kemampuan(trek);
  const lanjutan: Record<string, unknown>[] = [];
  if (autofokus(k)) lanjutan.push({ focusMode: "continuous" });
  const zoom = k.zoom;
  if (zoom && typeof zoom.max === "number" && zoom.max > (zoom.min ?? 1)) {
    lanjutan.push({ zoom: Math.max(zoom.min ?? 1, Math.min(zoom.max, ZOOM_PINDAI)) });
  }
  if (lanjutan.length === 0) return;
  try {
    await trek.applyConstraints({ advanced: lanjutan as MediaTrackConstraintSet[] });
  } catch {
    // kamera menolak: tetap pakai pengaturan bawaan
  }
}

async function bukaPerangkat(media: PerangkatMedia, deviceId: string): Promise<MediaStream | null> {
  try {
    return await media.getUserMedia({ video: { ...BATASAN_VIDEO_PINDAI, facingMode: undefined, deviceId: { exact: deviceId } }, audio: false });
  } catch {
    return null;
  }
}

/** Mencari kamera belakang lain yang ber-autofokus. Satu kamera dibuka sekaligus (HP sering menolak dua). */
async function cariKameraAutofokus(
  media: PerangkatMedia,
  kecuali: string | undefined,
): Promise<{ aliran: MediaStream; deviceId: string } | null> {
  let perangkat: MediaDeviceInfo[];
  try {
    perangkat = (await media.enumerateDevices()).filter((d) => d.kind === "videoinput" && d.deviceId && d.deviceId !== kecuali);
  } catch {
    return null;
  }
  for (const d of perangkat) {
    const aliran = await bukaPerangkat(media, d.deviceId);
    if (!aliran) continue;
    const k = kemampuan(aliran.getVideoTracks()[0]);
    const belakang = k.facingMode === undefined || k.facingMode.length === 0 || k.facingMode.includes("environment");
    if (belakang && autofokus(k)) return { aliran, deviceId: d.deviceId };
    hentikan(aliran);
  }
  return null;
}

function idPerangkat(aliran: MediaStream): string | undefined {
  const t = aliran.getVideoTracks()[0] as (MediaStreamTrack & { getSettings?: () => MediaTrackSettings }) | undefined;
  try {
    return t?.getSettings?.().deviceId;
  } catch {
    return undefined;
  }
}

/**
 * Membuka kamera belakang terbaik untuk scan. Galat izin/perangkat dari
 * getUserMedia pertama diteruskan ke pemanggil (pesan ramah di UI).
 */
export async function bukaKameraPindai(media: PerangkatMedia, simpanan: Simpanan | null = ambilSimpanan()): Promise<MediaStream> {
  const tersimpan = simpanan?.getItem(KUNCI_KAMERA);
  let aliran: MediaStream | null = null;
  if (tersimpan) {
    aliran = await bukaPerangkat(media, tersimpan);
    if (!aliran) simpanan?.removeItem(KUNCI_KAMERA);
  }
  aliran ??= await media.getUserMedia({ video: BATASAN_VIDEO_PINDAI, audio: false });

  if (!autofokus(kemampuan(aliran.getVideoTracks()[0]))) {
    const idBawaan = idPerangkat(aliran);
    hentikan(aliran);
    const lebihBaik = await cariKameraAutofokus(media, idBawaan);
    if (lebihBaik) {
      aliran = lebihBaik.aliran;
      simpanan?.setItem(KUNCI_KAMERA, lebihBaik.deviceId);
    } else {
      aliran = await media.getUserMedia({ video: BATASAN_VIDEO_PINDAI, audio: false });
    }
  }

  const trek = aliran.getVideoTracks()[0];
  if (trek) await aturKameraPindai(trek);
  return aliran;
}

function ambilSimpanan(): Simpanan | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
