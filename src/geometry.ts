import type { CounterColor, PitchType, Rect, Vec } from './types'

/** Which pitch is drawn, and which way round. */
export type PitchShape = { type: PitchType; rotated: boolean }

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

/** The rectangle a pitch actually occupies, in pitch coordinates. */
export type PitchBounds = { x: number; y: number; width: number; height: number }

/** Either half pitch: the two cover the same ground, with the goal at opposite ends. */
export function isHalfPitch(type: PitchType): boolean {
  return type === 'half' || type === 'half-right'
}

/**
 * What the chosen pitch covers.
 *
 * Half a pitch is the left half of a full one, centred in the full pitch's
 * coordinates — the same coordinates a drill's players are stored in, so
 * switching between presets never moves anybody. What changes is how much
 * of the board is drawn, and therefore how large it is on screen: a half
 * pitch used to be drawn at half scale in the middle of a full-sized
 * canvas, with a third of the board empty at each end.
 */
export function boundsOf(type: PitchType): PitchBounds {
  if (!isHalfPitch(type)) return { x: 0, y: 0, width: PITCH_W, height: PITCH_H }
  const width = PITCH_W / 2
  return { x: (PITCH_W - width) / 2, y: 0, width, height: PITCH_H }
}

/**
 * The same bounds in view coordinates, which is where the rotation lives.
 * A rotated board is the pitch turned 90 degrees clockwise, so its width
 * and height swap and its origin moves to the far end.
 */
export function viewBoundsOf(pitch: PitchShape): PitchBounds {
  const b = boundsOf(pitch.type)
  if (!pitch.rotated) return b
  return { x: PITCH_H - (b.y + b.height), y: b.x, width: b.height, height: b.width }
}

export function viewBoxOf(pitch: PitchShape): string {
  const b = viewBoundsOf(pitch)
  return `${b.x} ${b.y} ${b.width} ${b.height}`
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
export function clientToPitch(
  rect: Rect,
  clientX: number,
  clientY: number,
  pitch: PitchShape,
): Vec {
  // Read off the same box the board is drawn from, or a press lands
  // somewhere other than where the coach put it the moment the two differ.
  const view = viewBoundsOf(pitch)

  const scale = Math.min(rect.width / view.width, rect.height / view.height)
  const offsetX = (rect.width - view.width * scale) / 2
  const offsetY = (rect.height - view.height * scale) / 2

  const viewX = (clientX - rect.left - offsetX) / scale + view.x
  const viewY = (clientY - rect.top - offsetY) / scale + view.y

  return fromView({ x: viewX, y: viewY }, pitch.rotated)
}

/**
 * The inverse of clientToPitch: where on the screen a pitch point is drawn,
 * and how many pixels one pitch unit covers there. For laying HTML over the
 * board exactly where something on it sits.
 */
export function pitchToClient(
  rect: Rect,
  p: Vec,
  pitch: PitchShape,
): { x: number; y: number; scale: number } {
  const view = viewBoundsOf(pitch)

  const scale = Math.min(rect.width / view.width, rect.height / view.height)
  const offsetX = (rect.width - view.width * scale) / 2
  const offsetY = (rect.height - view.height * scale) / 2

  const v = toView(p, pitch.rotated)
  return {
    x: rect.left + offsetX + (v.x - view.x) * scale,
    y: rect.top + offsetY + (v.y - view.y) * scale,
    scale,
  }
}

/**
 * Hold a point inside the pitch being drawn.
 *
 * Defaults to the full pitch, so the many callers that have no opinion —
 * and every drill saved before half pitches had their own canvas — behave
 * exactly as they did.
 */
export function clampToPitch(p: Vec, type: PitchType = 'full'): Vec {
  const b = boundsOf(type)
  return {
    x: Math.min(b.x + b.width, Math.max(b.x, p.x)),
    y: Math.min(b.y + b.height, Math.max(b.y, p.y)),
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

/** A mini goal: the size a new one starts at. */
export const GOAL_DEFAULT_WIDTH = m(3)
/** Narrower than this and it stops reading as a goal at all. */
export const GOAL_MIN_WIDTH = m(1)
/** A full-size goal. Nothing on a training pitch is wider. */
export const GOAL_MAX_WIDTH = m(7.32)

/**
 * The four corners of a goal's net, in drawing order: post, post, and the
 * back of the net behind each. The net is a quarter turn clockwise from `a`
 * to `b` as drawn — so behind a goal whose posts run down the screen it is
 * on the left — unless flipped, and it gets deeper as the goal gets wider,
 * between a mini goal's shallow box and a full goal's two metres.
 */
export function goalCorners(goal: { a: Vec; b: Vec; flipped?: boolean }): [Vec, Vec, Vec, Vec] {
  const { a, b } = goal
  const width = distance(a, b)
  const depth = Math.min(m(2), Math.max(m(1), width * 0.35))
  const ux = width === 0 ? 0 : (b.x - a.x) / width
  const uy = width === 0 ? 1 : (b.y - a.y) / width
  // A quarter turn clockwise on screen, where y points down.
  const side = goal.flipped ? -1 : 1
  const nx = -uy * side * depth
  const ny = ux * side * depth
  return [a, b, { x: b.x + nx, y: b.y + ny }, { x: a.x + nx, y: a.y + ny }]
}

/**
 * Posts for a goal dropped at `at`: upright, the default width apart, with
 * the net towards the nearer end of the pitch — the way a goal faces at
 * either end of a grid.
 */
export function goalPostsAt(at: Vec): { a: Vec; b: Vec } {
  const half = GOAL_DEFAULT_WIDTH / 2
  const top = { x: at.x, y: at.y - half }
  const bottom = { x: at.x, y: at.y + half }
  // Downwards, the net is on the left; upwards, on the right.
  return at.x <= PITCH_W / 2 ? { a: top, b: bottom } : { a: bottom, b: top }
}

/**
 * Where a dragged post ends up: under the pointer, unless that would make
 * the goal narrower or wider than a goal can be, in which case as near as
 * it can get along the same line from the other post.
 */
export function goalPostTo(fixed: Vec, wanted: Vec): Vec {
  const width = distance(fixed, wanted)
  const clamped = Math.min(GOAL_MAX_WIDTH, Math.max(GOAL_MIN_WIDTH, width))
  if (width === 0) return { x: fixed.x, y: fixed.y + clamped }
  const k = clamped / width
  return { x: fixed.x + (wanted.x - fixed.x) * k, y: fixed.y + (wanted.y - fixed.y) * k }
}
