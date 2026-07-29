/**
 * Dash's configured instance of the shared client.
 *
 * Read endpoints are public; the write endpoints (host reboot, container
 * actions) take an `authorization` header, so the token saved by the phone UI
 * is attached to every request.
 *
 * Reminder: dash.andrewheschl.ca must stay in the `network` permission
 * whitelist in app.json or the runtime blocks these requests.
 */
import { createDashClient, login as loginWith } from '@andrewheschl/dash-api'
import type { Credentials, LoginResult } from '@andrewheschl/dash-api'
import { getSettings, updateSettings } from './settings'

export const api = createDashClient({ getToken: () => getSettings().token })

/** Logs in and saves the token; the password itself is never persisted. */
export async function login(credentials: Credentials): Promise<LoginResult> {
  const result = await loginWith(api, credentials)
  updateSettings({
    token: result.token,
    username: result.username,
    tokenExpiresAt: result.expires_at,
  })
  return result
}

export function logout() {
  updateSettings({ token: null, username: null, tokenExpiresAt: null })
}
