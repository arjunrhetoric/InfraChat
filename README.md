<div align="center">

```
██╗███╗   ██╗███████╗██████╗  █████╗      ██████╗██╗  ██╗ █████╗ ████████╗
██║████╗  ██║██╔════╝██╔══██╗██╔══██╗    ██╔════╝██║  ██║██╔══██╗╚══██╔══╝
██║██╔██╗ ██║█████╗  ██████╔╝███████║    ██║     ███████║███████║   ██║
██║██║╚██╗██║██╔══╝  ██╔══██╗██╔══██║    ██║     ██╔══██║██╔══██║   ██║
██║██║ ╚████║██║     ██║  ██║██║  ██║    ╚██████╗██║  ██║██║  ██║   ██║
╚═╝╚═╝  ╚═══╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝     ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝
```

### A controlled, role-governed internal messaging platform for engineering teams.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-infra--chat--build.vercel.app-1F3864?style=for-the-badge&logo=vercel&logoColor=white)](https://infra-chat-build.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-15_App_Router-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-Monorepo-EF4444?style=for-the-badge&logo=turborepo&logoColor=white)](https://turbo.build/)
[![Postgres](https://img.shields.io/badge/Postgres-Supabase-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://supabase.com/)
[![Pusher](https://img.shields.io/badge/Realtime-Pusher-300D4F?style=for-the-badge&logo=pusher&logoColor=white)](https://pusher.com/)

</div>

---

## What is InfraChat?

Most internal messaging tools treat everyone equally. InfraChat doesn't.

InfraChat is a real-time messaging platform where **authority is baked into the architecture**. Every action — every message sent, every room joined, every command typed — is governed by your role. A chat box that's also a control panel. A platform where hierarchy actually means something.

> *"Type `/kick @user` and they're gone. Type `/mute @user 10` and their input locks everywhere. Instantly."*

**Live:** [https://infra-chat-build.vercel.app](https://infra-chat-build.vercel.app/)

---

## ✨ Features

### 🔐 Role-Based Authority

Three tiers of power, enforced on every server action — not just at login.

| Role | Power Level | What They Control |
|------|-------------|-------------------|
| **SuperAdmin** | `3` | Full platform — rooms, users, audit log, everything |
| **Moderator** | `2` | Assigned rooms — kick, mute, ban, announce |
| **Member** | `1` | Own messages — nothing more |

> Role comparisons use integers. You can only act on someone strictly below you. No exceptions.

---

### ⚡ Real-Time Everything

Built on **Pusher Channels** (managed WebSocket infrastructure — no self-hosted socket server, works natively on serverless). Messages, kicks, bans, mutes, announcements, typing indicators and presence travel instantly to every connected client.

```
User sends → Route Handler validates → Pusher trigger → All screens update
```

Channel strategy (`packages/realtime` is the single source of truth):

| Channel | Purpose |
|---|---|
| `presence-infrachat` | Global presence + room-list refresh |
| `private-room-{id}` | Room messages, kicks, bans, mutes, announcements, typing |
| `private-user-{id}` | Personal events — kicked, banned, muted, role changed |
| `private-dm-{a}-{b}` | DM thread between two users |

---

### 🏠 Multi-Room Architecture

Three room types with distinct access rules:

- **Public** — Anyone can join and send
- **Private** — Invite-only, controlled by Moderators
- **Broadcast** — Anyone can read, only Moderators/SuperAdmin can send

Rooms can be archived (read-only) or deleted. Members join, leave, and get kicked in real time. **Bans evict instantly** — the banned user's screen drops out of the room the moment it happens.

---

### ⌨️ The Command System

Any message starting with `/` is intercepted **before broadcast** and routed through a server-side pipeline: **Parse → Lookup → Permission → Cooldown → Execute**.

| Command | Min Role | What Happens |
|---------|----------|--------------|
| `/help [command]` | Member | Returns usage info |
| `/members` | Member | Lists room members |
| `/rooms` | Member | Lists rooms with member counts |
| `/kick @user` | Moderator | Removes user from room instantly |
| `/mute @user [minutes]` | Moderator | Locks their input for N minutes (or indefinitely) |
| `/unmute @user` | Moderator | Lifts an active mute |
| `/ban @user` | Moderator | Bans + evicts instantly |
| `/unban @user` | Moderator | Lifts a ban |
| `/announce [message]` | Moderator | Pins a broadcast to the top of the room |
| `/promote @user` | SuperAdmin | Elevates role by one level |
| `/demote @user` | SuperAdmin | Reduces role by one level |
| `/audit` | SuperAdmin | Returns last 10 audit log entries |

> Commands live in `apps/web/lib/commands.ts`. Adding one touches no message-handling code. Cooldowns are Redis-backed when Upstash is configured, in-memory otherwise.

---

### 🔑 Auth Your Way

- **Credentials** (email + password, bcrypt-12, httpOnly-cookie JWT sessions — no `localStorage` tokens)
- **Google** and **GitHub** OAuth via Auth.js (same-email accounts link automatically; OAuth users get generated usernames; banned users are rejected)
- First registered user becomes **SuperAdmin** automatically

---

### 👁️ Presence & Typing

Online/offline presence via the Pusher presence channel (green/grey dots, online counts) and per-room typing indicators relayed through an authenticated API — no client-event hacks.

### 📎 Attachments

Up to 5 files per message (10MB each, allowlisted types). Stored in **Vercel Blob** in production, local disk in dev. Attachment-only messages are allowed.

### 📋 Audit Log

Every privileged action leaves a trace. **Append-only by construction** — no update/delete code paths exist. Moderator+ can read via `/audit` page or API filters.

Logged: kick, ban, unban, mute, unmute, promote, demote, room create/delete/archive/unarchive/announcement, member add/remove, message delete.

### 📜 History & Search

Paginated message history with "Load older" on rooms and DMs. Direct messages with edit/delete, per-thread unread badges.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────┐
│              Next.js 15 App Router (apps/web)         │
│  React 19 UI · Route Handlers (all REST) · Auth.js    │
│  middleware (Edge-safe session check, no Prisma)      │
└──────┬───────────────────────────────┬───────────────┘
       │  Prisma Client (Node only)    │  Pusher trigger
       │                               │  (server-side)
┌──────▼──────────────┐   ┌────────────▼────────────────┐
│  Postgres (Supabase) │   │  Pusher Channels            │
│  users · rooms       │   │  room / user / dm channels  │
│  members · bans      │   │  + presence-infrachat       │
│  messages · dms      │   └─────────────────────────────┘
│  attachments · audit │
│  accounts · sessions │
└─────────────────────┘
```

Auth runs a split config: `auth.config.ts` is Edge-safe (used by middleware — Prisma can never load on Edge), while `auth.ts` adds the Prisma adapter and DB-backed callbacks for Node runtimes.

---

## 📁 Project Structure

```
InfraChat/
├── turbo.json                  # task pipeline + declared env (cache-correct)
├── docker-compose.yml          # local Postgres
├── .env.example                # local template
├── .env.production.example     # prod template (Vercel)
│
├── apps/web/                   # Next.js App Router — UI + ALL backend
│   ├── app/
│   │   ├── page.tsx            # Workspace (rooms + DMs + members)
│   │   ├── workspace-client.tsx# realtime subscriptions, send, upload
│   │   ├── login/ register/    # credentials + Google/GitHub buttons
│   │   ├── admin/              # SuperAdmin role table
│   │   ├── audit/              # append-only log viewer
│   │   └── api/
│   │       ├── auth/           # register + NextAuth handlers
│   │       ├── rooms/          # CRUD, join/leave, members, messages, typing, archive
│   │       ├── messages/       # edit (owner) / delete (owner·mod·admin)
│   │       ├── dm-messages/    # DM edit/delete (owner-only)
│   │       ├── direct-messages/# DM threads
│   │       ├── users/          # list + role change (SuperAdmin)
│   │       ├── audit/          # filtered read (Moderator+)
│   │       ├── pusher/auth/    # private/presence channel authorization
│   │       └── upload/         # Blob in prod, disk in dev
│   ├── auth.ts                 # full Node auth (adapter + DB callbacks)
│   ├── auth.config.ts          # edge-safe base (middleware)
│   ├── middleware.ts           # login/auth-page redirects
│   └── lib/
│       ├── commands.ts         # slash-command pipeline
│       ├── validators.ts       # Zod schemas (content OR attachments)
│       ├── rate-limit.ts       # Redis when configured, memory fallback
│       ├── redis.ts / env.ts   # optional Upstash / env validation
│       └── roles.ts            # 1/2/3 hierarchy helpers
│
└── packages/
    ├── db/                     # Prisma schema, migrations, seed, client
    │   └── prisma/
    │       ├── schema.prisma
    │       └── migrations/0001_init/
    └── realtime/               # channel/event names + server trigger()
```

---

## 🗄️ Data Model (Postgres via Prisma)

- **User** — username (unique), email (unique), passwordHash (nullable for OAuth), role `1|2|3`, isBanned, isMuted, mutedUntil, avatar
- **Room** — name (unique), description, type `public|private|broadcast`, isPrivate, isArchived, announcement + author
- **RoomMember** — join with per-room `isModerator` flag · **RoomBan** — per-room bans
- **Message / DirectMessage** — content (empty allowed with attachments), type, edited, soft-delete, attachment tables
- **AuditLog** — action enum, actor, target, room, details, metadata, createdAt only
- **Account / Session / VerificationToken** — Auth.js tables

---

## 🚀 Getting Started

### Prerequisites

- Node.js `v18+`, npm
- Postgres (local Docker **or** Supabase) · Pusher Channels app
- Optional: Google + GitHub OAuth apps, Upstash Redis, Vercel Blob store

### 1. Clone & install

```bash
git clone https://github.com/arjunrhetoric/InfraChat.git
cd InfraChat
npm install
```

### 2. Environment

```bash
cp .env.example .env
cp .env.example apps/web/.env.local
```

Fill both identically: `DATABASE_URL`, `AUTH_SECRET` (32+ chars), `PUSHER_*` + `NEXT_PUBLIC_PUSHER_*`, and optionally `GOOGLE_*`, `GITHUB_*`, `BLOB_READ_WRITE_TOKEN`, `UPSTASH_*`. For OAuth, register redirect URIs:

```
http://localhost:3000/api/auth/callback/google
http://localhost:3000/api/auth/callback/github
```

> Rule: **restart `npm run dev` after any env change** — Next reads env once at boot.

### 3. Database

```bash
# local docker Postgres:
docker compose up -d postgres

npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
npm run db:seed --workspace=@infrachat/db
```

Seed creates `admin@infrachat.local / admin123` (SuperAdmin) + `#general`. Change or remove it after promoting your own account. (Supabase users: run migrations on the **direct or session-pooling** connection — the transaction pooler can't run DDL.)

### 4. Run

```bash
npm run dev          # web → http://localhost:3000
npm run typecheck --workspace=@infrachat/web
npm run build --workspace=@infrachat/web   # stop dev first (Windows file lock)
```

---

## 🌐 Deployment (Vercel)

1. Import the repo — root directory stays repo root (Turborepo auto-detected, builds `apps/web`).
2. **Storage → Create Blob store** (uploads don't persist on serverless disk).
3. Set production env from `.env.production.example`: pooler `DATABASE_URL` + `&connection_limit=1`, fresh `AUTH_SECRET`, `AUTH_URL` + `NEXT_PUBLIC_APP_URL` = prod domain, same Pusher/OAuth keys.
4. Add prod OAuth redirect URIs (`https://<domain>/api/auth/callback/google|github`).
5. Deploy + redeploy after env changes. No DB migration needed (Supabase already migrated).

---

## 🔒 Security

- bcrypt-12 password hashing, httpOnly-cookie JWT sessions, no client-stored tokens
- Every route re-validates membership, bans, mutes, archive/broadcast guards server-side
- Pusher channels authorized per-room (banned/non-members rejected), DMs restricted to participants
- Zod validation on all inputs; 10MB allowlisted uploads; rate limits on register + messaging
- Security headers (`nosniff`, `DENY` framing, strict referrer) in `next.config.mjs`
- Audit log has zero update/delete paths

---

## 🗺️ Roadmap

- [x] Turborepo + Next.js App Router migration
- [x] Postgres + Prisma + Auth.js (credentials, Google, GitHub)
- [x] Managed realtime (Pusher) + presence + typing
- [x] Ban eviction, mute persistence, attachment-only messages
- [ ] Message reactions / thread replies UI
- [ ] Email / push notifications
- [ ] Upstash Redis in production
- [ ] Tests (commands, validators, pipeline)

---

## 🧱 Tech Stack

| Layer | Technology |
|-------|-----------|
| UI + API | Next.js 15 (App Router), React 19 |
| Monorepo | Turborepo + npm workspaces |
| Realtime | Pusher Channels |
| Database | Postgres (Supabase), Prisma ORM |
| Auth | Auth.js v5 (credentials, Google, GitHub) |
| Uploads | Vercel Blob (prod), local disk (dev) |
| Validation | Zod |
| Deployment | Vercel |

---

<div align="center">

**Built with intention. Every action governed. Every message instant.**

[![Live Demo](https://img.shields.io/badge/Try%20it%20live-infra--chat--build.vercel.app-1F3864?style=for-the-badge&logo=vercel&logoColor=white)](https://infra-chat-build.vercel.app/)

</div>
