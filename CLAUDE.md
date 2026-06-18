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
There are two user types:

1. **Admin / Educator** — sign up with the educator passcode (`ADMIN_PASSCODE` env var)
   - Creates and manages scenarios; configures system prompts and feedback instructions
   - Each admin has their own set of scenarios stored in SQLite
   - On signup, three default scenarios are seeded (`lib/default-scenarios.ts`)

2. **User / Learner** — sign up with no passcode
   - Selects an educator whose scenarios to practice
   - Chat interactions, feedback, and progress are saved per scenario

**Auth flow**:
- Sign up / log in on `app/page.tsx` (tabbed form) → `POST /api/auth/signup` or `/api/auth/login`
- Routes set the session cookie; `middleware.ts` guards `/chat`, `/admin`, `/select-user`
- Client auth state is hydrated from the cookie via `GET /api/auth/me` (`AuthProvider` →
  `hydrateAuth`). The cookie — not localStorage — is the source of truth for auth.
- See `auth-reusable-guide.md` for the pattern this simplified flow is based on (the
  magic-link/email-verification steps from that guide are intentionally omitted).

### State Management (Zustand with Persistence)

The global store (`app/store/useScenarioStore.ts`) uses Zustand with persistence middleware:

- **Persisted** (`partialize`): `adminUserId`, `scenarios`, `commonSystemPrompt`,
  `feedbackPersona`, `feedbackInstruction`, `vtSessions`
- **NOT persisted (hydrated from cookie)**: `userId`, `userType`, `isAuthenticated`,
  `isAdmin`, `currentUser`, `authHydrated` — populated by `hydrateAuth()`
- **Version**: 3

Critical: When adding new persistent state, update the `partialize` function. Never
persist auth identity — it must come from the session cookie via `hydrateAuth`.

### Database Schema (SQLite with Drizzle ORM)

**Database Location**: `./data/rylai.db` (configurable via `DATABASE_URL` env var)

**Database Configuration**:
- WAL mode enabled for better concurrency
- Foreign keys enabled with cascade deletes
- Busy timeout: 5000ms to handle concurrent access

**users** table:
- `id` (TEXT): Primary key, UUID format
- `username` (TEXT): NOT NULL, **unique** — login id and the name shown to learners
- `passwordHash` (TEXT): bcrypt hash, NOT NULL
- `userType` (TEXT): 'admin' | 'user', NOT NULL, default 'user'
- `commonSystemPrompt`, `feedbackPersona`, `feedbackInstruction` (TEXT): Admin's custom prompts
- `createdAt` (INTEGER): Unix timestamp (milliseconds)
- `lastLoginAt` (INTEGER): Unix timestamp (milliseconds), nullable

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
1. **`/api/auth/signup`** - Create account (username + password; admin via `ADMIN_PASSCODE`), set session
2. **`/api/auth/login`** - Verify credentials, set session (generic error to prevent enumeration)
3. **`/api/auth/logout`** - Clear session cookie
4. **`/api/auth/me`** - Return the current session user (source of truth for client auth)

**Data**:
5. **`/api/health`** - Health check endpoint (returns database connection status)
6. **`/api/get-users-with-progress`** - List educators (for learners) with progress
7. **`/api/get-admin-info`** - Get educator's prompts by `adminId` (POST) / update prompts (PATCH)
8. **`/api/get-admin-scenarios`** - Get all scenarios for an educator
9. **`/api/delete-user`** - Delete user and cascade delete scenarios

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

**Select User Page** (`app/select-user/page.tsx`):
- Learner-only: shows the educator list with progress bars; picking one sets `adminUserId`
  + loads that educator's scenarios, then navigates to the first scenario's chat
- Waits for `authHydrated` before deciding to load or redirect (admins → `/admin`)
- All database queries go through API routes (`/api/get-users-with-progress`, etc.)

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
- `ADMIN_PASSCODE`: passcode that makes a sign-up an educator (admin) account
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
