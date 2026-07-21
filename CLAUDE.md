# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RYLAI (Resilient Youth Learn through Artificial Intelligence) is an educational web application for cybergrooming prevention training. It simulates realistic chat conversations with AI-powered predators across different grooming stages, providing real-time educational feedback to help teens recognize and respond to online grooming tactics.

## Development Commands

```bash
# Development server (uses Turbopack)
npm run dev

# Build for production
npm run build

# Run production server
npm start

# Lint code
npm run lint

# Database commands
npm run db:migrate    # Run database migrations
npm run db:studio     # Open Drizzle Studio GUI
```

## Architecture

### User Types and Authentication Flow

Authentication is **username + password** (bcrypt-hashed), with an httpOnly, HMAC-signed
session cookie (`lib/auth/session.ts`). No email is collected — nothing is emailed.
There are two user types, and they sign up in two different places:

1. **Admin / Educator** (`users.educator_id IS NULL`) — signs up on the root page `/`
   (`app/page.tsx`), which is **educator-only**. The educator passcode (`ADMIN_PASSCODE`)
   is required for every sign-up there; there is no passcode-less path.
   - Creates and manages scenarios; configures feedback / classification prompts
   - Each admin has their own set of scenarios stored in SQLite
   - On signup, default scenarios are seeded (`lib/default-scenarios.ts`)
   - Their username doubles as their distribution-link path segment (`/<username>`), so it
     must be unique among educators and is checked against `RESERVED_USERNAMES`

2. **User / Learner / Student** (`users.educator_id` set) — can only sign up and log in
   through the educator's distribution link `/<educatorUsername>` (optionally
   `?code=<accessCode>`), rendered by `app/[educator]/page.tsx`. Login exists purely so a
   student can come back later.
   - Bound to exactly one educator at sign-up; that binding decides which scenarios, welcome
     content and stage policy apply — it is never chosen client-side
   - Chat interactions, feedback, and progress are saved per scenario

**Per-educator username namespacing**: a student username is unique *within one educator's
class only*. The same username + password registered under two different educators are two
independent accounts, each requiring its own sign-up, with their own progress. Educator
usernames are unique among educators. This is enforced by the two partial unique indexes on
`users` (see the schema below) and by scoping every lookup: `findEducatorByUsername`
(`lib/auth/educator.ts`) matches only `userType = 'admin' AND educator_id IS NULL`, and
`/api/auth/login` resolves within one namespace (`educator` present → that class's students;
absent → educators).

**Class enrollment**: `users.open_enrollment` (educator-only, default true) decides whether
the plain class link is enough to sign up. When it is false, an unused access code issued by
*that* educator is required — codes are single-use and are never redeemable in another class.

**Auth flow**:
- Educator: `/` (tabbed Login / Sign Up) → `POST /api/auth/signup` (with `passcode`) or
  `POST /api/auth/login` (no `educator` field) → `/admin`
- Student: `/<educator>` (tabbed Sign Up / Login) → the same two routes with `educator` set
  to the URL segment → `/welcome` (if the educator wrote welcome content) or the first
  scenario's chat
- Routes set the session cookie. A student login/signup additionally sets `rylai_class`
  (`CLASS_COOKIE_NAME`), holding the educator's username — a routing hint only, never an
  authorization signal. It is cleared on logout and on an educator login.
- `middleware.ts` guards `/chat/:path*`, `/admin/:path*`, `/welcome`, `/complete`.
  `/[educator]` is deliberately unguarded — it is the public student login/signup page. An
  unverified session is redirected to `/<class>` when the class cookie is present, otherwise
  to `/`.
- Client auth state is hydrated from the cookie via `GET /api/auth/me` (`AuthProvider` →
  `hydrateAuth` → `setAuthUser`). The cookie — not localStorage — is the source of truth for
  auth *and* for a learner's class binding (`adminUserId` / `adminName`).
- See `auth-reusable-guide.md` for the pattern this simplified flow is based on (the
  magic-link/email-verification steps from that guide are intentionally omitted).

### State Management (Zustand with Persistence)

The global store (`app/store/useScenarioStore.ts`) uses Zustand with persistence middleware:

