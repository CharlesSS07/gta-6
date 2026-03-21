// GTA 6 Backend API — Supabase Edge Function
// Handles: save/load, progression events, player profile
// Runtime: Deno (Supabase Edge Functions)
// Live at: https://fymccfdiwzoypmnojszx.supabase.co/functions/v1/api

import { Hono } from 'npm:hono@4'
import { createClient } from 'npm:@supabase/supabase-js@2'

// ── Config ──────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const MIN_SCHEMA_VERSION = 1
const MAX_SAVE_BYTES = 1_048_576 // 1MB

// Service-role client — bypasses RLS for server-side ops.
// Per-request auth is validated manually via the user JWT.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ── App ──────────────────────────────────────────────────────
const app = new Hono()

// Required headers on every response
app.use('*', async (c, next) => {
  // Set before next() so headers are in context when route handler creates response.
  // SharedArrayBuffer requirements (Phoenix physics worker, Lux streaming)
  c.header('Cross-Origin-Opener-Policy', 'same-origin')
  c.header('Cross-Origin-Embedder-Policy', 'require-corp')
  // Required for COEP-enabled pages to fetch cross-origin resources (BUG-007)
  c.header('Cross-Origin-Resource-Policy', 'cross-origin')
  // CORS for browser game client
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  await next()
})

// CORS preflight — use body(null) since HTTP 204 must have no body
app.options('*', (c) => c.body(null, 204))

// ── Auth ─────────────────────────────────────────────────────
async function requireAuth(c: any, pathPlayerId: string): Promise<{ playerId: string } | null> {
  const authHeader = c.req.header('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    c.status(401)
    return null
  }
  const token = authHeader.slice(7)

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    c.status(401)
    return null
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('auth_user_id', data.user.id)
    .single()

  if (playerError || !player || player.id !== pathPlayerId) {
    c.status(403)
    return null
  }

  return { playerId: player.id }
}

// ── GET /v1/saves/:player_id ─────────────────────────────────
app.get('/v1/saves/:player_id', async (c) => {
  const pathPlayerId = c.req.param('player_id')
  const auth = await requireAuth(c, pathPlayerId)
  if (!auth) return c.json({ error: 'unauthorized' })

  const { data, error } = await supabase
    .from('saves')
    .select('save_version, schema_version, save_data, saved_at')
    .eq('player_id', pathPlayerId)
    .is('deleted_at', null)
    .single()

  if (error || !data) return c.json({ error: 'no_save_found' }, 404)

  return c.json({
    ...data.save_data,
    player_id: pathPlayerId,
    save_version: data.save_version,
    schema_version: data.schema_version,
    saved_at: data.saved_at,
  })
})

// ── POST /v1/saves/:player_id ────────────────────────────────
app.post('/v1/saves/:player_id', async (c) => {
  const pathPlayerId = c.req.param('player_id')
  const auth = await requireAuth(c, pathPlayerId)
  if (!auth) return c.json({ error: 'unauthorized' })

  const contentLength = parseInt(c.req.header('content-length') ?? '0')
  if (contentLength > MAX_SAVE_BYTES) {
    return c.json({ error: 'payload_too_large', max_bytes: MAX_SAVE_BYTES }, 413)
  }

  const body = await c.req.json()
  const { schema_version, save_version, ...saveData } = body

  if (!schema_version || schema_version < MIN_SCHEMA_VERSION) {
    return c.json({ error: 'schema_version_unsupported', min_version: MIN_SCHEMA_VERSION }, 400)
  }

  const { data: existing } = await supabase
    .from('saves')
    .select('id, save_version')
    .eq('player_id', pathPlayerId)
    .is('deleted_at', null)
    .single()

  if (existing) {
    if (existing.save_version !== save_version) {
      return c.json({ error: 'version_conflict', server_version: existing.save_version }, 409)
    }
    const newVersion = existing.save_version + 1
    const savedAt = new Date().toISOString()
    const { error } = await supabase
      .from('saves')
      .update({ save_version: newVersion, schema_version, save_data: saveData, saved_at: savedAt })
      .eq('id', existing.id)
    if (error) return c.json({ error: 'internal_error' }, 500)
    return c.json({ save_version: newVersion, saved_at: savedAt })
  } else {
    if (save_version !== 0) {
      return c.json({ error: 'version_conflict', server_version: 0 }, 409)
    }
    const savedAt = new Date().toISOString()
    const { error } = await supabase
      .from('saves')
      .insert({ player_id: pathPlayerId, save_version: 1, schema_version, save_data: saveData, saved_at: savedAt })
    if (error) return c.json({ error: 'internal_error' }, 500)
    return c.json({ save_version: 1, saved_at: savedAt })
  }
})

