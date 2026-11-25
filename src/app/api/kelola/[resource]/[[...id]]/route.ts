import type { z } from "zod";
import {
  aturanBaruSchema,
  aturanUbahSchema,
  kategoriBaruSchema,
  kategoriUbahSchema,
  lokasiBaruSchema,
  lokasiUbahSchema,
} from "@/lib/kelola-protocol";
import { templateLabelSchema } from "@/lib/label/template-label";
import { parse } from "@/server/kelola/galat";
import { responsGalatKelola } from "@/server/respons-kelola";
import { runtime } from "@/server/runtime";
import { tolakJikaBukanPemilik } from "@/server/require-owner";

export const dynamic = "force-dynamic";

/**
 * Endpoint kelola Kategori, Lokasi, dan Aturan Kategori (hanya online, ADR 0004):
 *   POST   /api/kelola/{resource}        -> buat
 *   PATCH  /api/kelola/{resource}/{id}   -> ubah
 *   DELETE /api/kelola/{resource}/{id}   -> hapus
 *   PUT    /api/kelola/template-label    -> simpan Template Label
 * `resource`: kategori | lokasi | aturan-kategori. Badan permintaan divalidasi
 * di sini dengan skema yang sama dengan API Kelola.
 */
type Ctx = { params: Promise<{ resource: string; id?: string[] }> };

type Perintah<Baru, Ubah> = {
  buat(input: Baru): Promise<unknown>;
  ubah(id: string, perubahan: Ubah): Promise<unknown>;
  hapus(id: string): Promise<unknown>;
};

/** Perintah satu sumber daya dengan badan permintaan yang sudah divalidasi. */
function sumberDaya<Baru, Ubah>(api: Perintah<Baru, Ubah>, baru: z.ZodType<Baru>, ubah: z.ZodType<Ubah>) {
  return {
    buat: (badan: unknown) => api.buat(parse(baru, badan)),
    ubah: (id: string, badan: unknown) => api.ubah(id, parse(ubah, badan)),
    hapus: (id: string) => api.hapus(id),
  };
}

function sumberDayaDari(resource: string) {
  const { kelola } = runtime();
  const peta = {
    kategori: () => sumberDaya(kelola.kategori, kategoriBaruSchema, kategoriUbahSchema),
    lokasi: () => sumberDaya(kelola.lokasi, lokasiBaruSchema, lokasiUbahSchema),
    "aturan-kategori": () => sumberDaya(kelola.aturanKategori, aturanBaruSchema, aturanUbahSchema),
  } as const;
  return resource in peta ? peta[resource as keyof typeof peta]() : null;
}

const tidakDitemukan = () => Response.json({ galat: "Tidak ditemukan" }, { status: 404 });

async function tangani(request: Request, { params }: Ctx, aksi: "buat" | "ubah" | "hapus" | "simpan") {
  const tolak = await tolakJikaBukanPemilik(request);
  if (tolak) return tolak;

  const { resource, id: segmen } = await params;

  // Template Label: satu per koleksi, disimpan dengan PUT /api/kelola/template-label.
  if (aksi === "simpan") {
    if (resource !== "template-label" || segmen) return tidakDitemukan();
    try {
      return Response.json(
        await runtime().kelola.templateLabel.simpan(parse(templateLabelSchema, await request.json())),
      );
    } catch (e) {
      return responsGalatKelola(e, "kelola");
    }
  }

  const target = sumberDayaDari(resource);
  const id = segmen?.[0];
  if (!target || (aksi === "buat") !== (id === undefined) || (segmen?.length ?? 0) > 1) return tidakDitemukan();

  try {
    if (aksi === "hapus") return Response.json(await target.hapus(id!));
    const badan: unknown = await request.json();
    return Response.json(aksi === "buat" ? await target.buat(badan) : await target.ubah(id!, badan));
  } catch (e) {
    return responsGalatKelola(e, "kelola");
  }
}

export const PUT = (r: Request, c: Ctx) => tangani(r, c, "simpan");
export const POST = (r: Request, c: Ctx) => tangani(r, c, "buat");
export const PATCH = (r: Request, c: Ctx) => tangani(r, c, "ubah");
export const DELETE = (r: Request, c: Ctx) => tangani(r, c, "hapus");
