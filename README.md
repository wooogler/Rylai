# RYLAI

**Resilient Youth Learn through Artificial Intelligence**

A Teen-based Educational Intervention for Cybergrooming Prevention

## Overview

RYLAI is an educational web application that simulates realistic chat conversations with AI-powered predators across different grooming stages, providing real-time educational feedback to help teens recognize and respond to online grooming tactics.

## Features

- 🤖 Real-time AI-powered predator simulation (VT Custom / StagePilot, with automatic stage prediction)
- 📊 7 stages of grooming progression (0-6)
- 💡 Personalized feedback on conversation responses
- 👨‍🏫 Educator portal for scenario management
- 🔐 Username + password accounts (educators vs learners)
- 🔒 Safe, controlled learning environment

## Tech Stack

- **Framework**: Next.js 15 (App Router, Turbopack)
- **UI**: React 19, Tailwind CSS 4, Lucide Icons
- **State Management**: Zustand with persist middleware
- **Database**: SQLite with Drizzle ORM
- **Auth**: username + password (bcryptjs), Zod validation, HMAC-signed httpOnly cookie
- **AI**: VT Custom (StagePilot) for predator chat; OpenAI Responses API for feedback
- **Deployment**: Docker + Docker Compose

## Getting Started

**📘 For detailed deployment instructions in Korean, see [DEPLOYMENT.md](DEPLOYMENT.md)**

### Prerequisites

- Node.js 20+
- npm or yarn
- (Optional) Docker for containerized deployment

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Rylai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   Create a `.env.local` file (see `.env.example` for all options):
   ```env
   # Optional: SQLite database location (defaults to ./data/rylai.db)
   DATABASE_URL=./data/rylai.db

   # Signs the session cookie (required in production)
   SESSION_SECRET=change-me-to-a-long-random-secret

   # Passcode that makes a sign-up an educator (admin) account
   ADMIN_PASSCODE=rylai2025

   # Required for feedback generation (OpenAI Responses API)
   OPENAI_API_KEY=sk-your-key-here

   # Optional: feedback model (defaults to gpt-5.5)
   FEEDBACK_MODEL=gpt-5.5
   ```

4. **Run database migrations**
   ```bash
   npm run db:migrate
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**

   Navigate to [http://localhost:3000](http://localhost:3000)

## User Types & Authentication

Authentication is username + password (no email is collected). There are two account
types, distinguished at sign-up:

| User Type | How to register | Purpose |
|-----------|-----------------|---------|
| **Educator / Admin** | Sign up **with** the educator passcode (`ADMIN_PASSCODE`) | Create and manage scenarios |
| **Learner** | Sign up **without** a passcode | Practice with an educator's scenarios |

Passwords are bcrypt-hashed (minimum 8 characters); sessions use an HMAC-signed httpOnly
cookie. Learners pick which educator's scenarios to practice on the "Select a Teacher"
page (educators are listed by username).

## Docker Deployment

### Quick Start

1. **Set up environment variables**

   Create a `.env` file:
   ```env
   SESSION_SECRET=change-me-to-a-long-random-secret
   ADMIN_PASSCODE=rylai2025
   OPENAI_API_KEY=sk-your-key-here
   FEEDBACK_MODEL=gpt-5.5
   ```

2. **Start the application**
   ```bash
   docker-compose up -d
   ```

3. **Access the application**

   Open [http://localhost:3000](http://localhost:3000)

4. **Check health status**
   ```bash
   curl http://localhost:3000/api/health
   ```

### Docker Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild after code changes
docker-compose up -d --build

# Remove all data (including database)
docker-compose down -v
```

### Database Persistence

The SQLite database is stored in a Docker volume named `rylai-data`. Data persists across container restarts but will be deleted if you run `docker-compose down -v`.

### Backup & Restore

**Backup database:**
```bash
docker cp rylai-app:/app/data/rylai.db ./backup-$(date +%Y%m%d).db
```

**Restore database:**
```bash
docker cp ./backup-20231201.db rylai-app:/app/data/rylai.db
docker-compose restart
```

## Database Management

### Run Migrations

```bash
npm run db:migrate
```

### Drizzle Studio (Database GUI)

```bash
npm run db:studio
```

Opens a web interface at `https://local.drizzle.studio` to view and edit database records.

### Database Schema

The application uses 5 main tables:

1. **users** - User accounts (username/password; admin or user)
2. **scenarios** - Educator-created chat scenarios
3. **user_messages** - Learner chat history (with VT-predicted stage)
4. **user_feedbacks** - Generated educational feedback
5. **scenario_progress** - Visit tracking and progress

For detailed schema information, see [CLAUDE.md](CLAUDE.md).

## Project Structure

