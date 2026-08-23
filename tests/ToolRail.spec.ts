import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { ToolMode } from '../src/types'
import ToolRail from '../src/components/ToolRail.vue'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { COUNTER_COLORS } from '../src/geometry'
import { TOOLS } from '../src/components/controls'

beforeEach(() => __resetBoardForTests())

function mountRail(tool: ToolMode = 'select') {
  return mount(ToolRail, { props: { tool, drawColor: '#ffffff' } })
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
    await wrapper.find('[data-add-counter="blue"]').trigger('click')
    expect(board.state.counters[0].color).toBe('blue')
  })

  it('switches to Move, so the new player can be dragged straight away', async () => {
    const wrapper = mountRail('arrow-pass')
    await wrapper.find('[data-add-counter="blue"]').trigger('click')
    expect(wrapper.emitted('update:tool')!.at(-1)).toEqual(['select'])
  })

  it('does not bother emitting when Move is already selected', async () => {
    const wrapper = mountRail('select')
    await wrapper.find('[data-add-counter="blue"]').trigger('click')
    expect(wrapper.emitted('update:tool')).toBeUndefined()
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
