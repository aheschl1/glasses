import {
  waitForEvenAppBridge,
  TextContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk'
import { sections } from './sections'

/**
 * Two-pane layout on the 576x288 canvas:
 *
 *   0        168 176                      576
 *   ┌──────────┐ ┌─────────────────────────┐
 *   │ System   │ │ SYSTEM                  │
 *   │ Temps    │ │ CPU  ━━──────  12%      │
 *   │ ...      │ │ ...                     │
 *   └──────────┘ └─────────────────────────┘
 *   bordered list  content (no border)
 *
 * The list scrolls natively in firmware and captures all input; the content pane
 * is updated in place with textContainerUpgrade so refreshes do not flicker.
 */
const LIST_ID = 1
const LIST_NAME = 'sections'
const LIST_WIDTH = 168

const CONTENT_ID = 2
const CONTENT_NAME = 'content'
const CONTENT_X = 176

const CANVAS_WIDTH = 576
const CANVAS_HEIGHT = 288

/**
 * Text updates travel over BLE, so this is a compromise between "live" and
 * saturating the link. Lower it if you want a faster tick on hardware.
 */
const REFRESH_MS = 1_500
/** A single flaky BLE hop can hang for ~30s; fail fast instead. */
const BRIDGE_TIMEOUT_MS = 5_000

const bridge = await waitForEvenAppBridge()

const sectionList = new ListContainerProperty({
  xPosition: 0,
  yPosition: 0,
  width: LIST_WIDTH,
  height: CANVAS_HEIGHT,
  borderWidth: 1,
  borderColor: 10,
  borderRadius: 4,
  paddingLength: 6,
  containerID: LIST_ID,
  containerName: LIST_NAME,
  isEventCapture: 0,
  itemContainer: new ListItemContainerProperty({
    itemCount: sections.length,
    itemWidth: 0,
    isItemSelectBorderEn: 1,
    itemName: sections.map((section) => section.label),
  }),
})

const contentPane = new TextContainerProperty({
  xPosition: CONTENT_X,
  yPosition: 0,
  width: CANVAS_WIDTH - CONTENT_X,
  height: CANVAS_HEIGHT,
  borderWidth: 0,
  borderColor: 0,
  paddingLength: 6,
  containerID: CONTENT_ID,
  containerName: CONTENT_NAME,
  content: 'Loading...',
  isEventCapture: 1,
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

async function showContent(text: string) {
  await serialize(() =>
    withTimeout(
      bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: CONTENT_ID,
          containerName: CONTENT_NAME,
          contentOffset: 0,
          contentLength: 0,
          content: text,
        }),
      ),
      'textContainerUpgrade',
    ),
  )
}

let selectedIndex = 0
let refreshing = false
let refreshQueued = false

/**
 * Never runs two refreshes at once. A cycle costs a network round trip plus a
 * BLE write, which can exceed REFRESH_MS; overlapping them piles requests up
 * past the webview's per-host connection limit until they abort unsent.
 */
async function refresh(): Promise<void> {
  if (refreshing) {
    refreshQueued = true
    return
  }
  refreshing = true

  try {
    const index = selectedIndex
    const section = sections[index]

    let body: string
    try {
      body = await section.render()
    } catch (error) {
      body = `Unavailable\n\n${(error as Error).message}`
    }

    // Drop the result if the user moved on while the request was in flight.
    if (index === selectedIndex) {
      await showContent(`${section.label.toUpperCase()}\n\n${body}`)
    }
  } finally {
    refreshing = false
  }

  // A selection landed mid-flight — render it now rather than at the next tick.
  if (refreshQueued) {
    refreshQueued = false
    await refresh()
  }
}

const created = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 2,
    listObject: [sectionList],
    textObject: [contentPane],
  }),
)
console.log('Page created:', created === 0 ? 'success' : `failed (${created})`)

bridge.onEvenHubEvent((event) => {
  console.log('PROBE', JSON.stringify(event.jsonData ?? event))
  const listEvent = event.listEvent
  if (!listEvent || listEvent.containerID !== LIST_ID) return

  // Proto3 omits zero-valued fields, so selecting item 0 arrives with no
  // `currentSelectItemIndex` at all — absent means 0, not "no selection".
  // (Same trap applies to containerID; LIST_ID is deliberately non-zero.)
  const index = listEvent.currentSelectItemIndex ?? 0
  if (index === selectedIndex) return
  if (index < 0 || index >= sections.length) return

  selectedIndex = index
  void refresh()
})

// Self-scheduling rather than setInterval: this waits REFRESH_MS *between*
// refreshes, so a slow link stretches the cadence instead of queueing work.
async function tick() {
  await refresh()
  setTimeout(() => void tick(), REFRESH_MS)
}

void tick()
