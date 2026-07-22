import { sqliteTable, text, integer, real, index, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Per-educator overrides for the feedback / classification prompts. Every field is
// optional: a missing (or empty) value falls back to the hardcoded system default
// (see lib/feedback-prompts.ts and lib/classification-criteria.ts). Stage keys are
// 1-6. Anchor lists are stored as newline-separated strings (one bullet per line).
export type StageKey = 1 | 2 | 3 | 4 | 5 | 6;

export interface FeedbackConfig {
  persona?: string; // global → FEEDBACK_BASE
  instruction?: string; // global → FEEDBACK_INSTRUCTION
  stages?: Partial<Record<StageKey, { description?: string; goal?: string }>>;
  // Feedback display (§6.2, L238): which of the three parts to show, and whether to present
  // them as one collective message or separate tabs. A part is shown unless set to false;
  // displayMode defaults to 'collective'.
  parts?: { yourResponse?: boolean; stageIntent?: boolean; nextMove?: boolean };
  displayMode?: 'collective' | 'tabs';
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

// Global (educator-wide) stage-progression policy, configured per stage *step* — keyed by the
// stage the conversation is leaving ("1" = the 1→2 step … "5" = the 5→6 step). When a step is
// enabled, the online stranger holds that stage until the learner has given `minVulnerable`
// vulnerable replies there, then advances one stage; protective/neutral replies never advance
// it. A step left disabled (or absent) falls back to the model's own stage prediction.
export interface StageEscalationStep {
  enabled: boolean;
  minVulnerable: number;
}
export type StageEscalationConfig = Record<string, StageEscalationStep>;

// Users table — username + password authentication (no email; nothing is emailed).
// userType: 'admin' (educator) creates scenarios; 'user' (learner/student) practices them.
//
// Accounts live in two namespaces, keyed by `educatorId`:
//   • Educators (`educatorId IS NULL`) sign up at `/` with the educator passcode. Their
//     username is globally unique among educators and doubles as their distribution-link
//     path segment (`/<username>`), so it is also checked against RESERVED_USERNAMES.
//   • Students (`educatorId` set) sign up only through their educator's distribution link
//     (`/<educator>`, optionally `?code=`). Their username is unique *within that educator*
//     only — the same username + password may be registered independently under two
//     different educators, and each is a separate account with separate progress.
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
    // Owning educator for a student account; NULL for educators themselves. Deleting an
    // educator cascades to their students (and, via their own cascades, to that student's
    // messages / feedback / progress).
    educatorId: text('educator_id').references((): AnySQLiteColumn => users.id, {
      onDelete: 'cascade',
    }),
    // Educator-only: may anyone holding the plain class link `/<username>` sign up, or is an
    // unused access code required? Default true (open class link).
    openEnrollment: integer('open_enrollment', { mode: 'boolean' }).notNull().default(true),
    // Global (per-educator) simulated victim age, sent to the VT session to scale
    // the grooming guardrails. Stored as a representative integer (13 / 15 / 17).
    age: integer('age'),
    // Per-educator overrides for the feedback / classification prompts. Null means
    // "use system defaults" for every field. Resolved server-side in /api/feedback.
    feedbackConfig: text('feedback_config', { mode: 'json' }).$type<FeedbackConfig>(),
    classificationConfig: text('classification_config', { mode: 'json' }).$type<ClassificationConfig>(),
    // Educator-authored Welcome-screen content (Markdown), shown after a learner picks
    // this educator and before the first scenario. Null = skip the welcome screen.
    // (Evaluation Plan §6, L105–121 / L183.)
    welcomeMarkdown: text('welcome_markdown'),
    // Educator-authored Closing-screen content (Markdown), shown when the learner finishes the
    // last scenario (the "Finish" action). Null = use the built-in default closing message.
    closingMarkdown: text('closing_markdown'),
    // What learners are told to call this educator: the byline on feedback cards and the chat
    // header badge. Deliberately a label, not the username — learners must not be able to tell
    // one class from another. Null / blank = the built-in DEFAULT_INSTRUCTOR_LABEL.
    instructorLabel: text('instructor_label'),
    // Global stage-progression policy, per stage step. See StageEscalationConfig above.
    // Null / missing step = that step is left to the model's own prediction.
    stageEscalation: text('stage_escalation', { mode: 'json' }).$type<StageEscalationConfig>(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
  },
  (table) => ({
    // Two partial unique indexes, one per namespace (see the table comment above). SQLite
    // treats NULLs as distinct in a composite unique index, so a plain UNIQUE(educator_id,
    // username) would let two educators share a username — hence the explicit WHERE clauses.
    studentUsernameIdx: uniqueIndex('users_educator_username_idx')
      .on(table.educatorId, table.username)
      .where(sql`${table.educatorId} IS NOT NULL`),
    educatorUsernameIdx: uniqueIndex('users_username_idx')
      .on(table.username)
      .where(sql`${table.educatorId} IS NULL`),
  })
);

// Educator usernames become URL path segments (`/<username>` is the student entry point), so
// they must never shadow a real route. Checked at educator signup.
export const RESERVED_USERNAMES = [
  'admin',
  'api',
  'chat',
  'complete',
  'welcome',
  'login',
  'logout',
  'signup',
  'select-user',
  'favicon.ico',
  'logo.svg',
  '_next',
] as const;

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
    // 80% Safe Response Rate gate (Evaluation Plan §6, L135/L146; team decision: numerator
    // = protective + neutral). When enabled, the learner must reach `masteryTargetRate`%
    // safe responses before advancing.
    masteryEnabled: integer('mastery_enabled', { mode: 'boolean' }).notNull().default(false),
    // Target safe-response percentage (0–100) that unlocks the next scenario. L146.
    masteryTargetRate: integer('mastery_target_rate').notNull().default(80),
    // Denominator floor for the safe-rate formula: (protective+neutral) / Max(minResponses,
    // total). Stops early replies from inflating the rate. L137.
    masteryMinResponses: integer('mastery_min_responses').notNull().default(20),
    // LEGACY (v3.x consecutive-streak gate, superseded by the masteryTargetRate score
    // gate and no longer read by the app). Kept to avoid a destructive SQLite column drop.
    masteryThreshold: integer('mastery_threshold').notNull().default(3),
    // Minimum predator↔teen exchanges at the current stage before it may escalate, so
    // transitions never feel abrupt (esp. lower stages). L198. Enforced app-side via
    // stageOverride. 0 = no minimum.
    minExchangesPerStage: integer('min_exchanges_per_stage').notNull().default(5),
    // When true, this scenario continues the previous scenario's conversation instead of
    // using preset messages (preset messages are disabled).
    persistMessages: integer('persist_messages', { mode: 'boolean' }).notNull().default(false),
    // Label for the time-gap separator rendered between the carried-over (previous
    // scenario) messages and this scenario's fresh conversation, e.g. "3 months later".
    // Empty = no separator. L168.
    timeGapLabel: text('time_gap_label').notNull().default(''),
    // Educator-authored splash-screen content (Markdown) shown as a scrollable modal over
    // the chat when the learner first enters this scenario. Null = no splash. L123–137.
    splashMarkdown: text('splash_markdown'),
    // 6.1b assessment-only chatbot: a predator-only mode for the post-training assessment
    // — no stage UI, no feedback agent, no mastery gate, natural progression, ending once the
    // participant has sent `maxMessages` of their own replies (0 = no limit). (Evaluation
    // Plan §6.1b, L219–226.)
    assessmentMode: integer('assessment_mode', { mode: 'boolean' }).notNull().default(false),
    maxMessages: integer('max_messages').notNull().default(0),
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
    // One row per (user, scenario, messageId): makes preset-message seeding idempotent even
    // if two loadMessages runs race, so inserts use onConflictDoNothing (see /api/messages).
    userScenarioMessageIdx: uniqueIndex('user_messages_user_scenario_message_idx').on(
      table.userId,
      table.scenarioId,
      table.messageId
    ),
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
    // Safe Response Rate snapshot (Evaluation Plan §6, L248 logging; protective_rate keeps
    // its column name but holds (P+N)/denom). The server
    // recomputes these from user_messages classifications on each classification save;
    // they are never trusted from the client.
    protectiveCount: integer('protective_count').notNull().default(0),
    neutralCount: integer('neutral_count').notNull().default(0),
    vulnerableCount: integer('vulnerable_count').notNull().default(0),
    // Latest safe rate in [0,1] = (protective+neutral) / Max(minResponses, total). Null
    // until the first reply is classified.
    protectiveRate: real('protective_rate'),
    // First time the learner's protective rate met the scenario target. Sticky: once set,
    // the next scenario stays unlocked even if the rate later dips. L33 / L146.
    masteryReachedAt: integer('mastery_reached_at', { mode: 'timestamp_ms' }),
    // Set when the learner voluntarily exits via "I don't feel comfortable anymore." L216.
    comfortExitAt: integer('comfort_exit_at', { mode: 'timestamp_ms' }),
    // Set when the learner ends the final scenario via "End Chat". L171.
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
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

// Conversations preserved when a learner uses Restart / Reset all. Both actions hard-delete
// user_messages / user_feedbacks (see /api/scenario-progress DELETE), which used to destroy the
// transcript outright; the reset now copies it here first, inside the same transaction. Rows
// are written once and never updated. `archivedAt` is the moment of that reset and so doubles
// as the run identifier — every row from one reset shares it, and ordering the distinct values
// gives "attempt 1, 2, …" without a counter to keep in sync.
//
// Deliberately separate from the live tables: the chat, the safe-rate recompute and the roster
// counts all query user_messages unfiltered, so keeping past runs out of it is what stops an
// earlier attempt's replies from leaking into the current score.
export const archivedMessages = sqliteTable(
  'archived_messages',
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
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }).notNull(),
    // Copied verbatim from user_messages.
    messageId: text('message_id').notNull(),
    text: text('text').notNull(),
    sender: text('sender', { enum: ['user', 'other'] }).notNull(),
    stage: integer('stage'),
    classification: text('classification', { enum: ['protective', 'neutral', 'vulnerable'] }),
    responseType: text('response_type', { enum: RESPONSE_TYPES }),
    tacticRecognized: integer('tactic_recognized', { mode: 'boolean' }),
    protectiveStrategy: integer('protective_strategy', { mode: 'boolean' }),
    rationale: text('rationale'),
    timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    userScenarioIdx: index('archived_messages_user_scenario_idx').on(
      table.userId,
      table.scenarioId
    ),
  })
);

