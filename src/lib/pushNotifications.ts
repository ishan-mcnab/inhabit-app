import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { readNotificationPrefs } from './notificationPrefs'
import { supabase } from '../supabase'

const TOKEN_STORAGE_KEY = 'inhabit_push_device_token'

function readStoredPushUserId(): string | null {
  const raw = localStorage.getItem(TOKEN_STORAGE_KEY)
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as { userId?: string }
    return typeof o.userId === 'string' ? o.userId : null
  } catch {
    return null
  }
}

/**
 * Main entry: call after onboarding / when enabling push. Attaches listeners and registers with FCM/APNs.
 */
export async function initPushNotifications(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  if (!readNotificationPrefs().pushNotifications) return

  const result = await PushNotifications.requestPermissions()
  if (result.receive !== 'granted') return

  await PushNotifications.removeAllListeners()

  await PushNotifications.addListener('registration', async (token) => {
    const platformRaw = Capacitor.getPlatform()
    const platform =
      platformRaw === 'ios' || platformRaw === 'android' ? platformRaw : 'web'
    const { error } = await supabase.from('device_tokens').upsert(
      {
        user_id: userId,
        token: token.value,
        platform,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' },
    )
    if (error) {
      console.error('device_tokens upsert failed:', error)
    }
    localStorage.setItem(
      TOKEN_STORAGE_KEY,
      JSON.stringify({ userId, token: token.value }),
    )
  })

  await PushNotifications.addListener('registrationError', (error) => {
    console.error('Push registration error:', error)
  })

  await PushNotifications.addListener(
    'pushNotificationReceived',
    (notification) => {
      console.log('Push received in foreground:', notification)
    },
  )

  await PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action) => {
      const data = action.notification.data as Record<string, unknown> | undefined
      const type = data?.type
      if (type === 'mission_reminder') {
        window.location.href = '/today'
      } else if (type === 'streak_alert') {
        window.location.href = '/today'
      } else if (type === 'reflection_ready') {
        window.location.href = '/reflection'
      }
    },
  )

  await PushNotifications.register()
}

/**
 * Disables push for this user: unregisters the device, deletes Supabase rows for the user, clears listeners.
 */
export async function removePushToken(userId: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await PushNotifications.unregister()
    } catch (e) {
      console.warn('PushNotifications.unregister failed:', e)
    }
    await PushNotifications.removeAllListeners()
  }

  await supabase.from('device_tokens').delete().eq('user_id', userId)
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

export function isPushSupported(): boolean {
  return Capacitor.isNativePlatform()
}

/** Run on sign-out so the next account or login does not inherit listeners or tokens. */
export async function cleanupPushOnSignOut(): Promise<void> {
  const uid = readStoredPushUserId()
  if (uid) {
    await removePushToken(uid)
    return
  }
  if (Capacitor.isNativePlatform()) {
    try {
      await PushNotifications.unregister()
    } catch {
      /* ignore */
    }
    await PushNotifications.removeAllListeners()
  }
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}
