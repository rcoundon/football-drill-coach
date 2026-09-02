import { describe, expect, it } from 'vitest'
import type { Ball, Counter, Frame, Marker, Vec } from '../src/types'
import { BALL_OFFSET, curveHandle } from '../src/geometry'
import {
  DEFAULT_FRAME_MS,
  GIF_FPS,
  GIF_TAIL_MS,
  ballPositionIn,
  durationOf,
  easeInOut,
  gifSchedule,
  interpolateFrames,
  lerp,
  pointOnCurve,
  runInto,
  timelineOf,
} from '../src/animation'

function counter(id: string, x: number, y: number): Counter {
  return { id, color: 'red', label: '', pos: { x, y } }
}

function marker(id: string, x: number, y: number): Marker {
  return { id, pos: { x, y } }
}

function ball(x: number, y: number, attachedTo: string | null = null, id = 'b1'): Ball {
  return { id, pos: { x, y }, attachedTo }
}

function frame(partial: Partial<Frame> = {}): Frame {
  return {
    counters: [],
    markers: [],
    labels: [],
    balls: [ball(50, 30)],
    drawings: [],
    ...partial,
  }
}

describe('lerp and easeInOut', () => {
  it('lerp hits both ends exactly', () => {
    expect(lerp(10, 20, 0)).toBe(10)
    expect(lerp(10, 20, 1)).toBe(20)
    expect(lerp(10, 20, 0.5)).toBe(15)
  })

  it('easeInOut is flat at both ends and even in the middle', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBe(0.5)
    // Slower than linear at the start, which is the whole point.
    expect(easeInOut(0.25)).toBeLessThan(0.25)
    expect(easeInOut(0.75)).toBeGreaterThan(0.75)
  })
})

describe('durationOf', () => {
  it('is zero for the first frame, because nothing moves into it', () => {
    expect(durationOf([frame(), frame()], 0)).toBe(0)
  })

  it('falls back to the default when a frame carries no duration', () => {
    expect(durationOf([frame(), frame()], 1)).toBe(DEFAULT_FRAME_MS)
  })

  it('uses the frame’s own duration when it has one', () => {
    expect(durationOf([frame(), frame({ duration: 400 })], 1)).toBe(400)
  })

  it('treats a non-positive duration as instant rather than dividing by it', () => {
    expect(durationOf([frame(), frame({ duration: 0 })], 1)).toBe(0)
    expect(durationOf([frame(), frame({ duration: -5 })], 1)).toBe(0)
  })
})

describe('timelineOf', () => {
  it('a single frame has no duration and always sits at its start', () => {
    const line = timelineOf([frame()])
    expect(line.total).toBe(0)
    expect(line.startOf(0)).toBe(0)
    expect(line.at(0)).toEqual({ index: 0, t: 0 })
    expect(line.at(5000)).toEqual({ index: 0, t: 0 })
  })

  it('totals the durations of every frame after the first', () => {
    const line = timelineOf([frame(), frame({ duration: 400 }), frame({ duration: 600 })])
    expect(line.total).toBe(1000)
    expect(line.startOf(0)).toBe(0)
    expect(line.startOf(1)).toBe(400)
    expect(line.startOf(2)).toBe(1000)
  })

  it('reports which segment a time falls in and how far through it is', () => {
    const line = timelineOf([frame(), frame({ duration: 400 }), frame({ duration: 600 })])
    expect(line.at(0)).toEqual({ index: 0, t: 0 })
    expect(line.at(200)).toEqual({ index: 0, t: 0.5 })
    expect(line.at(400)).toEqual({ index: 1, t: 0 })
    expect(line.at(700)).toEqual({ index: 1, t: 0.5 })
  })

  it('clamps outside the drill rather than running off either end', () => {
    const line = timelineOf([frame(), frame({ duration: 400 })])
    expect(line.at(-100)).toEqual({ index: 0, t: 0 })
    expect(line.at(9999)).toEqual({ index: 1, t: 0 })
  })

  it('steps straight over a zero-length segment', () => {
    const line = timelineOf([frame(), frame({ duration: 0 }), frame({ duration: 500 })])
    expect(line.startOf(1)).toBe(0)
    expect(line.at(0)).toEqual({ index: 1, t: 0 })
    expect(line.at(250)).toEqual({ index: 1, t: 0.5 })
  })

  it('survives an empty frame list rather than throwing', () => {
    const line = timelineOf([])
    expect(line.total).toBe(0)
    expect(line.at(100)).toEqual({ index: 0, t: 0 })
  })
})

