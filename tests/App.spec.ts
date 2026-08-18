import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import App from '../src/App.vue'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'

let wrapper: VueWrapper | undefined

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

function fire(init: KeyboardEventInit, target: EventTarget = window) {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
}

describe('keyboard shortcuts', () => {
  it('switches to the pen tool on an unmodified "p"', async () => {
    wrapper = mount(App)
    fire({ key: 'p' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-tool="pen"]').classes()).toContain('is-active')
  })

  it('does not change the tool on Ctrl+S or Meta+S, leaving the shortcut to the browser', async () => {
    wrapper = mount(App)
    fire({ key: 's', ctrlKey: true })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-tool="select"]').classes()).toContain('is-active')
    expect(wrapper.find('[data-tool="arrow-pass"]').classes()).not.toContain('is-active')

    fire({ key: 's', metaKey: true })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-tool="select"]').classes()).toContain('is-active')
    expect(wrapper.find('[data-tool="arrow-pass"]').classes()).not.toContain('is-active')
  })

  it('undoes on Ctrl+Z and redoes on Ctrl+Shift+Z', async () => {
    const board = useBoard()
    board.addCounter('red')
    wrapper = mount(App)
    expect(board.state.counters).toHaveLength(1)

    fire({ key: 'z', ctrlKey: true })
    expect(board.state.counters).toHaveLength(0)

    fire({ key: 'z', ctrlKey: true, shiftKey: true })
    expect(board.state.counters).toHaveLength(1)
  })

  it('ignores keystrokes while an input has focus', async () => {
    wrapper = mount(App)
    const input = document.createElement('input')
    document.body.appendChild(input)
    try {
      fire({ key: 'p' }, input)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-tool="select"]').classes()).toContain('is-active')
      expect(wrapper.find('[data-tool="pen"]').classes()).not.toContain('is-active')
    } finally {
      document.body.removeChild(input)
    }
  })
})

describe('renaming a counter label', () => {
  it('opens pre-filled with the current label, saves the new one, and is undoable', async () => {
    const board = useBoard()
    board.addCounter('red')
    wrapper = mount(App)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-counter] circle:last-child').trigger('dblclick')
    await wrapper.vm.$nextTick()

    const input = wrapper.find('#counter-label')
    expect((input.element as HTMLInputElement).value).toBe('1')

    await input.setValue('CB')
    await wrapper.find('.prompt-actions .chip').trigger('click')

    expect(board.state.counters[0].label).toBe('CB')

    board.undo()
    expect(board.state.counters[0].label).toBe('1')
  })

  it('does nothing on double-click while the erase tool is active', async () => {
    const board = useBoard()
    board.addCounter('red')
    wrapper = mount(App)
    fire({ key: 'e' })
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-counter] circle:last-child').trigger('dblclick')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('#counter-label').exists()).toBe(false)
  })
})