- **Persisted** (`partialize`): `scenarios`, `vtSessions`, `splashSeen`
- **NOT persisted (derived from the session payload)**: `userId`, `userType`,
  `isAuthenticated`, `isAdmin`, `currentUser`, `authHydrated`; the learner's class context
  `adminUserId`, `adminName`, `age`; and the educator's own settings `feedbackConfig`,
  `classificationConfig`, `welcomeMarkdown`, `closingMarkdown`, `stageEscalation`,
  `openEnrollment`. All are written by `setAuthUser()`, called from `hydrateAuth()`
  (`GET /api/auth/me`) and from the login/signup responses.
- **Version**: 5 — with a `migrate()` that rewrites any older snapshot down to the three
  persisted keys. Dropping a key from `partialize` is not enough on its own: Zustand
  shallow-merges whatever is already in local storage, so an old snapshot would keep
  re-injecting a stale `adminUserId` over the session-derived one.

Critical: When adding new persistent state, update the `partialize` function. Never persist
auth identity or the learner's class binding — both must come from the session cookie.

### Database Schema (SQLite with Drizzle ORM)

**Database Location**: `./data/rylai.db` (configurable via `DATABASE_URL` env var)

**Database Configuration**:
- WAL mode enabled for better concurrency
- Foreign keys enabled with cascade deletes
- Busy timeout: 5000ms to handle concurrent access

**users** table:
- `id` (TEXT): Primary key, UUID format
- `username` (TEXT): NOT NULL — login id; for an educator it is also their class-link path
  segment. **Not globally unique** — see the two partial indexes below
- `passwordHash` (TEXT): bcrypt hash, NOT NULL
- `userType` (TEXT): 'admin' | 'user', NOT NULL, default 'user'
- `educatorId` (TEXT): References users(id) ON DELETE CASCADE, nullable. NULL = this row *is*
  an educator; set = a student belonging to that educator. Deleting an educator cascades to
  their students and, through the students' own cascades, to those students' messages,
  feedback and progress.
- `openEnrollment` (INTEGER, boolean): Educator-only, NOT NULL, default true. False = the
  plain class link cannot be used to sign up; an unused access code is required.
- `age` (INTEGER): Educator's simulated-victim age bracket (13 / 15 / 17), sent to the VT session
- `feedbackConfig`, `classificationConfig`, `stageEscalation` (TEXT, json mode): Educator's
  prompt and stage-progression overrides (NULL = system defaults)
- `welcomeMarkdown`, `closingMarkdown` (TEXT): Educator-authored Welcome / Closing content
- `createdAt` (INTEGER): Unix timestamp (milliseconds)
- `lastLoginAt` (INTEGER): Unix timestamp (milliseconds), nullable
- **Uniqueness — two partial indexes, one per namespace**:
  - `users_educator_username_idx`: UNIQUE (`educator_id`, `username`)
    WHERE `educator_id IS NOT NULL` — a student username is unique inside one class only
  - `users_username_idx`: UNIQUE (`username`) WHERE `educator_id IS NULL` — educator
    usernames are unique among educators

  A plain composite UNIQUE(`educator_id`, `username`) would not work: SQLite treats NULLs as
  distinct, so two educators could take the same username.
- `RESERVED_USERNAMES` (`lib/db/schema.ts`) blocks educator usernames that would shadow a
  real route (`admin`, `api`, `chat`, `_next`, …), since `/<username>` is a real path.

**scenarios** table:
- `id` (INTEGER): Auto-increment primary key
- `userId` (TEXT): References users(id) ON DELETE CASCADE
- `slug`, `name`, `handle`, `predatorName` (TEXT): Scenario details
- `stage` (INTEGER): 0-6, represents grooming stage
- `systemPrompt` (TEXT): AI behavior instructions
- `presetMessages` (TEXT): JSON array of initial conversation
- `description` (TEXT): Scenario description
- `createdAt`, `updatedAt` (INTEGER): Unix timestamps (milliseconds)

