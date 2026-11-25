import { runtime } from "@/server/runtime";
import { tolakJikaBukanPemilik } from "@/server/require-owner";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tolak = await tolakJikaBukanPemilik(request);
  if (tolak) return tolak;
  const kursor = new URL(request.url).searchParams.get("kursor");
  try {
    return Response.json(await runtime().sync.pull(kursor || null));
  } catch (e) {
    if (e instanceof Error && e.message === "Kursor tidak valid") {
      return Response.json({ galat: e.message }, { status: 400 });
    }
    console.error("pull gagal", e);
    return Response.json({ galat: "Sinkronisasi gagal" }, { status: 500 });
  }
}