// ── POST /v1/events/:player_id ───────────────────────────────
app.post('/v1/events/:player_id', async (c) => {
  const pathPlayerId = c.req.param('player_id')
  const auth = await requireAuth(c, pathPlayerId)
  if (!auth) return c.json({ error: 'unauthorized' })

  const body = await c.req.json()
  const { event_type, event_id, payload } = body

  if (!event_id || !event_type || !payload) {
    return c.json({ error: 'missing_required_fields' }, 400)
  }

  const { data: existing } = await supabase
    .from('progression_events')
    .select('id, applied, rejection_reason')
    .eq('id', event_id)
    .single()

  if (existing) {
    return existing.applied
      ? c.json({ accepted: true, applied_changes: {} })
      : c.json({ accepted: false, reason: existing.rejection_reason ?? 'duplicate_event' }, 422)
  }

  const { data: save } = await supabase
    .from('saves')
    .select('save_data')
    .eq('player_id', pathPlayerId)
    .is('deleted_at', null)
    .single()

  const progression = save?.save_data?.progression ?? { missions_complete: [], vehicles_unlocked: [], safe_houses: [] }
  const stats = save?.save_data?.stats ?? { money: 0 }

  let rejection: string | null = null
  let appliedChanges: Record<string, any> = {}

  switch (event_type) {
    case 'mission_complete': {
      const { mission_id, reward_money = 0, reward_unlock } = payload
      if (!mission_id) { rejection = 'missing_mission_id'; break }
      if (progression.missions_complete.includes(mission_id)) { rejection = 'mission_already_complete'; break }
      if (reward_money < 0 || reward_money > 1_000_000) { rejection = 'reward_out_of_bounds'; break }
      appliedChanges = {
        missions_complete: [...progression.missions_complete, mission_id],
        money_delta: reward_money,
        ...(reward_unlock ? { vehicles_unlocked: [...progression.vehicles_unlocked, reward_unlock] } : {}),
      }
      break
    }
    case 'vehicle_unlock': {
      const { vehicle_id } = payload
      if (!vehicle_id) { rejection = 'missing_vehicle_id'; break }
      if (progression.vehicles_unlocked.includes(vehicle_id)) { rejection = 'mission_already_complete'; break }
      appliedChanges = { vehicles_unlocked: [...progression.vehicles_unlocked, vehicle_id] }
      break
    }
    case 'purchase': {
      const { cost = 0, item_id } = payload
      if (!item_id) { rejection = 'missing_item_id'; break }
      if (cost < 0 || cost > 1_000_000) { rejection = 'reward_out_of_bounds'; break }
      if (stats.money < cost) { rejection = 'insufficient_funds'; break }
      appliedChanges = { money_delta: -cost }
      break
    }
    case 'safe_house_unlock': {
      const { safe_house_id } = payload
      if (!safe_house_id) { rejection = 'missing_safe_house_id'; break }
      if (progression.safe_houses.includes(safe_house_id)) { rejection = 'mission_already_complete'; break }
      appliedChanges = { safe_houses: [...progression.safe_houses, safe_house_id] }
      break
    }
    default:
      rejection = 'unknown_event_type'
  }

  const applied = rejection === null

  await supabase.from('progression_events').insert({
    id: event_id,
    player_id: pathPlayerId,
    event_type,
    payload,
    applied,
    rejection_reason: rejection,
  })

  if (!applied) return c.json({ accepted: false, reason: rejection }, 422)

  if (save) {
    const updatedProgression = {
      missions_complete: appliedChanges.missions_complete ?? progression.missions_complete,
      vehicles_unlocked: appliedChanges.vehicles_unlocked ?? progression.vehicles_unlocked,
      safe_houses: appliedChanges.safe_houses ?? progression.safe_houses,
    }
    const updatedStats = {
      ...save.save_data.stats,
      money: (save.save_data.stats?.money ?? 0) + (appliedChanges.money_delta ?? 0),
    }
    await supabase
      .from('saves')
      .update({ save_data: { ...save.save_data, progression: updatedProgression, stats: updatedStats } })
      .eq('player_id', pathPlayerId)
      .is('deleted_at', null)
  }

  return c.json({ accepted: true, applied_changes: appliedChanges })
})

// ── GET /v1/profile/:player_id ───────────────────────────────
app.get('/v1/profile/:player_id', async (c) => {
  const pathPlayerId = c.req.param('player_id')
  const auth = await requireAuth(c, pathPlayerId)
  if (!auth) return c.json({ error: 'unauthorized' })

  const { data, error } = await supabase
    .from('players')
    .select('id, display_name, created_at, last_seen')
    .eq('id', pathPlayerId)
    .single()

  if (error || !data) return c.json({ error: 'profile_not_found' }, 404)

  return c.json({
    player_id: data.id,
    display_name: data.display_name,
    created_at: data.created_at,
    last_seen: data.last_seen,
  })
})

// ── Handler ──────────────────────────────────────────────────
Deno.serve(app.fetch)