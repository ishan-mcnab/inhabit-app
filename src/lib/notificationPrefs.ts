export type NotificationPrefs = {
  urgencyBanners: boolean
  streakWarnings: boolean
  newWeekBanner: boolean
}

const STORAGE_KEY = 'inhabit_notification_prefs'

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  urgencyBanners: true,
  streakWarnings: true,
  newWeekBanner: true,
}

const CHANGED = 'inhabit_notification_prefs'

let cachedPrefsSnapshot: NotificationPrefs = DEFAULT_NOTIFICATION_PREFS
let lastSerializedPrefs: string | null = null

function normalizeNotificationPrefs(raw: string | null): NotificationPrefs {
  if (!raw) return DEFAULT_NOTIFICATION_PREFS
  const o = JSON.parse(raw) as Partial<NotificationPrefs>
  return {
    urgencyBanners: o.urgencyBanners !== false,
    streakWarnings: o.streakWarnings !== false,
    newWeekBanner: o.newWeekBanner !== false,
  }
}

export function readNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const normalized = normalizeNotificationPrefs(raw)
    const serialized = JSON.stringify(normalized)
    if (serialized === lastSerializedPrefs) {
      return cachedPrefsSnapshot
    }
    lastSerializedPrefs = serialized
    cachedPrefsSnapshot =
      serialized === JSON.stringify(DEFAULT_NOTIFICATION_PREFS)
        ? DEFAULT_NOTIFICATION_PREFS
        : { ...normalized }
    return cachedPrefsSnapshot
  } catch {
    const serialized = JSON.stringify(DEFAULT_NOTIFICATION_PREFS)
    if (serialized === lastSerializedPrefs) {
      return cachedPrefsSnapshot
    }
    lastSerializedPrefs = serialized
    cachedPrefsSnapshot = DEFAULT_NOTIFICATION_PREFS
    return cachedPrefsSnapshot
  }
}

export function writeNotificationPrefs(p: NotificationPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  window.dispatchEvent(new Event(CHANGED))
}

export function patchNotificationPrefs(
  patch: Partial<NotificationPrefs>,
): NotificationPrefs {
  const next = { ...readNotificationPrefs(), ...patch }
  writeNotificationPrefs(next)
  return next
}

export function subscribeNotificationPrefs(cb: () => void): () => void {
  const onStorage = () => cb()
  const onCustom = () => cb()
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGED, onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGED, onCustom)
  }
}
