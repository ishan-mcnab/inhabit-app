import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID')!
const FIREBASE_CLIENT_EMAIL = Deno.env.get('FIREBASE_CLIENT_EMAIL')!
const FIREBASE_PRIVATE_KEY = Deno.env.get('FIREBASE_PRIVATE_KEY')!
  .replace(/\\n/g, '\n')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const header = { alg: 'RS256', typ: 'JWT' }

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')

  const signingInput = `${encode(header)}.${encode(payload)}`

  const pemContents = FIREBASE_PRIVATE_KEY
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  )

  const jwt = `${signingInput}.${btoa(
    String.fromCharCode(...new Uint8Array(signature))
  ).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenRes.json()
  return tokenData.access_token
}

async function sendFCMNotification(
  token: string,
  title: string,
  body: string,
  type: string
) {
  const accessToken = await getAccessToken()

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: { type },
          android: {
            priority: 'high',
          },
        },
      }),
    }
  )
  return response.json()
}

serve(async (req) => {
  const { type } = await req.json()
  const now = new Date()

  const { data: tokens } = await supabase
    .from('device_tokens')
    .select('user_id, token')

  if (!tokens?.length) {
    return new Response(JSON.stringify({ sent: 0 }))
  }

  let sent = 0

  for (const { user_id, token } of tokens) {
    if (type === 'mission_reminder') {
      const today = new Date().toISOString().split('T')[0]
      const { count } = await supabase
        .from('daily_missions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user_id)
        .eq('completed', false)
        .eq('due_date', today)

      if (count && count > 0) {
        await sendFCMNotification(
          token,
          'Missions waiting 🎯',
          `You have ${count} mission${count > 1 ? 's' : ''} left today. Don't break the streak.`,
          'mission_reminder'
        )
        sent++
      }
    }

    if (type === 'streak_alert') {
      const { data: user } = await supabase
        .from('users')
        .select('current_streak, last_activity_date')
        .eq('id', user_id)
        .single()

      const today = new Date().toISOString().split('T')[0]
      if (user &&
          user.current_streak > 3 &&
          user.last_activity_date !== today) {
        await sendFCMNotification(
          token,
          `🔥 ${user.current_streak} day streak at risk`,
          'Complete at least one mission to keep it alive.',
          'streak_alert'
        )
        sent++
      }
    }

    if (type === 'reflection_ready') {
      const dayOfWeek = now.getUTCDay()
      if (dayOfWeek !== 0) continue

      const weekStart = new Date(now)
      weekStart.setUTCDate(now.getUTCDate() - now.getUTCDay())
      weekStart.setUTCHours(0, 0, 0, 0)

      const { data: reflection } = await supabase
        .from('reflections')
        .select('id')
        .eq('user_id', user_id)
        .gte('created_at', weekStart.toISOString())
        .maybeSingle()

      if (!reflection) {
        await sendFCMNotification(
          token,
          'Weekly reflection ready 📝',
          'Take 2 minutes to reflect on your week. Your coach is waiting.',
          'reflection_ready'
        )
        sent++
      }
    }
  }

  return new Response(JSON.stringify({ sent }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

