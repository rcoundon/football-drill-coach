import { readonly, ref } from 'vue'
import type { CounterColor } from '../types'

/**
 * What is being dragged out of the palette and onto the pitch.
 *
 * Pressing a palette entry drops the thing in the middle of the pitch, which
 * is the fast way; dragging it puts it exactly where the coach let go, which
 * is the way that shows a coach who has never used the tool that players are
 * something you place at all.
 */
export type PlacementKind =
  | { kind: 'player'; color: CounterColor }
  | { kind: 'ball' }
  | { kind: 'cone' }
  | { kind: 'text' }

/** Where the pointer is, in client coordinates, so a ghost can follow it. */
export interface PlacementPoint {
  x: number
  y: number
}

/**
 * How far a pointer must travel before a press counts as a drag. Below this
 * the gesture is a tap, and a tap drops at the centre — without the
 * threshold, the wobble of a finger on a swatch would place a player under
 * the coach's own hand, off the pitch, and nothing would appear.
 */
export const DRAG_THRESHOLD_PX = 6

/**
 * Told where the pointer let go, in client coordinates. Returns true if it
 * landed on the pitch and something was placed.
 */
type DropHandler = (kind: PlacementKind, clientX: number, clientY: number) => boolean

const dragging = ref<PlacementKind | null>(null)
const pointer = ref<PlacementPoint | null>(null)

/**
 * The pointer a placement belongs to, from the press until the release.
 *
 * A tablet has as many pointers as the coach has fingers, and until this
 * was tracked a second one could start its own placement over the first, or
 * end the first one's gesture in a place the first finger had never been.
 * `dragging` alone was not enough: it stays null until a gesture travels
 * far enough to count as a drag.
 */
let activePointer: number | null = null

/**
 * The pitch registers itself as the place things can be dropped. Only the
 * pitch knows how to turn a client point into a point on the grass, and only
 * one pitch is ever on screen.
 */
let dropHandler: DropHandler | null = null

export function setPlacementDropTarget(handler: DropHandler | null): void {
  dropHandler = handler
}

/**
 * Begin a drag from a palette entry.
 *
 * `onTap` is what a press without travel means — dropping at the centre —
 * so a single pointerdown handler covers both interactions the palette has
 * to offer, and neither needs the coach to know which one they are doing.
 */
export function startPlacementDrag(
  what: PlacementKind,
  event: PointerEvent,
  onTap: () => void,
): void {
  // Only the primary button, and only one gesture at a time. Written as a
  // comparison against 0 rather than an equality check, so a synthetic
  // event carrying no button at all still counts as a press.
  if (event.button > 0 || activePointer !== null) return

  activePointer = event.pointerId ?? 0
  const startX = event.clientX
  const startY = event.clientY
  let travelled = false

  /** True for events belonging to some other finger, which are not ours. */
  function isOther(event: PointerEvent): boolean {
    return (event.pointerId ?? 0) !== activePointer
  }

  function onMove(move: PointerEvent): void {
    if (isOther(move)) return
    if (!travelled) {
      const far =
        Math.abs(move.clientX - startX) > DRAG_THRESHOLD_PX ||
        Math.abs(move.clientY - startY) > DRAG_THRESHOLD_PX
      if (!far) return
      travelled = true
      dragging.value = what
    }
    pointer.value = { x: move.clientX, y: move.clientY }
  }

  function onUp(up: PointerEvent): void {
    if (isOther(up)) return
    stop()
    if (!travelled) {
      onTap()
      return
    }
    dropHandler?.(what, up.clientX, up.clientY)
  }

  /**
   * A cancelled pointer places nothing. The browser takes the pointer away
   * for reasons that have nothing to do with the drill — a system gesture, a
   * notification — and a player appearing wherever that happened is not
   * something the coach asked for.
   */
  function onCancel(cancelled: PointerEvent): void {
    if (isOther(cancelled)) return
    stop()
  }

  function stop(): void {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    activePointer = null
    dragging.value = null
    pointer.value = null
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
}

/** What is being dragged and where, for the ghost that follows the pointer. */
export function usePlacement() {
  return {
    dragging: readonly(dragging),
    pointer: readonly(pointer),
  }
}

/** Test-only: drop any drag left running by a test that ended mid-gesture. */
export function __resetPlacementForTests(): void {
  activePointer = null
  dragging.value = null
  pointer.value = null
  dropHandler = null
}
