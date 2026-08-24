import { describe, expect, it } from 'vitest'
import type { Ball, Counter, Frame, Marker, Vec } from '../src/types'
import { BALL_OFFSET } from '../src/geometry'
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
  timelineOf,
} from '../src/animation'

function counter(id: string, x: number, y: number): Counter {
  return { id, color: 'red', label: '', pos: { x, y } }
}

function marker(id: string, x: number, y: number): Marker {
  return { id, pos: { x, y } }
}

function ball(x: number, y: number, attachedTo: string | null = null): Ball {
  return { pos: { x, y }, attachedTo, visible: true }
}

function frame(partial: Partial<Frame> = {}): Frame {
  return {
    counters: [],
    markers: [],
    labels: [],
    ball: ball(50, 30),
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
    expect(ballPositionIn(frame({ ball: ball(20, 30) }))).toEqual({ x: 20, y: 30 })
  })

  it('is one offset from the holder when someone is', () => {
    const f = frame({ counters: [counter('c1', 40, 25)], ball: ball(0, 0, 'c1') })
    expect(ballPositionIn(f)).toEqual({ x: 40 + BALL_OFFSET.x, y: 25 + BALL_OFFSET.y })
  })

  it('falls back to its own position when the holder is gone', () => {
    expect(ballPositionIn(frame({ ball: ball(20, 30, 'missing') }))).toEqual({ x: 20, y: 30 })
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
    const a = frame({ counters: [counter('c1', 0, 0), counter('c2', 40, 0)], ball: ball(0, 0, 'c1') })
    const b = frame({ counters: [counter('c1', 0, 0), counter('c2', 40, 0)], ball: ball(0, 0, 'c2') })
    const view = interpolateFrames(a, b, 0.25)
    expect(view.ball.attachedTo).toBeNull()
    // Linear, not eased: a struck ball does not accelerate.
    expect(view.ball.pos.x).toBeCloseTo(BALL_OFFSET.x + 10, 10)
  })

  it('keeps the source frame’s drawings for the whole move', () => {
    const drawing = { id: 'd1', kind: 'line', color: '#fff', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } } as const
    const a = frame({ drawings: [drawing] })
    expect(interpolateFrames(a, frame(), 0.9).drawings).toEqual([drawing])
  })
})

describe('gifSchedule', () => {
  it('samples the whole drill at the given rate', () => {
    // 1000ms at 12.5fps is 80ms a sample: 0, 80, ... 960, then the last frame.
    const samples = gifSchedule([frame(), frame({ duration: 1000 })], GIF_FPS)
    expect(samples[0].atMs).toBe(0)
    expect(samples[1].atMs).toBe(80)
    expect(samples.at(-1)!.atMs).toBe(1000)
  })

  it('holds on the last frame so the loop does not snap', () => {
    const samples = gifSchedule([frame(), frame({ duration: 1000 })], GIF_FPS)
    expect(samples.at(-1)!.delayMs).toBe(GIF_TAIL_MS)
  })

  it('gives every other sample the frame interval', () => {
    const samples = gifSchedule([frame(), frame({ duration: 1000 })], GIF_FPS)
    expect(samples[0].delayMs).toBe(80)
    expect(samples.at(-2)!.delayMs).toBe(80)
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
    expect(samples).toHaveLength(Math.floor(960 / 80) + 1)
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
    a: frame({ counters: [counter('c1', from.x, from.y)], ball: ball(0, 0, 'c1') }),
    b: frame({ counters: [counter('c1', to.x, to.y)], ball: ball(0, 0, 'c1') }),
  })

  it('stays on the carrier’s boot the whole way', () => {
    const { a, b } = carried({ x: 0, y: 0 }, { x: 40, y: 0 })
    // A quarter of the way through, where the eased and linear curves differ
    // most obviously. At the halfway point they agree, so a test there would
    // pass against a ball that drifts.
    const view = interpolateFrames(a, b, 0.25)
    const holder = view.counters[0]
    expect(view.ball.pos.x).toBeCloseTo(holder.pos.x + BALL_OFFSET.x, 10)
    expect(view.ball.pos.y).toBeCloseTo(holder.pos.y + BALL_OFFSET.y, 10)
  })

  it('is still in that player’s possession while they run', () => {
    const { a, b } = carried({ x: 0, y: 0 }, { x: 40, y: 0 })
    expect(interpolateFrames(a, b, 0.25).ball.attachedTo).toBe('c1')
  })

  it('is let go the moment the ball changes hands', () => {
    const a = frame({
      counters: [counter('c1', 0, 0), counter('c2', 40, 0)],
      ball: ball(0, 0, 'c1'),
    })
    const b = frame({
      counters: [counter('c1', 0, 0), counter('c2', 40, 0)],
      ball: ball(0, 0, 'c2'),
    })
    const view = interpolateFrames(a, b, 0.25)
    expect(view.ball.attachedTo).toBeNull()
    // And travels at its own constant speed, not the players'.
    expect(view.ball.pos.x).toBeCloseTo(BALL_OFFSET.x + 10, 10)
  })

  it('is let go when it is played into space', () => {
    const a = frame({ counters: [counter('c1', 0, 0)], ball: ball(0, 0, 'c1') })
    const b = frame({ counters: [counter('c1', 0, 0)], ball: ball(60, 20) })
    expect(interpolateFrames(a, b, 0.25).ball.attachedTo).toBeNull()
  })
})
