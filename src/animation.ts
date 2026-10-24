/**
 * Tween maths for playing a drill back.
 *
 * Pure, like geometry.ts, and for the same reason: it is the part worth
 * testing exhaustively, and nothing here should need a DOM or a component to
 * exercise it.
 */
import type { Ball, Counter, Drawing, Frame, Label, Marker, Vec } from './types'
import { BALL_OFFSET, curveControlPoint } from './geometry'

/** How long the move into a frame takes when the frame does not say. */
export const DEFAULT_FRAME_MS = 1000

/** Short enough to be a flick, long enough to be seen. */
export const MIN_FRAME_MS = 100

/** Longer than this is a pause, and a pause wants a hold. */
export const MAX_FRAME_MS = 10_000

/** The longest a phase can be held before the next move starts. */
export const MAX_HOLD_MS = 10_000

/**
 * A label as drawn. `opacity` is set only mid-move, on a label that is on
 * one side of the move and not the other.
 */
export type LabelView = Label & { opacity?: number }

/** What the board renders: a frame, or a blend of two. */
export type FrameView = {
  counters: Counter[]
  markers: Marker[]
  labels: LabelView[]
  balls: Ball[]
  drawings: Drawing[]
}

export type Timeline = {
  /** Milliseconds from the start of the drill to the end of the last frame's hold. */
  total: number
  /** When a frame is reached, in milliseconds from the start. */
  startOf(index: number): number
  /**
   * Which move a time falls in, and how far through it is. A time inside a
   * hold is parked on that frame: `t` is 0 until the next move begins.
   */
  at(ms: number): { index: number; t: number }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Smoothstep: flat at both ends, so a player accelerates away and settles. */
export function easeInOut(t: number): number {
  return t * t * (3 - 2 * t)
}

function lerpVec(a: Vec, b: Vec, t: number): Vec {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
}

/**
 * Where a curved move has reached at `t`.
 *
 * The quadratic whose control point `curveControlPoint` gives, so the path a
 * player travels is the same curve the trail draws — one set of maths, and a
 * bend that means the same thing on a run as it does on an arrow.
 *
 * A straight move takes the plain lerp rather than a Bezier with a control
 * point on the chord: the same answer, without the floating-point noise that
 * would make a straight run wander by a millionth of a unit.
 */
export function pointOnCurve(
  from: Vec,
  to: Vec,
  bend: number,
  bendAlong: number,
  t: number,
): Vec {
  if (bend === 0) return lerpVec(from, to, t)
  const control = curveControlPoint(from, to, bend, bendAlong)
  const u = 1 - t
  return {
    x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
  }
}

/**
 * How long the move into `index` takes.
 *
 * Zero for the first frame, because nothing moves into the start of a drill,
 * and zero for a non-positive duration, so a hand-edited file cannot make the
 * timeline divide by it.
 */
export function durationOf(frames: Frame[], index: number): number {
  if (index <= 0) return 0
  const raw = frames[index]?.duration ?? DEFAULT_FRAME_MS
  return raw > 0 ? raw : 0
}

/**
 * How long the board rests on `index` once it has arrived, before the move
 * out of it begins.
 *
 * Unlike a duration, every frame can have one — the first holds the set-up
 * before anything moves, the last holds the final shape before the drill
 * ends. Zero for anything that is not a positive number, for the same reason
 * `durationOf` is.
 */
export function holdOf(frames: Frame[], index: number): number {
  const raw = frames[index]?.hold ?? 0
  return raw > 0 ? raw : 0
}

export function timelineOf(frames: Frame[]): Timeline {
  // When each frame is reached, and when the board leaves it again once its
  // hold is over. The two are equal for a frame with no hold.
  const arrives: number[] = [0]
  const leaves: number[] = [holdOf(frames, 0)]
  for (let i = 1; i < frames.length; i++) {
    arrives.push(leaves[i - 1] + durationOf(frames, i))
    leaves.push(arrives[i] + holdOf(frames, i))
  }

  const last = Math.max(0, frames.length - 1)
  const total = leaves[last] ?? 0

  return {
    total,
    startOf(index) {
      return arrives[Math.max(0, Math.min(index, last))] ?? 0
    },
    at(ms) {
      // `ms > 0 ? ms : 0` so NaN and negative times clamp to the start
      // instead of skipping the loop below outright — a leading zero-length
      // segment still needs that loop to step the clamped time past it.
      const clamped = ms > 0 ? ms : 0
      if (clamped >= total) return { index: last, t: 0 }
      for (let i = 0; i < last; i++) {
        if (clamped < leaves[i]) return { index: i, t: 0 }
        const span = arrives[i + 1] - leaves[i]
        if (span <= 0) continue
        if (clamped < arrives[i + 1]) return { index: i, t: (clamped - leaves[i]) / span }
      }
      return { index: last, t: 0 }
    },
  }
}

/**
 * The run a held player made to reach this phase: where they were, where
 * they ended up, and the bend that phase already carries.
 *
 * Pure and shared rather than folded into the board, because the Inspector
 * needs to answer the same question — is there a run here, and what does it
 * look like — and the two must never disagree about it.
 */
export function runInto(
  frames: Frame[],
  index: number,
  counterId: string,
): { from: Vec; to: Vec; bend: number; bendAlong: number } | null {
  if (index < 1) return null
  const was = frames[index - 1]?.counters.find((c) => c.id === counterId)
  const now = frames[index]?.counters.find((c) => c.id === counterId)
  if (!was || !now) return null
  if (was.pos.x === now.pos.x && was.pos.y === now.pos.y) return null
  return { from: was.pos, to: now.pos, bend: now.bend ?? 0, bendAlong: now.bendAlong ?? 0 }
}

/** Where the ball is actually drawn in a frame, carried or not. */
export function ballPositionIn(frame: FrameView, ball: Ball): Vec {
  if (ball.attachedTo) {
    const holder = frame.counters.find((c) => c.id === ball.attachedTo)
    if (holder) return { x: holder.pos.x + BALL_OFFSET.x, y: holder.pos.y + BALL_OFFSET.y }
  }
  return ball.pos
}

/**
 * Match by id and move towards the target.
 *
 * The cast is drill-wide, so every id in `from` is in `to`. One that is not —
 * a hand-edited file — holds its position rather than throwing.
 */
function tweenAll<T extends { id: string; pos: Vec }>(from: T[], to: T[], e: number): T[] {
  return from.map((item) => {
    const target = to.find((other) => other.id === item.id)?.pos ?? item.pos
    return { ...item, pos: lerpVec(item.pos, target, e) }
  })
}

/**
 * Labels belong to their phase, so unlike the cast they come and go. One on
 * both sides of the move glides like a cone; one only on the phase being
 * left fades out where it stands, and one only on the phase arrived at
 * fades in where it will stand.
 */
function tweenLabels(from: Label[], to: Label[], e: number): LabelView[] {
  const staying = tweenAll(
    from.filter((label) => to.some((other) => other.id === label.id)),
    to,
    e,
  )
  const leaving = from
    .filter((label) => !to.some((other) => other.id === label.id))
    .map((label) => ({ ...label, opacity: 1 - e }))
  const arriving = to
    .filter((label) => !from.some((other) => other.id === label.id))
    .map((label) => ({ ...label, opacity: e }))
  return [...staying, ...leaving, ...arriving]
}

/**
 * Move each player towards where the next phase puts them, along the curve
 * that phase asks for.
 *
 * The bend is read off the TARGET, because it describes the move into that
 * frame — the same leg its `duration` times. A player with no counterpart in
 * the target holds position, the insurance `tweenAll` gives everything else.
 *
 * Separate from `tweenAll` rather than a widening of it: cones and labels
 * share that function and do not run, so there is no curve for them to take.
 */
function tweenCounters(from: Counter[], to: Counter[], e: number): Counter[] {
  return from.map((item) => {
    const target = to.find((other) => other.id === item.id)
    if (!target) return { ...item }
    return {
      ...item,
      pos: pointOnCurve(item.pos, target.pos, target.bend ?? 0, target.bendAlong ?? 0, e),
    }
  })
}

/**
 * How often the exported animation is sampled.
 *
 * 25 a second is 40ms, and GIF expresses delays in hundredths of a second, so
 * this lands on a whole one.
 *
 * It was half this to begin with, on the theory that a long drill would
 * otherwise run to hundreds of frames. Measuring killed that: a two-second
 * drill exported at 14KB, so size was never the constraint, while 80ms
 * between samples was visibly jumpy — worst in the middle of a move, which is
 * exactly where the easing covers the most ground per frame and where a coach
 * is looking. Doubling the rate halves that jump and costs kilobytes.
 */
export const GIF_FPS = 25

/** A beat on the last frame, so the loop does not snap back. */
export const GIF_TAIL_MS = 500

export type GifSample = { atMs: number; delayMs: number }

/**
 * The shortest delay a GIF frame can safely ask for. Browsers treat anything
 * below two hundredths as a mistake and slow it to a tenth of a second.
 */
const GIF_MIN_DELAY_MS = 20

/** Rounded to a whole hundredth, GIF's unit, and never below what browsers honour. */
function gifDelay(ms: number): number {
  return Math.max(GIF_MIN_DELAY_MS, Math.round(ms / 10) * 10)
}

/**
 * When to sample the board, and how long each sample is held.
 *
 * Moves are sampled at the frame rate. A hold is one sample, held for as long
 * as the hold lasts: the board is not changing, so sampling it twenty-five
 * times a second would only add identical frames to the file. The last
 * frame's hold is added to the tail rather than being a sample of its own.
 *
 * Each sample is given the moment it should end on the drill's own timeline,
 * and its delay is whatever takes the GIF from where it has got to so far
 * to that moment. A delay cannot be what was asked for exactly — it is
 * rounded to a hundredth, and never under 20ms — so working from the time
 * already encoded lets the next sample make up the difference, rather than
 * every short hold adding its rounding to everything after it.
 *
 * Pure and separate from the rasterising, which is the half that cannot be
 * tested here: jsdom has no canvas.
 */
export function gifSchedule(frames: Frame[], fps = GIF_FPS): GifSample[] {
  // Rounded to a whole hundredth, because that is GIF's unit; anything else
  // is silently rounded by the encoder and the animation drifts.
  const step = Math.max(10, Math.round(1000 / fps / 10) * 10)
  const line = timelineOf(frames)
  const last = Math.max(0, frames.length - 1)

  const samples: GifSample[] = []
  let encoded = 0
  const sample = (atMs: number, until: number) => {
    const delayMs = gifDelay(until - encoded)
    samples.push({ atMs, delayMs })
    encoded += delayMs
  }

  for (let i = 0; i < last; i++) {
    const hold = holdOf(frames, i)
    const leave = line.startOf(i) + hold
    if (hold > 0) sample(line.startOf(i), leave)
    const arrive = line.startOf(i + 1)
    // The last sample of a move is cut to what is left of it, so a move that
    // is not a whole number of steps does not overrun into the next phase.
    for (let at = leave; at < arrive; at += step) sample(at, Math.min(at + step, arrive))
  }
  sample(line.total, line.total + GIF_TAIL_MS)
  return samples
}

/**
 * Blend two frames.
 *
 * Bodies are eased and the ball is not: a player accelerates away and
 * decelerates into position, a struck ball does neither. The ball is also
 * detached for the whole move, which is what makes a pass render as a ball
 * travelling from one player to another rather than sitting on the passer's
 * boot and teleporting on arrival.
 *
 * Drawings are the source frame's throughout, so the arrow describing a pass
 * is on screen while the pass happens and gone once it has.
 */
export function interpolateFrames(a: Frame, b: Frame, t: number): FrameView {
  const e = easeInOut(t)
  const counters = tweenCounters(a.counters, b.counters, e)

  /*
   * Per ball, matched by id, exactly as the players are.
   *
   * The same player holding a ball at both ends of the move is carrying it,
   * not striking it. A carried ball has to move exactly as its carrier does —
   * so it keeps its possession and takes its position from the player, who has
   * already been eased. Giving it its own curve drifted it off the boot
   * mid-stride and let it catch up again by the end.
   *
   * Anything else is a ball in flight: played to someone else, or into space,
   * or picked up out of it. Then it is let go of and travels at the one
   * constant speed a struck ball has.
   *
   * A ball with no counterpart in the target frame holds where it is, the same
   * insurance `tweenAll` gives a player — the cast is drill-wide, so it should
   * not happen outside a hand-edited file.
   */
  const balls = a.balls.map((ball) => {
    const target = b.balls.find((other) => other.id === ball.id)
    const carrier = ball.attachedTo
    const carried = carrier !== null && target !== undefined && carrier === target.attachedTo
    const holder = carried ? counters.find((c) => c.id === carrier) : undefined
    if (holder) {
      return {
        id: ball.id,
        pos: { x: holder.pos.x + BALL_OFFSET.x, y: holder.pos.y + BALL_OFFSET.y },
        attachedTo: holder.id,
      }
    }
    const from = ballPositionIn(a, ball)
    const to = target ? ballPositionIn(b, target) : from
    return { id: ball.id, pos: lerpVec(from, to, t), attachedTo: null }
  })

  return {
    counters,
    markers: tweenAll(a.markers, b.markers, e),
    labels: tweenLabels(a.labels, b.labels, e),
    balls,
    drawings: a.drawings,
  }
}
