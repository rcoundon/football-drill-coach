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

/**
 * Below this the header cannot hold everything it holds on a desktop.
 *
 * It is one non-wrapping row, and adding up its own minimums — the mark, a
 * name that will not shrink past 6rem, the drill menu, the save status,
 * undo, redo, Share and Help, with a gap between each — it needs about
 * 590px, and rather more on a touch screen, where the icon buttons grow to
 * 44px. A portrait phone offers 360 to 430. Everything past the name used to
 * simply overflow the right edge, which took Help with it — and Help is
 * where "Take the tour" lives, so a coach who skipped the tour on a phone
 * had no way back to it.
 */
export const NARROW_MAX_PX = 640

const isCompact = ref(false)
const isPortrait = ref(false)
const isNarrow = ref(false)
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
  track(`(max-width: ${NARROW_MAX_PX}px)`, isNarrow)
  track('(orientation: portrait)', isPortrait)
}

/** Whether the screen is small enough, or tall enough, to change the layout. */
export function useViewport() {
  startWatching()
  return {
    isCompact: readonly(isCompact),
    isPortrait: readonly(isPortrait),
    isNarrow: readonly(isNarrow),
  }
}

/** Test-only: forget what was measured so a fresh stub can be installed. */
export function __resetViewportForTests(): void {
  watching = false
  isCompact.value = false
  isPortrait.value = false
  isNarrow.value = false
}
