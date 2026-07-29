/**
 * The section catalogue.
 *
 * The phone UI can reorder and hide sections, so always resolve the live list
 * through `orderSections` rather than assuming this array's order.
 */
import { hostSections } from './host'
import { networkSections } from './network'
import { opsSections } from './ops'
import { applyOrder, SECTION_LABELS } from './order'
import { workloadSections } from './workloads'
import type { Section } from './types'

export type { Section, SectionAction } from './types'
export { applyOrder, SECTION_LABELS } from './order'

const catalogue: Section[] = [
  ...hostSections,
  ...workloadSections,
  ...networkSections,
  ...opsSections,
]

export const allSections: Section[] = applyOrder(catalogue, SECTION_LABELS)

if (import.meta.env.DEV) {
  // `label` is the key for the cache, the in-flight set and the saved order, so
  // a duplicate or an unlisted section fails silently and confusingly.
  const labels = catalogue.map((section) => section.label)
  const duplicates = labels.filter((label, index) => labels.indexOf(label) !== index)
  if (duplicates.length > 0) console.error('Duplicate section labels:', duplicates)

  const unlisted = labels.filter((label) => !SECTION_LABELS.includes(label as never))
  if (unlisted.length > 0) console.error('Sections missing from SECTION_LABELS:', unlisted)
}

export function orderSections(order: readonly string[], hidden: readonly string[] = []): Section[] {
  return applyOrder(allSections, order, hidden)
}
