import { applyOrder, SECTION_LABELS } from '../sections/order'
import { updateSettings } from '../settings'

/**
 * Reorder and hide sections.
 *
 * Buttons rather than drag and drop: this runs in a phone webview where a drag
 * competes with the page's own scrolling. "Top" exists because moving a section
 * from the bottom to the front is otherwise a dozen taps, each one moving the
 * button out from under your finger.
 *
 * Hiding matters more than ordering — the glasses menu shows ten rows and there
 * are seventeen sections, so switching a few off is the fastest way to make the
 * list fit what you actually watch.
 */
export function SectionOrder({ order, hidden }: { order: string[]; hidden: string[] }) {
  const labels = applyOrder(
    SECTION_LABELS.map((label) => ({ label })),
    order,
  ).map((item) => item.label)

  function reorder(next: string[]) {
    updateSettings({ sectionOrder: next })
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= labels.length) return

    const next = [...labels]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    reorder(next)
  }

  function moveToTop(index: number) {
    const next = [...labels]
    const [moved] = next.splice(index, 1)
    reorder([moved, ...next])
  }

  function toggle(label: string) {
    const next = hidden.includes(label)
      ? hidden.filter((entry) => entry !== label)
      : [...hidden, label]
    updateSettings({ hiddenSections: next })
  }

  const visibleCount = labels.length - hidden.length

  return (
    <>
      <p className="hint">
        {visibleCount} of {labels.length} shown. The glasses menu fits ten at a time.
      </p>

      <ol className="order">
        {labels.map((label, index) => {
          const isHidden = hidden.includes(label)

          return (
            <li key={label} className={isHidden ? 'is-hidden' : undefined}>
              <label className="order-toggle">
                <input type="checkbox" checked={!isHidden} onChange={() => toggle(label)} />
                <span className="order-label">{label}</span>
              </label>

              <span className="order-buttons">
                <button
                  type="button"
                  aria-label={`Move ${label} to top`}
                  disabled={index === 0}
                  onClick={() => moveToTop(index)}
                >
                  Top
                </button>
                <button
                  type="button"
                  aria-label={`Move ${label} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${label} down`}
                  disabled={index === labels.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
              </span>
            </li>
          )
        })}
      </ol>

      <button
        type="button"
        className="secondary reset"
        onClick={() => updateSettings({ sectionOrder: [], hiddenSections: [] })}
      >
        Reset to defaults
      </button>
    </>
  )
}
