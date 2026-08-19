import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, type DOMWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import PitchBoard, { DOUBLE_PRESS_MS, STALE_DRAG_MS } from '../src/components/PitchBoard.vue'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { BALL_HIT_RADIUS_ATTACHED } from '../src/components/BallToken.vue'
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
 * `PlayerCounter`/`BallToken`/`ConeMarker`/`PitchLabel` deliberately put the pointerdown listener on
 * the LAST child of their group (the enlarged transparent hit circle), not
 * on the group itself — see the paint-order note in PlayerCounter.vue. A
 * real browser's hit-testing lands a press there; jsdom has no layout
 * engine and does no hit-testing, so a synthetic dispatch on `[data-counter]`
 * / `[data-ball]` / `[data-marker]` (the group) would silently miss that listener even though
 * the component is wired correctly. Route the dispatch to that last child
 * so the test exercises the same element a real press would.
 */
async function firePointer(
  target: DOMWrapper<Element>,
  type: string,
  opts: { clientX: number; clientY: number; pointerId: number },
) {
  const isHitGroup =
    target.element.hasAttribute('data-counter') ||
    target.element.hasAttribute('data-ball') ||
    target.element.hasAttribute('data-marker') ||
    target.element.hasAttribute('data-label')
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
  // By default every drag still holds its capture, i.e. no pointerup was lost.
  ;(svg as unknown as { hasPointerCapture: (id: number) => boolean }).hasPointerCapture = () => true
  return wrapper
}

function svgOf(wrapper: ReturnType<typeof mountBoard>) {
  return wrapper.find('svg').element as unknown as SVGSVGElement & {
    hasPointerCapture: (id: number) => boolean
    setPointerCapture: (id: number) => void
  }
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

  it('shows a counter label once one has been written', async () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    board.setCounterLabel(counter.id, '9')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-counter-label]').text()).toBe('9')
  })

  /** A counter nobody has labelled shows nothing, not a number it never asked for. */
  it('shows no label on a fresh counter', async () => {
    useBoard().addCounter('red')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-counter-label]').text()).toBe('')
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

    // Grabbed dead centre, so the counter's centre tracks the pointer exactly.
    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(c.pos.x, c.pos.y))
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

/**
 * Rename is driven from `pointerdown`, not from `dblclick`.
 *
 * `setPointerCapture` on pointerdown retargets the compatibility mouse
 * events at the capturing element, so in a real browser `click` and
 * `dblclick` fire on the `<svg>` and never reach the counter — a `@dblclick`
 * handler on the counter is dead code no coach can ever trigger. A test that
 * dispatches `dblclick` straight at the element passes anyway, because it
 * bypasses capture entirely, which is exactly how the defect survived.
 *
 * These tests therefore drive the same pointer sequence a real press
 * produces, so they would fail again if capture retargeting broke it.
 */
describe('renaming a counter', () => {
  async function press(wrapper: ReturnType<typeof mountBoard>, pointerId = 1) {
    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', { ...clientFor(50, 32), pointerId })
    await firePointer(wrapper.find('svg'), 'pointerup', { ...clientFor(50, 32), pointerId })
  }

  it('forwards rename on a second press of the same counter, in the same window a double-click uses', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()

    await press(wrapper)
    expect(wrapper.emitted('rename')).toBeUndefined()
    await press(wrapper)

    expect(wrapper.emitted('rename')).toEqual([[c.id]])
  })

  it('does not forward rename for two presses far apart in time', async () => {
    vi.useFakeTimers()
    try {
      const board = useBoard()
      board.addCounter('red')
      const wrapper = mountBoard('select')
      await wrapper.vm.$nextTick()

      await press(wrapper)
      vi.advanceTimersByTime(DOUBLE_PRESS_MS + 100)
      await press(wrapper)

      expect(wrapper.emitted('rename')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not forward rename when the two presses are on different counters', async () => {
    const board = useBoard()
    board.addCounter('red')
    board.addCounter('blue')
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()

    const counters = wrapper.findAll('[data-counter]')
    for (const counter of counters) {
      await firePointer(counter, 'pointerdown', clientFor(50, 32))
      await firePointer(wrapper.find('svg'), 'pointerup', clientFor(50, 32))
    }

    expect(wrapper.emitted('rename')).toBeUndefined()
  })

  it('does not start a drag on the press that opens the rename', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()

    await press(wrapper)
    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(10, 10))

    expect(board.counterById(c.id)!.pos.x).not.toBeCloseTo(10, 4)
  })

  it('does not forward rename while the erase tool is active', async () => {
    const board = useBoard()
    board.addCounter('red')
    board.addCounter('red')
    const wrapper = mountBoard('erase')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))

    expect(wrapper.emitted('rename')).toBeUndefined()
  })
})

