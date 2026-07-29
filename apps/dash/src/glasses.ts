import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  OsEventTypeList,
  RebuildPageContainer,
} from '@evenrealities/even_hub_sdk'
import { ItemListPanel, Panel, ScrollPanel } from './containers'
import { row } from './layout'
import { orderSections, type Section } from './sections'
import { getSettings, subscribeSettings } from './settings'

/**
 * The glasses runtime.
 *
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
 *   content focused  scroll picks a command on sections that have them, and is
 *                    otherwise handled natively by the firmware to scroll long
 *                    text; double click returns focus to the menu
 *
 * Both panels are text containers. The firmware's list container scrolls itself
 * without telling the app, which makes previewing on hover impossible — see
 * ./containers.
 */
const CANVAS_WIDTH = 576
const CANVAS_HEIGHT = 288
const MENU_WIDTH = 168
const CONTENT_X = 176

/** A single flaky BLE hop can hang for ~30s; fail fast instead. */
const BRIDGE_TIMEOUT_MS = 5_000
/** How long a confirming command stays armed before it cancels itself. */
const ARM_TIMEOUT_MS = 10_000

export async function startGlasses() {
  const bridge = await waitForEvenAppBridge()

  const menu = new ItemListPanel<Section>({
    id: 1,
    name: 'menu',
    x: 0,
    y: 0,
    width: MENU_WIDTH,
    height: CANVAS_HEIGHT,
    items: orderSections(getSettings().sectionOrder, getSettings().hiddenSections),
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
    let timer: ReturnType<typeof setTimeout>
    const expiry = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), BRIDGE_TIMEOUT_MS)
    })

    // Clearing matters: at a 0.5s refresh, uncleared 5s timers would mean the
    // app never has an idle moment.
    return Promise.race([promise, expiry]).finally(() => clearTimeout(timer))
  }

  /**
   * Sends a panel's text, but only when it actually changed. Every update
   * resets the container's native scroll position, so a no-op refresh would
   * drag the reader back to the top of a scrolled section.
   */
  async function push(panel: Panel) {
    try {
      await serialize(async () => {
        // Read and mark inside the queue, on one turn. Checking before
        // enqueueing let two pushes of the same text both pass the check and
        // both write — and a redundant write resets the native scroll position,
        // which is the exact thing this guard exists to prevent.
        const text = panel.content
        if (panel.isSent(text)) return

        await withTimeout(
          bridge.textContainerUpgrade(panel.upgradeFor(text)),
          `upgrade ${panel.name}`,
        )
        panel.markSent(text)
      })
    } catch (error) {
      // A dropped write is recoverable — the panel stays unsent, so the next
      // refresh retries it. It must never propagate: a rejection here used to
      // kill the refresh loop for good.
      console.warn(`Failed to update ${panel.name}:`, error)
    }
  }

  type Focus = 'menu' | 'content'
  let focus: Focus = 'menu'

  /** Cursor within the focused section's commands. */
  let actionIndex = 0
  /** A confirming command is armed by the first click and runs on the second. */
  let armed = false
  let armTimer: ReturnType<typeof setTimeout> | null = null

  /** Arming must expire: a forgotten prompt turns the next stray click into a reboot. */
  function disarm() {
    armed = false
    if (armTimer !== null) {
      clearTimeout(armTimer)
      armTimer = null
    }
  }
  /** Result of the last command, shown until the section changes. */
  let actionStatus: string | null = null
  /** True while a command is running, so a second click cannot start another. */
  let actionBusy = false
  /** Set while the app is backgrounded; refreshes stop until it returns. */
  let paused = false

  /** Last known body per section, so moving the cursor paints instantly. */
  const cache = new Map<string, string>()
  const loading = new Set<string>()

  function paint() {
    const section = menu.selected
    const body = cache.get(section.label) ?? 'Loading...'
    // One blank line after the heading, not two: the pane is ten rows and the
    // menu already shows which section this is.
    const parts = [`${section.label.toUpperCase()}\n${body}`]

    const actions = section.actions ?? []
    if (actions.length > 0) {
      parts.push(
        actions
          .map((action, index) =>
            row([
              { text: focus === 'content' && index === actionIndex ? '>' : ' ', x: 0 },
              { text: action.label, x: 20 },
            ]),
          )
          .join('\n'),
      )
      if (armed) parts.push('Click again to confirm')
      if (actionStatus) parts.push(actionStatus)
    }

    // Focusing a section with nothing to pick otherwise leaves the user parked:
    // scroll is swallowed by the firmware, click does nothing, and only a double
    // click escapes. Say so.
    if (focus === 'content' && actions.length === 0) {
      parts.push('double click: back')
    }

    content.setContent(parts.join('\n\n'))
  }

  /** Fetches a section, repainting only if it is still the one on screen. */
  async function load(section: Section): Promise<void> {
    if (loading.has(section.label)) return
    loading.add(section.label)

    try {
      // Capped even though the API client has its own timeout: a request that
      // never settles would leave this label in `loading` for good, and every
      // later refresh would skip it — the section would sit on "Loading..."
      // until the app restarted.
      cache.set(section.label, await withTimeout(section.render(), `load ${section.label}`))
    } catch (error) {
      cache.set(section.label, `Unavailable\n\n${(error as Error).message}`)
    } finally {
      loading.delete(section.label)
    }

    if (menu.selected !== section) return

    paint()
    await push(content)
  }

  /** Cursor moved: show whatever is cached immediately, then refresh it. */
  async function selectCurrent() {
    actionIndex = 0
    disarm()
    actionStatus = null

    const section = menu.selected
    paint()

    await push(menu)
    await push(content)
    await load(section)
  }

  /**
   * Which container captures input is fixed at container creation, so moving
   * focus costs a page rebuild rather than an upgrade.
   */
  async function setFocus(next: Focus) {
    if (focus === next) return

    const previous = focus
    focus = next

    if (focus === 'menu') {
      disarm()
      actionStatus = null
    }
    paint()

    const rebuiltMenu = menu.content
    const rebuiltContent = content.content

    try {
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
    } catch (error) {
      // The rebuild is what actually moves `isEventCapture`. If it failed, the
      // firmware still routes input to the old panel, and believing otherwise
      // leaves every later scroll and click going somewhere the user cannot see.
      focus = previous
      paint()
      console.warn('Focus change failed:', error)
      return
    }

    menu.markSent(rebuiltMenu)
    content.markSent(rebuiltContent)

    // Reading suspends refreshes, so catch up on the way back out.
    if (focus === 'menu') void load(menu.selected)
  }

  async function runSelectedAction() {
    // A command can run for the client's full timeout. Without this, impatient
    // taps queue a second reboot behind the first.
    if (actionBusy) return

    const actions = menu.selected.actions ?? []
    const action = actions[actionIndex]
    if (!action) return

    if (action.confirm && !armed) {
      armed = true
      armTimer = setTimeout(() => {
        disarm()
        paint()
        void push(content)
      }, ARM_TIMEOUT_MS)

      paint()
      await push(content)
      return
    }

    disarm()
    actionBusy = true
    actionStatus = 'Working...'
    paint()
    await push(content)

    try {
      actionStatus = await action.run()
    } catch (error) {
      actionStatus = `Failed: ${(error as Error).message}`
    } finally {
      actionBusy = false
    }
    paint()
    await push(content)
  }

  function onScroll(delta: number) {
    if (focus === 'menu') {
      if (menu.moveBy(delta)) void selectCurrent()
      return
    }

    // While the content panel holds a long section the firmware scrolls it
    // natively and never forwards the event; commands are the only case where
    // one arrives here.
    const actions = menu.selected.actions ?? []
    if (actions.length === 0) return

    const next = Math.max(0, Math.min(actions.length - 1, actionIndex + delta))
    if (next === actionIndex) return

    actionIndex = next
    disarm()
    paint()
    void push(content)
  }

  paint()

  const menuText = menu.content
  const contentText = content.content
  const created = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 2,
      textObject: [menu.property(true), content.property(false)],
    }),
  )
  if (created !== 0) {
    // 1 invalid, 2 oversize, 3 out of memory. Carrying on would register
    // handlers and start ticking against a page the firmware never built.
    throw new Error(`createStartUpPageContainer failed with code ${created}`)
  }
  // Only now is the text actually on the glasses. Recording it earlier would
  // let a failed write leave the panels marked clean and wedge the display.
  menu.markSent(menuText)
  content.markSent(contentText)
  console.log('Page created: success')

  bridge.onEvenHubEvent((event) => {
    // Proto3 omits zero-valued fields, so CLICK_EVENT (0) arrives as undefined —
    // but only ever on an event that carries one of these payloads. Defaulting
    // unconditionally would turn any other event (list, audio, foreground) into
    // a click, which on an armed command means an unrequested host reboot.
    const source = event.sysEvent ?? event.textEvent
    if (!source) return
    const type = source.eventType ?? OsEventTypeList.CLICK_EVENT

    switch (type) {
      case OsEventTypeList.SCROLL_TOP_EVENT:
        onScroll(-1)
        break
      case OsEventTypeList.SCROLL_BOTTOM_EVENT:
        onScroll(1)
        break
      case OsEventTypeList.CLICK_EVENT:
        if (focus === 'menu') void setFocus('content')
        else void runSelectedAction()
        break
      case OsEventTypeList.DOUBLE_CLICK_EVENT:
        void setFocus('menu')
        break
      // Backgrounded: stop spending BLE writes on a display nobody is looking
      // at. The firmware discards container state, so on return both panels are
      // invalidated to force a full repaint rather than being skipped as
      // already-sent.
      case OsEventTypeList.FOREGROUND_EXIT_EVENT:
        paused = true
        break
      case OsEventTypeList.FOREGROUND_ENTER_EVENT:
        paused = false
        menu.invalidate()
        content.invalidate()
        void push(menu)
        void push(content)
        break
      default:
        break
    }
  })

  // Reordering in the phone UI rebuilds the menu around the same selection.
  subscribeSettings((settings) => {
    const selected = menu.selected
    menu.setItems(orderSections(settings.sectionOrder, settings.hiddenSections), selected)
    paint()
    void push(menu)
    void push(content)
  })

  /**
   * Keeps the visible section current. Self-scheduling rather than setInterval
   * so a slow link stretches the cadence instead of queueing overlapping work,
   * and so a changed refresh interval takes effect on the next pass.
   */
  async function tick() {
    try {
      // Never refresh underneath someone reading a scrolled section: every
      // update resets the firmware's scroll position, so a live section would
      // yank them back to the top mid-read. The section reloads on the way out.
      if (focus === 'menu' && !paused) await load(menu.selected)
    } catch (error) {
      // Always reschedule. Whatever went wrong, a dead timer would leave the
      // display frozen until the user moves the cursor.
      console.warn('Refresh failed:', error)
    }
    setTimeout(() => void tick(), getSettings().refreshMs)
  }

  await selectCurrent()
  void tick()
}