**user_messages** table:
- `id` (TEXT): Primary key, UUID
- `userId` (TEXT): References users(id) ON DELETE CASCADE
- `scenarioId` (INTEGER): References scenarios(id) ON DELETE CASCADE
- `messageId` (TEXT): Unique message identifier (format: `{scenarioId}-preset-{index}-{timestamp}-{originalId}`)
- `text` (TEXT): Message content
- `sender` (TEXT): 'user' | 'other'
- `stage` (INTEGER): VT-predicted grooming stage for predator messages (nullable)
- `timestamp` (INTEGER): Unix timestamp (milliseconds)
- `createdAt` (INTEGER): Unix timestamp (milliseconds)

**user_feedbacks** table:
- `id` (TEXT): Primary key, UUID
- `userId` (TEXT): References users(id) ON DELETE CASCADE
- `scenarioId` (INTEGER): References scenarios(id) ON DELETE CASCADE
- `messageId` (TEXT): References message identifier
- `feedbackText` (TEXT): Generated feedback content
- `createdAt` (INTEGER): Unix timestamp (milliseconds)

**scenario_progress** table:
- `id` (TEXT): Primary key, UUID
- `userId` (TEXT): References users(id) ON DELETE CASCADE
- `scenarioId` (INTEGER): References scenarios(id) ON DELETE CASCADE
- `firstVisitedAt`, `lastVisitedAt` (INTEGER): Unix timestamps (milliseconds)
- `visitCount` (INTEGER): Number of visits, default 1
- `createdAt` (INTEGER): Unix timestamp (milliseconds)
- **Unique constraint**: (userId, scenarioId)

### AI Integration

There is no model picker. Configuration lives in `lib/ai-models.ts`:
- `VT_CUSTOM_BASE_URL` — the predator chatbot endpoint
- `FEEDBACK_MODEL` — the feedback model (defaults to `gpt-5.5`, override via `FEEDBACK_MODEL` env)

Two AI endpoints in `app/api/`:

1. **`/api/chat`** - Predator chatbot responses (VT Custom / StagePilot only)
   - Session-based API: `POST {VT_CUSTOM_BASE_URL}/sessions` then `/sessions/{id}/turn`
   - The VT model **predicts the grooming stage automatically**; the UI can override the
     stage for the next turn (`stageOverride`)
   - The endpoint uses a self-signed cert, so a custom `https.Agent({ rejectUnauthorized: false })`
     is used. Sessions seed from conversation history; a missing session is recreated and retried once.
   - Request: `{ conversationHistory, userMessage, vtSessionId, stageOverride }`
   - Response: `{ reply, vtSessionId, stage, stageLabel }`

2. **`/api/feedback`** - Educational feedback generation
   - Direct OpenAI **Responses API** (`openai.responses.create`) with `FEEDBACK_MODEL`
     (requires `OPENAI_API_KEY`). Uses `reasoning: { effort: 'low' }`.
   - Structured format: "What is the other person trying to do?", "How did you do?", "Tips to Stay Safe"
   - Configured via `feedbackPersona` and `feedbackInstruction`

Feedback prompts are intentionally concise and teen-friendly to ensure engagement.

### Database API Routes

Server-side API routes for database operations (SQLite can only be accessed server-side):

**Auth** (`app/api/auth/`):
1. **`/api/auth/signup`** - Two disjoint paths, chosen by whether the body carries
   `educator`: educator sign-up (requires `passcode` = `ADMIN_PASSCODE`, creates
   `educator_id = NULL`) or student sign-up (creates `educator_id` = that educator; a
   `passcode` in the body is rejected outright). Sets the session, plus the class cookie for
   students.
2. **`/api/auth/login`** - Verify credentials, set session (generic error to prevent
   enumeration). The lookup is scoped by namespace via the optional `educator` field.
3. **`/api/auth/logout`** - Clear the session and class cookies
4. **`/api/auth/me`** - Return the current session user; for a student the payload also
   carries their bound educator's context (source of truth for client auth *and* class binding)

**Data**:
5. **`/api/health`** - Health check endpoint (returns database connection status)
6. **`/api/educator?username=`** - Public: resolve an educator for their class page. Returns
   only `{ id, username, age, hasWelcome, openEnrollment }`.
