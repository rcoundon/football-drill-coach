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
