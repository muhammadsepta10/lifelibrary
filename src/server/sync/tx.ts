import type { Db } from "@/server/db/types";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
