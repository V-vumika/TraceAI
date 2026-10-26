import Fastify from "fastify";
import { STATUS_CODES } from "node:http";
import { z } from "zod";
import { config } from "dotenv";
import path from "node:path";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import { db, users } from "@traceai/db";
import argon2 from "argon2";

config({ path: path.resolve(process.cwd(), "../../.env") });

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
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

app.register(fastifyCookie);

app.register(fastifyJwt, {
  secret: env.JWT_ACCESS_SECRET,
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

const signupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255).toLowerCase(),
  password: z.string().min(8).max(128),
});

app.post("/auth/signup", async (request, reply) => {
  const parsed = signupSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid signup details",
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const { name, email, password } = parsed.data;

  const existingUser = await db.query.users.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existingUser) {
    return reply.status(409).send({
      error: "An account with this email already exists.",
    });
  }

  const passwordHash = await argon2.hash(password);

  const [user] = await db
    .insert(users)
    .values({ name, email, passwordHash })
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
    });

  return reply.status(201).send({
    message: "Account created successfully.",
    user,
  });

});
const loginSchema = z.object({
  email: z.string().trim().email().max(255).toLowerCase(),
  password: z.string().min(1).max(128),
});

app.post("/auth/login", async (request, reply) => {
  const parsed = loginSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid login details",
    });
  }

  const { email, password } = parsed.data;

  const user = await db.query.users.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (!user || user.passwordHash === "DISABLED_DEMO_ACCOUNT") {
    return reply.status(401).send({
      error: "Invalid email or password.",
    });
  }

  const passwordMatches = await argon2.verify(
    user.passwordHash,
    password,
  );

  if (!passwordMatches) {
    return reply.status(401).send({
      error: "Invalid email or password.",
    });
  }

  const accessToken = app.jwt.sign(
    { sub: user.id, email: user.email },
    { expiresIn: "15m" },
  );

  const jwt = await import("jsonwebtoken");

const refreshToken = jwt.sign(
  { sub: user.id, email: user.email, type: "refresh" },
  env.JWT_REFRESH_SECRET,
  { expiresIn: "7d" },
);

  reply.setCookie("traceai_refresh", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth",
    maxAge: 7 * 24 * 60 * 60,
  });

 return reply.status(200).send({
    message: "Login successful.",
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
});

app.post("/auth/refresh", async (request, reply) => {
  const refreshToken = request.cookies.traceai_refresh;

  if (!refreshToken) {
    return reply.status(401).send({
      error: "Refresh token missing.",
    });
  }

  try {
    const jwt = await import("jsonwebtoken");

const payload = jwt.verify(
  refreshToken,
  env.JWT_REFRESH_SECRET,
) as {
  sub: string;
  email: string;
  type: string;
};

    if (payload.type !== "refresh") {
      return reply.status(401).send({
        error: "Invalid refresh token.",
      });
    }

    const accessToken = app.jwt.sign(
      { sub: payload.sub, email: payload.email },
      { expiresIn: "15m" },
    );

    return reply.status(200).send({ accessToken });
  } catch {
    reply.clearCookie("traceai_refresh", { path: "/auth" });

    return reply.status(401).send({
      error: "Invalid or expired refresh token.",
    });
  }
});

app.post("/auth/logout", async (_request, reply) => {
  reply.clearCookie("traceai_refresh", {
    path: "/auth",
  });

  return reply.status(200).send({
    message: "Logged out successfully.",
  });
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