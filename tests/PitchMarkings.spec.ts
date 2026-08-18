import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PitchMarkings from '../src/components/PitchMarkings.vue'
import { PITCH_W, PITCH_H, m } from '../src/geometry'

function render(type: 'blank' | 'full' | 'half') {
  return mount(PitchMarkings, { props: { type } })
}

describe('blank pitch', () => {
  it('draws no markings', () => {
    const wrapper = render('blank')
    expect(wrapper.findAll('[data-marking]')).toHaveLength(0)
  })
})

describe('full pitch', () => {
  it('draws the halfway line', () => {
    expect(render('full').find('[data-marking="halfway"]').exists()).toBe(true)
  })

  it('draws the centre circle', () => {
    expect(render('full').find('[data-marking="centre-circle"]').exists()).toBe(true)
  })

  it('draws both penalty areas', () => {
    expect(render('full').findAll('[data-marking="penalty-area"]')).toHaveLength(2)
  })

  it('draws both six-yard boxes', () => {
    expect(render('full').findAll('[data-marking="six-yard"]')).toHaveLength(2)
  })

  it('draws four corner arcs', () => {
    expect(render('full').findAll('[data-marking="corner"]')).toHaveLength(4)
  })
})

describe('half pitch', () => {
  it('draws exactly one penalty area', () => {
    expect(render('half').findAll('[data-marking="penalty-area"]')).toHaveLength(1)
  })

  it('is inset so that it stays within the same coordinate space', () => {
    const group = render('half').find('[data-pitch-group]')
    expect(group.attributes('transform')).toContain('translate(25')
  })
})

/**
 * Replaces the brief's Step 5 (manual `npm run dev` eyeball check, which
 * requires a browser nobody performed) with an automated bounds check: every
 * marking coordinate must fall inside the 0..100 x 0..64.76 pitch box.
 *
 * Exception: `[data-marking="goal"]` rects sit outside the touchline by
 * design (a goal net is behind the goal line, so the left goal has a
 * negative x and the right goal starts at PITCH_W) and are excluded here
 * deliberately, not by accident.
 */
describe('marking bounds', () => {
  function assertInBounds(type: 'full' | 'half') {
    const wrapper = render(type)
    const markings = wrapper.findAll('[data-marking]').filter((el) => el.attributes('data-marking') !== 'goal')

    expect(markings.length).toBeGreaterThan(0)

    // The half-pitch group carries transform="translate(25 0)" (asserted
    // above). Coordinates are authored relative to that group, so the
    // x-offset must be added back here to check the coordinates that
    // actually land in the shared 0..100 pitch box, not the pre-translate
    // local ones.
    const xOffset = type === 'half' ? 25 : 0

    for (const el of markings) {
      const tag = el.element.tagName.toLowerCase()
      const label = el.attributes('data-marking')

      if (tag === 'rect') {
        const x = Number(el.attributes('x')) + xOffset
        const y = Number(el.attributes('y'))
        const width = Number(el.attributes('width'))
        const height = Number(el.attributes('height'))
        expect(x, `${label} x`).toBeGreaterThanOrEqual(0)
        expect(y, `${label} y`).toBeGreaterThanOrEqual(0)
        expect(x + width, `${label} x+width`).toBeLessThanOrEqual(PITCH_W + 1e-9)
        expect(y + height, `${label} y+height`).toBeLessThanOrEqual(PITCH_H + 1e-9)
      } else if (tag === 'circle') {
        const cx = Number(el.attributes('cx')) + xOffset
        const cy = Number(el.attributes('cy'))
        const r = Number(el.attributes('r'))
        expect(cx - r, `${label} cx-r`).toBeGreaterThanOrEqual(0)
        expect(cy - r, `${label} cy-r`).toBeGreaterThanOrEqual(0)
        expect(cx + r, `${label} cx+r`).toBeLessThanOrEqual(PITCH_W + 1e-9)
        expect(cy + r, `${label} cy+r`).toBeLessThanOrEqual(PITCH_H + 1e-9)
      } else if (tag === 'line') {
        const x1 = Number(el.attributes('x1')) + xOffset
        const y1 = Number(el.attributes('y1'))
        const x2 = Number(el.attributes('x2')) + xOffset
        const y2 = Number(el.attributes('y2'))
        for (const [x, y] of [
          [x1, y1],
          [x2, y2],
        ]) {
          expect(x, `${label} endpoint x`).toBeGreaterThanOrEqual(0)
          expect(y, `${label} endpoint y`).toBeGreaterThanOrEqual(0)
          expect(x, `${label} endpoint x`).toBeLessThanOrEqual(PITCH_W + 1e-9)
          expect(y, `${label} endpoint y`).toBeLessThanOrEqual(PITCH_H + 1e-9)
        }
      }
      // `path` elements (arcs) are not bounds-checked here: an arc's `d`
      // string carries its own endpoints, independent of any rect/circle
      // this loop already validates, so a bounds check here would not
      // exercise them. They get their own check below, verifying each
      // arc's endpoints actually lie on the circle its radius and centre
      // claim (which a bounds check alone would not catch — see the
      // penalty-arc fix this test suite caught).
    }
  }

  it('keeps every full-pitch marking (except goals) inside the pitch box', () => {
    assertInBounds('full')
  })

  it('keeps every half-pitch marking (except goals) inside the pitch box', () => {
    assertInBounds('half')
  })
})

