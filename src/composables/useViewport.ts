import { readonly, ref, type Ref } from 'vue'

/**
 * Below this the rail lies down.
 *
 * A rail is a column of controls down one edge, which is the right shape
 * while there is width to spare. On a phone an 88px column is a fifth of
 * the screen taken from the pitch before a coach has drawn anything, so
 * under this width the same rail runs along the bottom instead, directly
 * above the timeline.
 */
export const COMPACT_MAX_PX = 1023

const isCompact = ref(false)
const isPortrait = ref(false)
let watching = false

function track(query: string, target: Ref<boolean>): void {
  // No matchMedia in jsdom or an old WebView: fall back to a wide landscape
  // screen rather than taking the whole app down over a layout choice.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  const media = window.matchMedia(query)
  target.value = media.matches
  media.addEventListener('change', (event) => {
    target.value = event.matches
  })
}

function startWatching(): void {
  if (watching) return
  watching = true
  track(`(max-width: ${COMPACT_MAX_PX}px)`, isCompact)
  track('(orientation: portrait)', isPortrait)
}

/** Whether the screen is small enough, or tall enough, to change the layout. */
export function useViewport() {
  startWatching()
  return {
    isCompact: readonly(isCompact),
    isPortrait: readonly(isPortrait),
  }
}

/** Test-only: forget what was measured so a fresh stub can be installed. */
export function __resetViewportForTests(): void {
  watching = false
  isCompact.value = false
  isPortrait.value = false
}
