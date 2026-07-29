/** Sections covering things the host is running: containers, VMs, units, users. */
import { api } from '../api'
import { fit, row } from '../layout'
import { RIGHT_EDGE, field, lines, num, unwrap } from './format'
import type { Section } from './types'

export const workloadSections: Section[] = [
  {
    label: 'Docker',
    async render() {
      const containers = unwrap(await api.GET('/api/containers'))

      const isProblem = (c: (typeof containers)[number]) =>
        c.status !== 'running' || c.health === 'unhealthy'
      const running = containers.filter((c) => c.status === 'running').length

      // Anything wrong sorts to the top, where it lands in the first rows the
      // preview shows; the rest is reachable by scrolling.
      const ordered = [...containers].sort(
        (a, b) => Number(isProblem(b)) - Number(isProblem(a)) || a.name.localeCompare(b.name),
      )

      return lines([
        `${running} / ${containers.length} running`,
        '',
        ...ordered.map((container) =>
          row([
            { text: isProblem(container) ? '!' : '·', x: 0 },
            { text: fit(container.name, 220), x: 16 },
            {
              text: container.health === 'none' ? container.status : container.health,
              x: RIGHT_EDGE,
              align: 'right',
            },
          ]),
        ),
      ])
    },
  },
  {
    label: 'VMs',
    async render() {
      const data = unwrap(await api.GET('/api/vms'))

      if (!data.available) return 'libvirt unavailable'
      const vms = data.vms ?? []
      if (vms.length === 0) return 'No VMs defined'

      return lines(
        vms.flatMap((vm) => [
          row([
            { text: fit(vm.name, 240), x: 0 },
            { text: vm.state, x: RIGHT_EDGE, align: 'right' },
          ]),
          row([
            { text: `${num(vm.vcpus)} vcpu`, x: 16 },
            { text: `${num(vm.cpu_pct, 1)}% cpu`, x: 160 },
            { text: `${num(vm.guest_used_pct)}% mem`, x: 300 },
          ]),
        ]),
      )
    },
  },
  {
    label: 'Systemd',
    async render() {
      const data = unwrap(await api.GET('/api/systemd'))
      if (!data.available) return 'systemd unavailable'

      const failed = data.failed ?? []
      const timers = data.timers ?? []

      return lines([
        field('state', data.state ?? '—'),
        field('failed units', String(data.failed_count ?? failed.length)),
        '',
        ...failed.map((unit) => `! ${fit(unit.unit, 340)}`),
        ...(failed.length > 0 ? [''] : []),
        'next timers',
        ...timers
          .slice(0, 8)
          .map((timer) => field(`  ${timer.unit ?? '—'}`, fit(timer.next ?? '—', 150))),
      ])
    },
  },
  {
    label: 'Sessions',
    async render() {
      const sessions = unwrap(await api.GET('/api/sessions'))
      if (sessions.length === 0) return 'No active sessions'

      return lines(
        sessions.flatMap((session) => [
          row([
            { text: session.user, x: 0 },
            { text: session.tty, x: 150 },
            { text: session.public ? 'public' : 'private', x: RIGHT_EDGE, align: 'right' },
          ]),
          `  ${session.host ?? '—'}  ${session.login_time ?? ''}`.trimEnd(),
        ]),
      )
    },
  },
]
