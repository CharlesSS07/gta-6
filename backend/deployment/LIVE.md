# Backend — Live Deployment

> **Status:** LIVE as of 2026-03-20  
> **Deployed by:** Cedar  

---

## Live Endpoints

**Base URL:** `https://fymccfdiwzoypmnojszx.supabase.co/functions/v1/api`

| Endpoint | Method | Description |
|---|---|---|
| `/v1/saves/{player_id}` | GET | Load player save |
| `/v1/saves/{player_id}` | POST | Write save (optimistic versioning) |
| `/v1/events/{player_id}` | POST | Server-validate progression event |
| `/v1/profile/{player_id}` | GET | Read player profile |

Full URLs:
```
GET  https://fymccfdiwzoypmnojszx.supabase.co/functions/v1/api/v1/saves/{player_id}
POST https://fymccfdiwzoypmnojszx.supabase.co/functions/v1/api/v1/saves/{player_id}
POST https://fymccfdiwzoypmnojszx.supabase.co/functions/v1/api/v1/events/{player_id}
GET  https://fymccfdiwzoypmnojszx.supabase.co/functions/v1/api/v1/profile/{player_id}
```

---

## Infrastructure

| Component | Service | Status |
|---|---|---|
| Database | Supabase PostgreSQL (us-east-2) | ACTIVE |
| API Runtime | Supabase Edge Function (Deno) | ACTIVE |
| Auth | Supabase Auth | ACTIVE |
| Schema version | 1 (`001_initial_schema`) | Applied |

---

## Authentication

All endpoints require a Supabase user JWT:
```
Authorization: Bearer <supabase_session_token>
```

**For Phoenix (game client integration):**

1. Initialize the Supabase client in the game:
```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://fymccfdiwzoypmnojszx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5bWNjZmRpd3pveXBtbm9qc3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzg4ODgsImV4cCI6MjA4OTYxNDg4OH0.xip3RPx3NfX1FIeXi9zmUq5379PPMqBt_qXundlnLhE'
  // ^ anon key — safe for client-side use
)
```

2. Sign in / register (triggers player profile creation):
```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'player@example.com',
  password: 'password'
})
// or: supabase.auth.signUp({ email, password })
```

3. Get player ID and token for API calls:
```typescript
const { data: { session } } = await supabase.auth.getSession()
const token = session?.access_token
const playerId = session?.user?.id  // This is auth user ID, need to resolve to players.id
```

4. **Important:** The API uses `players.id` (internal UUID), not the Supabase auth user ID. After first sign-in:
```typescript
// Resolve auth user ID → internal player ID
const { data: player } = await supabase
  .from('players')
  .select('id')
  .eq('auth_user_id', session.user.id)
  .single()

const playerId = player.id  // Use this in API calls
```

5. Save game state:
```typescript
const response = await fetch(
  `https://fymccfdiwzoypmnojszx.supabase.co/functions/v1/api/v1/saves/${playerId}`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      schema_version: 1,
      save_version: 0,  // 0 for new save, server's save_version for updates
      position: { x: 0, y: 0, z: 0, heading: 0 },
      // ... rest of save data per save contract
    })
  }
)
```

---

## Auth Webhook (Player Profile Auto-Creation)

Player profiles in `players` table are created automatically when a user signs up.

**Configure in Supabase Dashboard:**
1. Go to Authentication → Webhooks  
2. Add webhook for "Insert" on `auth.users`  
3. Point to: `https://fymccfdiwzoypmnojszx.supabase.co/functions/v1/api/webhooks/auth`

Until the webhook is configured, create player profiles manually after sign-up:
```typescript
const { data: { session } } = await supabase.auth.getSession()
await supabase.from('players').insert({
  auth_user_id: session.user.id,
  display_name: session.user.email?.split('@')[0] ?? 'Player'
})
```

---

## Required Response Headers

Every response includes:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Access-Control-Allow-Origin: *
```

COOP/COEP headers are required for SharedArrayBuffer (Phoenix physics worker, Lux streaming pipeline). Confirmed active.

---

## Local Dev

To run locally against the live Supabase DB:
```bash
docker compose -f backend/docker-compose.dev.yml up -d
cd backend/server && bun install && bun run dev
```

The `LOCAL_DEV=true` flag in `.env.local` enables mock auth (any Bearer token accepted, token value = player_id).
