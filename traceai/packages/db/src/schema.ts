import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  uniqueIndex,
  index,
  } from "drizzle-orm/pg-core";
  
  export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });
  
  export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });
  
  export const memberships = pgTable("memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
  .notNull()
  .references(() => users.id),
  workspaceId: uuid("workspace_id")
  .notNull()
  .references(() => workspaces.id),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  });
  
  export const workflows = pgTable("workflows", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
  .notNull()
  .references(() => workspaces.id),
  name: text("name").notNull(),
  description: text("description"),
  definition: jsonb("definition").notNull(),
  draftGraph: jsonb("draft_graph"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });
  
  export const workflowVersions = pgTable("workflow_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  workflowId: uuid("workflow_id")
  .notNull()
  .references(() => workflows.id),
  version: integer("version").notNull(),
  definition: jsonb("definition").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  }, (table) => [
  uniqueIndex("workflow_versions_workflow_version_uidx").on(
  table.workflowId,
  table.version,
  ),
  ]);
  
  export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workflowId: uuid("workflow_id")
  .notNull()
  .references(() => workflows.id),
  workflowVersionId: uuid("workflow_version_id")
  .references(() => workflowVersions.id),
  status: text("status").notNull(),
  input: jsonb("input"),
  output: jsonb("output"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  }, (table) => [
  index("workflow_runs_status_idx").on(table.status),
  index("workflow_runs_workflow_id_idx").on(table.workflowId),
  ]);
  
  export const stepRuns = pgTable("step_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id")
  .notNull()
  .references(() => workflowRuns.id),
  nodeId: text("node_id").notNull(),
  iteration: integer("iteration").notNull().default(0),
  status: text("status").notNull(),
  input: jsonb("input"),
  output: jsonb("output"),
  error: jsonb("error"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  }, (table) => [
  uniqueIndex("step_runs_run_node_iteration_uidx").on(
  table.runId,
  table.nodeId,
  table.iteration,
  ),
  index("step_runs_status_idx").on(table.status),
  ]);