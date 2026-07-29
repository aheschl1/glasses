/**
 * Shared formatting for section renderers.
 *
 * Columns are placed in pixels because the firmware font is proportional — see
 * ../layout for the measuring rules.
 */
import { bar, fit, row } from '../layout'

/** Text area of the content pane: width 400 less 7px inset per side. */
export const CONTENT_INNER_WIDTH = 386
/** Right-aligned columns stop short of the edge so nothing wraps. */
export const RIGHT_EDGE = 370

const BAR_SEGMENTS = 8
const BAR_X = 60
const GAUGE_END_X = 290

/** Several model fields are nullable, so numbers are formatted through here. */
export function num(value: number | null | undefined, digits = 0): string {
  return typeof value === 'number' ? value.toFixed(digits) : '—'
}

/** `CPU   ━━──────  12%` with the bar and percentage on fixed columns. */
export function gauge(label: string, pct: number): string {
  return row([
    { text: label, x: 0 },
    { text: bar(pct, BAR_SEGMENTS), x: BAR_X },
    { text: `${Math.round(pct)}%`, x: GAUGE_END_X, align: 'right' },
  ])
}

/** `label ............ value`, both on fixed columns. */
export function field(label: string, value: string, labelWidth = 260): string {
  return row([
    { text: fit(label, labelWidth), x: 0 },
    { text: value, x: RIGHT_EDGE, align: 'right' },
  ])
}

export function rate(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)}M`
  if (bps >= 1_000) return `${Math.round(bps / 1_000)}K`
  return `${Math.round(bps)}`
}

export function gib(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)}G`
}

export function lines(parts: string[]): string {
  return parts.join('\n')
}

/**
 * Unwraps an openapi-fetch result into data, or throws something a person can
 * read on a 386px-wide display.
 *
 * Rendering the raw error body was worse than useless: a proxy's HTML 502 page
 * became a multi-kilobyte quoted string in the content pane. The status code is
 * the one thing worth showing. Also guards the case openapi-fetch leaves both
 * `data` and `error` undefined (a non-2xx with an empty body), which otherwise
 * surfaces as "cannot read properties of undefined" from the renderer.
 */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.error !== undefined || result.data === undefined) {
    if (result.response.status === 401) throw new Error('Sign in required')
    throw new Error(`HTTP ${result.response.status} ${result.response.statusText}`.trimEnd())
  }
  return result.data
}
