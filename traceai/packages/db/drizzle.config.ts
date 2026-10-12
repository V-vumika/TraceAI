import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

const envCandidates = [
  path.resolve(__dirname, "../../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
];

const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));

if (envPath) {
  config({
    path: envPath,
    override: true,
  });
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    `DATABASE_URL is not set. Checked: ${envCandidates.join(", ")}`,
  );
}

const databaseUrl = new URL(process.env.DATABASE_URL);
if (
  
  process.env.POSTGRES_PORT &&
  databaseUrl.port !== process.env.POSTGRES_PORT
) {
  throw new Error(
    `DATABASE_URL port ${databaseUrl.port || "5432"} does not match POSTGRES_PORT=${process.env.POSTGRES_PORT}. ` +
      "Drizzle would migrate the wrong Postgres instance.",
  );
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
