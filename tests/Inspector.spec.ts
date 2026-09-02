import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { SelectionRef } from '../src/types'
import Inspector from '../src/components/Inspector.vue'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { __resetViewportForTests } from '../src/composables/useViewport'
import { COUNTER_COLORS } from '../src/geometry'

const board = useBoard()

beforeEach(() => __resetBoardForTests())

function mountInspector(selection: SelectionRef[] = [], open = true) {
  return mount(Inspector, { props: { selection, open } })
}

describe('the collapsed strip', () => {
  /**
   * The notes used to hold roughly a quarter of the screen open for a field
   * that is usually empty. The pitch is the only thing on the page a coach
   * is actually looking at.
   */
  it('is all the panel is until it is asked for', () => {
    const wrapper = mountInspector([], false)
    expect(wrapper.find('[data-notes]').exists()).toBe(false)
    expect(wrapper.find('[data-inspector-open]').exists()).toBe(true)
  })

  it('opens on request, and closes again', async () => {
    const closed = mountInspector([], false)
    await closed.find('[data-inspector-open]').trigger('click')
    expect(closed.emitted('update:open')!.at(-1)).toEqual([true])

    const open = mountInspector([], true)
    await open.find('[data-inspector-close]').trigger('click')
    expect(open.emitted('update:open')!.at(-1)).toEqual([false])
  })
})

describe('with nothing held', () => {
  it('is about the drill', () => {
    const wrapper = mountInspector()
    expect(wrapper.find('[data-inspector-title]').text()).toBe('Drill notes')
  })

  it('types into the drill notes', async () => {
    const wrapper = mountInspector()
    await wrapper.find('[data-notes]').setValue('Two touch max.')
    expect(board.state.notes).toBe('Two touch max.')
  })

  /**
   * A coaching point about the third phase used to be either lost or filed
   * under the whole drill, which is not where it belongs.
   */
  it('offers a note for the phase the coach is standing on', async () => {
    board.addFrame()
    const wrapper = mountInspector()
    expect(wrapper.text()).toContain('Phase 2 note')

    await wrapper.find('[data-phase-note]').setValue('Overload arrives late.')
    expect(board.frameNote(1)).toBe('Overload arrives late.')
    // Deliberately not the whole drill: the point of it is what happens here
    // and not in the other phases.
    expect(board.frameNote(0)).toBe('')
    expect(board.state.notes).toBe('')
  })

  it('follows the coach from phase to phase', async () => {
    board.addFrame()
    board.setFrameNote(1, 'Second phase')
    board.goToFrame(0)
    const wrapper = mountInspector()
    expect((wrapper.find('[data-phase-note]').element as HTMLTextAreaElement).value).toBe('')

    board.goToFrame(1)
    await wrapper.vm.$nextTick()
    expect((wrapper.find('[data-phase-note]').element as HTMLTextAreaElement).value).toBe(
      'Second phase',
    )
  })
})

describe('with a player held', () => {
  function heldPlayer(): SelectionRef[] {
    const counter = board.addCounter('red')
    return [{ kind: 'counter', id: counter.id }]
  }

  /**
   * `Copy` and `Delete` used to sit in the toolbar with no stated subject, so
   * a coach had to remember what they were holding before pressing either.
   */
  it('says what it is about', () => {
    const wrapper = mountInspector(heldPlayer())
    expect(wrapper.find('[data-inspector-title]').text()).toBe('Player')
  })

  it('offers every colour, and marks the one the player is', async () => {
    const held = heldPlayer()
    const wrapper = mountInspector(held)
    expect(wrapper.findAll('[data-set-color]')).toHaveLength(COUNTER_COLORS.length)
    expect(wrapper.find('[data-set-color="red"]').classes()).toContain('is-active')

    await wrapper.find('[data-set-color="blue"]').trigger('click')
    expect(board.counterById(held[0].id)!.color).toBe('blue')
  })

  it('labels the player', async () => {
    const held = heldPlayer()
    const wrapper = mountInspector(held)
    const field = wrapper.find('[data-selection-label]')
    await field.setValue('GK')
    await field.trigger('change')
    expect(board.counterById(held[0].id)!.label).toBe('GK')
  })

  it('asks the app to copy or remove what is held', async () => {
    const wrapper = mountInspector(heldPlayer())
    await wrapper.find('[data-duplicate]').trigger('click')
    await wrapper.find('[data-delete-selection]').trigger('click')
    expect(wrapper.emitted('duplicate')).toHaveLength(1)
    expect(wrapper.emitted('removeSelection')).toHaveLength(1)
  })

  it('leaves the drill notes alone while something is held', () => {
    const wrapper = mountInspector(heldPlayer())
    expect(wrapper.find('[data-notes]').exists()).toBe(false)
  })
})

describe('with several things held', () => {
  it('counts them rather than pretending to inspect one', () => {
    const a = board.addCounter('red')
    const b = board.addCounter('blue')
    const wrapper = mountInspector([
      { kind: 'counter', id: a.id },
      { kind: 'counter', id: b.id },
    ])
    expect(wrapper.find('[data-inspector-title]').text()).toBe('2 things')
    // No colour row and no label field: they would have to mean one of the
    // two, and there is no saying which.
    expect(wrapper.find('[data-set-color="red"]').exists()).toBe(false)
    expect(wrapper.find('[data-selection-label]').exists()).toBe(false)
    expect(wrapper.find('[data-duplicate]').exists()).toBe(true)
  })
})

