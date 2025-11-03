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
```

## Architecture

### User Types and Authentication Flow

The application supports three user types with distinct workflows:

1. **Admin** (password: `rylai2025`)
   - Creates and manages scenarios
   - Configures system prompts and feedback instructions
   - Each admin has their own set of scenarios stored in Supabase

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

Critical: When adding new persistent state, update the `partialize` function in the persist config.

### Database Schema (Supabase)

**users** table:
- `id` (uuid): Primary key
- `username` (text): Unique username
- `user_type` (text): 'admin' | 'user' | 'parent'
- `common_system_prompt`, `feedback_persona`, `feedback_instruction`: Admin's custom prompts

**scenarios** table:
- `id` (int): Auto-increment primary key
- `user_id` (uuid): References admin who created it
- `slug`, `name`, `handle`, `predator_name`: Scenario details
- `stage` (int): 0-6, represents grooming stage
- `system_prompt` (text): AI behavior instructions
- `preset_messages` (jsonb): Initial conversation
- `description` (text): Scenario description

**user_messages** table:
- Stores all messages per user per scenario
- `message_id` (text): Unique message identifier (format: `{scenarioId}-preset-{index}-{timestamp}-{originalId}`)

**user_feedbacks** table:
- Stores generated feedback per message

**scenario_progress** table:
- Tracks visit counts and timestamps per user per scenario

### AI Integration

Two AI endpoints in `app/api/`:

1. **`/api/chat`** - Predator chatbot responses
   - Uses `gpt-4o` (OpenAI) or `mistral-7b-instruct-v0.3` (local)
   - Combines scenario-specific `systemPrompt` with `commonSystemPrompt`
   - Stage-specific behavior defined in `STAGE_DESCRIPTIONS` and `STAGE_GOALS`

2. **`/api/feedback`** - Educational feedback generation
   - Uses same model selection as chat
   - Structured format: "What is the other person trying to do?", "How did you do?", "Tips to Stay Safe"
   - Configured via `feedbackPersona` and `feedbackInstruction`

Feedback prompts are intentionally concise and teen-friendly to ensure engagement.

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

**Select User Page** (`app/select-user/page.tsx`):
- For learners/parents: Shows admin list with progress bars
- For admins: Shows other admin accounts
- Must wait for `isAuthenticated` and `userType` from persist store before loading data

### Common Pitfalls

1. **Duplicate Message IDs**: Always use timestamp in preset message IDs
2. **Supabase Query Errors**: Use `.maybeSingle()` instead of `.single()` when checking existence
3. **Persist State Not Loading**: Check useEffect dependencies include `isAuthenticated`, `userType`, `userId`
4. **Preview Feedback Not Showing**: Ensure `previewText` state matches current input text

### Environment Variables

Required in `.env.local`:
- `OPENAI_API_KEY`: OpenAI API key
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key
- `NEXT_PUBLIC_USE_LOCAL_API`: 'true' to use local mistral-7b instead of OpenAI

## Tech Stack

- **Framework**: Next.js 15 (App Router, Turbopack)
- **UI**: React 19, Tailwind CSS 4
- **State**: Zustand with persist middleware
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI API (gpt-4o) or local mistral-7b
- **Icons**: Lucide React
- **Markdown**: react-markdown for feedback rendering
