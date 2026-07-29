# glasses

Monorepo for Even Realities G2 smart glasses apps and the packages they share.
Managed with **npm workspaces** — no extra tooling, and workspace packages are
symlinked so edits are picked up without a publish or rebuild step.

## Layout

```text
glasses/
  package.json              root: workspace globs + cross-cutting scripts
  package-lock.json         the only lockfile — workspaces must not have their own
  apps/
    dash/                   G2 dashboard app
  packages/
    dash-api/               typed client + generated OpenAPI types
```

## Commands

Run from the repo root:

```bash
npm install                          # installs every workspace, hoisted
npm run dev                          # dev server for dash
npm run codegen                      # regenerate dash-api types from the live spec
npm run build                        # build every workspace that defines it
npm run typecheck                    # typecheck every workspace
```

Target one workspace with `--workspace` (`-w`):

```bash
npm run build -w dash
npm install some-dep -w dash         # add a dependency to one app
npm install -D some-tool -w @andrewheschl/dash-api
```

## Packages

### `@andrewheschl/dash-api`

Typed client for `dash.andrewheschl.ca`. Exports a `createDashClient` factory
rather than a shared singleton, so each app supplies its own base URL and token
storage:

```ts
import { createDashClient } from '@andrewheschl/dash-api'

const api = createDashClient({ getToken: () => myToken })
const { data, error } = await api.GET('/api/stats')
```

The package ships **TypeScript source**, not a build — `exports` points straight
at `src/index.ts`. Bundlers (Vite) and `tsc` both handle that, and it keeps the
edit loop instant. If you ever consume it from something that cannot compile TS
(plain Node, a published artifact), add a `tsc` build step and point `exports` at
the emitted `dist` instead.

## Adding a workspace

1. Create the directory. Both globs are already wired up: a shared library goes in
   `packages/<name>`, a glasses app in `apps/<name>`. No change to the root
   `workspaces` array is needed.
2. Give it a `package.json` with a unique `name` and `"private": true`.
3. Depend on a sibling with `"@andrewheschl/dash-api": "*"` — npm links the local
   copy instead of hitting the registry.
4. Run `npm install` from the root.

## Note

- **One lockfile.** Workspaces share the root `package-lock.json`; per-workspace
  lockfiles were removed and should not come back. `npm install` only runs at the
  root.
- **Hoisting.** Dependencies install to the root `node_modules`, so a workspace can
  import a package it never declared. Add real dependencies to that workspace's own
  `package.json` rather than relying on the hoist.
