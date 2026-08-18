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
})
