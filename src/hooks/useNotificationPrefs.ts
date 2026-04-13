import { useCallback, useSyncExternalStore } from 'react'
import {
  type NotificationPrefs,
  patchNotificationPrefs,
  readNotificationPrefs,
  subscribeNotificationPrefs,
} from '../lib/notificationPrefs'

export function useNotificationPrefs(): [
  NotificationPrefs,
  (patch: Partial<NotificationPrefs>) => void,
] {
  const prefs = useSyncExternalStore(
    subscribeNotificationPrefs,
    readNotificationPrefs,
    readNotificationPrefs,
  )
  const update = useCallback((patch: Partial<NotificationPrefs>) => {
    patchNotificationPrefs(patch)
  }, [])
  return [prefs, update]
}
