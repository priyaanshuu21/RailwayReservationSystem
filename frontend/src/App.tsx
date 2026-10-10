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
            <Route path="/pnr" element={<PnrPage />} />
            <Route path="/tte" element={<TtePage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/reports" element={<ReportingPage />} />
            <Route path="*" element={<Note kind="error">Page not found.</Note>} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
