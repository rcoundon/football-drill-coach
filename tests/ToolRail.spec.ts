import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { ToolMode } from '../src/types'
import ToolRail from '../src/components/ToolRail.vue'
import { useBoard, __resetBoardForTests, MAX_BALLS } from '../src/composables/useBoard'
import { COUNTER_COLORS } from '../src/geometry'
import { TOOLS } from '../src/components/controls'

beforeEach(() => __resetBoardForTests())

function mountRail(tool: ToolMode = 'select') {
  return mount(ToolRail, { props: { tool, drawColor: '#ffffff' } })
}

/**
 * Placing is one gesture with two endings: let go without moving and the
 * thing lands in the middle. The press alone decides nothing, so the release
 * is what these tests are actually exercising.
 */
async function pressAndRelease(wrapper: ReturnType<typeof mount>, selector: string) {
  await wrapper.find(selector).trigger('pointerdown')
  window.dispatchEvent(new Event('pointerup'))
  await wrapper.vm.$nextTick()
}

describe('the tool rail', () => {
  it('offers every tool the toolbar does', () => {
    const wrapper = mountRail()
    expect(wrapper.findAll('[data-tool]')).toHaveLength(TOOLS.length)
  })

  it('offers every player colour', () => {
    expect(mountRail().findAll('[data-add-counter]')).toHaveLength(COUNTER_COLORS.length)
  })

  it('adds a player of the colour pressed', async () => {
    const board = useBoard()
    const wrapper = mountRail()
    await pressAndRelease(wrapper, '[data-add-counter="blue"]')
    expect(board.state.counters[0].color).toBe('blue')
  })

  it('switches to Move, so the new player can be dragged straight away', async () => {
    const wrapper = mountRail('arrow-pass')
    await pressAndRelease(wrapper, '[data-add-counter="blue"]')
    expect(wrapper.emitted('update:tool')!.at(-1)).toEqual(['select'])
  })

  it('does not bother emitting when Move is already selected', async () => {
    const wrapper = mountRail('select')
    await pressAndRelease(wrapper, '[data-add-counter="blue"]')
    expect(wrapper.emitted('update:tool')).toBeUndefined()
  })

  it('will not add a player while the drill is playing', async () => {
    const board = useBoard()
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    board.scrubTo(500)

    const wrapper = mountRail()
    expect(wrapper.find('[data-add-counter="red"]').attributes('disabled')).toBeDefined()
    board.endScrub()
  })

  it('emits the chosen tool', async () => {
    const wrapper = mountRail()
    await wrapper.find('[data-tool="cone"]').trigger('click')
    expect(wrapper.emitted('update:tool')![0]).toEqual(['cone'])
  })

  it('marks the active tool', () => {
    expect(mountRail('erase').find('[data-tool="erase"]').classes()).toContain('is-active')
  })

  it('emits the chosen draw colour', async () => {
    const wrapper = mountRail()
    await wrapper.findAll('[data-draw-color]')[1].trigger('click')
    expect(wrapper.emitted('update:drawColor')).toBeTruthy()
  })

  /**
   * Undo and redo are actions rather than modes, and they were what got
   * pushed off the bottom of the rail. They live in the bar instead.
   */
  it('leaves undo and redo to the bar, so the rail never needs scrolling', () => {
    const wrapper = mountRail()
    expect(wrapper.find('[data-undo]').exists()).toBe(false)
    expect(wrapper.find('[data-redo]').exists()).toBe(false)
  })
})

/**
 * A rail that only offered colours never said what else a drill is made of.
 * Ball, cone and text sit with the players, under one label, because they
 * are all answers to the same question: how do I put something on the pitch?
 */
