import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  CalendarDays,
  ChartNoAxesCombined,
  Sun,
  Target,
  User,
} from 'lucide-react'
import { Goals } from '../pages/Goals'
import { Lifestyle } from '../pages/Lifestyle'
import { Profile } from '../pages/Profile'
import { Progress } from '../pages/Progress'
import { Today } from '../pages/Today'
import { useNotifications } from '../context/NotificationContext'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { useTutorial } from '../hooks/useTutorial'
import { PageErrorBoundary } from './PageErrorBoundary'
import { PWAInstallPrompt } from './PWAInstallPrompt'
import { TutorialOverlay } from './tutorial/TutorialOverlay'

const TAB_MUTED = '#888780'

const MAIN_TAB_PATHS = [
  '/today',
  '/goals',
  '/lifestyle',
  '/progress',
  '/profile',
] as const

function isMainTabPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    (MAIN_TAB_PATHS as readonly string[]).includes(pathname)
  )
}

function isTabRoute(pathname: string): boolean {
  return (
    pathname === '/' ||
    (MAIN_TAB_PATHS as readonly string[]).includes(pathname)
  )
}

const tabs = [
  { to: '/today', label: 'Today', badge: 'today' as const, Icon: CalendarDays },
  { to: '/goals', label: 'Goals', badge: 'goals' as const, Icon: Target },
  { to: '/lifestyle', label: 'Lifestyle', badge: null, Icon: Sun },
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
  const pathname = location.pathname
  const isMainTab = isMainTabPath(pathname)
  const tabRoute = isTabRoute(pathname)
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

  const { steps, showTutorial, currentStep, nextStep, skipTutorial } =
    useTutorial()

  const showToday = pathname === '/today' || pathname === '/'
  const showGoals = pathname === '/goals'
  const showLifestyle = pathname === '/lifestyle'
  const showProgress = pathname === '/progress'
  const showProfile = pathname === '/profile'

  return (
    <div className="relative flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-app-bg">
      <PWAInstallPrompt />
      {showTutorial ? (
        <TutorialOverlay
          steps={steps}
          currentStep={currentStep}
          onNext={nextStep}
          onSkip={skipTutorial}
        />
      ) : null}
      <div
        className="pointer-events-none"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80%',
            height: '40%',
            background:
              'radial-gradient(ellipse at 50% 0%, rgba(245,166,35,0.05) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '40%',
            height: '30%',
            background:
              'radial-gradient(ellipse at 100% 0%, rgba(255,255,255,0.025) 0%, transparent 60%)',
            pointerEvents: 'none',
          }}
        />
      </div>
      <div
        className={[
          'fixed left-0 right-0 z-[9999] border-l-4 py-2.5 pl-3 pr-4 text-[13px] font-medium text-white transition-opacity duration-300 ease-out',
          isOnline ? 'pointer-events-none opacity-0' : 'opacity-100',
        ].join(' ')}
        style={{
          top: 'env(safe-area-inset-top, 0px)',
          backgroundColor: '#111827',
          borderLeftColor: '#FF6B35',
        }}
        role="status"
        aria-live="polite"
        aria-hidden={isOnline}
      >
        You&apos;re offline — changes will sync when you reconnect
      </div>
      <main
        className="relative z-10 flex min-h-0 max-w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch]"
        style={{
          paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div
          className={[
            'flex min-h-0 min-w-0 max-w-full flex-1 flex-col',
            !tabRoute ? 'page-enter' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div
            className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col"
            style={{ display: isMainTab ? 'flex' : 'none' }}
            aria-hidden={!isMainTab}
          >
            <div
              className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col"
              style={{ display: showToday ? 'flex' : 'none' }}
            >
              <PageErrorBoundary>
                <Today />
              </PageErrorBoundary>
            </div>
            <div
              className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col"
              style={{ display: showGoals ? 'flex' : 'none' }}
            >
              <PageErrorBoundary>
                <Goals />
              </PageErrorBoundary>
            </div>
            <div
              className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col"
              style={{ display: showLifestyle ? 'flex' : 'none' }}
            >
              <PageErrorBoundary>
                <Lifestyle />
              </PageErrorBoundary>
            </div>
            <div
              className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col"
              style={{ display: showProgress ? 'flex' : 'none' }}
            >
              <PageErrorBoundary>
                <Progress />
              </PageErrorBoundary>
            </div>
            <div
              className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col"
              style={{ display: showProfile ? 'flex' : 'none' }}
            >
              <PageErrorBoundary>
                <Profile />
              </PageErrorBoundary>
            </div>
          </div>
          <div
            className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col"
            style={{ display: isMainTab ? 'none' : 'flex' }}
          >
            <Outlet />
          </div>
        </div>
      </main>
      <nav
        className="flex min-h-16 w-full items-stretch pb-[env(safe-area-inset-bottom,0px)]"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          width: '100%',
          zIndex: 50,
          borderTop: '1px solid #1C2840',
          background: 'rgba(10,15,30,0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
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
                    style={{ color: isActive ? '#F5A623' : TAB_MUTED }}
                    aria-hidden
                  />
                  {badge === 'today' && todayTabBadge ? (
                    <span
                      className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500"
                      style={{
                        boxShadow:
                          '0 0 0 2px var(--color-tab-bar, #0A0F1E)',
                      }}
                      aria-hidden
                    />
                  ) : null}
                  {badge === 'goals' && goalsTabBadge ? (
                    <span
                      className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500"
                      style={{
                        boxShadow:
                          '0 0 0 2px var(--color-tab-bar, #0A0F1E)',
                      }}
                      aria-hidden
                    />
                  ) : null}
                </span>
                <span
                  className="mt-0.5 text-[11px] font-medium leading-tight"
                  style={{ color: isActive ? '#F5A623' : TAB_MUTED }}
                >
                  {label}
                </span>
                <div
                  className="mt-0.5 flex h-1 items-center justify-center"
                  aria-hidden
                >
                  {isActive ? (
                    <span className="h-1 w-1 rounded-full bg-[#F5A623]" />
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
