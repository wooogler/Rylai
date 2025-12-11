# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RYLAI (Resilient Youth Learn through Artificial Intelligence) is an educational web application for cybergrooming prevention training. It simulates realistic chat conversations with AI-powered predators across different grooming stages, providing real-time educational feedback to help teens recognize and respond to online grooming tactics.

## Development Commands

```bash
# Development server (uses Turbopack)
npm run dev

# Development with local API (mistral-7b instead of OpenAI)
npm run dev:local

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

The application supports three user types with distinct workflows:

1. **Admin** (password: `rylai2025`)
   - Creates and manages scenarios
   - Configures system prompts and feedback instructions
   - Each admin has their own set of scenarios stored in SQLite

2. **User/Learner** (password: `user2025`)
   - Selects a teacher (admin) whose scenarios to practice
   - Chat interactions and feedback are saved per scenario
   - Progress tracked across all scenarios

3. **Parent** (password: `parent2025`)
   - Views child's progress (read-only access)
   - Must use child's username to login
   - Cannot send messages or reset progress

### State Management (Zustand with Persistence)

The global store (`app/store/useScenarioStore.ts`) uses Zustand with persistence middleware to maintain state across page refreshes:

- **Persisted**: `userId`, `userType`, `adminUserId`, `isAuthenticated`, `scenarios`, `commonSystemPrompt`, `feedbackPersona`, `feedbackInstruction`
- **Not persisted**: `isLoading` and other temporary UI states
- **Version**: 2 (incremented from Supabase migration to invalidate old cache)

Critical: When adding new persistent state, update the `partialize` function in the persist config.

### Database Schema (SQLite with Drizzle ORM)

**Database Location**: `./data/rylai.db` (configurable via `DATABASE_URL` env var)

**Database Configuration**:
- WAL mode enabled for better concurrency
- Foreign keys enabled with cascade deletes
- Busy timeout: 5000ms to handle concurrent access

**users** table:
- `id` (TEXT): Primary key, UUID format
- `username` (TEXT): Username, NOT NULL
- `userType` (TEXT): 'admin' | 'user' | 'parent', NOT NULL
- `commonSystemPrompt`, `feedbackPersona`, `feedbackInstruction` (TEXT): Admin's custom prompts
- `createdAt` (INTEGER): Unix timestamp (milliseconds)
- **Unique constraint**: (username, userType)

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

**Model Selection** (`lib/ai-models.ts`):
- Supports 13+ AI models via OpenRouter (OpenAI, Anthropic, Google, Meta, Mistral)
- Default model: `gpt-4o`
- Users can select models via dropdown in chat interface
- Selected model is persisted in Zustand store as `selectedModelId`

Two AI endpoints in `app/api/`:

1. **`/api/chat`** - Predator chatbot responses
   - Accepts `modelId` parameter to select AI model
   - Supports OpenRouter, direct OpenAI, and local models
   - Combines scenario-specific `systemPrompt` with `commonSystemPrompt`
   - Stage-specific behavior defined in `STAGE_DESCRIPTIONS` and `STAGE_GOALS`

2. **`/api/feedback`** - Educational feedback generation
   - Accepts `modelId` parameter (same model selection as chat)
   - Structured format: "What is the other person trying to do?", "How did you do?", "Tips to Stay Safe"
   - Configured via `feedbackPersona` and `feedbackInstruction`

**OpenRouter Configuration**:
- Base URL: `https://openrouter.ai/api/v1`
- Requires `OPENROUTER_API_KEY` environment variable
- Compatible with OpenAI SDK (uses OpenAI-compatible API)

Feedback prompts are intentionally concise and teen-friendly to ensure engagement.

### Database API Routes

Server-side API routes for database operations (SQLite can only be accessed server-side):

1. **`/api/health`** - Health check endpoint (returns database connection status)
2. **`/api/check-user`** - Verify user existence by username and user type
3. **`/api/get-users-with-progress`** - List users with optional progress tracking
4. **`/api/get-admin-info`** - Get educator's system prompts and settings
5. **`/api/get-admin-scenarios`** - Get all scenarios for an educator
6. **`/api/delete-user`** - Delete user and cascade delete scenarios

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
- For learners/parents: Shows admin list with progress bars
- For admins: Shows other admin accounts
- Must wait for `isAuthenticated` and `userType` from persist store before loading data
- All database queries go through API routes (`/api/get-users-with-progress`, etc.)

### Common Pitfalls

1. **Duplicate Message IDs**: Always use timestamp in preset message IDs
2. **Drizzle Query Errors**:
   - Use `findFirst()` which returns `undefined` if not found (like `.maybeSingle()`)
   - Wrap queries in try-catch blocks (Drizzle throws exceptions unlike Supabase)
3. **Persist State Not Loading**: Check useEffect dependencies include `isAuthenticated`, `userType`, `userId`
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

Required in `.env.local`:
- `OPENROUTER_API_KEY`: OpenRouter API key (recommended - supports 13+ models)
- `OPENAI_API_KEY`: OpenAI API key (optional - for direct OpenAI access)
- `DATABASE_URL`: SQLite database file path (optional, defaults to `./data/rylai.db`)
- `NEXT_PUBLIC_USE_LOCAL_API`: 'true' to use local mistral-7b instead of cloud APIs

**Note**: You need either `OPENROUTER_API_KEY` or `OPENAI_API_KEY` configured, unless using local API. OpenRouter is recommended for access to multiple AI models.

## Tech Stack

- **Framework**: Next.js 15 (App Router, Turbopack)
- **UI**: React 19, Tailwind CSS 4
- **State**: Zustand with persist middleware
- **Database**: SQLite with Drizzle ORM and better-sqlite3
- **AI**: OpenRouter (13+ models) or direct OpenAI API or local mistral-7b
- **Icons**: Lucide React
- **Markdown**: react-markdown for feedback rendering
- **Deployment**: Docker + Docker Compose

## Database Migration History

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
