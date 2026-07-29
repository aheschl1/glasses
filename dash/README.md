# Dash

Even Hub G2 app that pulls data from `https://dash.andrewheschl.ca` and renders it
on the glasses display (576x288, 4-bit greyscale).

One workspace of the [even-realities](../README.md) monorepo. The API client lives
in `@andrewheschl/dash-api` so other G2 apps can share it.

## Development

Run these from this directory, or from the repo root with `-w dash`. `npm install`
always runs at the root.

```bash
npm run dev        # Vite dev server on http://localhost:5173 (bound to LAN)
npm run simulate   # G2 simulator pointed at the dev server
npm run build      # typecheck + production build to dist/
npm run pack       # build + package into dash.ehpk
npm run codegen -w @andrewheschl/dash-api   # refresh API types (from root)
```

To sideload onto real glasses, put your machine and the glasses on the same Wi-Fi
network and run `npx evenhub qr --url http://<your-ip>:5173`, then scan the QR
code from the Even Hub companion app.

## Network access

The G2 runtime blocks any host that is not whitelisted in `app.json`. This app
declares:

```json
{
  "name": "network",
  "desc": "Dash fetches dashboard data from dash.andrewheschl.ca to show it on your glasses.",
  "whitelist": ["https://dash.andrewheschl.ca"]
}
```

Requests go through plain `fetch` — there is no SDK network bridge, and
`openapi-fetch` is a thin typed wrapper over it. **Adding a new host means adding it
to the whitelist**, otherwise the request fails at runtime.

Note that `dash.andrewheschl.ca` must send CORS headers that permit the app origin;
the webview enforces CORS normally.

## API access

The client and the generated types live in
[packages/dash-api](../packages/dash-api). [src/api.ts](src/api.ts) is just this
app's configured instance — base URL, token storage — so call sites import from
there:

```ts
import { api } from './api'

const { data, error } = await api.GET('/api/vms/{name}/logs', {
  params: { path: { name: 'my-vm' } },
})
```

`data` is fully typed off the backend's Pydantic models: responses, request bodies,
path params, and query params. Unknown paths and wrong params fail `tsc`, and
nullable model fields (`Vm.cpu_pct`, a null `/api/gpu`) are enforced because this
workspace compiles with `strict`.

Codegen is deliberately **not** part of `npm run build` — builds would then fail
whenever the server is unreachable. The committed schema is the build input.

**No auth is wired up**, because every endpoint this app reads is public — only
`/api/auth/me` returns 401 unauthenticated. If that changes, pass a `getToken` to
`createDashClient` in [src/api.ts](src/api.ts) and use `login()` from the package.
Note the spec declares no security scheme (`/api/auth/me` takes a raw
`authorization` header), so auth goes on as client middleware rather than as
generated per-operation auth — and there is no credential entry on the glasses, so
a token has to be provisioned rather than typed.

## Glasses layout

Two panes on the 576x288 canvas, built in [src/main.ts](src/main.ts):

```text
0        168 176                      576
┌──────────┐ ┌─────────────────────────┐
│ System   │ │ SYSTEM                  │
│ Temps    │ │ CPU  ━━──────       12% │
│ ...      │ │ ...                     │
└──────────┘ └─────────────────────────┘
 list          content
 bordered      no border, updated in place
```

The left pane is a **list container**: the firmware scrolls and highlights it natively,
and it holds the page's single `isEventCapture: 1`. The right pane is a text container
refreshed with `textContainerUpgrade`, which is flicker-free — a `rebuildPageContainer`
would redraw the list too.

**Interaction:** scroll (swipe up/down) moves the highlight only. The list emits its
`listEvent` on **tap**, so a section loads when you tap it — verified in the simulator.
List items are a fixed 40px, so 7 of the 8 sections are visible at once and the rest
scroll into view.

### Why layout is measured in pixels

The firmware font is **proportional** — `CPU` is 35px, `Swap` is 47px — so `padEnd`
columns come out ragged. [src/layout.ts](src/layout.ts) positions columns by measuring
real glyph widths with `@evenrealities/pretext` and inserting spaces (5px each), which
lands each column within one space of its target. Two rules that matter:

- Pad by **flooring** the gap. Rounding up overshoots the 388px text area and silently
  costs a wrapped row.
- Budget rows by **wrapped** line count, not `\n` count. The content pane fits exactly
  10 lines of 27px; `clipToLines` measures each line and appends `+N more`.

`pretext` embeds font tables, which is most of the ~63KB gzipped bundle. That ships in
the `.ehpk` and is served locally by the companion app, not over BLE.

## Current state

Eight sections — System, Temps, GPU, Disk, Docker, VMs, Net, Alerts — each backed by a
public endpoint and refreshed every 5s. Bridge calls are serialized through a queue and
capped with a 5s timeout, since concurrent calls can drop the BLE connection and a flaky
hop can otherwise hang for ~30s.

## Simulator

```bash
npm run dev
node node_modules/@evenrealities/evenhub-simulator/bin/index.js \
  --automation-port 9898 http://localhost:5173
```

With `--automation-port`, the simulator exposes an HTTP API for scripted checks:

```bash
curl -X POST localhost:9898/api/input -d '{"action":"down"}'  # or up / click
curl localhost:9898/api/screenshot/glasses -o shot.png        # 576x288 RGBA
curl localhost:9898/api/console                               # webview logs
```

Note the simulator approximates font rendering and its list scrolling may differ from
firmware — verify layout on hardware before shipping.