/**
 * A stylus with a resting palm, or simply two fingers, produces overlapping
 * pointers. `drag` is one global value, so without a pointerId a second
 * pointer overwrites the first mid-drag, leaks its capture and misattributes
 * its moves.
 */
describe('a second pointer during a drag', () => {
  it('ignores a pointerdown from another pointer while a drag is live', async () => {
    const board = useBoard()
    const first = board.addCounter('red')
    const second = board.addCounter('blue')
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()

    const counters = wrapper.findAll('[data-counter]')
    await firePointer(counters[0], 'pointerdown', { ...clientFor(50, 32), pointerId: 1 })
    await firePointer(counters[1], 'pointerdown', { ...clientFor(50, 32), pointerId: 2 })

    // Pointer 1 is still the one being tracked, so its moves still move ITS counter.
    await firePointer(wrapper.find('svg'), 'pointermove', { ...clientFor(20, 10), pointerId: 1 })
    expect(board.counterById(first.id)!.pos.x).toBeCloseTo(20, 4)
    expect(board.counterById(second.id)!.pos.x).not.toBeCloseTo(20, 4)
  })

  it('ignores pointermove from a pointer that is not the one dragging', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', { ...clientFor(50, 32), pointerId: 1 })
    await firePointer(wrapper.find('svg'), 'pointermove', { ...clientFor(90, 60), pointerId: 2 })

    expect(board.counterById(c.id)!.pos.x).not.toBeCloseTo(90, 4)
  })

  it('ignores pointerup from a pointer that is not the one dragging', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', { ...clientFor(50, 32), pointerId: 1 })
    await firePointer(wrapper.find('svg'), 'pointerup', { ...clientFor(90, 60), pointerId: 2 })
    await firePointer(wrapper.find('svg'), 'pointermove', { ...clientFor(20, 10), pointerId: 1 })

    expect(board.counterById(c.id)!.pos.x).toBeCloseTo(20, 4)
  })
})

/**
 * The toolbar sits outside the SVG's pointer capture, so a second finger can
 * commit while a stroke is in progress. `finishDrawing` used to pop the undo
 * stack blindly, which then discarded whatever that other finger did.
 */
describe('discarding a stray stroke', () => {
  it('leaves undo entries made by the toolbar mid-stroke intact', async () => {
    const board = useBoard()
    board.addCounter('red')
    const wrapper = mountBoard('pen')
    await wrapper.vm.$nextTick()

    // Finger A presses in pen mode: startPen pushes an undo entry.
    await firePointer(wrapper.find('svg'), 'pointerdown', clientFor(10, 10))
    // Finger B taps the pitch buttons, which live outside the captured SVG.
    board.setPitchType('full')
    board.setPitchType('half')
    // Finger A lifts without moving: the stroke is too short to keep.
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(10, 10))

    expect(board.state.drawings).toHaveLength(0)
    expect(board.state.pitch.type).toBe('half')

    board.undo()
    expect(board.state.pitch.type).toBe('full')
    expect(board.state.drawings).toHaveLength(0)

    board.undo()
    expect(board.state.pitch.type).toBe('blank')
    expect(board.state.counters).toHaveLength(1)

    board.undo()
    expect(board.state.counters).toHaveLength(0)
    expect(board.canUndo.value).toBe(false)
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

/**
 * An attached ball is drawn one BALL_OFFSET from its holder, so a press
 * anywhere on it is off the holder's centre and can be nearer a neighbour's.
 * A tap that never moves is not a re-placement of the ball at all, so it must
 * leave possession exactly as it found it.
 */
describe('tapping the ball without moving it', () => {
  it('leaves possession with the holder even when pressed towards a neighbour', async () => {
    const board = useBoard()
    const holder = board.addCounter('red')
    const neighbour = board.addCounter('blue')
    board.dropBall({ ...holder.pos })
    expect(board.state.ball.attachedTo).toBe(holder.id)

    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()

    // The far edge of the ball's hit circle, on the side facing the neighbour.
    const drawn = board.ballPosition()
    const toNeighbour = {
      x: neighbour.pos.x - drawn.x,
      y: neighbour.pos.y - drawn.y,
    }
    const length = Math.hypot(toNeighbour.x, toNeighbour.y)
    const press = {
      x: drawn.x + (toNeighbour.x / length) * BALL_HIT_RADIUS_ATTACHED,
      y: drawn.y + (toNeighbour.y / length) * BALL_HIT_RADIUS_ATTACHED,
    }

    await firePointer(wrapper.find('[data-ball]'), 'pointerdown', clientFor(press.x, press.y))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(press.x, press.y))

    expect(board.state.ball.attachedTo).toBe(holder.id)
  })

  it('still drops the ball where a real drag releases it', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 70, y: 40 })
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-ball]'), 'pointerdown', clientFor(20, 20))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(45, 30))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(45, 30))

    expect(board.state.ball.attachedTo).toBeNull()
    expect(board.state.ball.pos.x).toBeCloseTo(45, 4)
  })
})

