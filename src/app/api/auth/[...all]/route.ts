import { toNextJsHandler } from "better-auth/next-js";
import { runtime } from "@/server/runtime";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return toNextJsHandler(runtime().auth).GET(request);
}

export function POST(request: Request) {
  return toNextJsHandler(runtime().auth).POST(request);
}
