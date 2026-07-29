/**
 * Menu ordering, kept free of any imports.
 *
 * The phone UI needs the section names and the ordering rule, nothing else.
 * Importing the catalogue would drag the renderers — and with them the API
 * client and the settings store — into the React tree, which is the edge the
 * old settings → sections → api → settings cycle formed along.
 */

/**
 * Canonical order, and the source of truth for which sections exist.
 *
 * Sorted for a glance: the question "is anything wrong?" first, then the
 * one-screen vitals, then detail. Destructive commands are last on purpose —
 * being several scrolls away is a feature.
 */
export const SECTION_LABELS = [
  'Alerts',
  'System',
  'Docker',
  'Temps',
  'GPU',
  'Net',
  'Disk',
  'Systemd',
  'VMs',
  'Updates',
  'Certs',
  'Procs',
  'Ports',
  'Sessions',
  'VPN',
  'SMART',
  'Power',
] as const

/**
 * Applies a saved order to labelled items.
 *
 * Unknown labels are dropped and anything missing is appended, so adding a
 * section in code cannot be stranded behind a stale saved order.
 */
export function applyOrder<T extends { label: string }>(
  items: T[],
  saved: readonly string[],
  hidden: readonly string[] = [],
): T[] {
  const byLabel = new Map(items.map((item) => [item.label, item]))
  const hiddenSet = new Set(hidden)

  const ordered = saved
    .map((label) => byLabel.get(label))
    .filter((item): item is T => item !== undefined)

  const seen = new Set(ordered.map((item) => item.label))
  const rest = items.filter((item) => !seen.has(item.label))

  return [...ordered, ...rest].filter((item) => !hiddenSet.has(item.label))
}
