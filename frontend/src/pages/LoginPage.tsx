import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, Field, Input, Note } from '../components/ui'

const DEMO_PASSWORD = 'Demo@123'

interface DemoAccount {
  label: string
  email: string
  home: string
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { label: 'Passenger', email: 'passenger@railnexus.local', home: '/search' },
  { label: 'TTE (Conductor)', email: 'tte@railnexus.local', home: '/tte' },
  { label: 'Station Master', email: 'station@railnexus.local', home: '/tte' },
  { label: 'Zone Admin', email: 'zoneadmin@railnexus.local', home: '/reports' },
  { label: 'Super Admin', email: 'admin@railnexus.local', home: '/reports' }
]

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn(userEmail: string, userPassword: string, redirectTo: string) {
    setBusy(true)
    setError(null)
    try {
      await login(userEmail, userPassword)
      navigate(redirectTo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'sign in failed')
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void signIn(email, password, '/search')
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <Card title="Sign in">
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error ? <Note kind="error">{error}</Note> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <Note>
            Demo seed sets every account password to <code>Demo@123</code>.
          </Note>
        </form>
      </Card>

      <Card title="Quick Demo Sign-In">
        <div className="flex flex-col gap-3">
          <Note>
            One-click sign-in for the seeded demo roles (password <code>Demo@123</code>). You land straight in that
            role's dashboard.
          </Note>
          {DEMO_ACCOUNTS.map((account) => (
            <Button
              key={account.email}
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void signIn(account.email, DEMO_PASSWORD, account.home)}
            >
              {busy ? 'Signing in…' : account.label}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  )
}
