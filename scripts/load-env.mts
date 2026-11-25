import { existsSync } from "node:fs";

// Node 20.12+: muat .env.local bila ada. Nilai tidak pernah dicetak.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
