import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BoardView from '../src/components/BoardView.vue'
import { BALL_OFFSET, PITCH_H, PITCH_W } from '../src/geometry'
import type { FrameView } from '../src/animation'

function frame(over: Partial<FrameView> = {}): FrameView {
  return { counters: [], markers: [], labels: [], balls: [], drawings: [], ...over }
}

function mountView(over: Partial<FrameView> = {}, props: Record<string, unknown> = {}) {
  return mount(BoardView, {
    props: {
      frame: frame(over),
      pitch: { type: 'blank', rotated: false },
      labelsVisible: true,
      ballsVisible: true,
      ...props,
    },
  })
}

describe('BoardView', () => {
  it('draws every piece of the frame it is handed', () => {
    const wrapper = mountView({
      counters: [
        { id: 'c1', color: 'red', label: '1', pos: { x: 10, y: 10 } },
        { id: 'c2', color: 'blue', label: '2', pos: { x: 20, y: 20 } },
      ],
      markers: [{ id: 'm1', pos: { x: 30, y: 30 } }],
      labels: [{ id: 'l1', text: 'press here', pos: { x: 40, y: 40 } }],
      balls: [{ id: 'b1', pos: { x: 50, y: 50 }, attachedTo: null }],
      drawings: [{ id: 'd1', kind: 'line', color: '#fff', from: { x: 1, y: 1 }, to: { x: 9, y: 9 } }],
    })

    expect(wrapper.findAll('[data-counter]')).toHaveLength(2)
    expect(wrapper.findAll('[data-marker]')).toHaveLength(1)
    expect(wrapper.findAll('[data-label]')).toHaveLength(1)
    expect(wrapper.findAll('[data-ball]')).toHaveLength(1)
    expect(wrapper.findAll('[data-drawing]')).toHaveLength(1)
  })

  it('needs no board state: two views of different frames disagree', () => {
    const one = mountView({ counters: [{ id: 'c1', color: 'red', label: '1', pos: { x: 10, y: 10 } }] })
    const two = mountView({ counters: [] })

    expect(one.findAll('[data-counter]')).toHaveLength(1)
    expect(two.findAll('[data-counter]')).toHaveLength(0)
  })

  it('hides labels when told to, without losing them', async () => {
    const wrapper = mountView(
      { labels: [{ id: 'l1', text: 'press here', pos: { x: 40, y: 40 } }] },
      { labelsVisible: false },
    )

    expect(wrapper.findAll('[data-label]')).toHaveLength(0)

    await wrapper.setProps({ labelsVisible: true })
    expect(wrapper.findAll('[data-label]')).toHaveLength(1)
  })

  it('hides balls when told to', () => {
    const wrapper = mountView(
      { balls: [{ id: 'b1', pos: { x: 50, y: 50 }, attachedTo: null }] },
      { ballsVisible: false },
    )

    expect(wrapper.findAll('[data-ball]')).toHaveLength(0)
  })

  it("draws a carried ball at its carrier's feet, not at its stored position", () => {
    const wrapper = mountView({
      counters: [{ id: 'c1', color: 'red', label: '1', pos: { x: 10, y: 10 } }],
      balls: [{ id: 'b1', pos: { x: 90, y: 60 }, attachedTo: 'c1' }],
    })

    const ball = wrapper.find('[data-ball]')
    expect(ball.attributes('transform')).toContain(String(10 + BALL_OFFSET.x))
    expect(ball.attributes('transform')).toContain(String(10 + BALL_OFFSET.y))
  })

  it('rotates the board without the pieces knowing', async () => {
    const wrapper = mountView()

    expect(wrapper.find('svg').attributes('viewBox')).toBe(`0 0 ${PITCH_W} ${PITCH_H}`)

    await wrapper.setProps({ pitch: { type: 'blank', rotated: true } })
    expect(wrapper.find('svg').attributes('viewBox')).toBe(`0 0 ${PITCH_H} ${PITCH_W}`)
    expect(wrapper.find('g').attributes('transform')).toBe(`translate(${PITCH_H} 0) rotate(90)`)
  })

  it('reports a grab rather than acting on it', () => {
    const wrapper = mountView({
      counters: [{ id: 'c1', color: 'red', label: '1', pos: { x: 10, y: 10 } }],
    })

    // PlayerCounter puts its listener on the enlarged transparent hit circle,
    // the last child of its group — jsdom does no hit-testing, so a press has
    // to be aimed there. See the note atop tests/PitchBoard.spec.ts.
    const hit = wrapper.find('[data-counter]').element.lastElementChild!
    hit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }))

    expect(wrapper.emitted('grabCounter')?.[0]?.[0]).toBe('c1')
  })

  it('paints what is under the tokens beneath them, and what is over above', () => {
    const wrapper = mountView({
      counters: [{ id: 'c1', color: 'red', label: '1', pos: { x: 10, y: 10 } }],
    }, {})

    const withSlots = mount(BoardView, {
      props: {
        frame: frame({ counters: [{ id: 'c1', color: 'red', label: '1', pos: { x: 10, y: 10 } }] }),
        pitch: { type: 'blank', rotated: false },
        labelsVisible: true,
        ballsVisible: true,
      },
      slots: {
        'under-tokens': '<circle data-under r="1" />',
        'over-tokens': '<circle data-over r="1" />',
      },
    })

    const order = [...withSlots.find('g').element.children].map((el) =>
      el.hasAttribute('data-under') ? 'under'
        : el.hasAttribute('data-over') ? 'over'
        : el.hasAttribute('data-counter') ? 'counter'
        : 'other',
    )

    expect(order.indexOf('under')).toBeLessThan(order.indexOf('counter'))
    expect(order.indexOf('over')).toBeGreaterThan(order.indexOf('counter'))
    expect(wrapper.findAll('[data-under]')).toHaveLength(0)
  })

  it('exposes its svg element so it can be rasterised', () => {
    const wrapper = mountView()
    expect((wrapper.vm as unknown as { svgEl: SVGSVGElement }).svgEl.tagName).toBe('svg')
  })
})
