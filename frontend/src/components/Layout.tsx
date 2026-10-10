import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:text-ink'}`

export function Layout() {
  const { user, logout, hasRole } = useAuth()

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <NavLink to="/" className="text-lg font-bold text-primary">
              RailNexus
            </NavLink>
            <nav className="flex items-center gap-1">
              <NavLink to="/search" className={linkClass}>
                Search
              </NavLink>
              <NavLink to="/pnr" className={linkClass}>
                PNR
              </NavLink>
              <NavLink to="/alerts" className={linkClass}>
                Alerts
              </NavLink>
              {hasRole('tte', 'station_master', 'zone_admin', 'super_admin') ? (
                <NavLink to="/tte" className={linkClass}>
                  TTE
                </NavLink>
              ) : null}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="text-muted">{user.fullName}</span>
                <button onClick={logout} className="rounded px-3 py-1.5 font-medium text-danger hover:bg-danger/10">
                  Sign out
                </button>
              </>
            ) : (
              <NavLink to="/login" className={linkClass}>
                Sign in
              </NavLink>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
