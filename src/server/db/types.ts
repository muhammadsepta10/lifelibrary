import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** Handle database yang dipakai bersama oleh Neon (prod) dan PGlite (dev/tes). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
