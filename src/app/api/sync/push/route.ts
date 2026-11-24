import { ZodError } from "zod";
import { runtime } from "@/server/runtime";
import { tolakJikaBukanPemilik } from "@/server/require-owner";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const tolak = await tolakJikaBukanPemilik(request);
  if (tolak) return tolak;
  try {
    return Response.json(await runtime().sync.push(await request.json()));
  } catch (e) {
    if (e instanceof ZodError || e instanceof SyntaxError) {
      return Response.json({ galat: "Permintaan tidak valid" }, { status: 400 });
    }
    console.error("push gagal", e);
    return Response.json({ galat: "Sinkronisasi gagal" }, { status: 500 });
  }
}