describe('the Add group', () => {
  it('names itself, so a run of colour reads as a way to add players', () => {
    expect(mountRail().text()).toMatch(/add/i)
  })

  it('offers a ball, a cone and a text label beside the players', () => {
    const wrapper = mountRail()
    expect(wrapper.find('[data-add-ball]').exists()).toBe(true)
    expect(wrapper.find('[data-add-cone]').exists()).toBe(true)
    expect(wrapper.find('[data-add-text]').exists()).toBe(true)
  })

  it('puts a ball in the middle when the ball is pressed', async () => {
    const board = useBoard()
    const wrapper = mountRail()
    const before = board.state.balls.length
    await pressAndRelease(wrapper, '[data-add-ball]')
    expect(board.state.balls).toHaveLength(before + 1)
  })

  it('puts a cone in the middle, then hands the board back to Move', async () => {
    const board = useBoard()
    const wrapper = mountRail('cone')
    await pressAndRelease(wrapper, '[data-add-cone]')
    expect(board.state.markers).toHaveLength(1)
    expect(wrapper.emitted('update:tool')!.at(-1)).toEqual(['select'])
  })

  /** A label with no words is nothing to look at, so the app asks first. */
  it('asks the app for the words when a text label is pressed', async () => {
    const wrapper = mountRail()
    await pressAndRelease(wrapper, '[data-add-text]')
    expect(wrapper.emitted('addLabel')).toHaveLength(1)
  })

  it('stops at the cap, and says why', async () => {
    const board = useBoard()
    while (board.state.balls.length < MAX_BALLS) board.addBall()
    const wrapper = mountRail()
    await wrapper.vm.$nextTick()
    const add = wrapper.find('[data-add-ball]')
    expect(add.attributes('disabled')).toBeDefined()
    expect(add.attributes('title')).toMatch(new RegExp(String(MAX_BALLS)))
  })

  /**
   * Otherwise the button works, nothing appears, and the coach presses it
   * again — then finds four balls when they next show them.
   */
  it('will not put a ball out while the balls are hidden, and says why', async () => {
    const board = useBoard()
    board.toggleBallsVisible()
    const wrapper = mountRail()
    await wrapper.vm.$nextTick()
    const add = wrapper.find('[data-add-ball]')
    expect(add.attributes('disabled')).toBeDefined()
    expect(add.attributes('title')).toMatch(/show the balls/i)
  })

  it('will not add anything while the drill is playing', async () => {
    const board = useBoard()
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    board.scrubTo(500)

    const wrapper = mountRail()
    expect(wrapper.find('[data-add-cone]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-add-text]').attributes('disabled')).toBeDefined()
    board.endScrub()
  })
})

/**
 * A radio group that cannot be driven with the arrow keys is a radio group
 * in name only, and eight tools that each take a Tab stop is eight presses
 * between the rail and the board.
 */
describe('reaching the tools from the keyboard', () => {
  it('puts exactly one tool in the tab order — the one in use', () => {
    const wrapper = mountRail('cone')
    const tabbable = wrapper
      .findAll('[data-tool]')
      .filter((button) => button.attributes('tabindex') === '0')
    expect(tabbable).toHaveLength(1)
    expect(tabbable[0].attributes('data-tool')).toBe('cone')
  })

  it('moves to the next tool on an arrow key, and chooses it', async () => {
    const wrapper = mountRail('select')
    await wrapper.find('[data-tool="select"]').trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('update:tool')!.at(-1)).toEqual(['pen'])
  })

  it('goes the other way too', async () => {
    const wrapper = mountRail('pen')
    await wrapper.find('[data-tool="pen"]').trigger('keydown', { key: 'ArrowUp' })
    expect(wrapper.emitted('update:tool')!.at(-1)).toEqual(['select'])
  })

  /** Past the end is the beginning: a rail has two ends and no dead stop. */
  it('wraps around at both ends', async () => {
    const first = mountRail('select')
    await first.find('[data-tool="select"]').trigger('keydown', { key: 'ArrowUp' })
    expect(first.emitted('update:tool')!.at(-1)).toEqual(['erase'])

    const last = mountRail('erase')
    await last.find('[data-tool="erase"]').trigger('keydown', { key: 'ArrowDown' })
    expect(last.emitted('update:tool')!.at(-1)).toEqual(['select'])
  })

  it('leaves other keys to the board', async () => {
    const wrapper = mountRail('select')
    await wrapper.find('[data-tool="select"]').trigger('keydown', { key: 'r' })
    expect(wrapper.emitted('update:tool')).toBeUndefined()
  })
})

/**
 * Lying down, the rail shares its width with whatever the notes panel is
 * not using. Eight tools are 464px side by side, and a group that can
 * neither shrink nor wrap runs out of the strip and over what is beside it.
 */
