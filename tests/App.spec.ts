import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../src/App.vue'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { PITCH_H, PITCH_W } from '../src/geometry'

let wrapper: VueWrapper | undefined

const RECT = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }

/**
 * Mount the whole app with a board that behaves like one on screen: jsdom
 * gives every element a zero-sized rect and implements no pointer capture,
 * so without these the coordinate conversion divides by zero.
 */
function mountApp() {
  const app = mount(App, { attachTo: document.body })
  const svg = app.find('svg').element as unknown as SVGSVGElement
  svg.getBoundingClientRect = () => RECT as DOMRect
  ;(svg as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = vi.fn()
  ;(svg as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture = vi.fn()
  return app
}

/** Client coordinates for a given pitch position, matching RECT above. */
function clientFor(x: number, y: number) {
  const scale = 800 / PITCH_W
  const offsetY = (600 - PITCH_H * scale) / 2
  return { clientX: x * scale, clientY: offsetY + y * scale, pointerId: 1 }
}

async function firePointer(node: Element, type: string, opts: ReturnType<typeof clientFor>) {
  node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, ...opts }))
  await nextTick()
}

/**
 * One press on a counter, as a browser produces it: pointerdown on the
 * counter's hit circle, pointerup on the captured svg. Renaming is driven
 * from these, not from `dblclick`, which pointer capture retargets away from
 * the counter and which therefore never reaches it in a real browser.
 */
async function pressCounter(app: VueWrapper) {
  const hit = app.find('[data-counter]').element.lastElementChild as Element
  await firePointer(hit, 'pointerdown', clientFor(50, 32))
  await firePointer(app.find('svg').element, 'pointerup', clientFor(50, 32))
}

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
    wrapper = mountApp()
    await wrapper.vm.$nextTick()

    await pressCounter(wrapper)
    await pressCounter(wrapper)
    await wrapper.vm.$nextTick()

    const input = wrapper.find('#counter-label')
    expect((input.element as HTMLInputElement).value).toBe('1')

    await input.setValue('CB')
    await wrapper.find('.prompt-actions .chip').trigger('click')

    expect(board.state.counters[0].label).toBe('CB')

    board.undo()
    expect(board.state.counters[0].label).toBe('1')
  })

  it('does not open on a single press', async () => {
    useBoard().addCounter('red')
    wrapper = mountApp()
    await wrapper.vm.$nextTick()

    await pressCounter(wrapper)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('#counter-label').exists()).toBe(false)
  })

  it('does nothing on a double press while the erase tool is active', async () => {
    useBoard().addCounter('red')
    useBoard().addCounter('red')
    wrapper = mountApp()
    fire({ key: 'e' })
    await wrapper.vm.$nextTick()

    await pressCounter(wrapper)
    await pressCounter(wrapper)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('#counter-label').exists()).toBe(false)
  })
})
