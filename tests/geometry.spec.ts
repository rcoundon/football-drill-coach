import { describe, it, expect } from 'vitest'
import {
  PITCH_W,
  PITCH_H,
  COUNTER_COLORS,
  viewBoxOf,
  toView,
  fromView,
} from '../src/geometry'

describe('pitch dimensions', () => {
  it('is 100 units wide', () => {
    expect(PITCH_W).toBe(100)
  })

  it('preserves the 105x68 pitch aspect ratio at uniform scale', () => {
    expect(PITCH_H).toBeCloseTo(68 * (100 / 105), 2)
  })
})

describe('COUNTER_COLORS', () => {
  it('has exactly five colours', () => {
    expect(COUNTER_COLORS).toHaveLength(5)
  })

  it('contains the agreed colours', () => {
    expect([...COUNTER_COLORS]).toEqual(['red', 'blue', 'yellow', 'green', 'black'])
  })
})

describe('viewBoxOf', () => {
  it('is landscape when not rotated', () => {
    expect(viewBoxOf(false)).toBe(`0 0 ${PITCH_W} ${PITCH_H}`)
  })

  it('swaps the axes when rotated', () => {
    expect(viewBoxOf(true)).toBe(`0 0 ${PITCH_H} ${PITCH_W}`)
  })
})

describe('toView / fromView', () => {
  it('is the identity when not rotated', () => {
    const p = { x: 12, y: 34 }
    expect(toView(p, false)).toEqual(p)
    expect(fromView(p, false)).toEqual(p)
  })

  it('maps the pitch corners into the rotated view box', () => {
    // Top-left of the pitch lands at the top-right of a rotated board.
    expect(toView({ x: 0, y: 0 }, true)).toEqual({ x: PITCH_H, y: 0 })
    expect(toView({ x: PITCH_W, y: PITCH_H }, true)).toEqual({ x: 0, y: PITCH_W })
  })

  it('round-trips through the rotation', () => {
    const p = { x: 17, y: 41 }
    const back = fromView(toView(p, true), true)
    expect(back.x).toBeCloseTo(p.x, 10)
    expect(back.y).toBeCloseTo(p.y, 10)
  })
})
