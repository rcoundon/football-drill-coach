import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { ToolMode } from '../src/types'
import Toolbar from '../src/components/Toolbar.vue'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { COUNTER_COLORS } from '../src/geometry'

beforeEach(() => __resetBoardForTests())

function mountToolbar(tool: ToolMode = 'select') {
  return mount(Toolbar, { props: { tool, drawColor: '#ffffff' } })
}

describe('colour palette', () => {
  it('offers one swatch per colour', () => {
    expect(mountToolbar().findAll('[data-add-counter]')).toHaveLength(COUNTER_COLORS.length)
  })

  it('adds a counter of that colour when a swatch is clicked', async () => {
    const board = useBoard()
    const wrapper = mountToolbar()
    await wrapper.find('[data-add-counter="blue"]').trigger('click')
    expect(board.state.counters).toHaveLength(1)
    expect(board.state.counters[0].color).toBe('blue')
  })
})

describe('tool selection', () => {
  it('emits the chosen tool', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('[data-tool="pen"]').trigger('click')
    expect(wrapper.emitted('update:tool')![0]).toEqual(['pen'])
  })

  it('marks the active tool', () => {
    const wrapper = mount(Toolbar, { props: { tool: 'erase' as ToolMode, drawColor: '#ffffff' } })
    expect(wrapper.find('[data-tool="erase"]').classes()).toContain('is-active')
  })
})

describe('pitch controls', () => {
  it('changes the pitch type', async () => {
    const board = useBoard()
    const wrapper = mountToolbar()
    await wrapper.find('[data-pitch="full"]').trigger('click')
    expect(board.state.pitch.type).toBe('full')
  })

  it('rotates the board', async () => {
    const board = useBoard()
    const wrapper = mountToolbar()
    await wrapper.find('[data-rotate]').trigger('click')
    expect(board.state.pitch.rotated).toBe(true)
  })
})

describe('undo and redo buttons', () => {
  it('are disabled when there is nothing to do', () => {
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-undo]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-redo]').attributes('disabled')).toBeDefined()
  })

  it('undoes', async () => {
    const board = useBoard()
    board.addCounter('red')
    const wrapper = mountToolbar()
    await wrapper.find('[data-undo]').trigger('click')
    expect(board.state.counters).toHaveLength(0)
  })
})

describe('menu actions', () => {
  it('emits save', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('[data-save]').trigger('click')
    expect(wrapper.emitted('save')).toBeTruthy()
  })

  it('emits exportPng', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('[data-export-png]').trigger('click')
    expect(wrapper.emitted('exportPng')).toBeTruthy()
  })

  it('emits saveAs, which is a different action from save', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('[data-save-as]').trigger('click')
    expect(wrapper.emitted('saveAs')).toBeTruthy()
    expect(wrapper.emitted('save')).toBeFalsy()
  })
})

/**
 * Save updates the open pattern and Save as… forks it. The coach has to be
 * able to see which one they are about to get, so the toolbar names the
 * pattern that is open.
 */
describe('the open pattern', () => {
  it('names the pattern Save will update', () => {
    const wrapper = mount(Toolbar, {
      props: { tool: 'select' as ToolMode, drawColor: '#ffffff', patternName: 'Press trigger' },
    })
    expect(wrapper.find('[data-current-pattern]').text()).toContain('Press trigger')
    expect(wrapper.find('[data-save]').attributes('title')).toContain('Press trigger')
  })

  it('says so when nothing is open, so Save cannot look like an update', () => {
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-current-pattern]').text()).toMatch(/unsaved/i)
    expect(wrapper.find('[data-save]').attributes('title')).toMatch(/new pattern/i)
  })
})

describe('the line tool', () => {
  it('is offered alongside the other tools', () => {
    expect(mountToolbar().find('[data-tool="line"]').exists()).toBe(true)
  })

  it('emits the line tool when chosen', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('[data-tool="line"]').trigger('click')
    expect(wrapper.emitted('update:tool')![0]).toEqual(['line'])
  })
})

describe('clearing the board', () => {
  it('clears the players without touching the drawings', async () => {
    const board = useBoard()
    board.addCounter('red')
    const line = board.startLine({ x: 5, y: 5 }, '#fff')
    board.updateSegment(line, { x: 60, y: 5 })
    board.finishDrawing(line)

    const wrapper = mountToolbar()
    await wrapper.find('[data-clear-players]').trigger('click')

    expect(board.state.counters).toEqual([])
    expect(board.state.drawings).toHaveLength(1)
  })

  it('resets everything', async () => {
    const board = useBoard()
    board.addCounter('red')
    const line = board.startLine({ x: 5, y: 5 }, '#fff')
    board.updateSegment(line, { x: 60, y: 5 })
    board.finishDrawing(line)

    const wrapper = mountToolbar()
    await wrapper.find('[data-reset]').trigger('click')

    expect(board.state.counters).toEqual([])
    expect(board.state.drawings).toEqual([])
  })

  it('emits reset so the app can forget the open pattern', async () => {
    const board = useBoard()
    board.addCounter('red')
    const wrapper = mountToolbar()
    await wrapper.find('[data-reset]').trigger('click')
    expect(wrapper.emitted('reset')).toBeTruthy()
  })

  it('disables each button when it has nothing to do', () => {
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-clear-players]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-clear-drawings]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-reset]').attributes('disabled')).toBeDefined()
  })

  it('enables clearing the players once there is one', () => {
    useBoard().addCounter('red')
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-clear-players]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-clear-drawings]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-reset]').attributes('disabled')).toBeUndefined()
  })
})
