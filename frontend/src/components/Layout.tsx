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
            <nav className="flex flex-wrap items-center gap-1">
              <NavLink to="/demonstrate" className={linkClass}>
                Live demo
              </NavLink>
              <NavLink to="/search" className={linkClass}>
                Search
              </NavLink>
              <NavLink to="/pnr" className={linkClass}>
                My bookings / PNR
              </NavLink>
              <NavLink to="/notices" className={linkClass}>
                Notices
              </NavLink>
              {hasRole('tte', 'station_master', 'zone_admin', 'super_admin') ? (
                <NavLink to="/alerts" className={linkClass}>
                  Staff alerts
                </NavLink>
              ) : null}
              {hasRole('station_master') ? (
                <NavLink to="/station" className={linkClass}>
                  Station desk
                </NavLink>
              ) : null}
              {hasRole('zone_admin') ? (
                <NavLink to="/zone" className={linkClass}>
                  Zone dashboard
                </NavLink>
              ) : null}
              {hasRole('super_admin') ? (
                <NavLink to="/admin" className={linkClass}>
                  System dashboard
                </NavLink>
              ) : null}
              {hasRole('tte', 'super_admin') ? (
                <NavLink to="/tte" className={linkClass}>
                  TTE
                </NavLink>
              ) : null}
              {hasRole('zone_admin', 'super_admin') ? (
                <NavLink to="/reports" className={linkClass}>
                  Reports
                </NavLink>
              ) : null}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="text-muted">
                  {user.fullName} · {user.roles.join(', ')}
                </span>
                <button
                  onClick={logout}
                  className="rounded px-3 py-1.5 font-medium text-danger hover:bg-danger/10"
                >
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