describe('ballPositionIn', () => {
  it('is the ball’s own position when nobody is carrying it', () => {
    expect(ballPositionIn(frame({ balls: [ball(20, 30)] }), frame({ balls: [ball(20, 30)] }).balls[0])).toEqual({ x: 20, y: 30 })
  })

  it('is one offset from the holder when someone is', () => {
    const f = frame({ counters: [counter('c1', 40, 25)], balls: [ball(0, 0, 'c1')] })
    expect(ballPositionIn(f, f.balls[0])).toEqual({ x: 40 + BALL_OFFSET.x, y: 25 + BALL_OFFSET.y })
  })

  it('falls back to its own position when the holder is gone', () => {
    const f = frame({ balls: [ball(20, 30, 'missing')] })
    expect(ballPositionIn(f, f.balls[0])).toEqual({ x: 20, y: 30 })
  })
})

describe('interpolateFrames', () => {
  it('matches players by id and eases their positions', () => {
    const a = frame({ counters: [counter('c1', 0, 0), counter('c2', 100, 0)] })
    const b = frame({ counters: [counter('c2', 100, 40), counter('c1', 10, 0)] })
    const view = interpolateFrames(a, b, 0.5)
    expect(view.counters.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(view.counters[0].pos).toEqual({ x: 5, y: 0 })
    expect(view.counters[1].pos).toEqual({ x: 100, y: 20 })
  })

  it('holds a player that is missing from the target rather than throwing', () => {
    const a = frame({ counters: [counter('c1', 12, 34)] })
    const view = interpolateFrames(a, frame(), 0.5)
    expect(view.counters[0].pos).toEqual({ x: 12, y: 34 })
  })

  it('eases cones and labels the same way', () => {
    const a = frame({ markers: [marker('m1', 0, 0)] })
    const b = frame({ markers: [marker('m1', 20, 0)] })
    expect(interpolateFrames(a, b, 0.5).markers[0].pos).toEqual({ x: 10, y: 0 })
  })

  it('leaves the source frames untouched', () => {
    const a = frame({ counters: [counter('c1', 0, 0)] })
    const b = frame({ counters: [counter('c1', 20, 0)] })
    interpolateFrames(a, b, 0.5)
    expect(a.counters[0].pos).toEqual({ x: 0, y: 0 })
    expect(b.counters[0].pos).toEqual({ x: 20, y: 0 })
  })

  it('flies the ball linearly and lets go of it on the way', () => {
    const a = frame({ counters: [counter('c1', 0, 0), counter('c2', 40, 0)], balls: [ball(0, 0, 'c1')] })
    const b = frame({ counters: [counter('c1', 0, 0), counter('c2', 40, 0)], balls: [ball(0, 0, 'c2')] })
    const view = interpolateFrames(a, b, 0.25)
    expect(view.balls[0].attachedTo).toBeNull()
    // Linear, not eased: a struck ball does not accelerate.
    expect(view.balls[0].pos.x).toBeCloseTo(BALL_OFFSET.x + 10, 10)
  })

  it('keeps the source frame’s drawings for the whole move', () => {
    const drawing = { id: 'd1', kind: 'line', color: '#fff', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } } as const
    const a = frame({ drawings: [drawing] })
    expect(interpolateFrames(a, frame(), 0.9).drawings).toEqual([drawing])
  })
})