/**
 * Nudging a player, releasing and re-grabbing straight away is an ordinary
 * positioning rhythm. Arming the double press on every release turned the
 * second grab into a rename prompt and refused the drag.
 */
describe('a second grab that follows a drag', () => {
  it('drags normally rather than opening rename', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()

    // Nudge the player a little and let go.
    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(53, 34))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(53, 34))

    // Straight back in, well inside the double-press window.
    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(53, 34))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(20, 12))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(20, 12))

    expect(wrapper.emitted('rename')).toBeUndefined()
    expect(board.counterById(c.id)!.pos.x).toBeCloseTo(20, 4)
  })

  it('does not open rename when the second press lands away from the first', async () => {
    const board = useBoard()
    board.addCounter('red')
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(50, 32))
    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(54, 32))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(54, 32))

    expect(wrapper.emitted('rename')).toBeUndefined()
  })
})

/**
 * Ignoring presses while a drag is live removed the old self-healing, where a
 * fresh pointerdown simply replaced a stale drag. A pointerup lost to a
 * browser quirk or a pointercancel that never arrived would then brick the
 * board for the rest of the session.
 */
describe('recovering from a lost pointerup', () => {
  it('takes over when the stuck drag no longer holds its capture', async () => {
    const board = useBoard()
    const first = board.addCounter('red')
    const second = board.addCounter('blue')
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()
    svgOf(wrapper).hasPointerCapture = () => false

    const counters = wrapper.findAll('[data-counter]')
    await firePointer(counters[0], 'pointerdown', { ...clientFor(50, 32), pointerId: 1 })
    // pointerup for pointer 1 never arrives.
    const grabbedAt = { ...board.counterById(second.id)!.pos }
    await firePointer(counters[1], 'pointerdown', { ...clientFor(50, 32), pointerId: 2 })
    await firePointer(wrapper.find('svg'), 'pointermove', { ...clientFor(20, 10), pointerId: 2 })

    // Carried by the point it was grabbed, so it travels the pointer's distance.
    expect(board.counterById(second.id)!.pos.x).toBeCloseTo(grabbedAt.x - 30, 4)
    expect(board.counterById(first.id)!.pos.x).not.toBeCloseTo(20, 4)
  })

  it('takes over after a timeout when the browser cannot report capture', async () => {
    vi.useFakeTimers()
    try {
      const board = useBoard()
      board.addCounter('red')
      const second = board.addCounter('blue')
      const wrapper = mountBoard('select')
      await wrapper.vm.$nextTick()
      delete (svgOf(wrapper) as unknown as { hasPointerCapture?: unknown }).hasPointerCapture

      const counters = wrapper.findAll('[data-counter]')
      const grabbedAt = { ...board.counterById(second.id)!.pos }
      await firePointer(counters[0], 'pointerdown', { ...clientFor(50, 32), pointerId: 1 })
      vi.advanceTimersByTime(STALE_DRAG_MS + 1)
      await firePointer(counters[1], 'pointerdown', { ...clientFor(50, 32), pointerId: 2 })
      await firePointer(wrapper.find('svg'), 'pointermove', { ...clientFor(20, 10), pointerId: 2 })

      // Carried by the point it was grabbed, so it travels the pointer's distance.
      expect(board.counterById(second.id)!.pos.x).toBeCloseTo(grabbedAt.x - 30, 4)
    } finally {
      vi.useRealTimers()
    }
  })

  it('drags anyway when the browser refuses to give up pointer capture', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()
    svgOf(wrapper).setPointerCapture = () => {
      throw new DOMException('InvalidStateError')
    }

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(20, 10))

    expect(board.counterById(c.id)!.pos.x).toBeCloseTo(20, 4)
  })
})

describe('drawing a straight line', () => {
  it('creates a line with no arrowhead', async () => {
    const board = useBoard()
    const wrapper = mountBoard('line')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('svg'), 'pointerdown', clientFor(10, 10))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(60, 30))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(60, 30))

    expect(board.state.drawings).toHaveLength(1)
    expect(board.state.drawings[0].kind).toBe('line')

    const rendered = wrapper.find('[data-drawing]')
    expect(rendered.attributes('marker-end')).toBeUndefined()
    expect(rendered.attributes('stroke-dasharray')).toBeUndefined()
  })

  it('snaps a nearly-horizontal drag flat on the board', async () => {
    const board = useBoard()
    const wrapper = mountBoard('line')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('svg'), 'pointerdown', clientFor(10, 30))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(70, 31))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(70, 31))

    const line = board.state.drawings[0] as { from: { y: number }; to: { y: number } }
    expect(line.to.y).toBeCloseTo(line.from.y, 6)
  })

  it('does not drag counters while the line tool is active', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    const startX = c.pos.x
    const wrapper = mountBoard('line')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(20, 10))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(20, 10))

    expect(board.counterById(c.id)!.pos.x).toBeCloseTo(startX, 4)
  })
})

describe('cones', () => {
  it('drops a cone where the pitch is tapped', async () => {
    const board = useBoard()
    const wrapper = mountBoard('cone')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('svg'), 'pointerdown', clientFor(30, 20))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(30, 20))

    expect(board.state.markers).toHaveLength(1)
    expect(board.state.markers[0].pos.x).toBeCloseTo(30, 4)
    expect(board.state.markers[0].pos.y).toBeCloseTo(20, 4)
  })

  it('renders one cone per marker', async () => {
    const board = useBoard()
    board.addMarker({ x: 20, y: 20 })
    board.addMarker({ x: 40, y: 20 })
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[data-marker]')).toHaveLength(2)
  })

  it('drags a cone with the move tool', async () => {
    const board = useBoard()
    const marker = board.addMarker({ x: 50, y: 32 })
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-marker]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(20, 10))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(20, 10))

    expect(board.markerById(marker.id)!.pos.x).toBeCloseTo(20, 4)
  })

  it('erases a cone', async () => {
    const board = useBoard()
    board.addMarker({ x: 50, y: 32 })
    const wrapper = mountBoard('erase')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-marker]'), 'pointerdown', clientFor(50, 32))
    expect(board.state.markers).toHaveLength(0)
  })

  it('does not drop a cone while another tool is active', async () => {
    const board = useBoard()
    const wrapper = mountBoard('pen')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('svg'), 'pointerdown', clientFor(30, 20))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(30, 20))

    expect(board.state.markers).toHaveLength(0)
  })
})

describe('appearance', () => {
  it('draws players without an outline', async () => {
    useBoard().addCounter('red')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    const disc = wrapper.find('[data-counter] circle')
    expect(disc.attributes('stroke')).toBeUndefined()
  })

  it('draws cones without an outline', async () => {
    useBoard().addMarker({ x: 20, y: 20 })
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-marker] polygon').attributes('stroke')).toBeUndefined()
  })

  /**
   * The ball keeps its outline: a white disc sitting on a white pitch
   * marking would otherwise have no edge at all.
   */
  it('keeps an outline on the ball, and gives it a football pattern', async () => {
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    const ball = wrapper.find('[data-ball]')
    expect(ball.find('circle').attributes('stroke')).toBeDefined()
    expect(ball.find('polygon').exists()).toBe(true)
    expect(ball.findAll('line').length).toBe(5)
  })

  /**
   * PNG export serialises the SVG, so anything styled in CSS is lost. Every
   * value that makes the ball look like a ball must be an attribute.
   */
  it('styles the ball with attributes, so PNG export keeps it', async () => {
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    const ball = wrapper.find('[data-ball]')
    expect(ball.find('polygon').attributes('fill')).toBeDefined()
    expect(ball.find('line').attributes('stroke')).toBeDefined()
  })
})

