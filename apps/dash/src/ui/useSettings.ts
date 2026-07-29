import { useSyncExternalStore } from 'react'
import { getSettings, subscribeSettings, type Settings } from '../settings'

/**
 * The settings store lives outside React because the glasses runtime reads and
 * writes it too — `useSyncExternalStore` keeps the UI in step with both.
 */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings)
}
