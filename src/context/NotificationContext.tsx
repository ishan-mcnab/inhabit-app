import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type TodayNotificationSignals = {
  incompleteMissionsCount: number
  reflectionDue: boolean
}

type NotificationContextValue = {
  incompleteMissionsCount: number
  reflectionDue: boolean
  goalsNeedingAttention: number
  setFromToday: (partial: Partial<TodayNotificationSignals>) => void
  setGoalsNeedingAttention: (count: number) => void
  resetSignals: () => void
}

const defaultValue: NotificationContextValue = {
  incompleteMissionsCount: 0,
  reflectionDue: false,
  goalsNeedingAttention: 0,
  setFromToday: () => {},
  setGoalsNeedingAttention: () => {},
  resetSignals: () => {},
}

const NotificationContext = createContext<NotificationContextValue>(defaultValue)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [incompleteMissionsCount, setIncompleteMissionsCount] = useState(0)
  const [reflectionDue, setReflectionDue] = useState(false)
  const [goalsNeedingAttention, setGoalsNeedingAttentionState] = useState(0)

  const setFromToday = useCallback((partial: Partial<TodayNotificationSignals>) => {
    if (partial.incompleteMissionsCount !== undefined) {
      setIncompleteMissionsCount(
        Math.max(0, Math.floor(partial.incompleteMissionsCount)),
      )
    }
    if (partial.reflectionDue !== undefined) {
      setReflectionDue(partial.reflectionDue)
    }
  }, [])

  const setGoalsNeedingAttention = useCallback((count: number) => {
    setGoalsNeedingAttentionState(Math.max(0, Math.floor(count)))
  }, [])

  const resetSignals = useCallback(() => {
    setIncompleteMissionsCount(0)
    setReflectionDue(false)
    setGoalsNeedingAttentionState(0)
  }, [])

  const value = useMemo(
    () => ({
      incompleteMissionsCount,
      reflectionDue,
      goalsNeedingAttention,
      setFromToday,
      setGoalsNeedingAttention,
      resetSignals,
    }),
    [
      incompleteMissionsCount,
      reflectionDue,
      goalsNeedingAttention,
      setFromToday,
      setGoalsNeedingAttention,
      resetSignals,
    ],
  )

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}
