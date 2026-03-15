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

[![Live Demo](https://img.shields.io/badge/Live%20Demo-infra--chat--sudo1.vercel.app-1F3864?style=for-the-badge&logo=vercel&logoColor=white)](https://infra-chat-sudo1.vercel.app/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongodb.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-Realtime-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)

</div>

---

## What is InfraChat?

Most internal messaging tools treat everyone equally. InfraChat doesn't.

InfraChat is a real-time messaging platform where **authority is baked into the architecture**. Every action you can take — every message sent, every room joined, every command typed — is governed by your role. A chat box that's also a control panel. A platform where hierarchy actually means something.

> *"Type `/kick @user` and they're gone. Type `/mute @user 10` and their input box greys out across every connected screen. Instantly."*

---

## ✨ Features

### 🔐 Role-Based Authority
Three tiers of power, enforced on every single server event — not just at login.

| Role | Power Level | What They Control |
|------|-------------|-------------------|
| **SuperAdmin** | `3` | Full platform — rooms, users, audit log, everything |
| **Moderator** | `2` | Their assigned rooms — kick, mute, ban, announce |
| **Member** | `1` | Their own messages — nothing more |

> Role comparisons use integers. You can only act on someone strictly below you. No exceptions.

---

### ⚡ Real-Time Everything
Built on Socket.io with persistent WebSocket connections. Every event — messages, presence changes, command outcomes, typing indicators — travels instantly to every connected client.

```
User types → Server validates → Event fires → All screens update
                                               in < 100ms
```

---

### 🏠 Multi-Room Architecture

Three room types with distinct access rules:

- **Public** — Anyone can join and send
- **Private** — Invite-only, controlled by the Moderator  
- **Broadcast** — Anyone can read, only Moderators/SuperAdmin can send

Rooms can be archived (read-only) or deleted entirely. SuperAdmin assigns a Moderator to each room. Members join, leave, and get kicked in real time — their socket drops from the channel the moment it happens.

---

### ⌨️ The Command System

The most powerful part of InfraChat. Any message starting with `/` is intercepted **before broadcast** and routed through a 6-stage server-side pipeline.

```
Raw message arrives
      ↓
  Starts with "/"? ──No──► Normal broadcast
      ↓ Yes
  Parse → Lookup → Permission → Context → Cooldown → Execute
      ↓ Fail at any stage
  command:error (back to caller only)
```

#### Built-in Commands

| Command | Min Role | What Happens |
|---------|----------|--------------|
| `/help [command]` | Member | Returns usage info |
| `/rooms` | Member | Lists all public rooms with member counts |
| `/kick @user [reason]` | Moderator | Removes user from room instantly |
| `/mute @user [minutes]` | Moderator | Greys out their input box for N minutes |
| `/unmute @user` | Moderator | Lifts an active mute |
| `/ban @user [reason]` | Moderator | Permanently blocks from re-joining |
| `/announce [message]` | Moderator | Pins a broadcast to the top of the room |
| `/promote @user` | SuperAdmin | Elevates role by one level |
| `/demote @user` | SuperAdmin | Reduces role by one level |
| `/audit [limit]` | SuperAdmin | Returns last N audit log entries |

> Commands are registered in a single registry file. Adding a new command requires **zero changes** to core message-handling logic.

---

### 👁️ Presence System

Real-time awareness of who's online, away, or offline — without polling.

- `online` → User connected
- `away` → Connected but inactive for 10 minutes
- `offline` → Disconnected

Presence is broadcast to all rooms a user belongs to, the moment it changes.

---

### 📋 Audit Log

Every privileged action leaves a trace. Append-only. Never modified. Only SuperAdmin can read it.

Logged actions: `kick`, `ban`, `mute`, `promote`, `demote`, `room_created`, `room_deleted`

Each entry records: who did it, who it happened to, which room, the reason, and an immutable server timestamp.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React Client                       │
│  AuthContext · RoomList · MessageFeed · CommandHints │
└──────────────┬──────────────────┬───────────────────┘
               │   REST (HTTP)    │   WebSocket
               │                 │   (Socket.io)
┌──────────────▼──────────────────▼───────────────────┐
│              Node.js + Express Server                │
│                                                      │
│  ┌─────────────┐   ┌──────────────────────────────┐ │
│  │ REST Routes │   │       Socket.io Engine        │ │
│  │  /auth      │   │  room:join  message:send      │ │
│  │  /rooms     │   │  typing:*   user:*            │ │
│  │  /admin     │   └──────────┬───────────────────┘ │
│  └─────────────┘              │                      │
│                    ┌──────────▼───────────────────┐  │
│                    │     Command Pipeline          │  │
│                    │  Parse→Lookup→Permission      │  │
│                    │  →Context→Cooldown→Execute    │  │
│                    └──────────┬───────────────────┘  │
│                               │                      │
│                    ┌──────────▼───────────────────┐  │
│                    │     Command Registry          │  │
│                    │  Map<name, CommandObject>     │  │
│                    └──────────────────────────────┘  │
└──────────────────────────────┬──────────────────────┘
                               │   Mongoose ODM
┌──────────────────────────────▼──────────────────────┐
│                    MongoDB Atlas                      │
│   users · rooms · messages · auditlogs               │
└─────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
infra-chat/
│
├── server/
│   ├── index.js                      # Entry point — Express + Socket.io init
│   ├── config/
│   │   └── db.js                     # MongoDB connection via Mongoose
│   ├── models/
│   │   ├── User.js                   # username, email, role, mutedUntil
│   │   ├── Room.js                   # name, type, members, bannedUsers
│   │   ├── Message.js                # text, senderId, roomId, type
│   │   └── AuditLog.js               # action, actorId, targetId, reason
│   ├── routes/
│   │   ├── auth.js                   # POST /register, POST /login, GET /me
│   │   ├── rooms.js                  # CRUD + invite endpoints
│   │   └── admin.js                  # User management + audit query
│   ├── middleware/
│   │   └── auth.js                   # JWT verification middleware
│   ├── socket/
│   │   ├── index.js                  # Socket event listeners
│   │   └── commandPipeline.js        # 6-stage command execution pipeline
│   └── commands/
│       ├── registry.js               # Command Map + register()
│       └── handlers/
│           ├── kick.js
│           ├── mute.js
│           ├── ban.js
│           ├── announce.js
│           ├── promote.js
│           ├── demote.js
│           ├── audit.js
│           ├── rooms.js
│           └── help.js
│
└── client/
    └── src/
        ├── App.jsx                   # Root — routing + auth guard
        ├── socket.js                 # Socket.io singleton
        ├── context/
        │   └── AuthContext.jsx       # Global auth state
        ├── pages/
        │   ├── Login.jsx
        │   └── Chat.jsx
        └── components/
            ├── RoomList.jsx          # Sidebar room list
            ├── MessageFeed.jsx       # Live scrollable messages
            ├── MessageInput.jsx      # Input — intercepts '/' commands
            ├── UserList.jsx          # Members + presence indicators
            └── CommandHints.jsx      # Autocomplete for '/' commands
```

---

## 🗄️ Data Models

<details>
<summary><strong>User</strong></summary>

```js
{
  username:        String,      // unique, 3–30 chars
  email:           String,      // unique, valid email
  passwordHash:    String,      // bcrypt, never returned in responses
  role:            'member' | 'moderator' | 'superadmin',
  roomMemberships: [ObjectId],  // rooms the user has joined
  mutedUntil:      Date | null, // null = not muted
  createdAt:       Date
}
```
</details>

<details>
<summary><strong>Room</strong></summary>

```js
{
  name:        String,           // unique slug, e.g. 'engineering-general'
  type:        'public' | 'private' | 'broadcast',
  description: String,
  moderatorId: ObjectId,         // assigned moderator
  members:     [ObjectId],       // current room members
  bannedUsers: [ObjectId],       // permanently banned users
  isArchived:  Boolean,          // true = read-only
  createdBy:   ObjectId,
  createdAt:   Date
}
```
</details>

<details>
<summary><strong>Message</strong></summary>

```js
{
  roomId:          ObjectId,
  senderId:        ObjectId | null,  // null for system messages
  text:            String,           // max 2000 chars
  type:            'user' | 'system',
  parentMessageId: ObjectId | null,  // for threaded replies
  createdAt:       Date              // server timestamp only
}
```
</details>

<details>
<summary><strong>AuditLog</strong></summary>

```js
{
  action:    String,           // 'kick' | 'ban' | 'mute' | 'promote' | ...
  actorId:   ObjectId,
  targetId:  ObjectId | null,
  roomId:    ObjectId | null,
  reason:    String,
  createdAt: Date              // immutable
}
```
</details>

---

## 🔌 Socket Event Reference

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `room:join` | `{ roomId }` | Join a room channel |
| `room:leave` | `{ roomId }` | Leave a room channel |
| `message:send` | `{ roomId, text }` | Send message or trigger command |
| `typing:start` | `{ roomId }` | Began typing |
| `typing:stop` | `{ roomId }` | Stopped typing |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | `{ message }` | Broadcast to entire room |
| `room:user_joined` | `{ username, roomId }` | Someone joined |
| `room:user_left` | `{ username, roomId, reason? }` | Someone left or was removed |
| `room:kicked` | `{ roomName, reason }` | Sent to kicked user only |
| `room:muted` | `{ duration, mutedUntil }` | Sent to muted user only |
| `room:announcement` | `{ text, pinnedBy }` | Pinned broadcast |
| `user:online` | `{ userId, username }` | User connected |
| `user:offline` | `{ userId, username }` | User disconnected |
| `user:role_changed` | `{ userId, newRole }` | Role was updated |
| `command:error` | `{ message }` | Pipeline failure — caller only |
| `typing:update` | `{ username, isTyping }` | Typing indicator |

---

## 🚀 Getting Started

### Prerequisites

- Node.js `v18+`
- MongoDB Atlas account (or local MongoDB `v6+`)
- npm or yarn

### 1. Clone the repository

```bash
git clone https://github.com/your-username/infra-chat.git
cd infra-chat
```

### 2. Install dependencies

```bash
# Backend
cd server && npm install

# Frontend
cd ../client && npm install
```

### 3. Configure environment variables

Create `server/.env`:

```env
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/infrachat
JWT_SECRET=your_super_secret_key_here
CLIENT_URL=http://localhost:5173
```

Create `client/.env`:

```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

### 4. Run the development servers

```bash
# Terminal 1 — Backend
cd server && npm run dev

# Terminal 2 — Frontend
cd client && npm run dev
```

Visit `http://localhost:5173`. The first user to register becomes **SuperAdmin** automatically.

---

## 🌐 Deployment

The frontend is deployed on **Vercel**. The backend can be deployed on **Railway**, **Render**, or any Node.js host.

### Vercel (Frontend)

```bash
cd client
vercel --prod
```

Set environment variables in the Vercel dashboard:
- `VITE_API_URL` → your backend URL
- `VITE_SOCKET_URL` → your backend URL

### Backend (Railway / Render)

Push the `server/` directory and set:
- `MONGODB_URI`
- `JWT_SECRET`
- `CLIENT_URL` → your Vercel frontend URL

> Make sure your backend CORS config allows requests from your Vercel domain.

---

## 🔒 Security

- Passwords hashed with **bcrypt** (12 salt rounds) — never stored in plain text
- JWTs signed with a secret from environment variables — **never hardcoded**
- **Every** socket event re-validates the caller's role server-side — not just at connection time
- Role comparisons use integer arithmetic — no string-based checks that can be spoofed
- MongoDB queries use Mongoose's parameterised API — no raw string concatenation
- Audit log is append-only — privileged actions leave a permanent trace

---

## 📈 Non-Functional Targets

| Metric | Target |
|--------|--------|
| Socket event latency | < 100ms |
| Concurrent WebSocket connections | 100+ (v1.0) |
| REST API p95 response time | < 300ms |
| Message history page size | 50 messages |
| Mute default duration | 10 minutes |
| JWT expiry | 7 days |

---

## 🗺️ Roadmap

- [ ] Direct messaging (DMs)
- [ ] File and image attachments
- [ ] Message reactions
- [ ] Thread replies UI
- [ ] Email / push notifications
- [ ] OAuth (Google, GitHub)
- [ ] JWT refresh tokens
- [ ] Redis adapter for horizontal scaling
- [ ] Dynamic runtime command registration
- [ ] Mobile app (React Native)

---

## 🧱 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Socket.io-client |
| Backend | Node.js, Express.js |
| Realtime | Socket.io |
| Database | MongoDB, Mongoose |
| Auth | JWT, bcrypt |
| Deployment | Vercel (frontend), Railway (backend) |

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with intention. Every action governed. Every message instant.**

[![Live Demo](https://img.shields.io/badge/Try%20it%20live-infra--chat--sudo1.vercel.app-1F3864?style=for-the-badge&logo=vercel&logoColor=white)](https://infra-chat-sudo1.vercel.app/)

</div>
