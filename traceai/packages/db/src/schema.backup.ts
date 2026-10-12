import {
    pgTable,
    text,
    timestamp,
    uuid,
    jsonb,
  } from "drizzle-orm/pg-core";
  
  export const workflows = pgTable("workflows", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    definition: jsonb("definition").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });
  
  export const workflowRuns = pgTable("workflow_runs", {
    id: uuid("id").defaultRandom().primaryKey(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id),
    status: text("status").notNull(),
    input: jsonb("input"),
    output: jsonb("output"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  });