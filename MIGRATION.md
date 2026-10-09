# InfraChat 2.0 — Turborepo + Next.js App Router

Increment 2 complete (verified: `typecheck` + `next build` pass).

Increment 3 — production hardening (verified: `typecheck` + `next build` pass).

## Structure

```
InfraChat/
  turbo.json                 # build/dev pipeline
  package.json               # npm workspaces: apps/*, packages/*
  docker-compose.yml         # local Postgres
  .env.example
  frontend/  server/         # LEGACY — reference only, delete after parity
  apps/web/                  # Next.js App Router (UI + all REST)
    app/
      page.tsx               # Workspace (RSC + client realtime)
      workspace-client.tsx   # Pusher subscriptions, send, kick/ban eviction
      login/ register/ audit/ admin/
      api/
        auth/register        # first user → SuperAdmin
        auth/[...nextauth]   # Auth.js credentials, httpOnly-cookie JWT
        rooms                # GET list / POST create (Mod+, broadcast=Admin)
        rooms/[id]/messages  # GET paginated / POST send + /command intercept
        rooms/[id]/join|leave|members|members/[userId]
        messages/[messageId]  # PATCH owner / DELETE owner|room-mod|admin
        users + users/[id]/role (Admin, no self-demote)
        audit                # Mod+, append-only read
        direct-messages/[userId]
        pusher/auth          # private/presence channel auth + membership check
        upload               # multipart, 10MB, allowlist, relative /uploads/* URL
    auth.ts                  # NextAuth v5 + PrismaAdapter + mute-expiry persist
    middleware.ts            # redirect /login ↔ / (logged-in users leave auth pages)
    lib/commands.ts          # slash-command pipeline (Prisma+Pusher port)
    lib/validators.ts        # Zod: attachment-only allowed (bug fix)
    lib/rate-limit.ts        # in-memory (swap for Redis when scaling)
  packages/db/               # Prisma schema (User/Room/Member/Ban/Message/DM/Audit + Auth.js tables)
  packages/realtime/         # Pusher channel/event constants + server trigger()
```

## Gaps fixed in this increment

1. Auth in httpOnly cookies (Auth.js JWT) — no localStorage token; logged-in `/login` redirects home (middleware).
2. `Message.content=""` allowed at DB; Zod requires content OR attachments (old pre-validate dead code fixed).
3. `/ban` and REST kick both emit personal `room:banned/room:kicked` → client evicts immediately (old ban left socket in room).
4. Mute expiry persisted on login + message-send (old REST auth never saved).
5. No hardcoded backend URL; upload returns relative `/uploads/*`; single-origin Route Handlers → no CORS.
6. No `multer` in frontend; server allowlist + 10MB enforced in Route Handler.
7. Audit has zero update/delete code paths (append-only by construction).
8. Pusher channel auth checks membership/ban per room; DM channels check participation.
9. Basic rate limits on register + message send (replace with Redis for multi-instance).
10. Dead code removed: single Workspace, no Dashboard/RoomChat/DM duplicate routes.

## Run

```bash
# 1. Postgres
docker compose up -d postgres
cp .env.example .env   # fill DATABASE_URL, AUTH_SECRET, PUSHER_*

# 2. Install + DB
npm install
npm run db:generate
npm run db:push        # or db:migrate

# 3. Dev
npm run dev            # turbo → apps/web :3000

# Legacy apps untouched:
#  frontend/ (Vite) + server/ (Express+Socket.io) remain for diffing.
```

## Next increments

- File attachments UI + DM thread UI + typing/presence via Pusher presence channel.
- Room create/archive/delete UI, member add/remove UI, broadcast guard UI.
- Message edit/delete UI wired to PATCH/DELETE.
- Vercel Blob/R2 for uploads in prod (local disk doesn't persist serverless).
- Upstash Redis for rate-limit + command cooldown + presence.
- Prisma migrate history + seed SuperAdmin; delete `frontend/` + `server/` after parity; CI (typecheck/lint/build).
