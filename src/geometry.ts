import type { CounterColor, Rect, Vec } from './types'

/**
 * A real pitch is 105m x 68m. We normalise the long side to 100 units and
 * apply the SAME scale to both axes, so circles stay circular.
 */
const PITCH_SCALE = 100 / 105

export const PITCH_W = 100
export const PITCH_H = Number((68 * PITCH_SCALE).toFixed(2)) // 64.76

/**
 * Where an attached ball sits relative to its holder, in pitch units.
 *
 * Far enough out that the ball's own hit circle clears the whole drawn
 * counter: the ball is painted after the counters, so any overlap steals the
 * press, and an overlap reaching the counter's centre means pressing the
 * middle of a player in possession grabs the ball instead of the player.
 * See BALL_HIT_RADIUS_ATTACHED in BallToken.vue for the other half.
 *
 * It lives here rather than in useBoard so animation.ts can resolve where an
 * attached ball is drawn without importing useBoard, which would import
 * animation.ts back.
 */
export const BALL_OFFSET: Vec = { x: 3.4, y: 3.4 }

export const COUNTER_COLORS = ['red', 'blue', 'yellow', 'purple', 'black'] as const satisfies readonly CounterColor[]

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

/**
 * How far off the chord the bend handle must be dragged before the arrow
 * bows at all, in pitch units.
 *
 * A curve of a fraction of a unit is invisible at any projected size, but it
 * still costs the arrow its straightness — and a coach who drags the handle
 * back to the line means "straight", not "very nearly straight". Matching
 * the board's tap tolerance keeps a hand's wobble from bending anything.
 */
export const BEND_DEADBAND = 0.75

/**
 * The unit normal of the chord from `from` to `to`, or null when there is no
 * chord to take a normal of.
 *
 * Rotating the direction a quarter turn rather than picking an axis is what
 * makes a bend mean the same thing on a diagonal arrow as on a flat one.
 */
function chordNormal(from: Vec, to: Vec): Vec | null {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return null
  return { x: -dy / length, y: dx / length }
}

/**
 * How far the handle may slide along the chord, as a fraction of its length,
 * either side of the midpoint.
 *
 * Not a matter of taste: the control point slides twice as far as the handle,
 * so at a quarter it reaches the chord's own end. Past that it leaves the
 * chord's span, the curve doubles back on itself before reaching the far end,
 * and what the coach sees is a kink rather than a curl.
 */
export const MAX_BEND_ALONG = 0.25

/** The chord midpoint: where a straight arrow's handle sits. */
function chordMidpoint(from: Vec, to: Vec): Vec {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
}

/**
 * Where the handle sits: the point the drawn curve passes through halfway
 * along, offset from the chord midpoint both across the chord (`bend`) and
 * along it (`bendAlong`, as a fraction of the chord's length).
 *
 * Holding both offsets relative to the chord rather than as board
 * coordinates is what keeps a curve the same shape through a rotation.
 */
export function curveHandle(from: Vec, to: Vec, bend: number, bendAlong = 0): Vec {
  const mid = chordMidpoint(from, to)
  const normal = chordNormal(from, to)
  if (!normal) return mid
  const length = distance(from, to)
  const along = clampBendAlong(bendAlong) * length
  // The tangent is the normal turned back the other quarter turn.
  return {
    x: mid.x + normal.x * bend + normal.y * along,
    y: mid.y + normal.y * bend - normal.x * along,
  }
}

/**
 * The control point of the quadratic that draws this arrow.
 *
 * Twice the handle's offset in both directions, because a quadratic Bezier
 * passes through the point halfway between its chord midpoint and its
 * control point — so a control point one offset out would draw a curve only
 * half an offset out, and the handle would not sit on the line it is bending.
 */
export function curveControlPoint(from: Vec, to: Vec, bend: number, bendAlong = 0): Vec {
  const mid = chordMidpoint(from, to)
  const handle = curveHandle(from, to, bend, bendAlong)
  return { x: 2 * handle.x - mid.x, y: 2 * handle.y - mid.y }
}

function clampBendAlong(along: number): number {
  return Math.min(MAX_BEND_ALONG, Math.max(-MAX_BEND_ALONG, along))
}

/**
 * The bend a handle dragged to `at` asks for: how deep the bow is, and where
 * along the arrow it peaks.
 *
 * One drag sets both, so the handle simply follows the pointer. Straightening
 * the arrow takes the skew with it — an arrow with no bow has no peak to
 * place, and keeping a stale offset would make the next bend land off centre
 * for no reason the coach could see.
 */
export function bendFor(from: Vec, to: Vec, at: Vec): { bend: number; along: number } {
  const normal = chordNormal(from, to)
  if (!normal) return { bend: 0, along: 0 }

  const mid = chordMidpoint(from, to)
  const offX = at.x - mid.x
  const offY = at.y - mid.y

  const bend = offX * normal.x + offY * normal.y
  if (Math.abs(bend) < BEND_DEADBAND) return { bend: 0, along: 0 }

  const alongDistance = offX * normal.y - offY * normal.x
  if (Math.abs(alongDistance) < BEND_DEADBAND) return { bend, along: 0 }

  return { bend, along: clampBendAlong(alongDistance / distance(from, to)) }
}
