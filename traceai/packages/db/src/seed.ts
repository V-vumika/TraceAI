import { config } from "dotenv";
config({ path: "../../.env" });
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users, workspaces, memberships } from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const client = postgres(connectionString);
const db = drizzle(client);

async function seed() {
  const email = "demo@traceai.dev";
  const workspaceName = "TraceAI Demo Workspace";

  // Find or create demo user
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  let user = existingUser;

  if (!user) {
    const [createdUser] = await db
      .insert(users)
      .values({
        email,
        name: "TraceAI Demo User",
      })
      .returning();

    if (!createdUser) {
      throw new Error("Failed to create demo user");
    }
    user = createdUser;
  }

  // Find or create demo workspace
  const [existingWorkspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, workspaceName))
    .limit(1);

  let workspace = existingWorkspace;

  if (!workspace) {
    const [createdWorkspace] = await db
      .insert(workspaces)
      .values({ name: workspaceName })
      .returning();

    if (!createdWorkspace) {
      throw new Error("Failed to create demo workspace");
    }
    workspace = createdWorkspace;
  }

  // Create membership only if it does not exist
  const [membership] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, user.id),
        eq(memberships.workspaceId, workspace.id),
      ),
    )
    .limit(1);

  if (!membership) {
    await db.insert(memberships).values({
      userId: user.id,
      workspaceId: workspace.id,
      role: "owner",
    });
  }

  console.log("TraceAI seed completed successfully.");
  console.log(`Demo user: ${email}`);
  console.log(`Workspace: ${workspaceName}`);
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });