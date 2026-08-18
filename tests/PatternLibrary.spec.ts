import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PatternLibrary from '../src/components/PatternLibrary.vue'
import { useStorage } from '../src/composables/useStorage'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
})

function seed(name: string) {
  return useStorage().savePattern(name, {
    counters: [{ id: 'a', color: 'red', label: '1', pos: { x: 10, y: 10 } }],
    ball: { pos: { x: 5, y: 5 }, attachedTo: null },
    drawings: [],
    pitch: { type: 'full', rotated: false },
  })
}

describe('listing', () => {
  it('shows every saved pattern', () => {
    seed('Press trigger')
    seed('Build from the back')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    expect(wrapper.findAll('[data-pattern]')).toHaveLength(2)
  })

  it('shows a message when the library is empty', () => {
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    expect(wrapper.text()).toMatch(/nothing saved yet/i)
  })

  it('renders nothing when closed', () => {
    seed('Press trigger')
    const wrapper = mount(PatternLibrary, { props: { open: false } })
    expect(wrapper.findAll('[data-pattern]')).toHaveLength(0)
  })
})

describe('loading', () => {
  it('puts the pattern on the board and closes', async () => {
    seed('Press trigger')
    const board = useBoard()
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-load]').trigger('click')
    expect(board.state.counters).toHaveLength(1)
    expect(board.state.pitch.type).toBe('full')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('is undoable, so a mis-click does not lose the working board', async () => {
    seed('Press trigger')
    const board = useBoard()
    board.addCounter('blue')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-load]').trigger('click')
    board.undo()
    expect(board.state.counters[0].color).toBe('blue')
  })
})

describe('deleting', () => {
  it('removes the pattern from the list', async () => {
    seed('Press trigger')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-delete]').trigger('click')
    await wrapper.find('[data-confirm-delete]').trigger('click')
    expect(wrapper.findAll('[data-pattern]')).toHaveLength(0)
    expect(useStorage().listPatterns()).toHaveLength(0)
  })

  it('asks for confirmation first, in the page rather than a browser dialog', async () => {
    seed('Press trigger')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-delete]').trigger('click')
    expect(wrapper.find('[data-confirm-delete]').exists()).toBe(true)
    expect(useStorage().listPatterns()).toHaveLength(1)
  })
})

describe('renaming', () => {
  it('saves the new name', async () => {
    seed('Press trigger')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-rename]').trigger('click')
    const input = wrapper.find('[data-rename-input]')
    await input.setValue('Counter press')
    await wrapper.find('[data-rename-save]').trigger('click')
    expect(useStorage().listPatterns()[0].name).toBe('Counter press')
  })
})
