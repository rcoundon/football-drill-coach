import type { CounterColor, Rect, Vec } from './types'

/**
 * A real pitch is 105m x 68m. We normalise the long side to 100 units and
 * apply the SAME scale to both axes, so circles stay circular.
 */
const PITCH_SCALE = 100 / 105

export const PITCH_W = 100
export const PITCH_H = Number((68 * PITCH_SCALE).toFixed(2)) // 64.76

export const COUNTER_COLORS = ['red', 'blue', 'yellow', 'green', 'black'] as const satisfies readonly CounterColor[]

/** Metres to pitch units. Used by the markings component. */
export function m(metres: number): number {
  return metres * PITCH_SCALE
}

export function viewBoxOf(rotated: boolean): string {
  return rotated ? `0 0 ${PITCH_H} ${PITCH_W}` : `0 0 ${PITCH_W} ${PITCH_H}`
}

/**
 * Pitch coordinates to view-box coordinates.
 * A rotated board is the pitch turned 90 degrees clockwise, which is the SVG
 * transform `translate(PITCH_H 0) rotate(90)`.
 */
export function toView(p: Vec, rotated: boolean): Vec {
  return rotated ? { x: PITCH_H - p.y, y: p.x } : { x: p.x, y: p.y }
}

/** The inverse of toView. */
export function fromView(p: Vec, rotated: boolean): Vec {
  return rotated ? { x: p.y, y: PITCH_H - p.x } : { x: p.x, y: p.y }
}

/**
 * Convert a pointer event's client coordinates into pitch units.
 *
 * The SVG uses the default preserveAspectRatio ("xMidYMid meet"), so the
 * view box is scaled by the smaller of the two axis ratios and centred,
 * leaving letterboxing on the other axis. We reproduce that here rather
 * than using getScreenCTM so the function stays pure and testable.
 */
export function clientToPitch(rect: Rect, clientX: number, clientY: number, rotated: boolean): Vec {
  const vw = rotated ? PITCH_H : PITCH_W
  const vh = rotated ? PITCH_W : PITCH_H

  const scale = Math.min(rect.width / vw, rect.height / vh)
  const offsetX = (rect.width - vw * scale) / 2
  const offsetY = (rect.height - vh * scale) / 2

  const viewX = (clientX - rect.left - offsetX) / scale
  const viewY = (clientY - rect.top - offsetY) / scale

  return fromView({ x: viewX, y: viewY }, rotated)
}

export function clampToPitch(p: Vec): Vec {
  return {
    x: Math.min(PITCH_W, Math.max(0, p.x)),
    y: Math.min(PITCH_H, Math.max(0, p.y)),
  }
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * How far off true a segment may be and still be treated as straight, in
 * degrees. Generous enough to catch a hand-drawn thirds line on a tablet,
 * tight enough that a deliberate shallow diagonal survives.
 */
export const SNAP_ANGLE_DEG = 6

/**
 * Lock a segment to the horizontal or vertical when it is within
 * SNAP_ANGLE_DEG of it. A zone edge drawn by hand is never quite straight,
 * and an almost-straight line reads as a mistake on a projected screen.
 *
 * Only the off-axis coordinate moves, so the segment keeps the length the
 * coach dragged along the axis they meant.
 */
export function snapToAxis(from: Vec, to: Vec): Vec {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return { ...to }

  const tolerance = Math.tan((SNAP_ANGLE_DEG * Math.PI) / 180)

  if (Math.abs(dy) <= Math.abs(dx) * tolerance) return { x: to.x, y: from.y }
  if (Math.abs(dx) <= Math.abs(dy) * tolerance) return { x: from.x, y: to.y }
  return { ...to }
}
