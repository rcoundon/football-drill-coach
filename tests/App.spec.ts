import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../src/App.vue'
import { useBoard, __resetBoardForTests, type BoardSnapshot } from '../src/composables/useBoard'
import { useStorage, PATTERNS_KEY } from '../src/composables/useStorage'
import { useExport } from '../src/composables/useExport'
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
  useStorage().lastError.value = null
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
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

function sampleSnapshot(): BoardSnapshot {
  return {
    counters: [{ id: 'a', color: 'red', label: '1', pos: { x: 10, y: 10 } }],
    ball: { pos: { x: 5, y: 5 }, attachedTo: null },
    drawings: [],
    pitch: { type: 'full', rotated: false },
  }
}

async function openLibraryAndLoad(app: VueWrapper) {
  await app.find('[data-open]').trigger('click')
  await app.find('[data-load]').trigger('click')
  await nextTick()
}

/**
 * PatternLibrary used to load the snapshot itself and emit nothing, so App
 * never learned which pattern was open: Save forked a second pattern with
 * the same name and diverging content, the PNG filename fell back to
 * "tactics-board", and the save prompt offered "New pattern".
 */
describe('the pattern that is open', () => {
  it('is remembered when one is loaded from the library, and put on the board', async () => {
    const store = useStorage()
    store.savePattern('Press trigger', sampleSnapshot())
    const board = useBoard()
    wrapper = mountApp()

    await openLibraryAndLoad(wrapper)

    expect(board.state.counters).toHaveLength(1)
    expect(board.state.pitch.type).toBe('full')
    expect(wrapper.find('[data-current-pattern]').text()).toContain('Press trigger')
  })

  it('is undoable, so a mis-click does not lose the working board', async () => {
    useStorage().savePattern('Press trigger', sampleSnapshot())
    const board = useBoard()
    board.addCounter('blue')
    wrapper = mountApp()

    await openLibraryAndLoad(wrapper)
    board.undo()

    expect(board.state.counters[0].color).toBe('blue')
  })

  it('is updated in place by Save, not forked into a second copy', async () => {
    const store = useStorage()
    const saved = store.savePattern('Press trigger', sampleSnapshot())
    const board = useBoard()
    wrapper = mountApp()

    await openLibraryAndLoad(wrapper)
    board.addCounter('blue')
    await wrapper.find('[data-save]').trigger('click')
    await nextTick()

    const listed = store.listPatterns()
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(saved.id)
    expect(listed[0].name).toBe('Press trigger')
    expect(listed[0].frames[0].counters).toHaveLength(2)
  })

  it('names the PNG after the loaded pattern', async () => {
    useStorage().savePattern('Press trigger', sampleSnapshot())
    const exporter = useExport()
    vi.spyOn(exporter, 'svgToPngBlob').mockResolvedValue(new Blob(['x']))
    const downloads: string[] = []
    vi.spyOn(exporter, 'downloadBlob').mockImplementation((_blob, name) => { downloads.push(name) })
    wrapper = mountApp()

    await openLibraryAndLoad(wrapper)
    await wrapper.find('[data-export-png]').trigger('click')
    await nextTick()
    await nextTick()

    expect(downloads).toEqual(['press-trigger.png'])
  })
})

/**
 * The spec requires "Save" and "Save as…" as distinct actions. Without the
 * second, typing a new name in the save dialog with a pattern open renamed
 * and overwrote the source pattern instead of forking it.
 */
describe('Save as…', () => {
  it('forks the open pattern under the new name and leaves the original alone', async () => {
    const store = useStorage()
    const original = store.savePattern('Press trigger', sampleSnapshot())
    const board = useBoard()
    wrapper = mountApp()

    await openLibraryAndLoad(wrapper)
    board.addCounter('blue')
    await wrapper.find('[data-save-as]').trigger('click')
    await wrapper.find('#pattern-name').setValue('Counter press')
    await wrapper.find('[data-confirm-save]').trigger('click')
    await nextTick()

    const listed = store.listPatterns()
    expect(listed).toHaveLength(2)

    const source = listed.find((p) => p.id === original.id)!
    expect(source.name).toBe('Press trigger')
    expect(source.frames[0].counters).toHaveLength(1)

    const fork = listed.find((p) => p.id !== original.id)!
    expect(fork.name).toBe('Counter press')
    expect(fork.frames[0].counters).toHaveLength(2)

    // The fork is what is open now, so the next Save updates the copy.
    expect(wrapper.find('[data-current-pattern]').text()).toContain('Counter press')
  })

  it('offers the open pattern name as the starting point rather than a placeholder', async () => {
    useStorage().savePattern('Press trigger', sampleSnapshot())
    wrapper = mountApp()

    await openLibraryAndLoad(wrapper)
    await wrapper.find('[data-save-as]').trigger('click')

    expect((wrapper.find('#pattern-name').element as HTMLInputElement).value).toContain('Press trigger')
  })
})