describe('with a text label held', () => {
  it('edits what it says', async () => {
    const label = board.addLabel({ x: 50, y: 30 }, 'Overload')!
    const wrapper = mountInspector([{ kind: 'label', id: label.id }])
    expect(wrapper.find('[data-inspector-title]').text()).toBe('Text label')

    const field = wrapper.find('[data-selection-label]')
    await field.setValue('Underload')
    await field.trigger('change')
    expect(board.labelById(label.id)!.text).toBe('Underload')
  })
})

describe('while the drill is mid-move', () => {
  it('will not let a phase note be typed into a blend', () => {
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    board.scrubTo(500)

    const wrapper = mountInspector()
    expect(wrapper.find('[data-phase-note]').attributes('disabled')).toBeDefined()
    board.endScrub()
  })
})

/**
 * The panel is an overlay, and that is a fact about its CSS rather than its
 * markup — which jsdom does not apply, so this reads the rule itself.
 *
 * It has been a column a quarter of the screen wide and a permanent 40px
 * strip, and both took room from the pitch whether a coach was using the
 * notes or not. On a phone held upright there is no room to take. Either
 * rule falling back into normal flow puts that width back without anything
 * else failing.
 */
describe('the room the notes take', () => {
  const source = (
    import.meta.glob('../src/components/Inspector.vue', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
  )['../src/components/Inspector.vue']

  function rule(selector: string): string {
    return source.match(new RegExp(`\\${selector} \\{([^}]*)\\}`))![1]
  }

  it('is none, open or shut', () => {
    expect(rule('.panel')).toContain('position: absolute')
    expect(rule('.rail-strip')).toContain('position: absolute')
  })
})

describe('the curve of a held player', () => {
  /** A player who ran left to right into the second phase. */
  function playerWithARun() {
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 20, y: 30 })
    board.addFrame()
    board.moveCounter(c.id, { x: 60, y: 30 })
    return c.id
  }

  it('says nothing about a run on the first phase', () => {
    const c = board.addCounter('red')
    const wrapper = mountInspector([{ kind: 'counter', id: c.id }])
    expect(wrapper.find('[data-run-curve]').exists()).toBe(false)
  })

  it('says nothing about a player who stayed where they were', () => {
    const c = board.addCounter('red')
    board.addFrame()
    const wrapper = mountInspector([{ kind: 'counter', id: c.id }])
    expect(wrapper.find('[data-run-curve]').exists()).toBe(false)
  })

  it('reads Straight for a run that was never bent', () => {
    const id = playerWithARun()
    const wrapper = mountInspector([{ kind: 'counter', id }])
    expect(wrapper.find('[data-run-curve]').text()).toContain('Straight')
  })

  /**
   * Right of the direction of travel, not right of the screen: the bend is
   * held against the chord, so the words have to be too.
   */
  it('names the side the run bows towards, and how deep', () => {
    const id = playerWithARun()
    board.setCounterBend(id, 4)
    const wrapper = mountInspector([{ kind: 'counter', id }])
    expect(wrapper.find('[data-run-curve]').text()).toContain('Bows right 4m')
  })

  it('names the other side when the bow goes the other way', () => {
    const id = playerWithARun()
    board.setCounterBend(id, -4)
    const wrapper = mountInspector([{ kind: 'counter', id }])
    expect(wrapper.find('[data-run-curve]').text()).toContain('Bows left 4m')
  })

  it('offers no straighten button on a run that is already straight', () => {
    const id = playerWithARun()
    const wrapper = mountInspector([{ kind: 'counter', id }])
    expect(wrapper.find('[data-straighten-run]').exists()).toBe(false)
  })

  it('straightens the run', async () => {
    const id = playerWithARun()
    board.setCounterBend(id, 4, 0.1)
    const wrapper = mountInspector([{ kind: 'counter', id }])
    await wrapper.find('[data-straighten-run]').trigger('click')
    expect('bend' in board.counterById(id)!).toBe(false)
    expect('bendAlong' in board.counterById(id)!).toBe(false)
  })
})

/**
 * Which way the chevrons point.
 *
 * The panel is a card sliding in from the right on a wide screen and a
 * sheet rising from the bottom edge on a phone held upright, and an arrow
 * pointing left above a sheet that comes up describes neither.
 */
describe('the arrow on the tab', () => {
  const UP = 'm18 15-6-6-6 6'
  const DOWN = 'm6 9 6 6 6-6'
  const LEFT = 'm15 18-6-6 6-6'
  const RIGHT = 'm9 18 6-6-6-6'

  function stub(compact: boolean, portrait: boolean) {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('orientation') ? portrait : compact,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    __resetViewportForTests()
  }

  afterEach(() => __resetViewportForTests())

  function chevron(wrapper: ReturnType<typeof mountInspector>): string {
    return wrapper.find('path').attributes('d')!
  }

  it('points at the edge the panel comes from', () => {
    stub(false, false)
    expect(chevron(mountInspector([], false))).toBe(LEFT)
    expect(chevron(mountInspector([], true))).toBe(RIGHT)
  })

  it('points up and down where the panel is a sheet', () => {
    stub(true, true)
    expect(chevron(mountInspector([], false))).toBe(UP)
    expect(chevron(mountInspector([], true))).toBe(DOWN)
  })

  /** A phone on its side keeps the card, so it keeps the sideways arrows. */
  it('stays sideways on a landscape phone', () => {
    stub(true, false)
    expect(chevron(mountInspector([], false))).toBe(LEFT)
  })
})
