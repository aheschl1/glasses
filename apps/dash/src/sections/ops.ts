/** Sections about things needing attention, plus the host controls. */
import { api } from '../api'
import { fit } from '../layout'
import { CONTENT_INNER_WIDTH, field, lines, num, unwrap } from './format'
import type { Section } from './types'

/** Least to most severe; anything unrecognised sorts to the bottom. */
const LEVEL_ORDER = ['info', 'warning', 'critical']

export const opsSections: Section[] = [
  {
    label: 'Alerts',
    async render() {
      const alerts = unwrap(await api.GET('/api/alerts'))
      if (alerts.length === 0) return 'All clear'

      // Severity order, so a critical alert can never sit below an informational
      // one on the first screen.
      const rank = (level: string) => LEVEL_ORDER.indexOf(level.toLowerCase())
      const sorted = [...alerts].sort((a, b) => rank(b.level) - rank(a.level))

      return lines(sorted.flatMap((alert) => [`[${alert.level}] ${alert.category}`, alert.message, '']))
    },
  },
  {
    label: 'Updates',
    async render() {
      const data = unwrap(await api.GET('/api/updates'))
      if (!data.available) return 'Package data unavailable'

      const packages = data.packages ?? []

      return lines([
        // Reboot-required is the line that changes what you do next.
        field('reboot required', data.reboot?.required ? 'YES' : 'no'),
        field('upgradable', String(data.upgradable ?? 0)),
        field('security', String(data.security ?? 0)),
        field('checked', `${num(data.stale_days, 1)}d ago`),
        ...(packages.length > 0
          ? ['', ...packages.map((pkg) => `· ${fit(`${pkg.name} → ${pkg.candidate}`, 340)}`)]
          : []),
      ])
    },
  },
  {
    label: 'Certs',
    async render() {
      const data = unwrap(await api.GET('/api/certs'))
      if (!data.available) return 'Certificate data unavailable'

      const certs = [...(data.certs ?? [])].sort(
        (a, b) => (a.days_left ?? Infinity) - (b.days_left ?? Infinity),
      )
      if (certs.length === 0) return 'No certificates found'

      return lines(
        certs.flatMap((cert) => [
          fit(cert.name ?? '—', CONTENT_INNER_WIDTH),
          field('  expires in', cert.expired ? 'EXPIRED' : `${num(cert.days_left, 1)}d`),
        ]),
      )
    },
  },
  {
    label: 'Power',
    async render() {
      const data = unwrap(await api.GET('/api/stats'))

      return lines([field('uptime', data.uptime), '', 'Click to pick a command.'])
    },
    actions: [
      // Cancel sits first so the cursor starts on the harmless option, and so a
      // confirming command always has a visible way out — double click is the
      // only other escape and nothing on screen says so.
      { label: 'Cancel', async run() { return '' } },
      {
        label: 'Restart host',
        confirm: true,
        async run() {
          const data = unwrap(await api.POST('/api/host/reboot', {}))
          return `Host: ${data.status}`
        },
      },
    ],
  },
]
