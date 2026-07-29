/** Sections covering traffic, listeners and the VPN. */
import { api } from '../api'
import { fit, row } from '../layout'
import { RIGHT_EDGE, lines, rate, unwrap } from './format'
import type { Section } from './types'

/** Listeners worth sending; hosts can have dozens and only the first fit. */
const PORT_ROWS = 14

export const networkSections: Section[] = [
  {
    label: 'Net',
    async render() {
      const data = unwrap(await api.GET('/api/network'))

      const active = data
        .filter((iface) => iface.rx_bps + iface.tx_bps > 0)
        .sort((a, b) => b.rx_bps + b.tx_bps - (a.rx_bps + a.tx_bps))
      if (active.length === 0) return 'No traffic'

      return lines([
        row([
          { text: 'iface', x: 0 },
          { text: 'rx b/s', x: 250, align: 'right' },
          { text: 'tx b/s', x: RIGHT_EDGE, align: 'right' },
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
    label: 'Ports',
    async render() {
      const ports = unwrap(await api.GET('/api/ports'))
      if (ports.length === 0) return 'Nothing listening'

      // Hosts bind the same port on 0.0.0.0 and ::, which would double the list
      // with rows that look identical. Lowest port first — the well-known ones
      // are the interesting ones.
      const unique = new Map(ports.map((entry) => [`${entry.port}/${entry.process}`, entry]))
      const sorted = [...unique.values()].sort((a, b) => a.port - b.port).slice(0, PORT_ROWS)

      return lines(
        sorted.map((entry) =>
          row([
            { text: String(entry.port), x: 0 },
            { text: fit(entry.process, 220), x: 60 },
            { text: fit(entry.address, 90), x: RIGHT_EDGE, align: 'right' },
          ]),
        ),
      )
    },
  },
  {
    label: 'VPN',
    async render() {
      const data = unwrap(await api.GET('/api/wireguard'))

      const peers = data.peers ?? []
      if (peers.length === 0) return 'No WireGuard peers'

      return lines([
        `iface ${data.interface_ip ?? '—'}`,
        '',
        ...peers.flatMap((peer) => [
          peer.allowed_ips ?? '—',
          `  ${fit(peer.last_handshake ?? 'no handshake', 340)}`,
        ]),
      ])
    },
  },
]
