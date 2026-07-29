import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  OsEventTypeList,
  RebuildPageContainer,
} from '@evenrealities/even_hub_sdk'
import { ItemListPanel, Panel, ScrollPanel } from './containers'
import { sections, type Section } from './sections'

/**
 * Two panels on the 576x288 canvas:
 *
 *   0        168 176                      576
 *   ┌──────────┐ ┌─────────────────────────┐
 *   │ > System │ │ SYSTEM                  │
 *   │   Temps  │ │ CPU  ━━──────       12% │
 *   │   ...    │ │ ...                     │
 *   └──────────┘ └─────────────────────────┘
 *    menu          content
 *
 * Interaction:
 *   menu focused     scroll moves the cursor and previews that section at once
 *                    click hands focus to the content panel
 *   content focused  scroll scrolls the section
 *                    double click returns focus to the menu
 *
 * Both panels are text containers. The firmware's list container scrolls itself
 * without telling the app, which makes previewing on hover impossible — see
 * ./containers.
 */
const CANVAS_WIDTH = 576
const CANVAS_HEIGHT = 288
const MENU_WIDTH = 168
const CONTENT_X = 176

/** Gap between refreshes of the visible section. */
const REFRESH_MS = 1_500
/** A single flaky BLE hop can hang for ~30s; fail fast instead. */
const BRIDGE_TIMEOUT_MS = 5_000

const bridge = await waitForEvenAppBridge()

const menu = new ItemListPanel<Section>({
  id: 1,
  name: 'menu',
  x: 0,
  y: 0,
  width: MENU_WIDTH,
  height: CANVAS_HEIGHT,
  items: sections,
  label: (section) => section.label,
})

const content = new ScrollPanel({
  id: 2,
  name: 'content',
  x: CONTENT_X,
  y: 0,
  width: CANVAS_WIDTH - CONTENT_X,
  height: CANVAS_HEIGHT,
})

/** Concurrent bridge calls can drop the connection — run them one at a time. */
let queue: Promise<unknown> = Promise.resolve()

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), BRIDGE_TIMEOUT_MS),
    ),
  ])
}

/**
 * Sends a panel's text, but only when it actually changed. Every update resets
 * the container's native scroll position, so a no-op refresh would drag the
 * reader back to the top of a scrolled section.
 */
async function push(panel: Panel) {
  const content = panel.content
  if (panel.isSent(content)) return

  await serialize(async () => {
    await withTimeout(
      bridge.textContainerUpgrade(panel.upgradeFor(content)),
      `upgrade ${panel.name}`,
    )
    panel.markSent(content)
  })
}

type Focus = 'menu' | 'content'
let focus: Focus = 'menu'

/**
 * Which container captures input is fixed at container creation, so moving
 * focus costs a page rebuild rather than an upgrade.
 */
async function setFocus(next: Focus) {
  if (focus === next) return
  focus = next

  await serialize(() =>
    withTimeout(
      bridge.rebuildPageContainer(
        new RebuildPageContainer({
          containerTotalNum: 2,
          textObject: [menu.property(focus === 'menu'), content.property(focus === 'content')],
        }),
      ),
      'rebuildPageContainer',
    ),
  )
}

/**
 * Last known body per section, so moving the cursor paints a section instantly
 * and lets the network catch up.
 */
const cache = new Map<string, string>()
const loading = new Set<string>()

function paint(section: Section) {
  const body = cache.get(section.label) ?? 'Loading...'
  content.setContent(`${section.label.toUpperCase()}\n\n${body}`)
}

/** Fetches a section, repainting only if it is still the one on screen. */
async function load(section: Section): Promise<void> {
  if (loading.has(section.label)) return
  loading.add(section.label)

  try {
    const body = await section.render()
    cache.set(section.label, body)
  } catch (error) {
    cache.set(section.label, `Unavailable\n\n${(error as Error).message}`)
  } finally {
    loading.delete(section.label)
  }

  if (menu.selected !== section) return

  paint(section)
  await push(content)
}

/** Cursor moved: show whatever is cached immediately, then refresh it. */
async function selectCurrent() {
  const section = menu.selected
  paint(section)

  await push(menu)
  await push(content)
  await load(section)
}

function onScroll(delta: number) {
  // Only the menu scrolls here. While the content panel has focus the firmware
  // scrolls it natively and does not forward the event.
  if (focus !== 'menu') return
  if (menu.moveBy(delta)) void selectCurrent()
}

const created = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 2,
    textObject: [menu.property(true), content.property(false)],
  }),
)
console.log('Page created:', created === 0 ? 'success' : `failed (${created})`)

bridge.onEvenHubEvent((event) => {
  // Proto3 omits zero-valued fields, so CLICK_EVENT (0) arrives as undefined.
  const type =
    event.sysEvent?.eventType ?? event.textEvent?.eventType ?? OsEventTypeList.CLICK_EVENT

  switch (type) {
    case OsEventTypeList.SCROLL_TOP_EVENT:
      onScroll(-1)
      break
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      onScroll(1)
      break
    case OsEventTypeList.CLICK_EVENT:
      void setFocus('content')
      break
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      void setFocus('menu')
      break
    default:
      break
  }
})

/**
 * Keeps the visible section current. Self-scheduling rather than setInterval so
 * a slow link stretches the cadence instead of queueing overlapping work.
 */
async function tick() {
  await load(menu.selected)
  setTimeout(() => void tick(), REFRESH_MS)
}

await selectCurrent()
void tick()
