import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Env dibaca lazily supaya `next build` tidak butuh rahasia. */
export function env(): Env {
  cached ??= schema.parse({
    DATABASE_URL: process.env.DATABASE_URL || undefined,
    AUTH_SECRET: process.env.AUTH_SECRET || process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || undefined,
  });
  return cached;
}
