import { type ReactNode } from 'react'
import { useAuth } from './auth/AuthContext'
import { AnnouncementsPage } from './pages/AnnouncementsPage'
import { StationPage } from './pages/StationPage'
import { AdminPage, ZonePage } from './pages/AdminPage'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { Note } from './components/ui'
import { LoginPage } from './pages/LoginPage'
import { SearchPage } from './pages/SearchPage'
import { BookingPage } from './pages/BookingPage'
import { PnrPage } from './pages/PnrPage'
import { TtePage } from './pages/TtePage'
import { AlertsPage } from './pages/AlertsPage'
import { ReportingPage } from './pages/ReportingPage'

function Staff({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { ready, hasRole } = useAuth()
  if (!ready) return <Note>Loading account…</Note>
  return hasRole(...roles) ? (
    <>{children}</>
  ) : (
    <Note kind="error">
      Sign in with an authorized staff account to open this page.
    </Note>
  )
}
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<SearchPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/book" element={<BookingPage />} />
            <Route path="/notices" element={<AnnouncementsPage />} />
            <Route
              path="/station"
              element={
                <Staff roles={['station_master']}>
                  <StationPage />
                </Staff>
              }
            />
            <Route
              path="/zone"
              element={
                <Staff roles={['zone_admin']}>
                  <ZonePage />
                </Staff>
              }
            />
            <Route
              path="/admin"
              element={
                <Staff roles={['super_admin']}>
                  <AdminPage />
                </Staff>
              }
            />
            <Route path="/pnr" element={<PnrPage />} />
            <Route
              path="/tte"
              element={
                <Staff roles={['tte', 'super_admin']}>
                  <TtePage />
                </Staff>
              }
            />
            <Route
              path="/alerts"
              element={
                <Staff
                  roles={['tte', 'station_master', 'zone_admin', 'super_admin']}
                >
                  <AlertsPage />
                </Staff>
              }
            />
            <Route
              path="/reports"
              element={
                <Staff roles={['zone_admin', 'super_admin']}>
                  <ReportingPage />
                </Staff>
              }
            />
            <Route
              path="*"
              element={<Note kind="error">Page not found.</Note>}
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
