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
import { LINE_HEIGHT, row, wrapLines } from './layout'

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
      content: this.render() || ' ',
      isEventCapture: focused ? 1 : 0,
    })
  }

  upgrade(): TextContainerUpgrade {
    return new TextContainerUpgrade({
      containerID: this.id,
      containerName: this.name,
      contentOffset: 0,
      contentLength: 0,
      content: this.render() || ' ',
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
  readonly items: T[]

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

  get selected(): T {
    return this.items[this.index]
  }

  /** Returns true when the selection actually moved. */
  moveBy(delta: number): boolean {
    const next = Math.max(0, Math.min(this.items.length - 1, this.index + delta))
    if (next === this.index) return false

    this.index = next

    // Keep the cursor inside the visible window.
    if (this.index < this.windowStart) {
      this.windowStart = this.index
    } else if (this.index >= this.windowStart + this.maxLines) {
      this.windowStart = this.index - this.maxLines + 1
    }

    return true
  }

  render(): string {
    const visible = this.items.slice(this.windowStart, this.windowStart + this.maxLines)

    return visible
      .map((item, offset) => {
        const isSelected = this.windowStart + offset === this.index
        return row([
          { text: isSelected ? this.cursor : ' ', x: 0 },
          { text: this.labelOf(item), x: this.labelX },
        ])
      })
      .join('\n')
  }
}

/**
 * A scrollable block of text.
 *
 * Content is split into real display rows up front (see `wrapLines`) so a
 * scroll step moves exactly one visible row even when a line wraps.
 */
export class ScrollPanel extends Panel {
  private lines: string[] = []
  private offset = 0

  /**
   * Replaces the content. The offset is clamped rather than reset, so a
   * periodic refresh does not yank the view back to the top while reading.
   */
  setContent(text: string) {
    this.lines = wrapLines(text, this.innerWidth)
    this.offset = Math.min(this.offset, this.maxOffset)
  }

  scrollToTop() {
    this.offset = 0
  }

  get scrollable(): boolean {
    return this.lines.length > this.maxLines
  }

  private get maxOffset(): number {
    return Math.max(0, this.lines.length - this.visibleLines)
  }

  /** One row is spent on the overflow marker whenever content does not fit. */
  private get visibleLines(): number {
    return this.scrollable ? this.maxLines - 1 : this.maxLines
  }

  /** Returns true when the view actually moved. */
  scrollBy(delta: number): boolean {
    const next = Math.max(0, Math.min(this.maxOffset, this.offset + delta))
    if (next === this.offset) return false
    this.offset = next
    return true
  }

  render(): string {
    const visible = this.lines.slice(this.offset, this.offset + this.visibleLines)
    if (!this.scrollable) return visible.join('\n')

    const above = this.offset
    const below = this.lines.length - this.offset - this.visibleLines
    const marker = [above > 0 ? `^${above}` : '', below > 0 ? `+${below} more` : 'end'].filter(
      Boolean,
    )

    return [...visible, marker.join('  ')].join('\n')
  }
}
