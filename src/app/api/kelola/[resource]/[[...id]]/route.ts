import { KelolaDitolakError } from "@/lib/kelola-protocol";
import { runtime } from "@/server/runtime";
import { tolakJikaBukanPemilik } from "@/server/require-owner";

export const dynamic = "force-dynamic";

/**
 * Endpoint kelola Kategori, Lokasi, dan Aturan Kategori (hanya online, ADR 0004):
 *   POST   /api/kelola/{resource}        -> buat
 *   PATCH  /api/kelola/{resource}/{id}   -> ubah
 *   DELETE /api/kelola/{resource}/{id}   -> hapus
 * `resource`: kategori | lokasi | aturan-kategori.
 */
type Ctx = { params: Promise<{ resource: string; id?: string[] }> };

const STATUS = { "tidak-valid": 422, konflik: 409, "tidak-ditemukan": 404 } as const;

async function tangani(request: Request, { params }: Ctx, aksi: "buat" | "ubah" | "hapus" | "simpan") {
  const tolak = await tolakJikaBukanPemilik(request);
  if (tolak) return tolak;

  const { resource, id: segmen } = await params;
  const { kelola } = runtime();

  // Template Label: satu per koleksi, disimpan dengan PUT /api/kelola/template-label.
  if (aksi === "simpan") {
    if (resource !== "template-label" || segmen) {
      return Response.json({ galat: "Tidak ditemukan" }, { status: 404 });
    }
    try {
      return Response.json(await kelola.templateLabel.simpan((await request.json()) as never));
    } catch (e) {
      return galatKelola(e);
    }
  }
  const target =
    resource === "kategori"
      ? kelola.kategori
      : resource === "lokasi"
        ? kelola.lokasi
        : resource === "aturan-kategori"
          ? kelola.aturanKategori
          : null;
  const id = segmen?.[0];
  if (!target || (aksi === "buat") !== (id === undefined) || (segmen?.length ?? 0) > 1) {
    return Response.json({ galat: "Tidak ditemukan" }, { status: 404 });
  }

  try {
    // Sama bentuk antar sumber daya; masukan divalidasi di dalam API Kelola.
    const t = target as {
      buat(i: unknown): Promise<unknown>;
      ubah(id: string, i: unknown): Promise<unknown>;
      hapus(id: string): Promise<unknown>;
    };
    if (aksi === "hapus") return Response.json(await t.hapus(id!));
    const body: unknown = await request.json();
    return Response.json(aksi === "buat" ? await t.buat(body) : await t.ubah(id!, body));
  } catch (e) {
    return galatKelola(e);
  }
}

function galatKelola(e: unknown) {
  if (e instanceof KelolaDitolakError) {
    return Response.json({ galat: e.pesan, jenis: e.jenis, field: e.field }, { status: STATUS[e.jenis] });
  }
  if (e instanceof SyntaxError) {
    return Response.json({ galat: "Permintaan tidak valid" }, { status: 400 });
  }
  console.error("kelola gagal", e);
  return Response.json({ galat: "Gagal menyimpan" }, { status: 500 });
}

export const PUT = (r: Request, c: Ctx) => tangani(r, c, "simpan");
export const POST = (r: Request, c: Ctx) => tangani(r, c, "buat");
export const PATCH = (r: Request, c: Ctx) => tangani(r, c, "ubah");
export const DELETE = (r: Request, c: Ctx) => tangani(r, c, "hapus");
