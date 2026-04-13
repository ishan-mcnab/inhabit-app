import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useNotifications } from '../context/NotificationContext'

const tabs = [
  { to: '/today', label: 'Today', badge: 'today' as const },
  { to: '/goals', label: 'Goals', badge: 'goals' as const },
  { to: '/progress', label: 'Progress', badge: null },
  { to: '/profile', label: 'Profile', badge: null },
] as const

export function Layout() {
  const {
    incompleteMissionsCount,
    reflectionDue,
    goalsNeedingAttention,
  } = useNotifications()
  const [localHour, setLocalHour] = useState(() => new Date().getHours())

  useEffect(() => {
    const tick = () => setLocalHour(new Date().getHours())
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [])

  const todayTabBadge =
    (localHour >= 18 && incompleteMissionsCount > 0) || reflectionDue
  const goalsTabBadge = goalsNeedingAttention > 0

  return (
    <div className="flex min-h-screen flex-col bg-app-bg">
      <main className="flex min-h-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]">
        <Outlet />
      </main>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-zinc-800/60 bg-tab-bar pb-[env(safe-area-inset-bottom,0px)]"
        role="navigation"
        aria-label="Main tabs"
      >
        {tabs.map(({ to, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'relative flex flex-1 flex-col items-center justify-center py-3 text-xs font-medium transition-colors',
                isActive ? 'text-white' : 'text-zinc-500',
              ].join(' ')
            }
          >
            <span className="relative inline-block px-1">
              {label}
              {badge === 'today' && todayTabBadge ? (
                <span
                  className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500"
                  style={{ boxShadow: '0 0 0 2px var(--color-tab-bar, #141418)' }}
                  aria-hidden
                />
              ) : null}
              {badge === 'goals' && goalsTabBadge ? (
                <span
                  className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500"
                  style={{ boxShadow: '0 0 0 2px var(--color-tab-bar, #141418)' }}
                  aria-hidden
                />
              ) : null}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
