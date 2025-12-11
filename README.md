# RYLAI

**Resilient Youth Learn through Artificial Intelligence**

A Teen-based Educational Intervention for Cybergrooming Prevention

## Overview

RYLAI is an educational web application that simulates realistic chat conversations with AI-powered predators across different grooming stages, providing real-time educational feedback to help teens recognize and respond to online grooming tactics.

## Features

- 🤖 Real-time AI-powered predator simulation
- 📊 7 stages of grooming progression (0-6)
- 💡 Personalized feedback on conversation responses
- 👨‍🏫 Educator portal for scenario management
- 👪 Parent portal for monitoring child progress
- 🔒 Safe, controlled learning environment

## Tech Stack

- **Framework**: Next.js 15 (App Router, Turbopack)
- **UI**: React 19, Tailwind CSS 4, Lucide Icons
- **State Management**: Zustand with persist middleware
- **Database**: SQLite with Drizzle ORM
- **AI**: OpenRouter (supports 5 models: GPT-4o, Mistral 7B, Grok 4.1, Gemini 2.0, DeepSeek V3.2)
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

   Create a `.env.local` file:
   ```env
   # Optional: SQLite database location (defaults to ./data/rylai.db)
   DATABASE_URL=./data/rylai.db

   # OpenRouter API key (recommended - supports multiple AI models)
   OPENROUTER_API_KEY=sk-or-v1-your-key-here

   # Optional: OpenAI API key (for direct OpenAI access)
   OPENAI_API_KEY=sk-your-key-here

   # Optional: Use local Mistral-7b instead of cloud APIs
   NEXT_PUBLIC_USE_LOCAL_API=false
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

### Development with Local API (Mistral-7b)

```bash
npm run dev:local
```

## User Types & Passwords

The application supports three user types:

| User Type | Password | Purpose |
|-----------|----------|---------|
| **Educator/Admin** | `rylai2025` | Create and manage scenarios |
| **Learner** | `user2025` | Practice with educator scenarios |
| **Parent** | `parent2025` | View child's progress (read-only) |

## Docker Deployment

### Quick Start

1. **Set up environment variables**

   Create a `.env` file:
   ```env
   OPENROUTER_API_KEY=sk-or-v1-your-key-here
   OPENAI_API_KEY=sk-your-key-here
   NEXT_PUBLIC_USE_LOCAL_API=false
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

1. **users** - User accounts (admin/user/parent)
2. **scenarios** - Educator-created chat scenarios
3. **user_messages** - Learner chat history
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
npm run dev:local        # Start with local Mistral-7b API

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

### Internal Endpoints

- `POST /api/check-user` - Verify user existence
- `POST /api/get-users-with-progress` - List users with progress
- `POST /api/get-admin-info` - Get educator information
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

RYLAI supports multiple AI models through OpenRouter:

### Supported Models

1. **GPT-4o** (OpenAI) - Latest GPT-4 Omni model (default)
   - Context: 128K tokens

2. **Mistral 7B Instruct** (Mistral AI)
   - Context: 32K tokens

3. **Grok 4.1 Fast** (xAI)
   - Context: 131K tokens

4. **Gemini 2.0 Flash** (Google)
   - Context: 1M tokens

5. **DeepSeek V3.2** (DeepSeek)
   - Context: 65K tokens

### Selecting Models

Users can select their preferred AI model from the dropdown menu in the chat interface. The selected model is used for both predator chat responses and educational feedback generation.

### Getting OpenRouter API Key

1. Sign up at [OpenRouter](https://openrouter.ai/)
2. Add credits to your account
3. Generate an API key from your dashboard
4. Add the key to your `.env.local` file as `OPENROUTER_API_KEY`

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | `./data/rylai.db` | SQLite database file path |
| `OPENROUTER_API_KEY` | Recommended | - | OpenRouter API key (supports 5 models) |
| `OPENAI_API_KEY` | No | - | OpenAI API key (for direct OpenAI access) |
| `NEXT_PUBLIC_USE_LOCAL_API` | No | `false` | Use local Mistral-7b instead of cloud APIs |

**Note**: You need `OPENROUTER_API_KEY` configured. OpenRouter is required as it provides access to all 5 supported AI models.

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

- [ ] Change default passwords in production
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
