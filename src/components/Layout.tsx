import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/today', label: 'Today' },
  { to: '/goals', label: 'Goals' },
  { to: '/progress', label: 'Progress' },
  { to: '/profile', label: 'Profile' },
] as const

export function Layout() {
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
        {tabs.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'flex flex-1 flex-col items-center justify-center py-3 text-xs font-medium transition-colors',
                isActive ? 'text-white' : 'text-zinc-500',
              ].join(' ')
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