describe('gifSchedule', () => {
  /**
   * Derived from GIF_FPS rather than written out. These assertions were
   * hardcoded to 80ms, so raising the sample rate broke three tests that were
   * not about the rate at all — they were about reaching the end of the drill
   * and holding a whole hundredth.
   */
  const STEP = 1000 / GIF_FPS

  it('samples the whole drill at the given rate', () => {
    const samples = gifSchedule([frame(), frame({ duration: 1000 })], GIF_FPS)
    expect(samples[0].atMs).toBe(0)
    expect(samples[1].atMs).toBe(STEP)
    expect(samples.at(-1)!.atMs).toBe(1000)
  })

  it('samples often enough that movement does not judder', () => {
    // 25 a second. Below about 20 the middle of an eased move — where the most
    // ground is covered per sample — visibly steps rather than travels, which
    // is what a coach notices when a drill is shared.
    expect(GIF_FPS).toBeGreaterThanOrEqual(20)
  })

  it('holds on the last frame so the loop does not snap', () => {
    const samples = gifSchedule([frame(), frame({ duration: 1000 })], GIF_FPS)
    expect(samples.at(-1)!.delayMs).toBe(GIF_TAIL_MS)
  })

  it('gives every other sample the frame interval', () => {
    const samples = gifSchedule([frame(), frame({ duration: 1000 })], GIF_FPS)
    expect(samples[0].delayMs).toBe(STEP)
    expect(samples.at(-2)!.delayMs).toBe(STEP)
  })

  it('uses delays GIF can actually express, in whole hundredths', () => {
    const samples = gifSchedule([frame(), frame({ duration: 1000 })], GIF_FPS)
    for (const sample of samples) expect(sample.delayMs % 10).toBe(0)
  })

  it('never samples past the end of the drill', () => {
    const samples = gifSchedule([frame(), frame({ duration: 250 })], GIF_FPS)
    for (const sample of samples) expect(sample.atMs).toBeLessThanOrEqual(250)
  })

  it('a single frame is one still, held', () => {
    const samples = gifSchedule([frame()], GIF_FPS)
    expect(samples).toEqual([{ atMs: 0, delayMs: GIF_TAIL_MS }])
  })

  it('follows the durations rather than assuming they are equal', () => {
    const samples = gifSchedule([frame(), frame({ duration: 160 }), frame({ duration: 800 })], GIF_FPS)
    expect(samples.at(-1)!.atMs).toBe(960)
    expect(samples).toHaveLength(Math.floor(960 / STEP) + 1)
  })
})

describe('pointOnCurve', () => {
  const from = { x: 10, y: 10 }
  const to = { x: 30, y: 10 }

  it('is the plain lerp when there is no bend', () => {
    expect(pointOnCurve(from, to, 0, 0, 0.25)).toEqual({ x: 15, y: 10 })
    expect(pointOnCurve(from, to, 0, 0.2, 0.5)).toEqual({ x: 20, y: 10 })
  })

  it('returns the endpoints exactly', () => {
    expect(pointOnCurve(from, to, 6, 0.1, 0)).toEqual(from)
    expect(pointOnCurve(from, to, 6, 0.1, 1)).toEqual(to)
  })

  it('passes through the handle at the halfway point', () => {
    const handle = curveHandle(from, to, 6, 0.1)
    const mid = pointOnCurve(from, to, 6, 0.1, 0.5)
    expect(mid.x).toBeCloseTo(handle.x, 10)
    expect(mid.y).toBeCloseTo(handle.y, 10)
  })

  it('leaves the straight line when bent', () => {
    expect(pointOnCurve(from, to, 6, 0, 0.5).y).not.toBe(10)
  })

  it('holds still when the ends coincide', () => {
    expect(pointOnCurve(from, from, 6, 0.1, 0.5)).toEqual(from)
  })
})

/**
 * A struck ball travels at a constant speed and a running player does not, so
 * the two are deliberately given different curves. That is right while the
 * ball is in flight and wrong the moment a player is carrying it: a carried
 * ball has to move exactly as its carrier does, or it drifts off the boot
 * mid-stride and catches up again.
 */
