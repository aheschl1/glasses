/**
 * Pixel-based layout helpers for the glasses text pane.
 *
 * The firmware font is proportional and the renderer offers no alignment
 * controls, so `padEnd`-style columns do not line up — 'CPU' is 35px but 'Swap'
 * is 47px. Columns here are built by measuring real glyph widths and inserting
 * the right number of spaces (5px each), which lands every column within one
 * space of its target.
 */
import { getTextWidth, pxTruncate } from '@evenrealities/pretext'

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
 * Splits text into the display rows the renderer will actually produce, so
 * scrolling can step by real rows rather than by `\n`.
 *
 * Lines that already fit pass through untouched — they carry column padding
 * built by `row()`, and re-joining their words would destroy the alignment.
 * Only overlong lines (prose) get word-wrapped.
 */
export function wrapLines(text: string, innerWidth: number): string[] {
  const out: string[] = []

  for (const paragraph of text.split('\n')) {
    if (getTextWidth(paragraph) <= innerWidth) {
      out.push(paragraph)
      continue
    }

    let line = ''
    for (const word of paragraph.split(' ')) {
      const candidate = line === '' ? word : `${line} ${word}`
      if (getTextWidth(candidate) <= innerWidth) {
        line = candidate
        continue
      }
      if (line !== '') {
        out.push(line)
        line = ''
      }
      // A single word wider than the pane: break it by character.
      let chunk = ''
      for (const char of word) {
        if (chunk !== '' && getTextWidth(chunk + char) > innerWidth) {
          out.push(chunk)
          chunk = char
        } else {
          chunk += char
        }
      }
      line = chunk
    }

    if (line !== '') out.push(line)
  }

  return out
}

/** Horizontal meter drawn with box-drawing glyphs (20px each). */
export function bar(pct: number, segments: number): string {
  const clamped = Math.max(0, Math.min(100, pct))
  const filled = Math.round((clamped / 100) * segments)
  return '━'.repeat(filled) + '─'.repeat(segments - filled)
}
