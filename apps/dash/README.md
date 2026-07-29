# Dash

Even Hub G2 app that pulls data from `https://dash.andrewheschl.ca` and renders it
on the glasses display (576x288, 4-bit greyscale).

One workspace of the [glasses](../../README.md) monorepo. The API client lives
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
[packages/dash-api](../../packages/dash-api). [src/api.ts](src/api.ts) is just this
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

**Reading works signed out**; the commands do not. `/api/host/reboot` takes an
`authorization` header, so the phone settings screen signs in once and stores the
returned token (never the password) in `localStorage`. [src/api.ts](src/api.ts)
passes a `getToken` to `createDashClient`, which attaches it as client middleware —
the spec declares no security scheme, so there is no generated per-operation auth.

There is no credential entry on the glasses, which is why sign-in lives on the phone.

## Glasses layout

Two panels on the 576x288 canvas, built in [src/glasses.ts](src/glasses.ts) from the
generic containers in [src/containers.ts](src/containers.ts).
[src/main.tsx](src/main.tsx) is the entry point: it mounts the phone settings screen
and starts the glasses runtime alongside it.

```text
0        168 176                      576
┌──────────┐ ┌─────────────────────────┐
│ > System │ │ SYSTEM                  │
│   Temps  │ │ CPU  ━━──────       12% │
│   ...    │ │ ...                     │
└──────────┘ └─────────────────────────┘
 menu          content
 ItemListPanel ScrollPanel
```

| focus | scroll | click | double click |
| --- | --- | --- | --- |
| menu | move cursor (wraps), preview that section immediately | focus content | — |
| content | pick a command, or scroll long text natively | run the command | focus menu |

Moving the cursor paints the section from cache (or `Loading...`) before the request
starts, so the pane never sits blank waiting on the network.

Refreshes pause while the content panel has focus: every update resets the firmware's
scroll position, so a live section would drag a reader back to the top mid-sentence.
The section reloads on the way back out.

### Why both panels are text containers

The firmware's list container looks like the obvious fit, but it **scrolls itself and
reports nothing until you tap it** — verified in the simulator: `up`/`down` over a list
produce no event at all. Previewing on hover is therefore impossible with it. Text
containers do receive scroll events, so the app draws the list and cursor itself:

| input | event | |
|---|---|---|
| `up` | `{containerID, eventType: 1}` textEvent | SCROLL_TOP |
| `down` | `{containerID, eventType: 2}` textEvent | SCROLL_BOTTOM |
| `click` | `{eventSource: 1}` sysEvent | CLICK (type 0, omitted) |
| `double_click` | `{eventType: 3}` sysEvent | DOUBLE_CLICK |

Drawing the list also buys vertical space: self-drawn rows are 27px against the
firmware list's fixed 40px, so ten sections fit at once instead of seven. The cost is
that the firmware sees no overflow and draws no scrollbar for the menu, so
`ItemListPanel` renders its own `^` / `v` markers at the right edge.

Two consequences worth knowing:

- **Focus costs a rebuild.** `isEventCapture` is fixed when a container is created, so
  moving focus calls `rebuildPageContainer`, not an upgrade. Both panels always draw a
  1px border and only change its colour with focus — a conditional border would change
  the inner width and reflow the text on every focus change.
- **Proto3 omits zero values.** `CLICK_EVENT` is 0 and so arrives as `undefined`; the
  same applied to `currentSelectItemIndex` for item 0 back when this used a list
  container. Treat an absent enum as 0, never as "no value".

### Why layout is measured in pixels

The firmware font is **proportional** — `CPU` is 35px, `Swap` is 47px — so `padEnd`
columns come out ragged. [src/layout.ts](src/layout.ts) positions columns by measuring
real glyph widths with `@evenrealities/pretext` and inserting spaces (5px each), which
lands each column within one space of its target. Two rules that matter:

- Pad by **flooring** the gap. Rounding up overshoots the 388px text area and silently
  costs a wrapped row.
- The content pane fits exactly 10 rows of 27px. Sections do not clip to it —
  `ScrollPanel` hands the container the full text so the firmware draws its scrollbar
  and scrolls it natively.

`pretext` embeds font tables, which is most of the ~63KB gzipped bundle. That ships in
the `.ehpk` and is served locally by the companion app, not over BLE.

## Current state

Seventeen sections (see [src/sections/order.ts](src/sections/order.ts) for the default
order), each backed by a public endpoint. Alerts leads because it is the one that
answers "does this need me right now?".

Refresh interval, menu order, and which sections appear at all are set from the phone
screen in [src/ui/](src/ui/) and persist in `localStorage`.

Bridge calls are serialized through a queue and capped with a 5s timeout, since
concurrent calls can drop the BLE connection and a flaky hop can otherwise hang for
~30s. Writes are skipped when the rendered text is unchanged.

### Commands

`Power` carries the only write action, `Restart host`. It requires two clicks, arms for
ten seconds and then cancels itself, and the cursor starts on `Cancel` — a stray click
must never reboot a machine. Sections whose content overflows cannot host commands: the
firmware swallows the scroll events the cursor needs once a container scrolls.

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