describe('hiding the ball', () => {
  it('takes the ball off the pitch', async () => {
    const board = useBoard()
    board.toggleBallVisible()
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-ball]').exists()).toBe(false)
  })

  /** No ball on the pitch means nobody is in possession. */
  it('takes the possession ring with it', async () => {
    const board = useBoard()
    const player = board.addCounter('red')
    board.moveCounter(player.id, { x: 30, y: 30 })
    board.dropBall({ x: 30, y: 30 })

    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-possession-ring]').exists()).toBe(true)

    board.toggleBallVisible()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-possession-ring]').exists()).toBe(false)
  })

  it('puts the ball back with the player who had it', async () => {
    const board = useBoard()
    const player = board.addCounter('red')
    board.moveCounter(player.id, { x: 30, y: 30 })
    board.dropBall({ x: 30, y: 30 })
    board.toggleBallVisible()
    board.toggleBallVisible()

    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-ball]').exists()).toBe(true)
    expect(wrapper.find('[data-possession-ring]').exists()).toBe(true)
  })
})

describe('pitch labels', () => {
  it('renders one label per entry, with its text', async () => {
    const board = useBoard()
    board.addLabel({ x: 20, y: 20 }, 'Press trigger')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[data-label]')).toHaveLength(1)
    expect(wrapper.find('[data-label-text]').text()).toBe('Press trigger')
  })

  it('asks for the text when the pitch is tapped with the text tool', async () => {
    const wrapper = mountBoard('text')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('svg'), 'pointerdown', clientFor(30, 20))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(30, 20))

    const asked = wrapper.emitted('addLabel')
    expect(asked).toBeTruthy()
    expect(asked![0][0]).toMatchObject({ x: expect.closeTo(30, 4), y: expect.closeTo(20, 4) })
  })

  it('drags a label with the move tool', async () => {
    const board = useBoard()
    const label = board.addLabel({ x: 50, y: 32 }, 'Move me')!
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-label]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(20, 10))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(20, 10))

    expect(board.labelById(label.id)!.pos.x).toBeCloseTo(20, 4)
  })

  it('erases a label', async () => {
    const board = useBoard()
    board.addLabel({ x: 50, y: 32 }, 'Erase me')
    const wrapper = mountBoard('erase')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-label]'), 'pointerdown', clientFor(50, 32))
    expect(board.state.labels).toHaveLength(0)
  })

  it('hides the labels when they are toggled off', async () => {
    const board = useBoard()
    board.addLabel({ x: 20, y: 20 }, 'Hidden')
    board.toggleLabelsVisible()
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-label]').exists()).toBe(false)
  })
})

describe('adjusting a label with the text tool still active', () => {
  /**
   * Placing a label leaves the text tool selected, so the very next thing a
   * coach does is usually nudge the label they just made. Requiring a switch
   * to Move for that makes the label feel stuck.
   */
  it('drags the label rather than ignoring the press', async () => {
    const board = useBoard()
    const label = board.addLabel({ x: 50, y: 32 }, 'Nudge me')!
    const wrapper = mountBoard('text')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-label]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(20, 10))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(20, 10))

    expect(board.labelById(label.id)!.pos.x).toBeCloseTo(20, 4)
  })

  it('does not drop a second label on top of the one being dragged', async () => {
    const board = useBoard()
    board.addLabel({ x: 50, y: 32 }, 'Only me')
    const wrapper = mountBoard('text')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-label]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(50, 32))

    expect(board.state.labels).toHaveLength(1)
    expect(wrapper.emitted('addLabel')).toBeFalsy()
  })

  it('opens the editor on a double press, as Move does', async () => {
    const board = useBoard()
    const label = board.addLabel({ x: 50, y: 32 }, 'Edit me')!
    const wrapper = mountBoard('text')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-label]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(50, 32))
    await firePointer(wrapper.find('[data-label]'), 'pointerdown', clientFor(50, 32))

    expect(wrapper.emitted('editLabel')![0]).toEqual([label.id])
  })

  it('still places a new label on empty grass', async () => {
    const board = useBoard()
    board.addLabel({ x: 10, y: 10 }, 'Existing')
    const wrapper = mountBoard('text')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('svg'), 'pointerdown', clientFor(70, 45))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(70, 45))

    expect(wrapper.emitted('addLabel')).toBeTruthy()
  })
})

