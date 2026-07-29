/**
 * Generalized panel objects for the glasses.
 *
 * The firmware's own list container handles scrolling internally and reports
 * nothing to the app until you tap it, so there is no way to react as the
 * highlight moves. These panels are text containers instead: the app draws the
 * items and the cursor itself, which means every scroll arrives as an event and
 * the UI can respond immediately.
 *
 * Exactly one container per page may capture input. `property(focused)` builds
 * the container with that flag set, so moving focus is a rebuild with a
 * different panel focused.
 */
import { TextContainerProperty, TextContainerUpgrade } from '@evenrealities/even_hub_sdk'
import { LINE_HEIGHT, row } from './layout'

export type PanelOptions = {
  id: number
  /** Max 16 chars, unique per page. */
  name: string
  x: number
  y: number
  width: number
  height: number
  padding?: number
}

/**
 * A text container with fixed geometry.
 *
 * The border is always 1px wide and only changes colour with focus — drawing it
 * conditionally would change the inner width and reflow the text on every focus
 * change.
 */
export class Panel {
  readonly id: number
  readonly name: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly padding: number

  constructor(options: PanelOptions) {
    this.id = options.id
    this.name = options.name
    this.x = options.x
    this.y = options.y
    this.width = options.width
    this.height = options.height
    this.padding = options.padding ?? 6
  }

  /** Border (1) plus padding, on every side. */
  get inset(): number {
    return this.padding + 1
  }

  get innerWidth(): number {
    return this.width - 2 * this.inset
  }

  /** Rows of text that fit before the content clips. */
  get maxLines(): number {
    return Math.floor((this.height - 2 * this.inset) / LINE_HEIGHT)
  }

  /** Subclasses produce the visible text. */
  render(): string {
    return ''
  }

  /** What would be sent to the glasses right now. */
  get content(): string {
    return this.render() || ' '
  }

  /**
   * Content last confirmed on the glasses.
   *
   * Re-sending identical text is not free: the firmware resets a container's
   * scroll position to the top on every update, so a periodic refresh that
   * changes nothing would still yank the reader back. Callers send only when
   * this differs.
   */
  private sent: string | null = null

  isSent(content: string): boolean {
    return this.sent === content
  }

  markSent(content: string) {
    this.sent = content
  }

  property(focused: boolean): TextContainerProperty {
    return new TextContainerProperty({
      xPosition: this.x,
      yPosition: this.y,
      width: this.width,
      height: this.height,
      borderWidth: 1,
      // 0 is black, i.e. invisible on this display — the ring marks focus.
      borderColor: focused ? 10 : 0,
      borderRadius: 4,
      paddingLength: this.padding,
      containerID: this.id,
      containerName: this.name,
      content: this.content,
      isEventCapture: focused ? 1 : 0,
    })
  }

  /**
   * Forgets what the glasses are showing, so the next push writes even if the
   * text is unchanged. Needed after the firmware discards container state —
   * returning from the background, or a rebuild that failed.
   */
  invalidate() {
    this.sent = null
  }

  upgradeFor(content: string): TextContainerUpgrade {
    return new TextContainerUpgrade({
      containerID: this.id,
      containerName: this.name,
      contentOffset: 0,
      contentLength: 0,
      content,
    })
  }
}

export type ItemListOptions<T> = PanelOptions & {
  items: T[]
  label: (item: T) => string
  /** Drawn to the left of the current item. */
  cursor?: string
  /** Pixel column the labels start at, leaving room for the cursor. */
  labelX?: number
}

/**
 * A scrollable list of items with a cursor.
 *
 * Keeps its own window into the item array so long lists scroll rather than
 * clip, and reports whether a move actually changed anything so callers can
 * skip redundant BLE writes.
 */
export class ItemListPanel<T> extends Panel {
  items: T[]

  private readonly labelOf: (item: T) => string
  private readonly cursor: string
  private readonly labelX: number
  private index = 0
  private windowStart = 0

  constructor(options: ItemListOptions<T>) {
    super(options)
    this.items = options.items
    this.labelOf = options.label
    this.cursor = options.cursor ?? '>'
    this.labelX = options.labelX ?? 20
  }

  get selectedIndex(): number {
    return this.index
  }

  /**
   * Replaces the items, keeping the same entry selected where possible — the
   * phone UI can reorder sections while the menu is on screen.
   */
  setItems(items: T[], keep?: T) {
    this.items = items

    const kept = keep === undefined ? -1 : items.indexOf(keep)
    this.index = Math.max(0, kept >= 0 ? kept : Math.min(this.index, items.length - 1))
    this.clampWindow()
  }

  get selected(): T {
    return this.items[this.index]
  }

  /**
   * Moves the cursor, wrapping at both ends.
   *
   * Wrapping is not a nicety here: the only input is one scroll event per row,
   * so without it the last section costs as many scrolls as the list is long.
   */
  moveBy(delta: number): boolean {
    const count = this.items.length
    if (count === 0) return false

    const next = (((this.index + delta) % count) + count) % count
    if (next === this.index) return false

    this.index = next
    this.clampWindow()
    return true
  }

  private clampWindow() {
    const lastStart = Math.max(0, this.items.length - this.maxLines)
    this.windowStart = Math.max(0, Math.min(this.windowStart, lastStart))

    if (this.index < this.windowStart) {
      this.windowStart = this.index
    } else if (this.index >= this.windowStart + this.maxLines) {
      this.windowStart = this.index - this.maxLines + 1
    }
  }

  render(): string {
    const visible = this.items.slice(this.windowStart, this.windowStart + this.maxLines)
    const more = this.items.length - this.windowStart - visible.length

    return visible
      .map((item, offset) => {
        const isSelected = this.windowStart + offset === this.index

        // Because the app draws this list itself, the firmware sees no overflow
        // and draws no scrollbar — without these markers nothing hints that
        // there are more sections above or below. They sit at the right edge,
        // clear of the cursor column and of the labels.
        let marker = ' '
        if (offset === 0 && this.windowStart > 0) marker = '^'
        else if (offset === visible.length - 1 && more > 0) marker = 'v'

        return row([
          { text: isSelected ? this.cursor : ' ', x: 0 },
          { text: this.labelOf(item), x: this.labelX },
          { text: marker, x: this.innerWidth, align: 'right' },
        ])
      })
      .join('\n')
  }
}

/**
 * A block of text that may overflow its container.
 *
 * The container is given the content in full, which is what makes the firmware
 * draw its own scrollbar — a proportional thumb on the right edge showing how
 * much is off-screen — and scroll it natively while focused. The app therefore
 * does not window the text or track a scroll offset; doing so would hide the
 * overflow from the firmware and the bar would disappear with it.
 */
export class ScrollPanel extends Panel {
  private text = ''

  setContent(text: string) {
    this.text = text
  }

  render(): string {
    return this.text
  }
}
