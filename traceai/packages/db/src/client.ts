import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), "../../.env") });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const client = postgres(connectionString);

export const db = drizzle(client, { schema });
export { client };
export * from "./schema";