describe('a ball being carried', () => {
  const carried = (from: Vec, to: Vec) => ({
    a: frame({ counters: [counter('c1', from.x, from.y)], balls: [ball(0, 0, 'c1')] }),
    b: frame({ counters: [counter('c1', to.x, to.y)], balls: [ball(0, 0, 'c1')] }),
  })

  it('stays on the carrier’s boot the whole way', () => {
    const { a, b } = carried({ x: 0, y: 0 }, { x: 40, y: 0 })
    // A quarter of the way through, where the eased and linear curves differ
    // most obviously. At the halfway point they agree, so a test there would
    // pass against a ball that drifts.
    const view = interpolateFrames(a, b, 0.25)
    const holder = view.counters[0]
    expect(view.balls[0].pos.x).toBeCloseTo(holder.pos.x + BALL_OFFSET.x, 10)
    expect(view.balls[0].pos.y).toBeCloseTo(holder.pos.y + BALL_OFFSET.y, 10)
  })

  it('is still in that player’s possession while they run', () => {
    const { a, b } = carried({ x: 0, y: 0 }, { x: 40, y: 0 })
    expect(interpolateFrames(a, b, 0.25).balls[0].attachedTo).toBe('c1')
  })

  it('is let go the moment the ball changes hands', () => {
    const a = frame({
      counters: [counter('c1', 0, 0), counter('c2', 40, 0)],
      balls: [ball(0, 0, 'c1')],
    })
    const b = frame({
      counters: [counter('c1', 0, 0), counter('c2', 40, 0)],
      balls: [ball(0, 0, 'c2')],
    })
    const view = interpolateFrames(a, b, 0.25)
    expect(view.balls[0].attachedTo).toBeNull()
    // And travels at its own constant speed, not the players'.
    expect(view.balls[0].pos.x).toBeCloseTo(BALL_OFFSET.x + 10, 10)
  })

  it('is let go when it is played into space', () => {
    const a = frame({ counters: [counter('c1', 0, 0)], balls: [ball(0, 0, 'c1')] })
    const b = frame({ counters: [counter('c1', 0, 0)], balls: [ball(60, 20)] })
    expect(interpolateFrames(a, b, 0.25).balls[0].attachedTo).toBeNull()
  })
})

/**
 * The whole change rests on matching a ball in one phase to the SAME ball in
 * the next, by id. Every fixture above happens to hold one ball in the same
 * slot in both frames, so matching by index would pass all of them — which
 * means the load-bearing decision was asserted by nothing. These two put the
 * balls in a different order, where index and id disagree.
 */
describe('balls are matched by id, not by where they sit in the list', () => {
  it('follows each ball to its own destination when the order differs', () => {
    const a = frame({ balls: [ball(0, 0, null, 'b1'), ball(100, 0, null, 'b2')] })
    const b = frame({ balls: [ball(100, 40, null, 'b2'), ball(0, 40, null, 'b1')] })

    const view = interpolateFrames(a, b, 0.5)
    const shown = Object.fromEntries(view.balls.map((x) => [x.id, x.pos]))

    // b1 travels 0,0 -> 0,40 and b2 travels 100,0 -> 100,40. Matching by
    // index would have them crossing the pitch instead.
    expect(shown.b1).toEqual({ x: 0, y: 20 })
    expect(shown.b2).toEqual({ x: 100, y: 20 })
  })

  it('follows the right carrier when two balls swap places in the list', () => {
    const counters = [counter('c1', 0, 0), counter('c2', 60, 0)]
    const a = frame({ counters, balls: [ball(0, 0, 'c1', 'b1'), ball(0, 0, 'c2', 'b2')] })
    const b = frame({
      counters: [counter('c1', 0, 50), counter('c2', 60, 50)],
      balls: [ball(0, 0, 'c2', 'b2'), ball(0, 0, 'c1', 'b1')],
    })

    const view = interpolateFrames(a, b, 0.25)
    const held = Object.fromEntries(view.balls.map((x) => [x.id, x.attachedTo]))
    expect(held.b1).toBe('c1')
    expect(held.b2).toBe('c2')
  })
})

