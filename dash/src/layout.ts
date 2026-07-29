/**
 * Pixel-based layout helpers for the glasses text pane.
 *
 * The firmware font is proportional and the renderer offers no alignment
 * controls, so `padEnd`-style columns do not line up — 'CPU' is 35px but 'Swap'
 * is 47px. Columns here are built by measuring real glyph widths and inserting
 * the right number of spaces (5px each), which lands every column within one
 * space of its target.
 */
import { getTextWidth, measureTextWrap, pxTruncate } from '@evenrealities/pretext'

/** Fixed by the firmware renderer. */
export const LINE_HEIGHT = 27

const SPACE_PX = getTextWidth(' ')

export type Cell = {
  text: string
  /** Column position in pixels from the left edge of the text area. */
  x: number
  /** 'left' starts the cell at x; 'right' ends it at x. */
  align?: 'left' | 'right'
}

/** Lays out cells at pixel columns, padding with spaces. */
export function row(cells: Cell[]): string {
  let line = ''

  for (const cell of cells) {
    const target = cell.align === 'right' ? cell.x - getTextWidth(cell.text) : cell.x
    const gap = target - getTextWidth(line)

    // Floor, never round: overshooting a column pushes the line past the pane
    // width and costs a wrapped row.
    if (gap >= SPACE_PX) {
      line += ' '.repeat(Math.floor(gap / SPACE_PX))
    } else if (line.length > 0) {
      line += ' '
    }
    line += cell.text
  }

  return line
}

/** Truncates to a pixel budget, appending '...' when it does not fit. */
export function fit(text: string, maxPx: number): string {
  return pxTruncate(text, maxPx)
}

/**
 * Clips to a line budget, counting wrapped lines rather than `\n` breaks — a
 * long line silently costs two rows on the display.
 */
export function clipToLines(lines: string[], innerWidth: number, maxLines: number): string {
  const kept: string[] = []
  let used = 0

  for (const [index, line] of lines.entries()) {
    const cost = line === '' ? 1 : measureTextWrap(line, innerWidth).lineCount
    const remaining = lines.length - index

    // Reserve a row for the "+N more" marker when something will be dropped.
    const budget = remaining > 1 ? maxLines - 1 : maxLines

    if (used + cost > budget) {
      kept.push(`+${remaining} more`)
      return kept.join('\n')
    }

    kept.push(line)
    used += cost
  }

  return kept.join('\n')
}

/** Horizontal meter drawn with box-drawing glyphs (20px each). */
export function bar(pct: number, segments: number): string {
  const clamped = Math.max(0, Math.min(100, pct))
  const filled = Math.round((clamped / 100) * segments)
  return '━'.repeat(filled) + '─'.repeat(segments - filled)
}
