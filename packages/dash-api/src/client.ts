/**
 * Typed client for the Dash backend, shared across Even Hub apps.
 *
 * Types in ./schema.d.ts are generated from the live OpenAPI spec — run
 * `npm run codegen` from the repo root. Do not edit that file by hand.
 *
 * Consumers on the glasses: every host reached through this client must also
 * appear in the `network` permission whitelist of that app's app.json, or the
 * Even Hub runtime blocks the request.
 */
import createClient, { type Middleware } from 'openapi-fetch'
import type { components, paths } from './schema'

export const DASH_API_BASE = 'https://dash.andrewheschl.ca'

const DEFAULT_TIMEOUT_MS = 8000

export type DashClientOptions = {
  /** Defaults to the production dashboard. */
  baseUrl?: string
  /** Aborts requests that outlive this many ms — the glasses link can stall. */
  timeoutMs?: number
  /**
   * Called before every request to attach a bearer token. The spec declares no
   * security scheme (/api/auth/me takes a raw `authorization` header), so auth
   * is applied by middleware rather than generated per operation.
   */
  getToken?: () => string | null
}

export type DashClient = ReturnType<typeof createDashClient>

export function createDashClient(options: DashClientOptions = {}) {
  const { baseUrl = DASH_API_BASE, timeoutMs = DEFAULT_TIMEOUT_MS, getToken } = options

  async function fetchWithTimeout(request: Request): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(request, { signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }

  const client = createClient<paths>({
    baseUrl,
    fetch: fetchWithTimeout,
    headers: { Accept: 'application/json' },
  })

  if (getToken) {
    const auth: Middleware = {
      onRequest({ request }) {
        const token = getToken()
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`)
        }
        return request
      },
    }
    client.use(auth)
  }

  return client
}

export type Credentials = components['schemas']['Body_login_api_auth_login_post']
export type LoginResult = components['schemas']['LoginResult']

/**
 * Exchanges credentials for a token. Storing it is the caller's job - pass a
 * `getToken` to `createDashClient` that reads wherever you put it.
 */
export async function login(client: DashClient, credentials: Credentials): Promise<LoginResult> {
  const { data, error } = await client.POST('/api/auth/login', { body: credentials })
  if (error) {
    throw new Error(`Login failed: ${JSON.stringify(error)}`)
  }
  return data
}
