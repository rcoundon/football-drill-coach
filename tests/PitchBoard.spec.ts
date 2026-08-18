import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, type DOMWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import PitchBoard from '../src/components/PitchBoard.vue'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { PITCH_H, PITCH_W } from '../src/geometry'
import type { ToolMode } from '../src/types'

/**
 * Dispatches a real PointerEvent directly, bypassing @vue/test-utils'
 * `.trigger()`. In this jsdom/vue-test-utils combination, `.trigger()`
 * constructs the event correctly (clientX/clientY are set fine via the
 * init dict) but then tries to re-assign every option onto the event a
 * second time, checking only the event's OWN prototype for a setter.
 * `clientX`/`clientY` are inherited from MouseEvent.prototype as
 * getter-only accessors, so that check misses them and the re-assignment
 * throws. Constructing and dispatching the event ourselves sidesteps the
 * bug while still exercising a genuine native PointerEvent.
 *
 * `PlayerCounter`/`BallToken` deliberately put the pointerdown listener on
 * the LAST child of their group (the enlarged transparent hit circle), not
 * on the group itself — see the paint-order note in PlayerCounter.vue. A
 * real browser's hit-testing lands a press there; jsdom has no layout
 * engine and does no hit-testing, so a synthetic dispatch on `[data-counter]`
 * / `[data-ball]` (the group) would silently miss that listener even though
 * the component is wired correctly. Route the dispatch to that last child
 * so the test exercises the same element a real press would.
 */
async function firePointer(
  target: DOMWrapper<Element>,
  type: string,
  opts: { clientX: number; clientY: number; pointerId: number },
) {
  const isHitGroup = target.element.hasAttribute('data-counter') || target.element.hasAttribute('data-ball')
  const node = (isHitGroup ? target.element.lastElementChild : null) ?? target.element
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, ...opts })
  node.dispatchEvent(event)
  await nextTick()
}

const RECT = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }

function mountBoard(tool: ToolMode = 'select') {
  const wrapper = mount(PitchBoard, { props: { tool, drawColor: '#ffffff' }, attachTo: document.body })
  const svg = wrapper.find('svg').element as unknown as SVGSVGElement
  // jsdom gives every element a zero-sized rect; supply a realistic one.
  svg.getBoundingClientRect = () => RECT as DOMRect
  // jsdom does not implement pointer capture.
  ;(svg as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = vi.fn()
  ;(svg as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture = vi.fn()
  return wrapper
}

/** Client coordinates for a given pitch position, matching RECT above. */
function clientFor(x: number, y: number) {
  const scale = 800 / PITCH_W
  const offsetY = (600 - PITCH_H * scale) / 2
  return { clientX: x * scale, clientY: offsetY + y * scale, pointerId: 1 }
}

beforeEach(() => {
  __resetBoardForTests()
  document.body.innerHTML = ''
})

describe('rendering', () => {
  it('renders one circle per counter', async () => {
    const board = useBoard()
    board.addCounter('red')
    board.addCounter('blue')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[data-counter]')).toHaveLength(2)
  })

  it('shows the counter label', async () => {
    useBoard().addCounter('red')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-counter-label]').text()).toBe('1')
  })

  it('rings the counter that has the ball', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 30 })
    board.dropBall({ x: 30, y: 30 })
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-possession-ring]').exists()).toBe(true)
  })

  it('renders the ball', async () => {
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-ball]').exists()).toBe(true)
  })
})

describe('dragging a counter', () => {
  it('moves it to where the pointer goes', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(20, 10))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(20, 10))

    const moved = board.counterById(c.id)!
    expect(moved.pos.x).toBeCloseTo(20, 4)
    expect(moved.pos.y).toBeCloseTo(10, 4)
  })

  it('produces exactly ONE undo entry for the whole drag', async () => {
    const board = useBoard()
    board.addCounter('red')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(30, 20))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(25, 15))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(20, 10))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(20, 10))

    board.undo() // undoes the drag
    expect(board.state.counters[0].pos.x).toBeCloseTo(PITCH_W / 2, 4)
    board.undo() // undoes the add
    expect(board.state.counters).toHaveLength(0)
  })

  it('ignores pointer moves after the pointer is released', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(20, 10))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(90, 60))

    expect(board.counterById(c.id)!.pos.x).toBeCloseTo(20, 4)
  })
})

describe('dragging the ball', () => {
  it('drops it where released and attaches it to a nearby counter', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 70, y: 40 })
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-ball]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(70, 40))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(70, 40))

    expect(board.state.ball.attachedTo).toBe(c.id)
  })
})

describe('drawing', () => {
  it('draws a freehand path in pen mode', async () => {
    const board = useBoard()
    const wrapper = mountBoard('pen')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('svg'), 'pointerdown', clientFor(10, 10))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(40, 10))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(70, 10))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(70, 10))

    expect(board.state.drawings).toHaveLength(1)
    expect(board.state.drawings[0].kind).toBe('pen')
  })

  it('draws a run arrow', async () => {
    const board = useBoard()
    const wrapper = mountBoard('arrow-run')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('svg'), 'pointerdown', clientFor(10, 10))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(60, 30))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(60, 30))

    expect(board.state.drawings).toHaveLength(1)
    const arrow = board.state.drawings[0]
    expect(arrow.kind === 'arrow' && arrow.style).toBe('run')
  })

  it('does not drag counters while a drawing tool is active', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    const wrapper = mountBoard('pen')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(20, 10))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(20, 10))

    expect(board.counterById(c.id)!.pos.x).toBeCloseTo(PITCH_W / 2, 4)
  })
})

describe('erase mode', () => {
  it('deletes a counter that is pressed', async () => {
    const board = useBoard()
    board.addCounter('red')
    const wrapper = mountBoard('erase')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    expect(board.state.counters).toHaveLength(0)
  })
})

describe('renaming a counter', () => {
  it('forwards rename with the counter id while the select tool is active', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-counter] circle:last-child').trigger('dblclick')

    expect(wrapper.emitted('rename')).toEqual([[c.id]])
  })

  it('does not forward rename while the erase tool is active', async () => {
    const board = useBoard()
    board.addCounter('red')
    const wrapper = mountBoard('erase')
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-counter] circle:last-child').trigger('dblclick')

    expect(wrapper.emitted('rename')).toBeUndefined()
  })
})

describe('rotation', () => {
  it('swaps the view box when the board is rotated', async () => {
    const board = useBoard()
    board.setRotated(true)
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('svg').attributes('viewBox')).toBe(`0 0 ${PITCH_H} ${PITCH_W}`)
  })
})