describe('renaming a counter, and where focus ends up', () => {
  /**
   * The rename must be emitted on the release, not the press. Opening the
   * dialog on the press means the pointerup that follows lands on the
   * <svg> and pulls focus straight back out of the field — so the coach
   * double-presses, types, and nothing lands. Only reproducible in a real
   * browser, hence the explicit ordering test here.
   */
  it('does not emit the rename until the second press is released', async () => {
    const board = useBoard()
    board.addCounter('red')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(50, 32))
    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))

    expect(wrapper.emitted('rename')).toBeFalsy()

    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(50, 32))
    expect(wrapper.emitted('rename')).toBeTruthy()
  })

  /**
   * The second press does not start a drag — it is the opening half of a
   * rename — so sliding away from it cancels the rename rather than moving
   * the counter. Predates the release change; pinned so it stays deliberate.
   */
  it('cancels the rename when the pointer slides away before releasing', async () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    const startX = counter.pos.x
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(50, 32))
    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(20, 10))

    expect(wrapper.emitted('rename')).toBeFalsy()
    expect(board.counterById(counter.id)!.pos.x).toBeCloseTo(startX, 4)
  })
})

describe('tap gestures that finish on release', () => {
  /**
   * The counter's hit target is 4.2 units where the disc is 2.4, so a press
   * lands well off centre routinely. Travel must be measured from where the
   * press landed, not from the counter's middle, or a stationary press near
   * the edge reads as a drag and never renames.
   */
  it('renames on a stationary press that lands off the counter centre', async () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    const edge = { x: counter.pos.x + 3, y: counter.pos.y }
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(edge.x, edge.y))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(edge.x, edge.y))
    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(edge.x, edge.y))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(edge.x, edge.y))

    expect(wrapper.emitted('rename')).toBeTruthy()
  })

  it('abandons a rename when the gesture is cancelled', async () => {
    const board = useBoard()
    board.addCounter('red')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(50, 32))
    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointercancel', clientFor(50, 32))

    expect(wrapper.emitted('rename')).toBeFalsy()
  })

  /** A second finger's release must not complete someone else's gesture. */
  it('ignores a release from a different pointer', async () => {
    const board = useBoard()
    board.addCounter('red')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(50, 32))
    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointerup', { ...clientFor(50, 32), pointerId: 7 })

    expect(wrapper.emitted('rename')).toBeFalsy()
  })

  it('abandons a label placement when the gesture is cancelled', async () => {
    const wrapper = mountBoard('text')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('svg'), 'pointerdown', clientFor(30, 20))
    await firePointer(wrapper.find('svg'), 'pointercancel', clientFor(30, 20))

    expect(wrapper.emitted('addLabel')).toBeFalsy()
  })

  it('does not place a label on a different pointer\'s release', async () => {
    const wrapper = mountBoard('text')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('svg'), 'pointerdown', clientFor(30, 20))
    await firePointer(wrapper.find('svg'), 'pointerup', { ...clientFor(30, 20), pointerId: 7 })

    expect(wrapper.emitted('addLabel')).toBeFalsy()
  })
})

describe('one tap tolerance, shared by every gesture', () => {
  /**
   * A local constant was shadowing the exported TAP_TOLERANCE, so travel
   * between the two values counted as a tap in one place and a drag in
   * another. This pins the boundary: 0.75 units is past 0.5, so the press
   * travelled and cannot also be the opening half of a double press.
   */
  it('treats travel between 0.5 and 1 units as a drag, not a tap', async () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    const from = { ...counter.pos }
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(from.x, from.y))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(from.x + 0.75, from.y))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(from.x + 0.75, from.y))

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(from.x + 0.75, from.y))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(from.x + 0.75, from.y))

    expect(wrapper.emitted('rename')).toBeFalsy()
  })
})

