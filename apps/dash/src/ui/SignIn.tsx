import { useState, type FormEvent } from 'react'
import { login, logout } from '../api'
import { tokenIsValid, type Settings } from '../settings'

/**
 * Read endpoints are public, so signing in is only needed for the commands on
 * the glasses (host restart). The password is used once and never stored — the
 * token the server returns is what gets saved.
 */
export function SignIn({ settings }: { settings: Settings }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signedIn = tokenIsValid(settings)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      await login({ username, password })
      setPassword('')
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (signedIn) {
    const expires = settings.tokenExpiresAt
      ? new Date(settings.tokenExpiresAt * 1000).toLocaleString()
      : 'no expiry'

    return (
      <div className="signed-in">
        <p>
          Signed in as <strong>{settings.username}</strong>
        </p>
        <p className="hint">Session expires {expires}</p>
        <button type="button" className="secondary" onClick={logout}>
          Sign out
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit}>
      {settings.token ? (
        <p className="warning">Your session expired. Sign in again to use commands.</p>
      ) : null}

      <label>
        Username
        <input
          name="username"
          autoComplete="username"
          value={username}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>

      <label>
        Password
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {error ? <p className="error">{error}</p> : null}

      <button type="submit" disabled={busy || username === '' || password === ''}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