7. **`/api/educator/students`** - The signed-in educator's full student roster with
   per-scenario progress, including students who joined through the plain class link and so
   have no access-code row
8. **`/api/get-admin-info`** - POST: the acting user's educator settings (an educator's own
   row, or the class a student is bound to). PATCH: update the signed-in educator's own row
   (age, `openEnrollment`, prompt overrides, welcome/closing content, stage policy).
9. **`/api/get-admin-scenarios`** - Scenarios belonging to the acting user's class
10. **`/api/access-codes`** (GET/POST/DELETE) - The session educator's own access codes.
    `/api/access-codes/lookup?code=&educator=` is the public invite-link check, scoped to the
    educator named in the URL (`valid` | `used` | `invalid`).
11. **`/api/delete-user`** - Delete the *session* user; cascades to their scenarios and, for
    an educator, to their students

**Session-scoped**: routes 7–11 and `/api/feedback` resolve the acting user (and their
educator) from the session cookie — `getSessionUserId()` plus `resolveEducatorIdForUser()`
(`lib/auth/educator.ts`) — never from a client-supplied id. The remaining data routes
(`/api/messages`, `/api/feedbacks`, `/api/scenario-progress`, `/api/preview-events`,
`/api/scenarios`, `/api/restore-default-scenarios`) still trust a `userId` from the request;
that is a known pre-existing gap, not yet addressed.

### Message ID Generation Strategy

Preset messages use timestamp-based IDs to prevent duplicates on reset:
```typescript
`${scenarioId}-preset-${index}-${Date.now()}-${originalId}`
```

User-generated messages use:
```typescript
Date.now().toString()
```

### Grooming Stages

Stages 0-6 represent the grooming process:
- **Stage 0**: Free interaction (no constraints)
- **Stage 1**: Friendship forming (profile info, pictures)
- **Stage 2**: Relationship forming (hobbies, school life)
- **Stage 3**: Risk assessment (checking for supervision)
- **Stage 4**: Exclusivity (emotional bonding, secrets)
- **Stage 5**: Sexual content introduction
- **Stage 6**: Planning offline meeting

Stage information is defined in `GROOMING_STAGES` array and used throughout the UI.

### Key Component Interactions

**Chat Page Flow** (`app/chat/[scenario]/page.tsx`):
1. On mount: Load saved messages or initialize with preset messages
2. User sends message → Save to DB (if user type) → Call `/api/chat` → Display AI response
3. User clicks message/preview → Generate feedback via `/api/feedback`
4. Feedback icon (Lightbulb): Gray when inactive, blue when active/hovered
5. Database operations called through store methods (server-side via Drizzle)

**Class Entry Page** (`app/[educator]/page.tsx`):
- The educator's distribution link and the only student entry point: a Sign Up / Login form
  scoped to the educator named in the URL segment, resolved via `GET /api/educator?username=`
- `?code=` (a per-participant invite link) pre-fills the access code, switches to the Sign Up
  tab, and validates the code against *this* class via `GET /api/access-codes/lookup`
- When the educator's `openEnrollment` is off, the access-code field is shown and required
- On success: `setAuthUser(data.user)` → `loadUserScenarios()` → `/welcome` if the educator
  has welcome content, else `/chat/<first scenario slug>`
- An already-authenticated visitor: educator → `/admin`; a student of this class → straight
  in; a student of a *different* class → the form is disabled behind a "log out to continue
  here" banner, since an account is never re-bound to another educator
- Static routes (`/admin`, `/chat`, …) take precedence, so this catches only otherwise
  unmatched single-segment paths

### Common Pitfalls

1. **Duplicate Message IDs**: Always use timestamp in preset message IDs
2. **Drizzle Query Errors**:
   - Use `findFirst()` which returns `undefined` if not found (like `.maybeSingle()`)
   - Wrap queries in try-catch blocks (Drizzle throws exceptions unlike Supabase)
3. **Auth Not Loaded Yet**: Auth is hydrated async from the cookie. Guard redirects with
   `authHydrated` (e.g. `if (authHydrated && !isAuthenticated) ...`) so pages don't bounce to `/`
   before hydration completes. Effects that depend on `userType` re-run once it's populated.
