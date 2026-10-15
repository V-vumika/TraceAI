import Fastify from "fastify";
import { z } from "zod";

const app = Fastify({
  logger: true,
});

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("127.0.0.1"),
});

const env = envSchema.parse(process.env);

app.get("/health", async () => {
  return {
    status: "ok",
    service: "traceai-api",
    timestamp: new Date().toISOString(),
  };
});

const start = async () => {
  try {
    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();