describe('saving a board that is not in the library yet', () => {
  it('asks for a name and saves under it', async () => {
    const store = useStorage()
    useBoard().addCounter('red')
    wrapper = mountApp()

    await wrapper.find('[data-save]').trigger('click')
    await wrapper.find('#pattern-name').setValue('Press trigger')
    await wrapper.find('[data-confirm-save]').trigger('click')
    await nextTick()

    const listed = store.listPatterns()
    expect(listed).toHaveLength(1)
    expect(listed[0].name).toBe('Press trigger')
    expect(wrapper.find('[data-current-pattern]').text()).toContain('Press trigger')
  })
})

/**
 * loadSnapshot commits, so restoring the draft on mount left an undo stack
 * whose one entry was "empty board": a coach who opens the app and hits
 * Ctrl+Z loses the restored board, and the debounced autosave then writes
 * the empty board over the draft 400ms later.
 */
describe('restoring the autosaved draft', () => {
  it('puts the board back without putting anything on the undo stack', async () => {
    const store = useStorage()
    store.saveDraft(sampleSnapshot())
    const board = useBoard()

    wrapper = mountApp()
    await nextTick()

    expect(board.state.counters).toHaveLength(1)
    expect(board.state.pitch.type).toBe('full')
    expect(board.canUndo.value).toBe(false)
  })

  it('survives a reflexive Ctrl+Z on a freshly opened app', async () => {
    useStorage().saveDraft(sampleSnapshot())
    const board = useBoard()

    wrapper = mountApp()
    await nextTick()
    fire({ key: 'z', ctrlKey: true })

    expect(board.state.counters).toHaveLength(1)
  })
})

describe('the storage error message', () => {
  it('can be dismissed by clicking it, like the notice above it', async () => {
    const store = useStorage()
    wrapper = mountApp()
    store.lastError.value = 'Something went wrong.'
    await nextTick()

    expect(wrapper.find('.error').exists()).toBe(true)
    await wrapper.find('.error').trigger('click')

    expect(wrapper.find('.error').exists()).toBe(false)
    expect(store.lastError.value).toBeNull()
  })
})

/**
 * The library renames and deletes through useStorage. App owns which pattern
 * is open, so unless the library reports what it did, the two drift: Save
 * wrote the stale name back over a renamed pattern, and resurrected a deleted
 * one under its old id.
 */
describe('the library changing the open pattern', () => {
  it('keeps the open name in step when the library renames it', async () => {
    const store = useStorage()
    const saved = store.savePattern('Press trigger', sampleSnapshot())
    wrapper = mountApp()

    await openLibraryAndLoad(wrapper)
    await wrapper.find('[data-open]').trigger('click')
    await wrapper.find('[data-rename]').trigger('click')
    await wrapper.find('[data-rename-input]').setValue('Counter press')
    await wrapper.find('[data-rename-save]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-current-pattern]').text()).toContain('Counter press')

    await wrapper.find('[data-save]').trigger('click')
    await nextTick()

    const listed = store.listPatterns()
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(saved.id)
    expect(listed[0].name).toBe('Counter press')
  })

  it('closes the open pattern when the library deletes it, so Save cannot resurrect it', async () => {
    const store = useStorage()
    store.savePattern('Press trigger', sampleSnapshot())
    wrapper = mountApp()

    await openLibraryAndLoad(wrapper)
    await wrapper.find('[data-open]').trigger('click')
    await wrapper.find('[data-delete]').trigger('click')
    await wrapper.find('[data-confirm-delete]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-current-pattern]').text()).toMatch(/unsaved/i)

    await wrapper.find('[data-save]').trigger('click')
    await nextTick()

    // Save must ask for a name rather than write the deleted pattern back.
    expect(wrapper.find('#pattern-name').exists()).toBe(true)
    expect(store.listPatterns()).toHaveLength(0)
  })
})

/**
 * savePattern deliberately writes nothing when the library is unreadable, so
 * claiming success unconditionally showed the coach a "Saved" notice and an
 * error banner at the same time.
 */
describe('a save that was refused', () => {
  it('does not claim the open pattern was saved', async () => {
    const store = useStorage()
    store.savePattern('Press trigger', sampleSnapshot())
    wrapper = mountApp()
    await openLibraryAndLoad(wrapper)

    localStorage.setItem(PATTERNS_KEY, '{not json at all')
    await wrapper.find('[data-save]').trigger('click')
    await nextTick()

    expect(wrapper.find('.notice').exists()).toBe(false)
    expect(wrapper.find('.error').exists()).toBe(true)
    expect(store.lastError.value).toMatch(/could not be read/i)
  })

  it('does not treat a pattern that was never written as the open one', async () => {
    useBoard().addCounter('red')
    localStorage.setItem(PATTERNS_KEY, '{not json at all')
    wrapper = mountApp()

    await wrapper.find('[data-save]').trigger('click')
    await wrapper.find('#pattern-name').setValue('Press trigger')
    await wrapper.find('[data-confirm-save]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-current-pattern]').text()).toMatch(/unsaved/i)
    expect(localStorage.getItem(PATTERNS_KEY)).toBe('{not json at all')
  })
})