describe('the rail lying down', () => {
  function mountHorizontal() {
    return mount(ToolRail, {
      props: { tool: 'select' as ToolMode, drawColor: '#ffffff', horizontal: true },
    })
  }

  it('carries every control it carries standing up', () => {
    const wrapper = mountHorizontal()
    expect(wrapper.findAll('[data-tool]')).toHaveLength(TOOLS.length)
    expect(wrapper.findAll('[data-add-counter]')).toHaveLength(COUNTER_COLORS.length)
    expect(wrapper.find('[data-add-ball]').exists()).toBe(true)
    expect(wrapper.find('[data-pitch-menu]').exists()).toBe(true)
  })

  /**
   * The labels were turned on their side to save width, which set the same
   * word differently depending on which way the rail was lying.
   */
  it('keeps its group labels the right way up', () => {
    const wrapper = mountHorizontal()
    expect(wrapper.text()).toMatch(/add/i)
    expect(wrapper.text()).toMatch(/tools/i)
    expect(wrapper.text()).toMatch(/ink/i)
  })

  it('says which way it is lying, so the styles can follow', () => {
    expect(mountHorizontal().find('.rail').classes()).toContain('rail--horizontal')
    expect(mountRail().find('.rail').classes()).not.toContain('rail--horizontal')
  })
})

/**
 * Enter and Space on a focused button, and every assistive technology that
 * activates one, produce a click and no pointerdown at all. A palette that
 * only listened for pointers could be reached by keyboard but never used
 * from one.
 */
describe('placing without a pointer', () => {
  it('adds a player when the swatch is activated', async () => {
    const board = useBoard()
    const wrapper = mountRail()
    await wrapper.find('[data-add-counter="blue"]').trigger('click')
    expect(board.state.counters).toHaveLength(1)
    expect(board.state.counters[0].color).toBe('blue')
  })

  it('adds a ball, a cone and a label the same way', async () => {
    const board = useBoard()
    const wrapper = mountRail()
    const balls = board.state.balls.length

    await wrapper.find('[data-add-ball]').trigger('click')
    await wrapper.find('[data-add-cone]').trigger('click')
    await wrapper.find('[data-add-text]').trigger('click')

    expect(board.state.balls).toHaveLength(balls + 1)
    expect(board.state.markers).toHaveLength(1)
    expect(wrapper.emitted('addLabel')).toHaveLength(1)
  })

  /**
   * A press with a pointer behind it produces a click too, and the two
   * routes must not both place.
   */
  it('places once for a press, not twice', async () => {
    const board = useBoard()
    const wrapper = mountRail()
    const swatch = wrapper.find('[data-add-counter="red"]')

    await swatch.trigger('pointerdown')
    window.dispatchEvent(new Event('pointerup'))
    await wrapper.vm.$nextTick()
    await swatch.trigger('click')

    expect(board.state.counters).toHaveLength(1)
  })

  it('refuses while the drill is mid-move', async () => {
    const board = useBoard()
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    board.scrubTo(500)

    const wrapper = mountRail()
    await wrapper.find('[data-add-counter="blue"]').trigger('click')

    expect(board.state.counters).toHaveLength(0)
    board.endScrub()
  })
})

/**
 * The rail scrolls on a short screen, and on a Mac set to show scrollbars
 * always that drew a permanent light stripe down the swatches — furniture
 * beside the row of controls a coach uses most. The bar is painted only
 * while the pointer or the keyboard is in the rail; the gutter it sits in
 * is reserved either way, so revealing it shifts nothing.
 */
describe('the scrollbar in the rail', () => {
  const source = (
    import.meta.glob('../src/components/ToolRail.vue', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
  )['../src/components/ToolRail.vue']

  function rule(selector: string): string {
    return source.match(new RegExp(`\\${selector} \\{([^}]*)\\}`))![1]
  }

  it('is unpainted until the rail is hovered or focused', () => {
    for (const scroller of ['.rail-scroll', '.rail']) {
      expect(rule(`${scroller}::-webkit-scrollbar-thumb`)).toContain('background: transparent')
      expect(source).toContain(`${scroller}:hover::-webkit-scrollbar-thumb`)
      expect(source).toContain(`${scroller}:focus-within { scrollbar-color: var(--ring)`)
    }
  })

  /** Without the gutter, revealing the bar shunts an 88px rail sideways. */
  it('keeps its gutter reserved in both scroll regions', () => {
    expect(rule('.rail-scroll')).toContain('scrollbar-gutter: stable')
    expect(source.match(/scrollbar-gutter: stable/g)!.length).toBe(2)
  })
})