```
Rylai/
├── app/                      # Next.js App Router
│   ├── page.tsx             # Landing page (login)
│   ├── admin/               # Scenario management
│   ├── chat/[scenario]/     # Chat interface
│   ├── select-user/         # Educator selection
│   ├── store/               # Zustand state management
│   └── api/                 # API routes
│       ├── chat/            # AI chat endpoint
│       ├── feedback/        # Feedback generation
│       └── health/          # Health check
├── lib/
│   └── db/                  # Database layer
│       ├── schema.ts        # Drizzle schema
│       ├── client.ts        # SQLite client
│       └── migrations/      # Database migrations
├── Dockerfile               # Docker image definition
├── docker-compose.yml       # Docker orchestration
└── CLAUDE.md               # Detailed project documentation
```

## Development Scripts

```bash
# Development
npm run dev              # Start dev server with Turbopack

# Production
npm run build            # Build for production
npm start                # Start production server

# Database
npm run db:migrate       # Run database migrations
npm run db:studio        # Open Drizzle Studio

# Code Quality
npm run lint             # Run ESLint
```

## API Endpoints

### Public Endpoints

- `GET /api/health` - Health check endpoint
- `POST /api/chat` - Generate AI predator responses
- `POST /api/feedback` - Generate educational feedback

### Auth Endpoints

- `POST /api/auth/signup` - Create an account (username + password; admin via passcode)
- `POST /api/auth/login` - Log in and set the session cookie
- `POST /api/auth/logout` - Clear the session cookie
- `GET /api/auth/me` - Get the current session user

### Internal Endpoints

- `POST /api/get-users-with-progress` - List educators with learner progress
- `POST /api/get-admin-info` - Get / update educator information
- `POST /api/get-admin-scenarios` - Get educator's scenarios
- `POST /api/delete-user` - Delete user account

## Grooming Stages

The application simulates 7 stages of online grooming:

0. **Free Interaction** - No stage constraints
1. **Friendship Forming** - Building rapport, asking for pictures
2. **Relationship Forming** - Discussing hobbies and school life
3. **Risk Assessment** - Checking for supervision
4. **Exclusivity** - Building emotional bond and secrets
5. **Sexual** - Introducing inappropriate content
6. **Conclusion** - Planning offline meetings

## AI Models

There is no model picker — the two AI roles are fixed:

- **Predator chat**: VT Custom (StagePilot), a session-based endpoint
  (`https://rylai.cs.vt.edu/llm`) that also predicts the grooming stage automatically.
  No API key required. The UI can override the stage for the next turn.
- **Feedback**: OpenAI **Responses API** with a single model (`FEEDBACK_MODEL`,
  default `gpt-5.5`). Requires `OPENAI_API_KEY`.

To change the feedback model, set `FEEDBACK_MODEL` in your environment to any model
available to your OpenAI key.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | `./data/rylai.db` | SQLite database file path |
| `SESSION_SECRET` | Yes (prod) | dev fallback | Secret used to sign the session cookie |
| `ADMIN_PASSCODE` | Yes | - | Passcode to register an educator (admin) account |
| `OPENAI_API_KEY` | Yes | - | OpenAI API key, used for feedback generation |
| `FEEDBACK_MODEL` | No | `gpt-5.5` | Feedback model (must be available to your key) |

## Troubleshooting

### Database Issues

**Error: "database is locked"**
- SQLite allows only one write at a time
- Wait a moment and try again
- Check if another process is accessing the database

**Migration fails**
```bash
# Reset database (WARNING: deletes all data)
rm -rf data/*.db*
npm run db:migrate
```

### Docker Issues

**Container won't start**
```bash
# Check logs
docker-compose logs

# Rebuild image
docker-compose up -d --build
```

**Database not persisting**
- Ensure volume is mounted correctly
- Check `docker volume ls` for `rylai-data`

## Production Deployment

### Security Checklist

- [ ] Set a strong, unique `SESSION_SECRET` (e.g. `openssl rand -hex 32`)
- [ ] Set a non-default `ADMIN_PASSCODE`
- [ ] Set up HTTPS with reverse proxy (nginx/caddy)
- [ ] Configure firewall rules
- [ ] Set up regular database backups
- [ ] Monitor logs and health endpoint
- [ ] Keep dependencies updated

### Reverse Proxy Example (Nginx)

```nginx
server {
    listen 80;
    server_name rylai.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Contributing

This is an educational research project. For questions or contributions, please contact the project maintainers.

## License

[Add your license information here]

## Acknowledgments

- Built with [Next.js](https://nextjs.org)
- AI powered by [OpenAI](https://openai.com)
- Database by [Drizzle ORM](https://orm.drizzle.team)
