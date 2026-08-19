import { readonly, ref, type Ref } from 'vue'

/**
 * Below this, the toolbar cannot show every control at a touchable size, so
 * the layout collapses to a compact one. Chosen from the toolbar's own
 * natural width rather than a device: it needs well over 2000px to lay out
 * flat, and anything under this wraps into rows that eat the pitch.
 */
export const NARROW_MAX_PX = 768

/**
 * Above this the toolbar has room to lay out flat across the top. Between
 * here and NARROW_MAX_PX is tablet territory, where the controls fit but
 * only by stacking into rows — so they move to a rail down the edge
 * instead, under the thumb of the hand already holding the device.
 */
export const RAIL_MAX_PX = 1280

const isNarrow = ref(false)
const isRail = ref(false)
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
  track(`(max-width: ${NARROW_MAX_PX}px)`, isNarrow)
  track('(orientation: portrait)', isPortrait)
  track(`(min-width: ${NARROW_MAX_PX + 1}px) and (max-width: ${RAIL_MAX_PX}px)`, isRail)
}

/** Whether the screen is small enough, or tall enough, to change the layout. */
export function useViewport() {
  startWatching()
  return {
    isNarrow: readonly(isNarrow),
    isRail: readonly(isRail),
    isPortrait: readonly(isPortrait),
  }
}

/** Test-only: forget what was measured so a fresh stub can be installed. */
export function __resetViewportForTests(): void {
  watching = false
  isNarrow.value = false
  isRail.value = false
  isPortrait.value = false
}
