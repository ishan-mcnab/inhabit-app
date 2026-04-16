import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  CalendarDays,
  ChartNoAxesCombined,
  Target,
  User,
} from 'lucide-react'
import { useNotifications } from '../context/NotificationContext'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { PWAInstallPrompt } from './PWAInstallPrompt'

const TAB_MUTED = '#888780'

const tabs = [
  { to: '/today', label: 'Today', badge: 'today' as const, Icon: CalendarDays },
  { to: '/goals', label: 'Goals', badge: 'goals' as const, Icon: Target },
  {
    to: '/progress',
    label: 'Progress',
    badge: null,
    Icon: ChartNoAxesCombined,
  },
  { to: '/profile', label: 'Profile', badge: null, Icon: User },
] as const

export function Layout() {
  const location = useLocation()
  const {
    incompleteMissionsCount,
    reflectionDue,
    goalsNeedingAttention,
  } = useNotifications()
  const { isOnline } = useNetworkStatus()
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
    <div className="flex h-[100dvh] min-h-0 flex-col bg-app-bg">
      <PWAInstallPrompt />
      <div
        className={[
          'fixed left-0 right-0 z-[9999] border-l-4 py-2.5 pl-3 pr-4 text-[13px] font-medium text-white transition-opacity duration-300 ease-out',
          isOnline ? 'pointer-events-none opacity-0' : 'opacity-100',
        ].join(' ')}
        style={{
          top: 'env(safe-area-inset-top, 0px)',
          backgroundColor: '#141418',
          borderLeftColor: '#FF6B35',
        }}
        role="status"
        aria-live="polite"
        aria-hidden={isOnline}
      >
        You&apos;re offline — changes will sync when you reconnect
      </div>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain pb-[calc(4rem+env(safe-area-inset-bottom,0px))] [-webkit-overflow-scrolling:touch]">
        <div
          key={location.pathname}
          className="page-enter flex min-h-0 flex-1 flex-col"
        >
          <Outlet />
        </div>
      </main>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex min-h-16 items-stretch border-t border-zinc-800/60 bg-tab-bar pb-[env(safe-area-inset-bottom,0px)]"
        role="navigation"
        aria-label="Main tabs"
      >
        {tabs.map(({ to, label, badge, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className="flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center"
          >
            {({ isActive }) => (
              <div className="flex flex-col items-center pt-2 pb-1">
                <span className="relative inline-flex">
                  <Icon
                    size={22}
                    strokeWidth={2}
                    className="shrink-0"
                    style={{ color: isActive ? '#ffffff' : TAB_MUTED }}
                    aria-hidden
                  />
                  {badge === 'today' && todayTabBadge ? (
                    <span
                      className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500"
                      style={{
                        boxShadow:
                          '0 0 0 2px var(--color-tab-bar, #141418)',
                      }}
                      aria-hidden
                    />
                  ) : null}
                  {badge === 'goals' && goalsTabBadge ? (
                    <span
                      className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500"
                      style={{
                        boxShadow:
                          '0 0 0 2px var(--color-tab-bar, #141418)',
                      }}
                      aria-hidden
                    />
                  ) : null}
                </span>
                <span
                  className="mt-0.5 text-[11px] font-medium leading-tight"
                  style={{ color: isActive ? '#ffffff' : TAB_MUTED }}
                >
                  {label}
                </span>
                <div
                  className="mt-0.5 flex h-1 items-center justify-center"
                  aria-hidden
                >
                  {isActive ? (
                    <span className="h-1 w-1 rounded-full bg-[#534AB7]" />
                  ) : null}
                </div>
              </div>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
