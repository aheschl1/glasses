/**
 * Section definitions for the glasses dashboard.
 *
 * Each section is one entry in the left-hand list and one screen of text in the
 * right-hand pane. Columns are positioned in pixels (see ./layout) because the
 * firmware font is proportional.
 *
 * Response shapes come straight from the generated schema — no local types and
 * no casts. Run `npm run codegen` after the service changes.
 */
import { api } from './api'
import { bar, fit, row } from './layout'

/**
 * Width of the content pane's text area. Renderers size columns against this;
 * overflow is the pane's problem, not theirs — ScrollPanel scrolls it.
 */
export const CONTENT_INNER_WIDTH = 388

const BAR_SEGMENTS = 8
const BAR_X = 60
const GAUGE_END_X = 290
/** Right-aligned columns stop short of the pane edge so nothing wraps. */
const RIGHT_EDGE = 370

/**
 * Several model fields are nullable (`Vm.cpu_pct`, `Vm.vcpus`, ...), so numbers
 * are formatted through here rather than called on directly.
 */
function num(value: number | null | undefined, digits = 0): string {
  return typeof value === 'number' ? value.toFixed(digits) : '—'
}

/** `CPU   ━━──────  12%` with the bar and percentage on fixed columns. */
function gauge(label: string, pct: number): string {
  return row([
    { text: label, x: 0 },
    { text: bar(pct, BAR_SEGMENTS), x: BAR_X },
    { text: `${Math.round(pct)}%`, x: GAUGE_END_X, align: 'right' },
  ])
}

function rate(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)}M`
  if (bps >= 1_000) return `${Math.round(bps / 1_000)}K`
  return `${Math.round(bps)}`
}

function clip(lines: string[]): string {
  return lines.join('\n')
}

export type Section = {
  /** Label in the left list — keep short, the list pane is narrow. */
  label: string
  render: () => Promise<string>
}

export const sections: Section[] = [
  {
    label: 'System',
    async render() {
      const { data: s, error } = await api.GET('/api/stats')
      if (error) throw new Error(JSON.stringify(error))
      return clip([
        gauge('CPU', s.cpu_pct),
        gauge('RAM', s.ram_pct),
        gauge('Swap', s.swap_pct),
        gauge('Disk', s.disk_pct),
        '',
        `${s.ram_used_gb.toFixed(1)} / ${s.ram_total_gb.toFixed(1)} GB used`,
        `Up ${s.uptime}`,
      ])
    },
  },
  {
    label: 'Temps',
    async render() {
      const { data, error } = await api.GET('/api/temps')
      if (error) throw new Error(JSON.stringify(error))
      const entries = Object.entries(data)
      if (entries.length === 0) return 'No sensors reporting'

      return clip(
        entries.map(([sensor, celsius]) =>
          row([
            { text: fit(sensor.replace(/_/g, ' '), 260), x: 0 },
            { text: `${num(celsius, 1)}C`, x: RIGHT_EDGE, align: 'right' },
          ]),
        ),
      )
    },
  },
  {
    label: 'GPU',
    async render() {
      const { data: gpu, error } = await api.GET('/api/gpu')
      if (error) throw new Error(JSON.stringify(error))
      // The endpoint is typed `Gpu | null` — a host with no card is not an error.
      if (!gpu) return 'No GPU detected'
      const vramPct = (gpu.vram_used_mib / gpu.vram_total_mib) * 100

      return clip([
        fit(gpu.name.replace('NVIDIA ', ''), CONTENT_INNER_WIDTH),
        '',
        gauge('Util', gpu.util_pct),
        gauge('VRAM', vramPct),
        '',
        `${(gpu.vram_used_mib / 1024).toFixed(1)} / ${(gpu.vram_total_mib / 1024).toFixed(1)} GB`,
        `${gpu.temp_c}C`,
      ])
    },
  },
  {
    label: 'Disk',
    async render() {
      const { data: disks, error } = await api.GET('/api/disk')
      if (error) throw new Error(JSON.stringify(error))

      return clip(
        disks.map((disk) =>
          row([
            { text: fit(disk.mount, 100), x: 0 },
            { text: bar(disk.pct, 6), x: 110 },
            { text: `${disk.pct}%`, x: 290, align: 'right' },
            { text: `${Math.round(disk.size_gb)}G`, x: RIGHT_EDGE, align: 'right' },
          ]),
        ),
      )
    },
  },
  {
    label: 'Docker',
    async render() {
      const { data: containers, error } = await api.GET('/api/containers')
      if (error) throw new Error(JSON.stringify(error))

      const isProblem = (c: (typeof containers)[number]) =>
        c.status !== 'running' || c.health === 'unhealthy'
      const running = containers.filter((c) => c.status === 'running').length

      // Anything wrong sorts to the top, where it survives the hover preview's
      // first few rows; the rest is reachable by scrolling.
      const ordered = [...containers].sort(
        (a, b) => Number(isProblem(b)) - Number(isProblem(a)) || a.name.localeCompare(b.name),
      )

      return clip([
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
      const { data, error } = await api.GET('/api/vms')
      if (error) throw new Error(JSON.stringify(error))

      if (!data.available) return 'libvirt unavailable'
      const vms = data.vms ?? []
      if (vms.length === 0) return 'No VMs defined'

      const lines: string[] = []
      for (const vm of vms) {
        lines.push(
          row([
            { text: fit(vm.name, 240), x: 0 },
            { text: vm.state, x: RIGHT_EDGE, align: 'right' },
          ]),
        )
        lines.push(
          row([
            { text: `${num(vm.vcpus)} vcpu`, x: 16 },
            { text: `${num(vm.cpu_pct, 1)}% cpu`, x: 160 },
            { text: `${num(vm.guest_used_pct)}% mem`, x: 300 },
          ]),
        )
      }
      return clip(lines)
    },
  },
  {
    label: 'Net',
    async render() {
      const { data, error } = await api.GET('/api/network')
      if (error) throw new Error(JSON.stringify(error))
      const active = data
        .filter((iface) => iface.rx_bps + iface.tx_bps > 0)
        .sort((a, b) => b.rx_bps + b.tx_bps - (a.rx_bps + a.tx_bps))

      if (active.length === 0) return 'No traffic'

      return clip([
        row([
          { text: 'iface', x: 0 },
          { text: 'rx', x: 250, align: 'right' },
          { text: 'tx', x: RIGHT_EDGE, align: 'right' },
        ]),
        ...active.map((iface) =>
          row([
            { text: fit(iface.iface, 150), x: 0 },
            { text: rate(iface.rx_bps), x: 250, align: 'right' },
            { text: rate(iface.tx_bps), x: RIGHT_EDGE, align: 'right' },
          ]),
        ),
      ])
    },
  },
  {
    label: 'Alerts',
    async render() {
      const { data: alerts, error } = await api.GET('/api/alerts')
      if (error) throw new Error(JSON.stringify(error))

      if (alerts.length === 0) return 'All clear'

      const lines: string[] = []
      for (const alert of alerts) {
        lines.push(`[${alert.level}] ${alert.category}`)
        lines.push(alert.message)
        lines.push('')
      }
      return clip(lines)
    },
  },
]