4. **Preview Feedback Not Showing**: Ensure `previewText` state matches current input text
5. **SQLite Concurrency**:
   - "database is locked" errors can occur with simultaneous writes
   - WAL mode is enabled to minimize this
   - Use transactions for multi-step operations
6. **Client vs Server DB Access**:
   - NEVER import `db` from `lib/db/client.ts` in client components
   - Use API routes for all client-side database operations
   - Server components and API routes can access DB directly

### Environment Variables

See `.env.example`. Key variables:
- `SESSION_SECRET`: signs the session cookie (REQUIRED in production)
- `ADMIN_PASSCODE`: required for every sign-up on the root page `/` (all of which create
  educator accounts); students never use it
- `OPENAI_API_KEY`: REQUIRED for feedback generation (Responses API)
- `FEEDBACK_MODEL`: optional, defaults to `gpt-5.5`
- `DATABASE_URL`: SQLite path (optional, defaults to `./data/rylai.db`)

## Tech Stack

- **Framework**: Next.js 15 (App Router, Turbopack)
- **UI**: React 19, Tailwind CSS 4
- **State**: Zustand with persist middleware
- **Database**: SQLite with Drizzle ORM and better-sqlite3
- **Auth**: username + password (bcryptjs), Zod validation, HMAC-signed httpOnly cookie
- **AI**: VT Custom (StagePilot) for chat; OpenAI Responses API for feedback
- **Icons**: Lucide React
- **Markdown**: react-markdown for feedback rendering
- **Deployment**: Docker + Docker Compose

## Database Migration History

### v4.0 - Educator-scoped accounts + distribution links (July 2026)

Students no longer have global accounts they create on the root page and then point at
whichever educator they like. Every student account now lives inside exactly one educator's
class and can only be created through that educator's link.

**Key Changes**:
1. **Root page `/` is educator-only** (`app/page.tsx`). The educator passcode is required for
   every sign-up there; the passcode-less "learner" path is gone.
2. **Students enter only through `/<educatorUsername>`** — sign-up *and* login, optionally
   with `?code=<accessCode>`. `app/[educator]/page.tsx` was rewritten from a redirect-only
   landing page into that form. `/select-user` and `/api/get-users-with-progress` were deleted.
3. **Schema** (`lib/db/migrations/0014_educator_scoping.sql`): `users` gains `educator_id`
   (self-FK, ON DELETE CASCADE; NULL = educator) and `open_enrollment` (boolean, default
   true). The global unique username index is replaced by two **partial** unique indexes —
   `(educator_id, username) WHERE educator_id IS NOT NULL` and
   `(username) WHERE educator_id IS NULL` — so student usernames are unique per class while
   educator usernames stay unique among educators. Existing students are backfilled onto an
   educator (redeemed access code → most recent scenario progress → most recent message →
   nearest preceding educator). `RESERVED_USERNAMES` blocks educator names that would shadow
   a route.