/**
 * Arc markings are SVG `path` elements whose `d` attribute hard-codes two
 * endpoints and a radius. Nothing in Vue or the DOM enforces that those
 * endpoints actually lie on the circle of that radius, centred where the
 * marking claims to be centred (the penalty spot, the halfway line, a
 * pitch corner) — an arithmetic slip in either endpoint renders a visibly
 * different, off-centre curve while every other check in this file still
 * passes. These tests parse each arc's `d` string and verify both
 * endpoints are exactly `radius` away from the claimed centre.
 */
describe('arc endpoints lie on their claimed circle', () => {
  const spotFromGoal = m(11)
  const arcRadius = m(9.15)
  const cornerRadius = m(1)

  function parseArcEndpoints(d: string) {
    const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    // "M x1 y1 A rx ry x-axis-rotation large-arc-flag sweep-flag x2 y2"
    return {
      start: { x: nums[0], y: nums[1] },
      end: { x: nums[7], y: nums[8] },
    }
  }

  function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function expectOnCircle(label: string, point: { x: number; y: number }, centre: { x: number; y: number }, radius: number) {
    expect(distance(point, centre), `${label} distance from claimed centre`).toBeCloseTo(radius, 6)
  }

  it('penalty arcs are centred on their own penalty spot, on both pitch types', () => {
    for (const type of ['full', 'half'] as const) {
      const arcs = render(type).findAll('[data-marking="penalty-arc"]')
      expect(arcs.length).toBeGreaterThan(0)

      for (const arc of arcs) {
        const { start, end } = parseArcEndpoints(arc.attributes('d')!)
        // The left goal's arc endpoints sit left of centre, the right
        // goal's sit right of centre; use that to pick the matching spot.
        const isLeftGoal = start.x < PITCH_W / 2
        const spot = isLeftGoal
          ? { x: spotFromGoal, y: PITCH_H / 2 }
          : { x: PITCH_W - spotFromGoal, y: PITCH_H / 2 }

        expectOnCircle('penalty-arc start', start, spot, arcRadius)
        expectOnCircle('penalty-arc end', end, spot, arcRadius)
      }
    }
  })

  it('the half-pitch centre-circle arc is centred on the halfway line', () => {
    const arc = render('half').find('[data-marking="centre-circle"]')
    expect(arc.exists()).toBe(true)

    const { start, end } = parseArcEndpoints(arc.attributes('d')!)
    const centre = { x: PITCH_W / 2, y: PITCH_H / 2 }

    expectOnCircle('centre-circle start', start, centre, arcRadius)
    expectOnCircle('centre-circle end', end, centre, arcRadius)
  })

  it('corner arcs are each centred on a pitch corner', () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 0, y: PITCH_H },
      { x: PITCH_W, y: 0 },
      { x: PITCH_W, y: PITCH_H },
    ]

    for (const type of ['full', 'half'] as const) {
      const arcs = render(type).findAll('[data-marking="corner"]')
      expect(arcs.length).toBeGreaterThan(0)

      for (const arc of arcs) {
        const d = arc.attributes('d')!
        const { start, end } = parseArcEndpoints(d)
        const centre = corners.find(
          (c) =>
            Math.abs(distance(start, c) - cornerRadius) < 1e-6 && Math.abs(distance(end, c) - cornerRadius) < 1e-6,
        )
        expect(centre, `corner arc d="${d}" has a matching corner centre`).toBeDefined()
      }
    }
  })
})