// The feedback that accompanied an archived conversation. Joined to archived_messages by
// (userId, scenarioId, archivedAt, messageId).
export const archivedFeedbacks = sqliteTable(
  'archived_feedbacks',
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
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }).notNull(),
    messageId: text('message_id').notNull(),
    feedbackText: text('feedback_text').notNull(),
  },
  (table) => ({
    userScenarioIdx: index('archived_feedbacks_user_scenario_idx').on(
      table.userId,
      table.scenarioId
    ),
  })
);

// Restart / Reset all clicks, for the educator's participant stats. This needs its own table
// rather than a counter column: both actions DELETE the learner's scenario_progress row (see
// /api/scenario-progress DELETE), so a count kept there would be erased by the very action it
// counts. Nothing in the reset paths touches this table.
export const resetEvents = sqliteTable(
  'reset_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // The scenario for a per-scenario Restart; NULL for a module-wide Reset all, which is one
    // click covering every scenario.
    scenarioId: integer('scenario_id').references(() => scenarios.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['restart', 'reset_all'] }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index('reset_events_user_idx').on(table.userId),
  })
);

// Access codes — researcher-issued, single-use participant signup gate (Evaluation Plan §6,
// L101–102). Each code is created by an educator, optionally labeled with a participant id
// (e.g. "p1-rylai"), and consumed by the learner who signs up with it.
export const accessCodes = sqliteTable(
  'access_codes',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull(),
    educatorId: text('educator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    participantLabel: text('participant_label').notNull().default(''),
    // Set once the code is redeemed at signup; null while unused.
    usedByUserId: text('used_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    usedAt: integer('used_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    codeIdx: uniqueIndex('access_codes_code_idx').on(table.code),
    educatorIdx: index('access_codes_educator_idx').on(table.educatorId),
  })
);

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type AccessCode = typeof accessCodes.$inferSelect;
export type InsertAccessCode = typeof accessCodes.$inferInsert;

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

export type ArchivedMessage = typeof archivedMessages.$inferSelect;
export type ArchivedFeedback = typeof archivedFeedbacks.$inferSelect;

export type ResetEvent = typeof resetEvents.$inferSelect;
export type InsertResetEvent = typeof resetEvents.$inferInsert;
export type ResetEventKind = ResetEvent['kind'];