4. **New `lib/auth/educator.ts`**: `findEducatorByUsername`, `buildAuthUser` (one shared
   payload for login/signup/me, carrying a student's educator context) and
   `resolveEducatorIdForUser`.
5. **New `rylai_class` cookie** (`lib/auth/session.ts`): the educator's username, so edge
   middleware can bounce an expired *student* session to `/<educator>` rather than the
   educator-only `/`. Routing hint only. `middleware.ts` now guards `/chat/:path*`,
   `/admin/:path*`, `/welcome`, `/complete`.
6. **Session-scoped routes**: `get-admin-scenarios`, `get-admin-info` (POST + PATCH),
   `access-codes` (GET/POST/DELETE), `access-codes/lookup` (now scoped to the educator in the
   URL), `feedback` and `delete-user` take the educator/user from the session cookie instead
   of the request body. New `/api/educator/students` (roster including students who joined via
   the plain class link) with shared enrichment in `lib/progress/educator-progress.ts`.
7. **Store**: `adminUserId` / `adminName` / `age` are derived from the session payload via
   `setAuthUser` and no longer persisted; `setAdminContext` was removed; `openEnrollment` +
   `saveOpenEnrollment` added. Persist version 4 → 5 with a `migrate()` that strips the old
   client-held class binding.
8. **Admin UI**: `app/admin/AccessCodes.tsx` became the Distribution panel — class-link card,
   open-enrollment toggle, Students roster, and the per-participant access codes.

### v3.0 - Auth + cleanup refactor (June 2026)

Replaced the shared-password login with real per-account auth and trimmed the
codebase ahead of new feature work.

**Key Changes**:
1. **Auth**: username + password (bcryptjs), Zod validation, HMAC-signed httpOnly session
   cookie. New `app/api/auth/{signup,login,logout,me}` routes; `middleware.ts` guards
   `/chat`, `/admin`, `/select-user`. Client auth hydrated from cookie via `AuthProvider`.
   Based on `auth-reusable-guide.md` (magic-link/email steps omitted). No email is
   collected — nothing is emailed. Password rule is minimum length only (prototype).
2. **`parent` user type removed** everywhere.
3. **Predator chat fixed to VT Custom**; the multi-model picker and OpenRouter/local-model
   code were removed. `lib/ai-models.ts` now only holds `VT_CUSTOM_BASE_URL` + `FEEDBACK_MODEL`.
4. **Feedback** switched to the OpenAI **Responses API**, single fixed model (`gpt-5.5`).
5. **Schema**: `users` now `username`/`passwordHash`/`userType('admin'|'user')`/`age`/
   `lastLoginAt`; `user_messages` gained `stage` + classification columns. DB was reset
   (old data archived in `docs/legacy-data-backup.{md,json}`).
6. **Fixes**: `presetMessages` no longer double-encoded (relies on Drizzle json mode); VT
   session + predicted stage persisted per scenario; removed hardcoded `stage-1-friendship`
   navigation; store save-gates simplified to learner-only.
7. **Removed**: `lib/supabase.ts` + `@supabase/supabase-js`, `app/api/login`,
   `app/api/check-user`, stale top-level `migrations/`, `check-db.js`, `dev:local` script.

### v2.0 - SQLite Migration (December 2024)

The project was migrated from Supabase (PostgreSQL) to SQLite with Drizzle ORM for easier self-hosted deployment.

**Key Changes**:
1. Database layer completely rewritten using Drizzle ORM
2. All Supabase client calls replaced with Drizzle queries
3. Client-side database access moved to server-side API routes
4. UUID generation moved from database to application layer (`crypto.randomUUID()`)
5. Timestamps stored as Unix milliseconds instead of ISO strings
6. JSONB columns converted to JSON text with automatic parsing
7. Transaction support added using `db.transaction()`
8. Foreign key cascading enabled with `PRAGMA foreign_keys = ON`
9. WAL mode enabled for better concurrency
10. Docker deployment with volume persistence

**Files Created**:
- `lib/db/schema.ts` - Drizzle schema definitions
- `lib/db/client.ts` - SQLite client initialization
- `lib/db/migrate.ts` - Migration runner
- `drizzle.config.ts` - Drizzle configuration
- `app/api/health/route.ts` - Health check
- `app/api/check-user/route.ts` - User verification
- `app/api/get-users-with-progress/route.ts` - User listing
- `app/api/get-admin-info/route.ts` - Admin info retrieval
- `app/api/get-admin-scenarios/route.ts` - Scenario listing
- `app/api/delete-user/route.ts` - User deletion
- `Dockerfile` - Multi-stage Docker build
- `docker-compose.yml` - Docker orchestration
- `.dockerignore` - Docker ignore rules

**Files Modified**:
- `app/store/useScenarioStore.ts` - Complete Drizzle conversion (all 15+ functions)
- `app/page.tsx` - Use API routes instead of direct Supabase
- `app/select-user/page.tsx` - Use API routes for all DB operations
- `next.config.ts` - Added `output: 'standalone'` for Docker
- `package.json` - Added db:migrate and db:studio scripts
- `.gitignore` - Added SQLite database files

**Files Deleted**:
- `lib/supabase.ts` - No longer needed (replaced by `lib/db/`)
- Old Supabase migrations are archived for reference but not used
