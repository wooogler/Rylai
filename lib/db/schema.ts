import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Users table
export const users = sqliteTable(
  'users',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    username: text('username').notNull(),
    userType: text('user_type', { enum: ['admin', 'user', 'parent'] }).notNull(),
    commonSystemPrompt: text('common_system_prompt'),
    feedbackPersona: text('feedback_persona'),
    feedbackInstruction: text('feedback_instruction'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    usernameUserTypeIdx: uniqueIndex('username_user_type_idx').on(
      table.username,
      table.userType
    ),
  })
);

// Scenarios table
export const scenarios = sqliteTable(
  'scenarios',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    predatorName: text('predator_name').notNull(),
    handle: text('handle').notNull(),
    stage: integer('stage').notNull().default(1),
    systemPrompt: text('system_prompt').notNull(),
    presetMessages: text('preset_messages', { mode: 'json' })
      .notNull()
      .$type<
        Array<{
          id: string;
          text: string;
          sender: 'user' | 'other';
          timestamp: string;
        }>
      >(),
    description: text('description').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdIdx: index('scenarios_user_id_idx').on(table.userId),
  })
);

// User messages table
export const userMessages = sqliteTable(
  'user_messages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scenarioId: integer('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    messageId: text('message_id').notNull(),
    text: text('text').notNull(),
    sender: text('sender', { enum: ['user', 'other'] }).notNull(),
    timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    userScenarioIdx: index('user_messages_user_scenario_idx').on(
      table.userId,
      table.scenarioId
    ),
    messageIdIdx: index('user_messages_message_id_idx').on(table.messageId),
  })
);

// User feedbacks table
export const userFeedbacks = sqliteTable(
  'user_feedbacks',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scenarioId: integer('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    messageId: text('message_id').notNull(),
    feedbackText: text('feedback_text').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    userScenarioIdx: index('user_feedbacks_user_scenario_idx').on(
      table.userId,
      table.scenarioId
    ),
    messageIdIdx: index('user_feedbacks_message_id_idx').on(table.messageId),
  })
);

// Scenario progress table
export const scenarioProgress = sqliteTable(
  'scenario_progress',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scenarioId: integer('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    firstVisitedAt: integer('first_visited_at', { mode: 'timestamp_ms' }).notNull(),
    lastVisitedAt: integer('last_visited_at', { mode: 'timestamp_ms' }).notNull(),
    visitCount: integer('visit_count').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    userScenarioIdx: uniqueIndex('scenario_progress_user_scenario_idx').on(
      table.userId,
      table.scenarioId
    ),
  })
);

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Scenario = typeof scenarios.$inferSelect;
export type InsertScenario = typeof scenarios.$inferInsert;

export type UserMessage = typeof userMessages.$inferSelect;
export type InsertUserMessage = typeof userMessages.$inferInsert;

export type UserFeedback = typeof userFeedbacks.$inferSelect;
export type InsertUserFeedback = typeof userFeedbacks.$inferInsert;

export type ScenarioProgress = typeof scenarioProgress.$inferSelect;
export type InsertScenarioProgress = typeof scenarioProgress.$inferInsert;
