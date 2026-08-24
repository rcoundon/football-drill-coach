/**
 * Tween maths for playing a drill back.
 *
 * Pure, like geometry.ts, and for the same reason: it is the part worth
 * testing exhaustively, and nothing here should need a DOM or a component to
 * exercise it.
 */
import type { Ball, Counter, Drawing, Frame, Label, Marker, Vec } from './types'
import { BALL_OFFSET } from './geometry'

/** How long the move into a frame takes when the frame does not say. */
export const DEFAULT_FRAME_MS = 1000

/** Short enough to be a flick, long enough to be seen. */
export const MIN_FRAME_MS = 100

/** Longer than this is a pause, and a pause wants its own frame. */
export const MAX_FRAME_MS = 10_000

/** What the board renders: a frame, or a blend of two. */
export type FrameView = {
  counters: Counter[]
  markers: Marker[]
  labels: Label[]
  ball: Ball
  drawings: Drawing[]
}

export type Timeline = {
  /** Milliseconds from the start of the drill to the last frame. */
  total: number
  /** When a frame is reached, in milliseconds from the start. */
  startOf(index: number): number
  /** Which move a time falls in, and how far through it is. */
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

export function timelineOf(frames: Frame[]): Timeline {
  const starts: number[] = [0]
  for (let i = 1; i < frames.length; i++) starts.push(starts[i - 1] + durationOf(frames, i))

  const last = Math.max(0, frames.length - 1)
  const total = starts[last] ?? 0

  return {
    total,
    startOf(index) {
      return starts[Math.max(0, Math.min(index, last))] ?? 0
    },
    at(ms) {
      // `ms > 0 ? ms : 0` so NaN and negative times clamp to the start
      // instead of skipping the loop below outright — a leading zero-length
      // segment still needs that loop to step the clamped time past it.
      const clamped = ms > 0 ? ms : 0
      if (clamped >= total) return { index: last, t: 0 }
      for (let i = 0; i < last; i++) {
        const span = starts[i + 1] - starts[i]
        if (span <= 0) continue
        if (clamped < starts[i + 1]) return { index: i, t: (clamped - starts[i]) / span }
      }
      return { index: last, t: 0 }
    },
  }
}

/** Where the ball is actually drawn in a frame, carried or not. */
export function ballPositionIn(frame: FrameView): Vec {
  if (frame.ball.attachedTo) {
    const holder = frame.counters.find((c) => c.id === frame.ball.attachedTo)
    if (holder) return { x: holder.pos.x + BALL_OFFSET.x, y: holder.pos.y + BALL_OFFSET.y }
  }
  return frame.ball.pos
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
 * How often the exported animation is sampled.
 *
 * 12.5 a second is 80ms, and GIF expresses delays in hundredths of a second,
 * so this lands on a whole one. Fast enough to read as movement, slow enough
 * that a ten-second drill is not hundreds of frames.
 */
export const GIF_FPS = 12.5

/** A beat on the last frame, so the loop does not snap back. */
export const GIF_TAIL_MS = 500

export type GifSample = { atMs: number; delayMs: number }

/**
 * When to sample the board, and how long each sample is held.
 *
 * Pure and separate from the rasterising, which is the half that cannot be
 * tested here: jsdom has no canvas.
 */
export function gifSchedule(frames: Frame[], fps = GIF_FPS): GifSample[] {
  // Rounded to a whole hundredth, because that is GIF's unit; anything else
  // is silently rounded by the encoder and the animation drifts.
  const step = Math.max(10, Math.round(1000 / fps / 10) * 10)
  const total = timelineOf(frames).total

  const samples: GifSample[] = []
  for (let at = 0; at < total; at += step) samples.push({ atMs: at, delayMs: step })
  samples.push({ atMs: total, delayMs: GIF_TAIL_MS })
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
  const counters = tweenAll(a.counters, b.counters, e)

  /*
   * The same player holding the ball at both ends of the move is carrying it,
   * not striking it. A carried ball has to move exactly as its carrier does —
   * so it keeps its possession and takes its position from the player, who has
   * already been eased. Giving it its own curve drifted it off the boot
   * mid-stride and let it catch up again by the end.
   *
   * Anything else is a ball in flight: played to someone else, or into space,
   * or picked up out of it. Then it is let go of and travels at the one
   * constant speed a struck ball has.
   */
  const carrier = a.ball.attachedTo
  const carried = carrier !== null && carrier === b.ball.attachedTo
  const holder = carried ? counters.find((c) => c.id === carrier) : undefined

  return {
    counters,
    markers: tweenAll(a.markers, b.markers, e),
    labels: tweenAll(a.labels, b.labels, e),
    ball: holder
      ? {
          pos: { x: holder.pos.x + BALL_OFFSET.x, y: holder.pos.y + BALL_OFFSET.y },
          attachedTo: holder.id,
          visible: a.ball.visible,
        }
      : {
          pos: lerpVec(ballPositionIn(a), ballPositionIn(b), t),
          attachedTo: null,
          visible: a.ball.visible,
        },
    drawings: a.drawings,
  }
}
