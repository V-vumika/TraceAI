import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import { STATUS_CODES } from "node:http";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { config } from "dotenv";
import path from "node:path";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import { db, users, workspaces, memberships } from "@traceai/db";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import fastifyCors from "@fastify/cors";
import { nodeDefinitions } from "@traceai/nodes";

// ---------------------------------------------------------------------------
// Type augmentation (fixes TS2339 for `app.authenticate` and `request.user.sub`)
// ---------------------------------------------------------------------------
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; email: string };
    user: { sub: string; email: string };
  }
}

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
    parsedEnv.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    ),
  );
  process.exit(1);
}

const env = parsedEnv.data;

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------
const signupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255).toLowerCase(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(255).toLowerCase(),
  password: z.string().min(1).max(128),
});

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(100),
});

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = Fastify({ logger: true });
export { app };

app.register(fastifyCookie);

app.register(fastifyCors, {
  origin: "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
});

app.register(fastifyJwt, {
  secret: env.JWT_ACCESS_SECRET,
});

app.decorate(
  "authenticate",
  async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      await reply.status(401).send({
        error: "Unauthorized",
      });
    }
  },
);

const requireWorkspaceRole = async (
  userId: string,
  workspaceId: string,
  allowedRoles: string[],
) => {
  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!membership || !allowedRoles.includes(membership.role)) {
    return null;
  }

  return membership;
};

const problem = (statusCode: number, detail: string, instance: string) => ({
  type: "about:blank",
  title: STATUS_CODES[statusCode] ?? "Error",
  status: statusCode,
  detail,
  instance,
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);

  const isObject = typeof error === "object" && error !== null;

  const statusCode =
    isObject &&
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

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get("/health", async () => ({
  status: "ok",
  service: "traceai-api",
  timestamp: new Date().toISOString(),
}));

// Create workspace
app.post(
  "/workspaces",
  { preHandler: (request, reply) => app.authenticate(request, reply) },
  async (request, reply) => {
    const parsed = createWorkspaceSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid workspace details",
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const userId = request.user.sub;
    const { name } = parsed.data;

    const result = await db.transaction(async (tx) => {
      const [workspace] = await tx
        .insert(workspaces)
        .values({ name })
        .returning();

      if (!workspace) {
        throw new Error("Failed to create workspace.");
      }

      await tx.insert(memberships).values({
        userId,
        workspaceId: workspace.id,
        role: "owner",
      });

      return workspace;
    });

    return reply.status(201).send({
      message: "Workspace created successfully.",
      workspace: result,
    });
  },
);

// Check workspace membership and role
app.get(
  "/workspaces/:workspaceId/access",
  { preHandler: (request, reply) => app.authenticate(request, reply) },
  async (request, reply) => {
    const { workspaceId } = request.params as {
      workspaceId: string;
    };

    const userId = request.user.sub;

    const membership = await requireWorkspaceRole(
      userId,
      workspaceId,
      ["owner", "member"],
    );

    if (!membership) {
      return reply.status(403).send({
        error: "You are not a member of this workspace.",
      });
    }

    return reply.send({
      workspaceId,
      role: membership.role,
      access: true,
    });
  },
);

// Node catalog
app.get("/api/v1/nodes", async () => ({
  nodes: nodeDefinitions.map(({ type, label, description, category }) => ({
    type,
    label,
    description,
    category,
  })),
}));

// Signup
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

// Login
app.post("/auth/login", async (request, reply) => {
  const parsed = loginSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid login details",
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
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

  const passwordMatches = await argon2.verify(user.passwordHash, password);

  if (!passwordMatches) {
    return reply.status(401).send({
      error: "Invalid email or password.",
    });
  }

  const accessToken = app.jwt.sign(
    { sub: user.id, email: user.email },
    { expiresIn: "15m" },
  );

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

// Refresh access token
app.post("/auth/refresh", async (request, reply) => {
  const refreshToken = request.cookies.traceai_refresh;

  if (!refreshToken) {
    return reply.status(401).send({
      error: "Refresh token missing.",
    });
  }

  try {
    const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);

    if (
      typeof payload === "string" ||
      payload.type !== "refresh" ||
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string"
    ) {
      reply.clearCookie("traceai_refresh", { path: "/auth" });

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

// Logout
app.post("/auth/logout", async (_request, reply) => {
  reply.clearCookie("traceai_refresh", {
    path: "/auth",
  });

  return reply.status(200).send({
    message: "Logged out successfully.",
  });
});

// ---------------------------------------------------------------------------
// Startup / shutdown
// ---------------------------------------------------------------------------
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

if (process.env.NODE_ENV !== "test") {
  void start();
}
