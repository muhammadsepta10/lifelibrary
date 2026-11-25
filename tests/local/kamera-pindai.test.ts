import { describe, expect, it, vi } from "vitest";
import { aturKameraPindai, BATASAN_VIDEO_PINDAI, bukaKameraPindai } from "@/lib/kamera-pindai";

/**
 * Regresi: barcode ISBN tidak terbaca sama sekali di Galaxy A33 (Chrome dan
 * Brave). `facingMode: "environment"` memilih "camera 2", kamera belakang
 * berfokus tetap (focusMode hanya "manual"); garis barcode selalu kabur dan
 * ZXing gagal tanpa galat. Kamera utama "camera 0" punya fokus "continuous"
 * dan di perangkat yang sama membaca barcode di setiap bingkai.
 */

type Kemampuan = { facingMode?: string[]; focusMode?: string[]; zoom?: { min?: number; max?: number } };

function trekPalsu(kemampuan: Kemampuan | undefined, tolak = false) {
  return {
    getCapabilities: kemampuan === undefined ? undefined : () => kemampuan,
    applyConstraints: vi.fn(() => (tolak ? Promise.reject(new Error("OverconstrainedError")) : Promise.resolve())),
    stop: vi.fn(),
  };
}

/** Meniru Galaxy A33: kamera bawaan untuk "environment" berfokus tetap, kamera utama ber-autofokus. */
function perangkatPalsu(kamera: { id: string; label: string; kemampuan: Kemampuan }[], bawaan: string) {
  const dibuka: string[] = [];
  const trek: Record<string, ReturnType<typeof trekPalsu>[]> = {};
  const media = {
    enumerateDevices: vi.fn(async () => kamera.map((k) => ({ kind: "videoinput", deviceId: k.id, label: k.label }))),
    getUserMedia: vi.fn(async (c: MediaStreamConstraints) => {
      const v = c.video as MediaTrackConstraints;
      const id = (v.deviceId as { exact?: string } | undefined)?.exact ?? bawaan;
      const k = kamera.find((x) => x.id === id)!;
      dibuka.push(id);
      const t = trekPalsu(k.kemampuan);
      (trek[id] ??= []).push(t);
      return { getVideoTracks: () => [t], getTracks: () => [t], id } as unknown as MediaStream;
    }),
  };
  return { media: media as unknown as Pick<MediaDevices, "getUserMedia" | "enumerateDevices">, dibuka, trek };
}

const A33 = [
  { id: "c2", label: "camera 2, facing back", kemampuan: { facingMode: ["environment"], focusMode: ["manual"], zoom: { min: 1, max: 4 } } },
  { id: "c1", label: "camera 1, facing front", kemampuan: { facingMode: ["user"], focusMode: ["manual"] } },
  { id: "c0", label: "camera 0, facing back", kemampuan: { facingMode: ["environment"], focusMode: ["manual", "single-shot", "continuous"], zoom: { min: 1, max: 8 } } },
];

function simpananPalsu() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe("kamera pindai", () => {
  it("meminta kamera belakang beresolusi tinggi", () => {
    expect(BATASAN_VIDEO_PINDAI).toMatchObject({ facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } });
  });

  it("pindah ke kamera belakang yang ber-autofokus bila bawaan browser berfokus tetap", async () => {
    const { media, trek } = perangkatPalsu(A33, "c2");
    const aliran = await bukaKameraPindai(media, simpananPalsu());
    expect((aliran as unknown as { id: string }).id).toBe("c0");
    expect(trek.c2[0].stop).toHaveBeenCalled();
    expect(trek.c0.at(-1)!.applyConstraints).toHaveBeenCalledWith({ advanced: [{ focusMode: "continuous" }, { zoom: 2 }] });
  });

  it("kamera pilihan diingat: kunjungan berikutnya langsung membuka kamera itu", async () => {
    const simpanan = simpananPalsu();
    await bukaKameraPindai(perangkatPalsu(A33, "c2").media, simpanan);
    const kedua = perangkatPalsu(A33, "c2");
    const aliran = await bukaKameraPindai(kedua.media, simpanan);
    expect((aliran as unknown as { id: string }).id).toBe("c0");
    expect(kedua.dibuka).toEqual(["c0"]);
  });

  it("tetap memakai kamera bawaan bila tidak ada kamera belakang ber-autofokus", async () => {
    const { media, dibuka } = perangkatPalsu([A33[0], A33[1]], "c2");
    const aliran = await bukaKameraPindai(media, simpananPalsu());
    expect((aliran as unknown as { id: string }).id).toBe("c2");
    expect(dibuka.at(-1)).toBe("c2");
  });

  it("kamera bawaan yang sudah ber-autofokus dipakai tanpa mencoba kamera lain", async () => {
    const { media, dibuka } = perangkatPalsu(A33, "c0");
    await bukaKameraPindai(media, simpananPalsu());
    expect(dibuka).toEqual(["c0"]);
  });

  it("zoom dibatasi rentang kamera", async () => {
    const trek = trekPalsu({ zoom: { min: 1, max: 1.5 } });
    await aturKameraPindai(trek);
    expect(trek.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 1.5 }] });
  });

  it("tidak menyentuh kamera yang tidak melaporkan kemampuan apa pun", async () => {
    for (const trek of [trekPalsu(undefined), trekPalsu({}), trekPalsu({ focusMode: ["manual"], zoom: { min: 1, max: 1 } })]) {
      await aturKameraPindai(trek);
      expect(trek.applyConstraints).not.toHaveBeenCalled();
    }
  });

  it("penolakan kamera tidak menggagalkan pemindaian", async () => {
    await expect(aturKameraPindai(trekPalsu({ focusMode: ["continuous"] }, true))).resolves.toBeUndefined();
  });
});