describe('a curved run in playback', () => {
  it('leaves the straight line between the two phases', () => {
    const a = frame({ counters: [counter('c1', 10, 10)], balls: [] })
    const b = frame({ counters: [{ ...counter('c1', 30, 10), bend: 6 }], balls: [] })
    const view = interpolateFrames(a, b, 0.5)
    expect(view.counters[0].pos.y).not.toBeCloseTo(10, 6)
  })

  it('reads the bend off the phase being moved into, not the one being left', () => {
    const a = frame({ counters: [{ ...counter('c1', 10, 10), bend: 6 }], balls: [] })
    const b = frame({ counters: [counter('c1', 30, 10)], balls: [] })
    const view = interpolateFrames(a, b, 0.5)
    expect(view.counters[0].pos.y).toBeCloseTo(10, 10)
  })

  it('still arrives exactly where the phase says', () => {
    const a = frame({ counters: [counter('c1', 10, 10)], balls: [] })
    const b = frame({ counters: [{ ...counter('c1', 30, 10), bend: 6 }], balls: [] })
    expect(interpolateFrames(a, b, 1).counters[0].pos).toEqual({ x: 30, y: 10 })
  })

  it('does not bend a cone', () => {
    const a = frame({ counters: [], markers: [marker('m1', 10, 10)], balls: [] })
    const b = frame({
      counters: [],
      markers: [{ ...marker('m1', 30, 10), bend: 6 } as unknown as Marker],
      balls: [],
    })
    expect(interpolateFrames(a, b, 0.5).markers[0].pos.y).toBeCloseTo(10, 10)
  })

  it('carries a held ball around the curve with its carrier', () => {
    const a = frame({ counters: [counter('c1', 10, 10)], balls: [ball(10, 10, 'c1')] })
    const b = frame({
      counters: [{ ...counter('c1', 30, 10), bend: 6 }],
      balls: [ball(30, 10, 'c1')],
    })
    const view = interpolateFrames(a, b, 0.5)
    expect(view.balls[0].pos.x).toBeCloseTo(view.counters[0].pos.x + BALL_OFFSET.x, 10)
    expect(view.balls[0].pos.y).toBeCloseTo(view.counters[0].pos.y + BALL_OFFSET.y, 10)
  })

  it('does not bend a ball in flight', () => {
    const a = frame({ counters: [counter('c1', 10, 10)], balls: [ball(10, 10, null)] })
    const b = frame({
      counters: [{ ...counter('c1', 30, 10), bend: 6 }],
      balls: [ball(30, 10, null)],
    })
    expect(interpolateFrames(a, b, 0.5).balls[0].pos.y).toBeCloseTo(10, 10)
  })

  it('holds a player with no counterpart in the next phase', () => {
    const a = frame({ counters: [counter('c1', 10, 10)], balls: [] })
    const b = frame({ counters: [], balls: [] })
    expect(interpolateFrames(a, b, 0.5).counters[0].pos).toEqual({ x: 10, y: 10 })
  })
})

describe('runInto', () => {
  it('is null before the first phase', () => {
    const frames = [frame({ counters: [counter('c1', 10, 10)] })]
    expect(runInto(frames, 0, 'c1')).toBeNull()
  })

  it('is null for a player absent from either phase', () => {
    const frames = [
      frame({ counters: [counter('c1', 10, 10)] }),
      frame({ counters: [counter('c1', 30, 10)] }),
    ]
    expect(runInto(frames, 1, 'ghost')).toBeNull()
  })

  it('is null for a player who did not move', () => {
    const frames = [
      frame({ counters: [counter('c1', 10, 10)] }),
      frame({ counters: [counter('c1', 10, 10)] }),
    ]
    expect(runInto(frames, 1, 'c1')).toBeNull()
  })

  it('returns the run into the phase, with the bend read off the arriving frame', () => {
    const frames = [
      frame({ counters: [counter('c1', 10, 10)] }),
      frame({ counters: [{ ...counter('c1', 30, 10), bend: 6, bendAlong: 0.25 }] }),
    ]
    expect(runInto(frames, 1, 'c1')).toEqual({
      from: { x: 10, y: 10 },
      to: { x: 30, y: 10 },
      bend: 6,
      bendAlong: 0.25,
    })
  })
})
