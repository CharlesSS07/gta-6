/**
 * Supabase Auth Webhook Handler
 *
 * Called by Supabase when a new user signs up via Auth.
 * Creates the corresponding row in the `players` table.
 *
 * Configure in Supabase Dashboard:
 *   Authentication → Webhooks → New user → POST /api/v1/webhooks/auth
 *
 * The webhook payload is signed with SUPABASE_WEBHOOK_SECRET.
 * Verify the signature before processing.
 */

import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const WEBHOOK_SECRET = process.env.SUPABASE_WEBHOOK_SECRET ?? ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export const authWebhookRouter = new Hono()

authWebhookRouter.post('/api/v1/webhooks/auth', async (c) => {
  // Verify webhook signature
  const signature = c.req.header('x-supabase-signature') ?? ''
  const rawBody = await c.req.text()

  if (WEBHOOK_SECRET) {
    const expected = createHmac('sha256', WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex')
    if (signature !== expected) {
      return c.json({ error: 'invalid_signature' }, 401)
    }
  }

  const event = JSON.parse(rawBody)

  // Only handle new user creation events
  if (event.type !== 'INSERT' || event.table !== 'users') {
    return c.json({ ok: true })
  }

  const { id: authUserId, email, raw_user_meta_data } = event.record
  const displayName = raw_user_meta_data?.full_name
    ?? raw_user_meta_data?.name
    ?? email?.split('@')[0]
    ?? 'Player'

  const { error } = await supabase.from('players').insert({
    auth_user_id: authUserId,
    display_name: displayName,
  })

  if (error) {
    // If already exists (e.g. duplicate webhook), treat as success
    if (error.code === '23505') return c.json({ ok: true })
    console.error('Failed to create player profile:', error)
    return c.json({ error: 'internal_error' }, 500)
  }

  console.log(`✅ Created player profile for auth user ${authUserId}`)
  return c.json({ ok: true })
})
