/**
 * Dash's configured instance of the shared client.
 *
 * Every endpoint this app reads is public, so no token is wired up. If that
 * changes, pass `getToken` here and use `login()` from @andrewheschl/dash-api —
 * note there is no credential entry on the glasses, so the token would have to
 * be provisioned rather than typed.
 *
 * Reminder: dash.andrewheschl.ca must stay in the `network` permission
 * whitelist in app.json or the runtime blocks these requests.
 */
import { createDashClient } from '@andrewheschl/dash-api'

export const api = createDashClient()
