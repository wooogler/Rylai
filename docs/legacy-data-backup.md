# Legacy Data Backup (pre-auth-refactor)

> Backed up **2026-06-11** before wiping the SQLite DB for the email-based auth migration.
> Source: `./data/rylai.db`. Full machine-readable copy: `docs/legacy-data-backup.json`.
> Old schema used `username`+`user_type` (admin/user/parent). New schema uses `email`+`passwordHash`+`userType` (admin/user).

## Users (2)

| id | username | user_type | created_at |
|---|---|---|---|
| 7b871878-0b91-4626-9c89-60c0f44f0097 | sangwooklee | admin | 2025-12-11T20:30:10.390Z |
| befd0451-b032-465a-851d-4ff141a604bf | sangwooklee | user | 2026-04-21T16:21:25.130Z |

_Note: no passwords existed (shared-password auth). These accounts cannot be carried over; re-register under the new email auth._

## Scenarios (3)

### #1 — The Friendly Gamer (`friendly-gamer`)

- owner user_id: `7b871878-0b91-4626-9c89-60c0f44f0097`
- predator: Alex (@alexgamer99)
- stage: 1
- description: A friendly gamer who wants to connect
- system_prompt: (empty)
- preset messages:
  - **other**: Hey! I saw you play the same game as me
  - **other**: You're really good! How long have you been playing?

### #2 — The Supportive Friend (`supportive-friend`)

- owner user_id: `7b871878-0b91-4626-9c89-60c0f44f0097`
- predator: Jordan (@jordan_cares)
- stage: 2
- description: Someone offering emotional support
- system_prompt: (empty)
- preset messages:
  - **other**: Hi! I noticed you seemed a bit down in your last post
  - **other**: I'm here if you want to talk about it

### #3 — The Secret Keeper (`secret-keeper`)

- owner user_id: `7b871878-0b91-4626-9c89-60c0f44f0097`
- predator: Sam (@samsecret)
- stage: 4
- description: Someone trying to build a secret relationship
- system_prompt: (empty)
- preset messages:
  - **other**: Hey, can I tell you something? But you have to promise not to tell anyone
  - **other**: I feel like I can really trust you

## user_messages (4)

| scenario_id | sender | text | timestamp |
|---|---|---|---|
| 1 | other | Hey! I saw you play the same game as me | 2025-12-11T20:30:10.378Z |
| 1 | other | You're really good! How long have you been playing? | 2025-12-11T20:30:10.378Z |
| 1 | user | I play something. | 2026-04-23T19:07:49.535Z |
| 1 | other | Really? That's cool. I wish I could join you sometime. | 2026-04-23T19:07:55.430Z |

## scenario_progress (1)

| user_id | scenario_id | visit_count | last_visited |
|---|---|---|---|
| befd0451-b032-465a-851d-4ff141a604bf | 1 | 2 | 2026-04-23T19:07:40.102Z |

## user_feedbacks (0)

_(none)_
