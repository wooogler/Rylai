import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Per-educator overrides for the feedback / classification prompts. Every field is
// optional: a missing (or empty) value falls back to the hardcoded system default
// (see lib/feedback-prompts.ts and lib/classification-criteria.ts). Stage keys are
// 1-6. Anchor lists are stored as newline-separated strings (one bullet per line).
export type StageKey = 1 | 2 | 3 | 4 | 5 | 6;

export interface FeedbackConfig {
  persona?: string; // global → FEEDBACK_BASE
  instruction?: string; // global → FEEDBACK_INSTRUCTION
  stages?: Partial<Record<StageKey, { description?: string; goal?: string }>>;
}

export interface ClassificationConfig {
  labelDefinitions?: { protective?: string; neutral?: string; vulnerable?: string };
  signals?: { tacticRecognized?: string; protectiveStrategy?: string };
  stages?: Partial<Record<StageKey, { protective?: string; vulnerable?: string }>>;
}

// Per-reply response type — the paper's stage-based taxonomy (Zhang et al., CHI '26):
// four protective strategies and four vulnerable behaviors, plus 'none' for neutral /
// unclear replies. Captured alongside the 3-way classification for research and
// stage-appropriate coaching.
export const RESPONSE_TYPES = [
  // Protective strategies
  'setting_boundaries',
  'directly_declining',
  'signaling_risk_awareness',
  'leveraging_avoidance',
  // Vulnerable behaviors
  'encouraging_escalation',
  'accepting_advance',
  'displaying_vulnerability',
  'negating_risk_concern',
  // Neutral / not applicable
  'none',
] as const;
export type ResponseType = (typeof RESPONSE_TYPES)[number];

// Users table — username + password authentication (no email; nothing is emailed).
// `username` is the login id and the name shown to learners when picking an educator.
// userType: 'admin' (educator) creates scenarios; 'user' (learner) practices them.
export const users = sqliteTable(
  'users',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    userType: text('user_type', { enum: ['admin', 'user'] })
      .notNull()
      .default('user'),
    // Global (per-educator) simulated victim age, sent to the VT session to scale
    // the grooming guardrails. Stored as a representative integer (13 / 15 / 17).
    age: integer('age'),
    // Per-educator overrides for the feedback / classification prompts. Null means
    // "use system defaults" for every field. Resolved server-side in /api/feedback.
    feedbackConfig: text('feedback_config', { mode: 'json' }).$type<FeedbackConfig>(),
    classificationConfig: text('classification_config', { mode: 'json' }).$type<ClassificationConfig>(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
  },
  (table) => ({
    usernameIdx: uniqueIndex('users_username_idx').on(table.username),
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
    // Fixed/initial grooming stage, used when autoStage is off.
    stage: integer('stage').notNull().default(1),
    // When true, the VT model auto-predicts the stage each turn; when false, the
    // session is pinned to `stage`.
    autoStage: integer('auto_stage', { mode: 'boolean' }).notNull().default(true),
    // Lower bound (1–6) on the grooming stage in auto mode. The VT server keeps its
    // prediction and generated content at or above this floor, so the predator never
    // drops below it. Default 1 = no floor (matches pre-feature behavior).
    minStage: integer('min_stage').notNull().default(1),
    // Upper bound (1–6) on the grooming stage in auto mode. The VT server clamps
    // both its prediction and the generated content to this cap, so the predator
    // never escalates past it. Default 6 = no cap (matches pre-feature behavior).
    maxStage: integer('max_stage').notNull().default(6),
    // Mastery gate: when enabled, the learner must reach a streak of `masteryThreshold`
    // consecutive non-vulnerable (protective/neutral) replies before advancing.
    masteryEnabled: integer('mastery_enabled', { mode: 'boolean' }).notNull().default(false),
    masteryThreshold: integer('mastery_threshold').notNull().default(3),
    // When true, this scenario continues the previous scenario's conversation instead of
    // using preset messages (preset messages are disabled).
    persistMessages: integer('persist_messages', { mode: 'boolean' }).notNull().default(false),
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
    // VT Custom predicted grooming stage for predator messages (null otherwise).
    stage: integer('stage'),
    // Feedback-agent classification of a participant (user) reply. Null for online
    // stranger messages and any reply not yet classified. Used for the resilience score.
    classification: text('classification', { enum: ['protective', 'neutral', 'vulnerable'] }),
    // Finer-grained response type from the paper taxonomy (one of RESPONSE_TYPES).
    responseType: text('response_type', { enum: RESPONSE_TYPES }),
    tacticRecognized: integer('tactic_recognized', { mode: 'boolean' }),
    protectiveStrategy: integer('protective_strategy', { mode: 'boolean' }),
    rationale: text('rationale'),
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

// Preview-feedback events: logged when a learner uses the "preview" button to check
// feedback on a draft reply *before* sending it. The draft may never be sent, so this
// is separate from user_messages. Useful research signal (the learner self-correcting).
export const previewEvents = sqliteTable(
  'preview_events',
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
    draftText: text('draft_text').notNull(),
    feedbackText: text('feedback_text').notNull(),
    classification: text('classification', { enum: ['protective', 'neutral', 'vulnerable'] }),
    responseType: text('response_type', { enum: RESPONSE_TYPES }),
    stage: integer('stage'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    userScenarioIdx: index('preview_events_user_scenario_idx').on(
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

export type PreviewEvent = typeof previewEvents.$inferSelect;
export type InsertPreviewEvent = typeof previewEvents.$inferInsert;
