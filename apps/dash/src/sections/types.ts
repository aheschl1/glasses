/**
 * A section is one row in the glasses menu and one screen of content.
 *
 * Renderers return the full text; they never clip. The content panel hands it
 * to the firmware whole so the native scrollbar appears and scrolling works —
 * see ../containers.
 */
export type Section = {
  /** Menu label — the menu panel is narrow, so keep it to ~8 characters. */
  label: string
  render: () => Promise<string>
  /**
   * Optional commands, shown under the content when the section is focused.
   *
   * Only add these to sections whose content stays short: once a container
   * overflows, the firmware scrolls it natively and stops forwarding the scroll
   * events the action cursor needs.
   */
  actions?: SectionAction[]
}

export type SectionAction = {
  label: string
  /** Requires a second click before running — use for anything destructive. */
  confirm?: boolean
  /** Returns a short status line to show after running. */
  run: () => Promise<string>
}
