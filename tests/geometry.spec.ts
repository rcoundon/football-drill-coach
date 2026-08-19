import { describe, it, expect } from 'vitest'
import {
  PITCH_W,
  PITCH_H,
  COUNTER_COLORS,
  viewBoxOf,
  toView,
  fromView,
  clientToPitch,
  clampToPitch,
  distance,
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
    expect([...COUNTER_COLORS]).toEqual(['red', 'blue', 'yellow', 'purple', 'black'])
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

describe('clientToPitch', () => {
  // An 800x600 element. The 100 x 64.76 view box fits by WIDTH:
  // scale = 800/100 = 8, rendered height = 64.76*8 = 518.1, so there is
  // (600 - 518.1)/2 = 40.95 of letterboxing above and below.
  const rect = { left: 0, top: 0, width: 800, height: 600 }

  it('maps the centre of the element to the centre of the pitch', () => {
    const p = clientToPitch(rect, 400, 300, false)
    expect(p.x).toBeCloseTo(PITCH_W / 2, 6)
    expect(p.y).toBeCloseTo(PITCH_H / 2, 6)
  })

  it('maps the top-left of the rendered pitch to the pitch origin', () => {
    const letterbox = (600 - PITCH_H * 8) / 2
    const p = clientToPitch(rect, 0, letterbox, false)
    expect(p.x).toBeCloseTo(0, 6)
    expect(p.y).toBeCloseTo(0, 6)
  })

  it('accounts for the element being offset in the page', () => {
    const offset = { left: 120, top: 45, width: 800, height: 600 }
    const p = clientToPitch(offset, 120 + 400, 45 + 300, false)
    expect(p.x).toBeCloseTo(PITCH_W / 2, 6)
    expect(p.y).toBeCloseTo(PITCH_H / 2, 6)
  })

  it('maps the centre correctly when rotated', () => {
    const p = clientToPitch({ left: 0, top: 0, width: 600, height: 800 }, 300, 400, true)
    expect(p.x).toBeCloseTo(PITCH_W / 2, 6)
    expect(p.y).toBeCloseTo(PITCH_H / 2, 6)
  })

  it('puts the pitch origin at the top-RIGHT of a rotated board', () => {
    // Rotated view box is 64.76 wide x 100 tall in a 600x800 box:
    // scale = min(600/64.76, 800/100) = min(9.265, 8) = 8.
    const scale = 8
    const renderedW = PITCH_H * scale
    const offX = (600 - renderedW) / 2
    const p = clientToPitch({ left: 0, top: 0, width: 600, height: 800 }, offX + renderedW, 0, true)
    expect(p.x).toBeCloseTo(0, 6)
    expect(p.y).toBeCloseTo(0, 6)
  })

  it('round-trips an arbitrary pitch position back to itself', () => {
    const original = { x: 73.5, y: 12.25 }
    const view = toView(original, false)
    const scale = 8
    const offY = (600 - PITCH_H * scale) / 2
    const p = clientToPitch(rect, view.x * scale, offY + view.y * scale, false)
    expect(p.x).toBeCloseTo(original.x, 6)
    expect(p.y).toBeCloseTo(original.y, 6)
  })
})

describe('clampToPitch', () => {
  it('leaves an in-bounds point alone', () => {
    expect(clampToPitch({ x: 50, y: 30 })).toEqual({ x: 50, y: 30 })
  })

  it('pulls an out-of-bounds point back onto the pitch', () => {
    expect(clampToPitch({ x: -20, y: 999 })).toEqual({ x: 0, y: PITCH_H })
  })
})

describe('distance', () => {
  it('measures a 3-4-5 triangle', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 10)
  })
})

import { snapToAxis, SNAP_ANGLE_DEG } from '../src/geometry'

describe('snapToAxis', () => {
  const from = { x: 20, y: 30 }

  it('leaves a clearly diagonal segment alone', () => {
    const to = { x: 60, y: 60 }
    expect(snapToAxis(from, to)).toEqual(to)
  })

  it('flattens a nearly-horizontal segment onto the horizontal', () => {
    // 1 unit of rise over 40 of run is about 1.4 degrees.
    const snapped = snapToAxis(from, { x: 60, y: 31 })
    expect(snapped).toEqual({ x: 60, y: 30 })
  })

  it('straightens a nearly-vertical segment onto the vertical', () => {
    const snapped = snapToAxis(from, { x: 21, y: 60 })
    expect(snapped).toEqual({ x: 20, y: 60 })
  })

  it('snaps when the segment points back and up, not only forward', () => {
    expect(snapToAxis(from, { x: -20, y: 29.5 })).toEqual({ x: -20, y: 30 })
    expect(snapToAxis(from, { x: 20.5, y: 5 })).toEqual({ x: 20, y: 5 })
  })

  it('preserves the segment length along the axis it snaps to', () => {
    const snapped = snapToAxis(from, { x: 75, y: 31 })
    expect(snapped.x).toBe(75)
  })

  it('does not snap just outside the tolerance', () => {
    // Just over the threshold angle from horizontal.
    const run = 40
    const rise = Math.tan(((SNAP_ANGLE_DEG + 0.5) * Math.PI) / 180) * run
    const to = { x: from.x + run, y: from.y + rise }
    expect(snapToAxis(from, to)).toEqual(to)
  })

  it('snaps just inside the tolerance', () => {
    const run = 40
    const rise = Math.tan(((SNAP_ANGLE_DEG - 0.5) * Math.PI) / 180) * run
    const snapped = snapToAxis(from, { x: from.x + run, y: from.y + rise })
    expect(snapped.y).toBe(from.y)
  })

  it('leaves a zero-length segment alone rather than dividing by zero', () => {
    expect(snapToAxis(from, { ...from })).toEqual(from)
  })
})
