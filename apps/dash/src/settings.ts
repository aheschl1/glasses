/**
 * User settings, shared between the phone UI and the glasses runtime.
 *
 * Persisted in localStorage, which survives an app restart. The password is
 * deliberately never stored — only the token the server hands back, so a lost
 * phone does not leak credentials that work anywhere else.
 */
export type Settings = {
  /** Gap between refreshes of the visible section, in milliseconds. */
  refreshMs: number
  /** Section labels, in menu order. */
  sectionOrder: string[]
  /** Section labels kept out of the menu entirely. */
  hiddenSections: string[]
  /** Who the stored token belongs to, for display. */
  username: string | null
  token: string | null
  /** Unix seconds; used to show whether the session is still good. */
  tokenExpiresAt: number | null
}

const STORAGE_KEY = 'dash.settings'

/**
 * Refresh bounds. The ceiling is deliberately low: past ten seconds the reading
 * on screen is stale enough to mislead, and the slider's useful range is the
 * second or two either side of the default.
 */
export const MIN_REFRESH_MS = 500
export const MAX_REFRESH_MS = 10_000

/**
 * An empty order means "whatever the code defines, in its own order" — see
 * `orderSections`. Naming the sections here instead would make this module
 * import the section catalogue, which imports the API client, which imports
 * this module.
 */
export const defaultSettings: Settings = {
  refreshMs: 1_500,
  sectionOrder: [],
  hiddenSections: [],
  username: null,
  token: null,
  tokenExpiresAt: null,
}

function read(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultSettings
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      ...defaultSettings,
      ...parsed,
      // A corrupt order must not strand the menu with no sections.
      sectionOrder: Array.isArray(parsed.sectionOrder) ? parsed.sectionOrder : [],
      hiddenSections: Array.isArray(parsed.hiddenSections) ? parsed.hiddenSections : [],
      // Clamped on read, not just in the slider: a stored 0 or null would make
      // the refresh timer fire continuously and swamp the BLE link.
      refreshMs: Number.isFinite(parsed.refreshMs)
        ? Math.min(MAX_REFRESH_MS, Math.max(MIN_REFRESH_MS, parsed.refreshMs as number))
        : defaultSettings.refreshMs,
    }
  } catch {
    return defaultSettings
  }
}

let current = read()

type Listener = (settings: Settings) => void
const listeners = new Set<Listener>()

export function getSettings(): Settings {
  return current
}

/** Merges a patch, persists it, and notifies the glasses runtime. */
export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // A full or disabled store is not worth breaking the app over.
  }
  for (const listener of listeners) listener(current)
}

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function tokenIsValid(settings: Settings): boolean {
  if (!settings.token) return false
  if (!settings.tokenExpiresAt) return true
  return settings.tokenExpiresAt * 1000 > Date.now()
}