describe('a pending tap while another press arrives', () => {
  /** The pointer that started a gesture keeps it until it releases. */
  it('does not let a second press steal a pending label placement', async () => {
    const wrapper = mountBoard('text')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('svg'), 'pointerdown', clientFor(30, 20))
    await firePointer(wrapper.find('svg'), 'pointerdown', { ...clientFor(70, 45), pointerId: 7 })
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(30, 20))

    const placed = wrapper.emitted('addLabel')
    expect(placed).toBeTruthy()
    expect(placed![0][0]).toMatchObject({ x: expect.closeTo(30, 4), y: expect.closeTo(20, 4) })
  })
})

describe('a cancel from an unrelated pointer', () => {
  it('leaves an active drag alone', async () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointercancel', { ...clientFor(50, 32), pointerId: 7 })
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(20, 10))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(20, 10))

    expect(board.counterById(counter.id)!.pos.x).toBeCloseTo(20, 4)
  })

  /**
   * A press the browser took away never happened, so it cannot count as
   * the opening half of a double press.
   */
  it('stops a cancelled press arming a rename', async () => {
    const board = useBoard()
    board.addCounter('red')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointercancel', clientFor(50, 32))
    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(50, 32))

    expect(wrapper.emitted('rename')).toBeFalsy()
  })
})

describe('grabbing something without moving it', () => {
  /**
   * Pressing an object used to snap it so the pointer sat at its centre,
   * so a plain click nudged whatever it landed on. A press should pick a
   * thing up where it is, not reposition it.
   */
  it('leaves a counter exactly where it was when it is only clicked', async () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    const before = { ...counter.pos }
    const offCentre = { x: before.x + 1.8, y: before.y + 1.2 }
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(offCentre.x, offCentre.y))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(offCentre.x, offCentre.y))

    expect(board.counterById(counter.id)!.pos).toEqual(before)
  })

  it('carries a counter by the point it was grabbed, not by its centre', async () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    const start = { ...counter.pos }
    const grab = { x: start.x + 1.8, y: start.y + 1.2 }
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-counter]'), 'pointerdown', clientFor(grab.x, grab.y))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(grab.x + 20, grab.y + 10))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(grab.x + 20, grab.y + 10))

    const moved = board.counterById(counter.id)!.pos
    expect(moved.x).toBeCloseTo(start.x + 20, 4)
    expect(moved.y).toBeCloseTo(start.y + 10, 4)
  })

  it('leaves a cone where it was when it is only clicked', async () => {
    const board = useBoard()
    const marker = board.addMarker({ x: 40, y: 25 })
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-marker]'), 'pointerdown', clientFor(41.5, 26))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(41.5, 26))

    expect(board.markerById(marker.id)!.pos).toEqual({ x: 40, y: 25 })
  })

  it('leaves a label where it was when it is only clicked', async () => {
    const board = useBoard()
    const label = board.addLabel({ x: 40, y: 25 }, 'Stay put')!
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-label]'), 'pointerdown', clientFor(42, 26))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(42, 26))

    expect(board.labelById(label.id)!.pos).toEqual({ x: 40, y: 25 })
  })
})

describe('adjusting a cone with the cone tool still active', () => {
  /** Same as the text tool: placing one leaves that tool selected. */
  it('drags the cone rather than dropping another on top of it', async () => {
    const board = useBoard()
    const marker = board.addMarker({ x: 50, y: 32 })
    const wrapper = mountBoard('cone')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('[data-marker]'), 'pointerdown', clientFor(50, 32))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(20, 10))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(20, 10))

    expect(board.state.markers).toHaveLength(1)
    expect(board.markerById(marker.id)!.pos.x).toBeCloseTo(20, 4)
  })

  it('still drops a new cone on empty grass', async () => {
    const board = useBoard()
    board.addMarker({ x: 10, y: 10 })
    const wrapper = mountBoard('cone')
    await wrapper.vm.$nextTick()

    await firePointer(wrapper.find('svg'), 'pointerdown', clientFor(70, 45))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(70, 45))

    expect(board.state.markers).toHaveLength(2)
  })
})
