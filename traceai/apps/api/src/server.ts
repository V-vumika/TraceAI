import Fastify from "fastify";
import { STATUS_CODES } from "node:http";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("127.0.0.1"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    "Invalid environment variables:",
    parsedEnv.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  );
  process.exit(1);
}

const env = parsedEnv.data;

const app = Fastify({
  logger: true,
});

const problem = (statusCode: number, detail: string, instance: string) => ({
  type: "about:blank",
  title: STATUS_CODES[statusCode] ?? "Error",
  status: statusCode,
  detail,
  instance,
});

app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
  
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number" &&
      error.statusCode >= 400 &&
      error.statusCode < 600
        ? error.statusCode
        : 500;
  
    const detail =
      statusCode >= 500
        ? "An unexpected error occurred."
        : error instanceof Error
          ? error.message
          : "Request failed.";
  
    return reply
      .status(statusCode)
      .type("application/problem+json")
      .send(problem(statusCode, detail, request.url));
  });

  
// Fastify's default 404 bypasses setErrorHandler, so handle it explicitly
app.setNotFoundHandler((request, reply) => {
  return reply
    .status(404)
    .type("application/problem+json")
    .send(
      problem(
        404,
        `Route ${request.method} ${request.url} not found.`,
        request.url,
      ),
    );
});

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

const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, shutting down...`);
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

void start();