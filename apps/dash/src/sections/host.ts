/** Sections describing the machine itself: load, heat, storage. */
import { api } from '../api'
import { bar, fit, row } from '../layout'
import { CONTENT_INNER_WIDTH, RIGHT_EDGE, field, gauge, lines, num, unwrap } from './format'
import type { Section } from './types'

/** Rows of process list worth sending; the rest cannot be reached by scrolling. */
const PROCESS_ROWS = 12

export const hostSections: Section[] = [
  {
    label: 'System',
    async render() {
      const s = unwrap(await api.GET('/api/stats'))

      return lines([
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
      const data = unwrap(await api.GET('/api/temps'))

      // Hottest first: on a glance display the top line should be the one that
      // might be a problem.
      const entries = Object.entries(data).sort(([, a], [, b]) => b - a)
      if (entries.length === 0) return 'No sensors reporting'

      return lines(
        entries.map(([sensor, celsius]) =>
          field(sensor.replace(/_/g, ' '), `${num(celsius, 1)}°C`),
        ),
      )
    },
  },
  {
    label: 'GPU',
    async render() {
      const gpu = unwrap(await api.GET('/api/gpu'))
      // Typed `Gpu | null` — a host with no card is not an error.
      if (!gpu) return 'No GPU detected'

      // A driver reporting a zero total would render "NaN%" and an empty bar.
      const vramPct =
        gpu.vram_total_mib > 0 ? (gpu.vram_used_mib / gpu.vram_total_mib) * 100 : 0

      return lines([
        fit(gpu.name.replace('NVIDIA ', ''), CONTENT_INNER_WIDTH),
        '',
        gauge('Util', gpu.util_pct),
        gauge('VRAM', vramPct),
        '',
        field('vram', `${(gpu.vram_used_mib / 1024).toFixed(1)} / ${(gpu.vram_total_mib / 1024).toFixed(1)} GB`),
        field('temp', `${gpu.temp_c}°C`),
      ])
    },
  },
  {
    label: 'Disk',
    async render() {
      const disks = unwrap(await api.GET('/api/disk'))

      return lines(
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
    label: 'Procs',
    async render() {
      const procs = unwrap(await api.GET('/api/processes'))
      if (procs.length === 0) return 'No processes reported'

      // The endpoint returns every process. Anything past the first dozen is
      // unreachable in practice, so show the busiest and stop.
      const busiest = [...procs].sort((a, b) => b.cpu_pct - a.cpu_pct).slice(0, PROCESS_ROWS)

      return lines([
        row([
          { text: 'process', x: 0 },
          { text: 'cpu', x: 300, align: 'right' },
          { text: 'mem', x: RIGHT_EDGE, align: 'right' },
        ]),
        ...busiest.map((proc) =>
          row([
            { text: fit(proc.name, 230), x: 0 },
            { text: `${num(proc.cpu_pct, 1)}%`, x: 300, align: 'right' },
            { text: `${num(proc.mem_pct, 1)}%`, x: RIGHT_EDGE, align: 'right' },
          ]),
        ),
      ])
    },
  },
  {
    label: 'SMART',
    async render() {
      const drives = unwrap(await api.GET('/api/smart'))
      if (drives.length === 0) return 'No SMART data'

      return lines(
        drives.flatMap((drive) => [
          drive.type ? `${drive.device} (${drive.type})` : drive.device,
          ...Object.entries(drive.attrs ?? {}).map(([attr, value]) =>
            field(`  ${attr.replace(/_/g, ' ')}`, typeof value === 'number' ? num(value, 0) : '—'),
          ),
          '',
        ]),
      )
    },
  },
]
