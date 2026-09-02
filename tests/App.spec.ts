import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../src/App.vue'
import { useBoard, __resetBoardForTests, type BoardSnapshot } from '../src/composables/useBoard'
import { useStorage, PATTERNS_KEY } from '../src/composables/useStorage'
import { __resetViewportForTests } from '../src/composables/useViewport'
import { useExport } from '../src/composables/useExport'
import { useSessions } from '../src/composables/useSessions'
import { PITCH_H, PITCH_W } from '../src/geometry'

// jsdom has no canvas package installed, so decoding a rasterised board never
// settles at all rather than rejecting (see the comment on this same point
// in useExport's GIF encoder) — real rendering would hang the one test below
// that exercises a rasterise failure. Mocked here rather than left real, the
// same way sessionPdf.spec.ts mocks it for the same reason.
vi.mock('../src/composables/renderFrame', () => ({
  renderFrameToDataUrl: vi.fn(async () => 'data:image/png;base64,AAAA'),
  SESSION_BOARD_WIDTH: 800,
}))

let wrapper: VueWrapper | undefined

const RECT = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }

/**
 * Mount the whole app with a board that behaves like one on screen: jsdom
 * gives every element a zero-sized rect and implements no pointer capture,
 * so without these the coordinate conversion divides by zero.
 */
function mountApp() {
  const app = mount(App, { attachTo: document.body })
  const svg = app.find('.stage svg').element as unknown as SVGSVGElement
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
/** The drill name, which the header renders as an editable field. */
function drillName(app: VueWrapper): string {
  return (app.find('[data-current-pattern]').element as HTMLInputElement).value
}

async function pressCounter(app: VueWrapper) {
  const hit = app.find('[data-counter]').element.lastElementChild as Element
  await firePointer(hit, 'pointerdown', clientFor(50, 32))
  await firePointer(app.find('.stage svg').element, 'pointerup', clientFor(50, 32))
}

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
  useStorage().lastError.value = null
  // No longer the same ref as the line above — each store owns its own pair
  // now, so both need resetting between tests.
  useSessions().lastError.value = null
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})

/** Returns what `dispatchEvent` returns: false once something calls `preventDefault`. */
function fire(init: KeyboardEventInit, target: EventTarget = window): boolean {
  return target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
}

describe('resetting the board', () => {
  it('forgets the open pattern, so a later Save cannot overwrite it', async () => {
    const board = useBoard()
    const storage = useStorage()
    const saved = storage.savePattern('High press', board.snapshot())

    wrapper = mount(App)
    await wrapper.vm.$nextTick()

    // Load it, so the app is treating this board as that pattern.
    await wrapper.find('[data-open]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-load]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(drillName(wrapper)).toContain('High press')

    board.addCounter('red')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-reset]').trigger('click')
    await wrapper.find('[data-confirm-reset]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(drillName(wrapper)).not.toContain('High press')
    expect(storage.listPatterns().find((p) => p.id === saved.id)).toBeDefined()
  })

  /**
   * Reset refuses on the board while the drill is playing or mid-move — but
   * the toolbar used to forget the open pattern regardless, so the coach saw
   * "Unsaved" for a board that had not actually changed, and the next Save
   * wrote a duplicate under a new id. It is now refused before it is even
   * offered.
   */
  it('is refused while the drill is playing or mid-move, so a saved pattern is not silently detached', async () => {
    const board = useBoard()
    const storage = useStorage()
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    storage.savePattern('High press', board.snapshot())

    wrapper = mountApp()
    await wrapper.vm.$nextTick()

    await openLibraryAndLoad(wrapper)
    expect(drillName(wrapper)).toContain('High press')

    board.scrubTo(500)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-reset]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-reset]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-confirm-reset]').exists()).toBe(false)
    expect(drillName(wrapper)).toContain('High press')
    expect(board.state.frames).toHaveLength(2)

    board.endScrub()
  })
})

describe('dialogs', () => {
  it('focuses the name field when the save prompt opens, so typing lands in it', async () => {
    useBoard().addCounter('red')
    wrapper = mount(App, { attachTo: document.body })
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-save]').trigger('click')
    await wrapper.vm.$nextTick()
    await nextTick()

    const input = wrapper.find('[role="dialog"] input').element
    expect(document.activeElement).toBe(input)
  })

  /**
   * Without this, typing a pattern name drives the tool shortcuts behind
   * the dialog: "Cone grid" contains an r, so the board silently switches
   * to the Run tool while the coach is naming their drill.
   */
  it('ignores tool shortcuts while a dialog is open', async () => {
    useBoard().addCounter('red')
    wrapper = mount(App, { attachTo: document.body })
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-save]').trigger('click')
    await wrapper.vm.$nextTick()

    fire({ key: 'r' })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-tool="arrow-run"]').classes()).not.toContain('is-active')
    expect(wrapper.find('[data-tool="select"]').classes()).toContain('is-active')
  })

  it('ignores tool shortcuts while the library is open', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-open]').trigger('click')
    await wrapper.vm.$nextTick()

    fire({ key: 'd' })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-tool="pen"]').classes()).not.toContain('is-active')
  })
})

describe('keyboard shortcuts', () => {
  it('switches to the pen tool on an unmodified "d"', async () => {
    wrapper = mount(App)
    fire({ key: 'd' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-tool="pen"]').classes()).toContain('is-active')
  })

  it('switches to the line tool on an unmodified "l"', async () => {
    wrapper = mount(App)
    fire({ key: 'l' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-tool="line"]').classes()).toContain('is-active')
  })

  it('does not change the tool on Ctrl+P or Meta+P, leaving Print to the browser', async () => {
    wrapper = mount(App)
    fire({ key: 'p', ctrlKey: true })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-tool="select"]').classes()).toContain('is-active')
    expect(wrapper.find('[data-tool="arrow-pass"]').classes()).not.toContain('is-active')

    fire({ key: 'p', metaKey: true })
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
      fire({ key: 'd' }, input)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-tool="select"]').classes()).toContain('is-active')
      expect(wrapper.find('[data-tool="pen"]').classes()).not.toContain('is-active')
    } finally {
      document.body.removeChild(input)
    }
  })
})

describe('the chosen drawing and the keyboard', () => {
  /** Draw an arrow, then choose it by pressing it, as a coach would. */
  async function chooseAnArrow(app: VueWrapper) {
    const board = useBoard()
    const id = board.startArrow({ x: 20, y: 30 }, '#ffffff', 'pass')
    board.updateSegment(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    await app.vm.$nextTick()
    const path = app.find('[data-drawing]').element
    await firePointer(path, 'pointerdown', clientFor(40, 30))
    await firePointer(app.find('.stage svg').element, 'pointerup', clientFor(40, 30))
  }

  it('rubs the chosen drawing out on Delete', async () => {
    const board = useBoard()
    wrapper = mount(App)
    await chooseAnArrow(wrapper)

    fire({ key: 'Delete' })
    await wrapper.vm.$nextTick()

    expect(board.state.drawings).toEqual([])
  })

  it('does the same on Backspace, which is the key a laptop offers', async () => {
    const board = useBoard()
    wrapper = mount(App)
    await chooseAnArrow(wrapper)

    fire({ key: 'Backspace' })
    await wrapper.vm.$nextTick()

    expect(board.state.drawings).toEqual([])
  })

  it('leaves the board alone when no drawing has been chosen', async () => {
    const board = useBoard()
    const id = board.startArrow({ x: 20, y: 30 }, '#ffffff', 'pass')
    board.updateSegment(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    wrapper = mount(App)

    fire({ key: 'Delete' })
    await wrapper.vm.$nextTick()

    expect(board.state.drawings).toHaveLength(1)
  })

  it('puts the drawing down on Escape without rubbing it out', async () => {
    const board = useBoard()
    wrapper = mount(App)
    await chooseAnArrow(wrapper)
    expect(wrapper.find('[data-selected]').exists()).toBe(true)

    fire({ key: 'Escape' })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-selected]').exists()).toBe(false)
    expect(board.state.drawings).toHaveLength(1)
  })

  it('copies the chosen drawing on Cmd+D', async () => {
    const board = useBoard()
    wrapper = mount(App)
    await chooseAnArrow(wrapper)

    fire({ key: 'd', metaKey: true })
    await wrapper.vm.$nextTick()

    expect(board.state.drawings).toHaveLength(2)
  })

  it('copies on Ctrl+D too, for a keyboard without a Cmd key', async () => {
    const board = useBoard()
    wrapper = mount(App)
    await chooseAnArrow(wrapper)

    fire({ key: 'd', ctrlKey: true })
    await wrapper.vm.$nextTick()

    expect(board.state.drawings).toHaveLength(2)
  })

  it('leaves Cmd+D alone when nothing is held, so bookmarking still works', async () => {
    const board = useBoard()
    const id = board.startArrow({ x: 20, y: 30 }, '#ffffff', 'pass')
    board.updateSegment(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    wrapper = mount(App)

    fire({ key: 'd', metaKey: true })
    await wrapper.vm.$nextTick()

    expect(board.state.drawings).toHaveLength(1)
  })

  it('copies from the inspector, which is the only way in on a tablet', async () => {
    const board = useBoard()
    wrapper = mount(App)
    await chooseAnArrow(wrapper)

    await wrapper.find('[data-duplicate]').trigger('click')

    expect(board.state.drawings).toHaveLength(2)
  })

  it('removes from the inspector as well', async () => {
    const board = useBoard()
    wrapper = mount(App)
    await chooseAnArrow(wrapper)

    await wrapper.find('[data-delete-selection]').trigger('click')

    expect(board.state.drawings).toEqual([])
  })

  /**
   * The buttons no longer sit in the chrome waiting to be greyed out: they
   * only exist while something is held, which is the only time either of
   * them means anything.
   */
  it('offers neither until something is held', async () => {
    const board = useBoard()
    const id = board.startArrow({ x: 20, y: 30 }, '#ffffff', 'pass')
    board.updateSegment(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    wrapper = mount(App)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-duplicate]').exists()).toBe(false)

    await chooseAnArrow(wrapper)

    expect(wrapper.find('[data-duplicate]').exists()).toBe(true)
  })

  it('leaves Delete to the field while a dialog is up', async () => {
    const board = useBoard()
    wrapper = mount(App)
    await chooseAnArrow(wrapper)
    await wrapper.find('[data-save]').trigger('click')

    fire({ key: 'Delete' })
    await wrapper.vm.$nextTick()

    expect(board.state.drawings).toHaveLength(1)
  })
})

describe('renaming a counter label', () => {
  it('opens empty on a fresh counter, saves what is typed, and is undoable', async () => {
    const board = useBoard()
    board.addCounter('red')
    wrapper = mountApp()
    await wrapper.vm.$nextTick()

    await pressCounter(wrapper)
    await pressCounter(wrapper)
    await wrapper.vm.$nextTick()

    const input = wrapper.find('#counter-label')
    expect((input.element as HTMLInputElement).value).toBe('')

    await input.setValue('CB')
    await wrapper.find('.prompt-actions .chip').trigger('click')

    expect(board.state.counters[0].label).toBe('CB')

    board.undo()
    expect(board.state.counters[0].label).toBe('')
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
    frames: [
      {
        counters: [{ id: 'a', color: 'red', label: '1', pos: { x: 10, y: 10 } }],
        markers: [],
        labels: [],
        balls: [{ id: 'b1', pos: { x: 5, y: 5 }, attachedTo: null }],
        drawings: [],
      },
    ],
    currentFrame: 0,
    labelsVisible: true,
    ballsVisible: true,
    notes: '',
    notesVisible: true,
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
    expect(drillName(wrapper)).toContain('Press trigger')
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
    expect(drillName(wrapper)).toContain('Counter press')
  })

  /**
   * Save as… used to pass no id at all, so the fork had nothing to carry
   * tags forward from and always landed untagged. A copy of a rondo is
   * still a rondo, and refiling a fork by hand is the exact problem tags
   * exist to solve.
   */
  it('carries the original drill’s tags onto the fork', async () => {
    const store = useStorage()
    const original = store.savePattern('Press trigger', sampleSnapshot())
    store.setTags(original.id, ['rondo', 'warm up'])
    wrapper = mountApp()

    await openLibraryAndLoad(wrapper)
    await wrapper.find('[data-save-as]').trigger('click')
    await wrapper.find('#pattern-name').setValue('Counter press')
    await wrapper.find('[data-confirm-save]').trigger('click')
    await nextTick()

    const fork = store.listPatterns().find((p) => p.id !== original.id)!
    expect(fork.tags).toEqual(['rondo', 'warm up'])
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
    expect(drillName(wrapper)).toContain('Press trigger')
  })

  it('files the drill under the tags typed while naming it', async () => {
    const store = useStorage()
    useBoard().addCounter('red')
    wrapper = mountApp()

    await wrapper.find('[data-save]').trigger('click')
    await wrapper.find('#pattern-name').setValue('Press trigger')
    await wrapper.find('[data-tag-new]').setValue('Pressing, u12')
    await wrapper.find('[data-confirm-save]').trigger('click')
    await nextTick()

    expect(store.listPatterns()[0].tags).toEqual(['pressing', 'u12'])
  })

  it('offers the tags already in use as chips, and files under the one pressed', async () => {
    const store = useStorage()
    const existing = store.savePattern('Rondo 4v2', sampleSnapshot())
    store.setTags(existing.id, ['rondo'])
    useBoard().addCounter('red')
    wrapper = mountApp()

    await wrapper.find('[data-save]').trigger('click')
    await wrapper.find('#pattern-name').setValue('Press trigger')
    await wrapper.find('[data-chip]').trigger('click')
    await wrapper.find('[data-confirm-save]').trigger('click')
    await nextTick()

    const saved = store.listPatterns().find((p) => p.name === 'Press trigger')!
    expect(saved.tags).toEqual(['rondo'])
  })

  it('leaves a drill untagged when nothing is chosen or typed', async () => {
    const store = useStorage()
    useBoard().addCounter('red')
    wrapper = mountApp()

    await wrapper.find('[data-save]').trigger('click')
    await wrapper.find('#pattern-name').setValue('Press trigger')
    await wrapper.find('[data-confirm-save]').trigger('click')
    await nextTick()

    expect(store.listPatterns()[0].tags).toEqual([])
  })
})

describe('Save as… before a drill has ever been saved', () => {
  it('asks for a name rather than offering to copy a drill that does not exist', async () => {
    useBoard().addCounter('red')
    wrapper = mountApp()

    await wrapper.find('[data-save-as]').trigger('click')

    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.attributes('aria-label')).toBe('Name this drill')
    expect(wrapper.find('[data-confirm-save]').text()).toBe('Save')
    // The hint names the drill being copied from. There isn't one.
    expect(wrapper.text()).not.toMatch(/stays as it is/)
  })

  it('still offers to copy once a drill is open', async () => {
    const store = useStorage()
    store.savePattern('Press trigger', sampleSnapshot())
    wrapper = mountApp()

    await openLibraryAndLoad(wrapper)
    await wrapper.find('[data-save-as]').trigger('click')

    expect(wrapper.find('[role="dialog"]').attributes('aria-label')).toBe('Save a copy as')
    expect(wrapper.find('[data-confirm-save]').text()).toBe('Save copy')
  })
})

describe('escape closes what is open', () => {
  function pressEscape(from?: Element) {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    ;(from ?? document.body).dispatchEvent(event)
    return nextTick()
  }

  it('closes the save prompt, even from inside the field it focuses', async () => {
    useBoard().addCounter('red')
    wrapper = mountApp()

    await wrapper.find('[data-save]').trigger('click')
    expect(wrapper.find('#pattern-name').exists()).toBe(true)

    // The prompt focuses its name field, so a handler that ignores keys from
    // inside an input would never see this at all.
    await pressEscape(wrapper.find('#pattern-name').element)

    expect(wrapper.find('#pattern-name').exists()).toBe(false)
  })

  it('discards the name typed into an escaped save prompt', async () => {
    const store = useStorage()
    useBoard().addCounter('red')
    wrapper = mountApp()

    await wrapper.find('[data-save]').trigger('click')
    await wrapper.find('#pattern-name').setValue('Press trigger')
    await pressEscape(wrapper.find('#pattern-name').element)

    expect(store.listPatterns()).toEqual([])

    // Reopening offers the default again, not the abandoned draft — the same
    // as pressing Cancel.
    await wrapper.find('[data-save]').trigger('click')
    expect((wrapper.find('#pattern-name').element as HTMLInputElement).value).toBe('New drill')
  })

  it('closes the saved-drills panel', async () => {
    useStorage().savePattern('Press trigger', sampleSnapshot())
    wrapper = mountApp()

    await wrapper.find('[data-open]').trigger('click')
    expect(wrapper.find('[aria-label="Saved drills"]').exists()).toBe(true)

    await pressEscape()

    expect(wrapper.find('[aria-label="Saved drills"]').exists()).toBe(false)
  })

  it('closes the help panel', async () => {
    wrapper = mountApp()

    await wrapper.find('[data-help]').trigger('click')
    expect(wrapper.find('[data-help-section="board"]').exists()).toBe(true)

    await pressEscape()

    expect(wrapper.find('[data-help-section="board"]').exists()).toBe(false)
  })

  it('closes the session editor before the sessions library beneath it', async () => {
    useSessions().createSession('Tuesday U12')
    wrapper = mountApp()

    await openSessions(wrapper)
    await wrapper.find('[data-session] [data-open]').trigger('click')
    await nextTick()

    // Reopened behind the editor that is already up, the way Save as… can
    // sit over an already-open library.
    await openSessions(wrapper)

    await pressEscape()
    expect(wrapper.find('[role="dialog"][aria-label="Tuesday U12"]').exists()).toBe(false)
    expect(wrapper.find('[role="dialog"][aria-label="Sessions"]').exists()).toBe(true)

    await pressEscape()
    expect(wrapper.find('[role="dialog"][aria-label="Sessions"]').exists()).toBe(false)
  })

})

/**
 * Task 12's way into the sessions feature: the brief named a `Toolbar.vue`
 * that does not exist. The drill menu is where `@open` already leads to the
 * pattern library, so Sessions sits beside it in that same menu.
 */
async function openSessions(app: VueWrapper) {
  await app.find('[data-drill-menu]').trigger('click')
  await app.find('[data-open-sessions]').trigger('click')
}

describe('the Sessions control', () => {
  it('opens the sessions panel from the drill menu', async () => {
    wrapper = mountApp()
    await openSessions(wrapper)
    expect(wrapper.find('[role="dialog"][aria-label="Sessions"]').exists()).toBe(true)
  })

  it('ignores tool shortcuts while the sessions panel is open', async () => {
    wrapper = mountApp()
    await openSessions(wrapper)

    fire({ key: 'd' })
    await nextTick()

    expect(wrapper.find('[data-tool="pen"]').classes()).not.toContain('is-active')
  })

  it('opens a session for editing and closes the library behind it', async () => {
    useSessions().createSession('Tuesday U12')
    wrapper = mountApp()

    await openSessions(wrapper)
    await wrapper.find('[data-session] [data-open]').trigger('click')
    await nextTick()

    expect(wrapper.find('[role="dialog"][aria-label="Sessions"]').exists()).toBe(false)
    expect(wrapper.find('[role="dialog"][aria-label="Tuesday U12"]').exists()).toBe(true)
  })
})

/**
 * SessionLibrary's `renamed` and `deleted` emits exist so App's held-open
 * session cannot drift from what the library just did to the same row:
 * `saveSession` upserts by id, so a stale rename or a deleted-but-still-open
 * session would otherwise be resurrected by the editor's next write.
 */
describe('the library changing the open session', () => {
  it('keeps the open session in step when the library renames it', async () => {
    useSessions().createSession('Tuesday U12')
    wrapper = mountApp()

    await openSessions(wrapper)
    await wrapper.find('[data-session] [data-open]').trigger('click')
    await nextTick()

    // Reopen the library behind the editor and rename the session there.
    await openSessions(wrapper)
    await wrapper.find('[data-session] [data-rename]').trigger('click')
    await wrapper.find('[data-rename-input]').setValue('Wednesday U12')
    await wrapper.find('[data-rename-save]').trigger('click')
    await nextTick()

    expect(wrapper.find('[role="dialog"][aria-label="Wednesday U12"]').exists()).toBe(true)
  })

  it('closes the open session when the library deletes it', async () => {
    useSessions().createSession('Tuesday U12')
    wrapper = mountApp()

    await openSessions(wrapper)
    await wrapper.find('[data-session] [data-open]').trigger('click')
    await nextTick()

    await openSessions(wrapper)
    await wrapper.find('[data-session] [data-delete]').trigger('click')
    await wrapper.find('[data-confirm-delete]').trigger('click')
    await nextTick()

    expect(wrapper.find('[role="dialog"][aria-label="Tuesday U12"]').exists()).toBe(false)
  })
})

/**
 * `useStorage` and `useSessions` used to import one shared `lastError` ref
 * from `collection.ts`, so a healthy read of one store silently erased the
 * other's unresolved warning — SessionLibrary's own `refresh()` triggered
 * this on every open, by reading sessions then patterns. Each store now owns
 * its own pair (`createCollectionErrors()`), and this banner reads both
 * explicitly rather than leaning on them happening to be the same ref.
 */
describe('the session store error', () => {
  it('is surfaced the same way as a pattern store error', async () => {
    wrapper = mountApp()

    useSessions().lastError.value = 'Your saved sessions could not be read.'
    await nextTick()

    expect(wrapper.find('.error').exists()).toBe(true)
    expect(wrapper.find('.error').text()).toMatch(/saved sessions/i)

    await wrapper.find('.error').trigger('click')
    expect(wrapper.find('.error').exists()).toBe(false)
    expect(useSessions().lastError.value).toBeNull()
  })

  it('does not clobber the pattern store error, and dismissing shows what is left', async () => {
    const storage = useStorage()
    wrapper = mountApp()

    storage.lastError.value = 'Your saved patterns could not be read.'
    useSessions().lastError.value = 'Your saved sessions could not be read.'
    await nextTick()

    // The patterns message shows first; the session one is still there
    // underneath, not lost the way a shared ref would have lost it.
    expect(wrapper.find('.error').text()).toMatch(/saved patterns/i)

    await wrapper.find('.error').trigger('click')
    expect(storage.lastError.value).toBeNull()
    expect(useSessions().lastError.value).toBe('Your saved sessions could not be read.')
    await nextTick()

    expect(wrapper.find('.error').text()).toMatch(/saved sessions/i)

    await wrapper.find('.error').trigger('click')
    expect(useSessions().lastError.value).toBeNull()
    expect(wrapper.find('.error').exists()).toBe(false)
  })

  it('is not erased by a healthy patterns read the way it was when the two stores shared one ref', async () => {
    const storage = useStorage()
    wrapper = mountApp()

    useSessions().lastError.value = 'Your saved sessions could not be read.'
    storage.listPatterns()
    await nextTick()

    expect(useSessions().lastError.value).toBe('Your saved sessions could not be read.')
    expect(wrapper.find('.error').exists()).toBe(true)
  })
})

/**
 * Unlike the GIF, exporting a session never touches the live board: the
 * boards it prints are rasterised off-screen by `renderFrameToDataUrl`, so a
 * coach can keep working, and a failure halfway through cannot strand them
 * mid-move. `exporting` is still the same guard the GIF export uses, so the
 * two cannot run on top of each other.
 */
describe('exporting a session as a PDF', () => {
  it('builds and downloads the PDF, reporting progress, without locking the board', async () => {
    const board = useBoard()
    const exporter = useExport()
    const downloads: string[] = []
    vi.spyOn(exporter, 'downloadBlob').mockImplementation((_blob, name) => { downloads.push(name) })

    // No drills in the session: the cover alone is enough to prove the
    // wiring without needing a working canvas, which jsdom does not have.
    useSessions().createSession('Tuesday U12')
    wrapper = mountApp()

    await openSessions(wrapper)
    await wrapper.find('[data-session] [data-open]').trigger('click')
    await nextTick()

    await wrapper.find('[data-export-pdf]').trigger('click')
    await nextTick()
    await nextTick()

    expect(downloads).toEqual(['tuesday-u12.pdf'])
    expect(wrapper.find('.notice').text()).toBe('Session saved.')
    expect(board.isDerived.value).toBe(false)
  })

  it('reports the reason a drill could not be rasterised, leaving the board untouched', async () => {
    const { renderFrameToDataUrl } = await import('../src/composables/renderFrame')
    vi.mocked(renderFrameToDataUrl).mockRejectedValueOnce(
      new Error('This browser could not create the image.'),
    )

    const store = useStorage()
    const board = useBoard()
    const pattern = store.savePattern('Rondo', sampleSnapshot())
    const created = useSessions().createSession('Tuesday U12')
    useSessions().saveSession({
      ...created,
      entries: [useSessions().newEntry(pattern.id, 10)],
    })

    wrapper = mountApp()
    await openSessions(wrapper)
    await wrapper.find('[data-session] [data-open]').trigger('click')
    await nextTick()

    await wrapper.find('[data-export-pdf]').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper!.find('.notice').text()).toMatch(/could not render/i)
    })

    // Never locked: the export rasterises off-screen, so the live board was
    // never put into the export-derived state the GIF export uses.
    expect(board.isDerived.value).toBe(false)
  })
})

describe('tagging while forking a drill', () => {
  it('starts the copy with the original’s tags pressed, and files it under them', async () => {
    const store = useStorage()
    const original = store.savePattern('Press trigger', sampleSnapshot())
    store.setTags(original.id, ['pressing', 'u12'])
    wrapper = mountApp()

    await openLibraryAndLoad(wrapper)
    await wrapper.find('[data-save-as]').trigger('click')
    await wrapper.find('#pattern-name').setValue('Counter press')

    const pressed = wrapper
      .findAll('[data-chip]')
      .filter((chip) => chip.attributes('aria-pressed') === 'true')
      .map((chip) => chip.text())
    expect(pressed).toEqual(['pressing', 'u12'])

    await wrapper.find('[data-confirm-save]').trigger('click')
    await nextTick()

    const fork = store.listPatterns().find((p) => p.id !== original.id)!
    expect(fork.tags).toEqual(['pressing', 'u12'])
  })

  it('untags the copy when the original’s chips are pressed off', async () => {
    const store = useStorage()
    const original = store.savePattern('Press trigger', sampleSnapshot())
    store.setTags(original.id, ['pressing'])
    wrapper = mountApp()

    await openLibraryAndLoad(wrapper)
    await wrapper.find('[data-save-as]').trigger('click')
    await wrapper.find('#pattern-name').setValue('Counter press')
    await wrapper.find('[data-chip]').trigger('click')
    await wrapper.find('[data-confirm-save]').trigger('click')
    await nextTick()

    const fork = store.listPatterns().find((p) => p.id !== original.id)!
    expect(fork.tags).toEqual([])
    // The drill it was copied from keeps its own filing.
    expect(store.listPatterns().find((p) => p.id === original.id)!.tags).toEqual(['pressing'])
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

    expect(drillName(wrapper)).toContain('Counter press')

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

    expect(wrapper.find('[data-save-status]').text()).toMatch(/not saved/i)

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

    expect(wrapper.find('[data-save-status]').text()).toMatch(/not saved/i)
    expect(localStorage.getItem(PATTERNS_KEY)).toBe('{not json at all')
  })
})

/**
 * A drill already in the library keeps itself up to date, so Save is
 * something a coach may press rather than something they must remember.
 * Debounced by a second: a drag is hundreds of changes and the library is a
 * single localStorage key.
 */
describe('autosaving the open drill', () => {
  it('writes a change back to the library without anyone pressing Save', async () => {
    vi.useFakeTimers()
    try {
      const store = useStorage()
      const board = useBoard()
      const saved = store.savePattern('Press trigger', sampleSnapshot())
      wrapper = mountApp()
      await openLibraryAndLoad(wrapper)

      const before = board.state.counters.length
      board.addCounter('red')
      await nextTick()
      expect(wrapper.find('[data-save-status]').text()).toMatch(/unsaved changes/i)

      vi.advanceTimersByTime(1000)
      await nextTick()

      const listed = store.listPatterns()
      expect(listed).toHaveLength(1)
      expect(listed[0].id).toBe(saved.id)
      expect(listed[0].frames[0].counters).toHaveLength(before + 1)
      // Not a bare /saved/, which "Not saved yet" satisfies too.
      expect(wrapper.find('[data-save-status]').text()).toMatch(/saved (just now|\d+m ago)/i)
    } finally {
      vi.useRealTimers()
    }
  })

  /**
   * Autosave can update a drill in place, but it cannot decide what a new
   * one is called — a board that has never been saved stays a draft until
   * the coach names it.
   */
  it('leaves a board that was never saved out of the library', async () => {
    vi.useFakeTimers()
    try {
      const store = useStorage()
      const board = useBoard()
      wrapper = mountApp()

      board.addCounter('red')
      vi.advanceTimersByTime(2000)
      await nextTick()

      expect(store.listPatterns()).toHaveLength(0)
      expect(wrapper.find('[data-save-status]').text()).toMatch(/not saved/i)
    } finally {
      vi.useRealTimers()
    }
  })

  it('files the drill under the name typed into the header', async () => {
    vi.useFakeTimers()
    try {
      const store = useStorage()
      const saved = store.savePattern('Press trigger', sampleSnapshot())
      wrapper = mountApp()
      await openLibraryAndLoad(wrapper)

      const field = wrapper.find('[data-current-pattern]')
      await field.setValue('Counter press')
      await field.trigger('change')
      vi.advanceTimersByTime(1000)
      await nextTick()

      const listed = store.listPatterns()
      expect(listed).toHaveLength(1)
      expect(listed[0].id).toBe(saved.id)
      expect(listed[0].name).toBe('Counter press')
    } finally {
      vi.useRealTimers()
    }
  })

  /**
   * Playing moves the playhead, not the drill. Writing a blend back over the
   * saved drill would file a half-tweened board as the coach's work.
   */
  it('writes nothing while the drill is playing', async () => {
    vi.useFakeTimers()
    try {
      const store = useStorage()
      const board = useBoard()
      board.addFrame()
      board.setFrameDuration(1, 1000)
      board.goToFrame(0)
      store.savePattern('Press trigger', board.snapshot())
      wrapper = mountApp()
      await openLibraryAndLoad(wrapper)

      const before = JSON.stringify(store.listPatterns())
      board.scrubTo(500)
      vi.advanceTimersByTime(2000)
      await nextTick()

      expect(JSON.stringify(store.listPatterns())).toBe(before)
      board.endScrub()
    } finally {
      vi.useRealTimers()
    }
  })
})

/**
 * Deleting the open drill throws away work no undo on the board can bring
 * back, so it is the one header action that asks first.
 */
describe('deleting the open drill from the header', () => {
  it('asks before it deletes, and leaves the board alone when it does', async () => {
    const store = useStorage()
    const board = useBoard()
    store.savePattern('Press trigger', sampleSnapshot())
    wrapper = mountApp()
    await openLibraryAndLoad(wrapper)
    const onBoard = board.state.counters.length

    await wrapper.find('[data-drill-menu]').trigger('click')
    await wrapper.find('[data-delete-drill]').trigger('click')
    await nextTick()
    expect(store.listPatterns()).toHaveLength(1)

    await wrapper.find('[data-confirm-delete-drill]').trigger('click')
    await nextTick()

    expect(store.listPatterns()).toHaveLength(0)
    expect(board.state.counters).toHaveLength(onBoard)
    expect(wrapper.find('[data-save-status]').text()).toMatch(/not saved/i)
  })
})

/**
 * Duplicate adapts a saved drill for today without a dialog, and without
 * touching the drill it came from.
 */
describe('duplicating the open drill', () => {
  it('files a copy and leaves the original as it was', async () => {
    const store = useStorage()
    store.savePattern('Press trigger', sampleSnapshot())
    wrapper = mountApp()
    await openLibraryAndLoad(wrapper)

    await wrapper.find('[data-drill-menu]').trigger('click')
    await wrapper.find('[data-duplicate-drill]').trigger('click')
    await nextTick()

    const names = store.listPatterns().map((p) => p.name).sort()
    expect(names).toEqual(['Press trigger', 'Press trigger copy'])
    expect(drillName(wrapper)).toBe('Press trigger copy')
  })
})

/**
 * The one thing the tool never said was how a player gets onto the grass.
 * A press drops one in the middle; a drag puts it exactly where the coach
 * let go, which is the interaction that says placement is possible at all.
 */
describe('dragging a player onto the pitch', () => {
  /** A drag, as a browser produces it: press, travel, release. */
  async function dragTo(
    app: VueWrapper,
    selector: string,
    to: { clientX: number; clientY: number; pointerId?: number },
  ) {
    const from = app.find(selector).element
    from.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 1 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 40, clientY: 40, pointerId: 1 }))
    await nextTick()
    window.dispatchEvent(new PointerEvent('pointermove', to))
    await nextTick()
    window.dispatchEvent(new PointerEvent('pointerup', to))
    await nextTick()
  }

  it('leaves the player where it was let go, not in the middle', async () => {
    const board = useBoard()
    wrapper = mountApp()

    await dragTo(wrapper, '[data-add-counter="blue"]', clientFor(20, 10))

    expect(board.state.counters).toHaveLength(1)
    expect(board.state.counters[0].color).toBe('blue')
    expect(board.state.counters[0].pos.x).toBeCloseTo(20, 1)
    expect(board.state.counters[0].pos.y).toBeCloseTo(10, 1)
  })

  it('shows what is being carried while the drag is running', async () => {
    wrapper = mountApp()
    const from = wrapper.find('[data-add-counter="red"]').element

    from.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 1 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 60, clientY: 60, pointerId: 1 }))
    await nextTick()
    expect(wrapper.find('[data-placement-ghost]').exists()).toBe(true)

    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 60, clientY: 60, pointerId: 1 }))
    await nextTick()
    expect(wrapper.find('[data-placement-ghost]').exists()).toBe(false)
  })

  /**
   * Inside the board's box is not inside the pitch: it is letterboxed
   * within it, and a release on the dark green either side used to convert
   * to a point off the pitch that the placement clamp then pulled onto the
   * touchline — a player somewhere the coach never let go of.
   */
  it('places nothing when the drag ends beside the pitch rather than on it', async () => {
    const board = useBoard()
    wrapper = mountApp()

    // Well below the pitch's own height, but still inside the 800x600 board.
    await dragTo(wrapper, '[data-add-counter="blue"]', { clientX: 400, clientY: 595, pointerId: 1 })

    expect(board.state.counters).toHaveLength(0)
  })

  /** A player dropped on the toolbar is a player the coach did not mean. */
  it('places nothing when the drag ends off the pitch', async () => {
    const board = useBoard()
    wrapper = mountApp()

    await dragTo(wrapper, '[data-add-counter="blue"]', { clientX: 900, clientY: 900, pointerId: 1 })

    expect(board.state.counters).toHaveLength(0)
  })

  /**
   * The browser takes the pointer away for reasons that have nothing to do
   * with the drill — a system gesture, a notification — and a player
   * appearing wherever that happened is not something anyone asked for.
   */
  it('places nothing when the pointer is taken away mid-drag', async () => {
    const board = useBoard()
    wrapper = mountApp()

    const from = wrapper.find('[data-add-counter="blue"]').element
    from.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 1 }))
    window.dispatchEvent(new PointerEvent('pointermove', clientFor(20, 10)))
    await nextTick()
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 }))
    await nextTick()

    expect(board.state.counters).toHaveLength(0)
    expect(wrapper.find('[data-placement-ghost]').exists()).toBe(false)
  })

  /**
   * A tablet has as many pointers as the coach has fingers. A second one
   * used to be able to start its own placement over the first, or end the
   * first one's gesture somewhere the first finger had never been.
   */
  it('belongs to the finger that started it', async () => {
    const board = useBoard()
    wrapper = mountApp()

    const from = wrapper.find('[data-add-counter="blue"]').element
    from.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 1 }),
    )
    // A second finger presses another swatch and lets go somewhere else.
    wrapper
      .find('[data-add-counter="red"]')
      .element.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 2 }),
      )
    window.dispatchEvent(new PointerEvent('pointermove', { ...clientFor(20, 10), pointerId: 2 }))
    window.dispatchEvent(new PointerEvent('pointerup', { ...clientFor(20, 10), pointerId: 2 }))
    await nextTick()

    expect(board.state.counters).toHaveLength(0)

    // The first finger's own release still places, and places once.
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 0, clientY: 0, pointerId: 1 }))
    await nextTick()

    expect(board.state.counters).toHaveLength(1)
    expect(board.state.counters[0].color).toBe('blue')
  })

  /**
   * Under the drag threshold the gesture is a press, and a press drops in
   * the middle. Without the threshold the wobble of a finger would place a
   * player under the coach's own hand.
   */
  it('treats a press that barely moves as a press', async () => {
    const board = useBoard()
    wrapper = mountApp()

    const from = wrapper.find('[data-add-counter="blue"]').element
    from.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 1 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 3, clientY: 2, pointerId: 1 }))
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 3, clientY: 2, pointerId: 1 }))
    await nextTick()

    expect(board.state.counters).toHaveLength(1)
    expect(board.state.counters[0].pos).toEqual({ x: PITCH_W / 2, y: PITCH_H / 2 })
  })
})

/**
 * Said once, over the only place a coach is looking, and gone for good the
 * moment the first thing lands.
 */
describe('the first-run prompt', () => {
  it('is on an empty pitch', () => {
    wrapper = mountApp()
    expect(wrapper.find('[data-empty-state]').exists()).toBe(true)
  })

  it('goes as soon as a player is placed, and does not come back', async () => {
    const board = useBoard()
    wrapper = mountApp()

    board.addCounter('red')
    await nextTick()
    expect(wrapper.find('[data-empty-state]').exists()).toBe(false)

    board.clearCounters()
    await nextTick()
    expect(wrapper.find('[data-empty-state]').exists()).toBe(false)
  })

  it('never appears for a drill that already has players on it', async () => {
    const store = useStorage()
    store.savePattern('Press trigger', sampleSnapshot())
    wrapper = mountApp()
    await openLibraryAndLoad(wrapper)

    expect(wrapper.find('[data-empty-state]').exists()).toBe(false)
  })
})

/**
 * Anything held populates the panel, which is no use behind a closed one:
 * opening it is what makes Duplicate and Remove reachable at all on a
 * tablet, where there is no Cmd+D and no Delete key.
 */
describe('the inspector and the selection', () => {
  /** Draw an arrow and pick it up, the way a coach would. */
  async function chooseAnArrow(app: VueWrapper) {
    const board = useBoard()
    const id = board.startArrow({ x: 20, y: 30 }, '#ffffff', 'pass')
    board.updateSegment(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    await app.vm.$nextTick()
    const path = app.find('[data-drawing]').element
    await firePointer(path, 'pointerdown', clientFor(40, 30))
    await firePointer(app.find('.stage svg').element, 'pointerup', clientFor(40, 30))
  }

  it('opens itself when something is picked up', async () => {
    wrapper = mountApp()
    expect(wrapper.find('[data-inspector]').exists()).toBe(false)

    await chooseAnArrow(wrapper)

    expect(wrapper.find('[data-inspector]').exists()).toBe(true)
    expect(wrapper.find('[data-inspector-title]').text()).toBe('Drawing')
  })

  /** Putting it down gives the pitch its room back. */
  it('closes again when the selection is put down', async () => {
    wrapper = mountApp()
    await chooseAnArrow(wrapper)
    expect(wrapper.find('[data-inspector]').exists()).toBe(true)

    fire({ key: 'Escape' })
    await nextTick()

    expect(wrapper.find('[data-inspector]').exists()).toBe(false)
  })

  /**
   * Picking a player up is not an edit to the drill. Routing the panel
   * through the board's own toggle put an entry on the undo stack, marked
   * the drill dirty and set the autosave going, all for a panel opening.
   */
  it('does not count as a change to the drill', async () => {
    const board = useBoard()
    wrapper = mountApp()
    await chooseAnArrow(wrapper)
    const undoDepth = board.canUndo.value

    board.undo()
    await nextTick()

    // The undo that follows takes back the drawing, not the panel.
    expect(undoDepth).toBe(true)
    expect(board.state.drawings).toHaveLength(0)
  })

  /**
   * A coach who opened the notes themselves did not open them to have them
   * shut again by picking something up.
   */
  it('leaves a panel the coach opened themselves alone', async () => {
    wrapper = mountApp()
    await wrapper.find('[data-inspector-open]').trigger('click')

    await chooseAnArrow(wrapper)
    fire({ key: 'Escape' })
    await nextTick()

    expect(wrapper.find('[data-inspector]').exists()).toBe(true)
  })
})

/**
 * Clear players, Clear drawings and Reset used to sit one mis-tap from Undo.
 * They are behind the drill menu now, and each either asks first or leaves a
 * way back.
 */
describe('taking things off the board', () => {
  it('says what a clear took, and offers it back', async () => {
    const board = useBoard()
    board.addCounter('red')
    board.addCounter('blue')
    wrapper = mountApp()

    await wrapper.find('[data-clear-players]').trigger('click')
    await nextTick()

    expect(board.state.counters).toHaveLength(0)
    expect(wrapper.find('[data-toast]').text()).toContain('Cleared 2 players')

    await wrapper.find('[data-toast-undo]').trigger('click')
    await nextTick()

    expect(board.state.counters).toHaveLength(2)
    expect(wrapper.find('[data-toast]').exists()).toBe(false)
  })

  it('counts one player as a player', async () => {
    const board = useBoard()
    board.addCounter('red')
    wrapper = mountApp()

    await wrapper.find('[data-clear-players]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-toast]').text()).toContain('Cleared 1 player.')
  })

  it('offers the drawings back too', async () => {
    const board = useBoard()
    const id = board.startArrow({ x: 20, y: 30 }, '#ffffff', 'pass')
    board.updateSegment(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    wrapper = mountApp()

    await wrapper.find('[data-clear-drawings]').trigger('click')
    await nextTick()

    expect(board.state.drawings).toHaveLength(0)
    expect(wrapper.find('[data-toast]').text()).toContain('Cleared 1 drawing.')

    await wrapper.find('[data-toast-undo]').trigger('click')
    await nextTick()
    expect(board.state.drawings).toHaveLength(1)
  })

  it('can be waved away without undoing anything', async () => {
    const board = useBoard()
    board.addCounter('red')
    wrapper = mountApp()

    await wrapper.find('[data-clear-players]').trigger('click')
    await wrapper.find('[data-toast-dismiss]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-toast]').exists()).toBe(false)
    expect(board.state.counters).toHaveLength(0)
  })

  /**
   * Reset is not one thing taken off the board but all of them at once, and
   * it detaches the board from the drill it was saved as — more than a
   * six-second window is worth resting on.
   */
  it('asks before resetting, and does nothing if the answer is no', async () => {
    const board = useBoard()
    board.addCounter('red')
    wrapper = mountApp()

    await wrapper.find('[data-reset]').trigger('click')
    await nextTick()
    expect(board.state.counters).toHaveLength(1)

    fire({ key: 'Escape' })
    await nextTick()
    expect(wrapper.find('[data-confirm-reset]').exists()).toBe(false)
    expect(board.state.counters).toHaveLength(1)
  })

  it('resets once the answer is yes', async () => {
    const board = useBoard()
    board.addCounter('red')
    wrapper = mountApp()

    await wrapper.find('[data-reset]').trigger('click')
    await wrapper.find('[data-confirm-reset]').trigger('click')
    await nextTick()

    expect(board.state.counters).toHaveLength(0)
  })

  /** Nothing to clear, nothing to say. */
  it('offers no clear at all on a board with nothing on it', async () => {
    wrapper = mountApp()
    expect(wrapper.find('[data-clear-players]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-clear-drawings]').attributes('disabled')).toBeDefined()
  })
})

/**
 * The bar across the top exists only where there is no rail. On a tablet the
 * rail carries the tools, the colours and the two board menus, and what was
 * left of the bar was an empty stripe of chrome over the pitch.
 */
/**
 * Showing a drill to players rather than building one. Everything that
 * edits leaves the screen, and the pitch stops taking pointer events at
 * all: a tablet held out to a group should not lose a player to a thumb.
 */
describe('presenting the drill', () => {
  /** A drill with phases, so the bar has something to run. */
  function aDrillWithPhases() {
    const board = useBoard()
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
  }

  it('is reached from the pitch itself, and from F', async () => {
    aDrillWithPhases()
    wrapper = mountApp()
    expect(wrapper.find('[data-presentation-bar]').exists()).toBe(false)

    await wrapper.find('[data-present-toggle]').trigger('click')
    expect(wrapper.find('[data-presentation-bar]').exists()).toBe(true)

    await wrapper.find('[data-present-toggle]').trigger('click')
    expect(wrapper.find('[data-presentation-bar]').exists()).toBe(false)

    fire({ key: 'f' })
    await nextTick()
    expect(wrapper.find('[data-presentation-bar]').exists()).toBe(true)
  })

  it('takes everything that edits off the screen', async () => {
    wrapper = mountApp()
    await wrapper.find('[data-present-toggle]').trigger('click')

    expect(wrapper.find('.rail').exists()).toBe(false)
    expect(wrapper.find('[data-add-frame]').exists()).toBe(false)
    expect(wrapper.find('[data-drill-menu]').exists()).toBe(false)
    expect(wrapper.find('[data-inspector-open]').exists()).toBe(false)
  })

  it('keeps the drill playable and steppable', async () => {
    const board = useBoard()
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    wrapper = mountApp()
    await wrapper.find('[data-present-toggle]').trigger('click')

    expect(wrapper.find('[data-present-phase]').text()).toBe('1 / 2')

    await wrapper.find('[data-present-next]').trigger('click')
    expect(board.state.currentFrame).toBe(1)
    expect(wrapper.find('[data-present-phase]').text()).toBe('2 / 2')

    await wrapper.find('[data-present-play]').trigger('click')
    expect(board.playback.playing).toBe(true)
    board.pause()
  })

  /**
   * A single phase has nothing to play or step through, and a bar holding
   * one button over the middle of the pitch says less than the corner
   * control that put it there.
   */
  it('shows no bar at all for a single-phase drill', async () => {
    wrapper = mountApp()
    await wrapper.find('[data-present-toggle]').trigger('click')
    expect(wrapper.find('[data-presentation-bar]').exists()).toBe(false)
    // Still a way back, and the same control that opened it.
    expect(wrapper.find('[data-present-toggle]').attributes('aria-pressed')).toBe('true')
  })

  it('leaves on Escape and on the bar’s own button', async () => {
    aDrillWithPhases()
    wrapper = mountApp()
    await wrapper.find('[data-present-toggle]').trigger('click')
    fire({ key: 'Escape' })
    await nextTick()
    expect(wrapper.find('[data-presentation-bar]').exists()).toBe(false)

    await wrapper.find('[data-present-toggle]').trigger('click')
    await wrapper.find('[data-present-exit]').trigger('click')
    expect(wrapper.find('[data-presentation-bar]').exists()).toBe(false)
  })

  /**
   * The tools it would switch between are not on screen to say what
   * happened, so a stray key must not change one.
   */
  it('ignores the tool shortcuts while it is up', async () => {
    wrapper = mountApp()
    await wrapper.find('[data-present-toggle]').trigger('click')

    fire({ key: 'd' })
    await nextTick()
    await wrapper.find('[data-present-toggle]').trigger('click')

    expect(wrapper.find('[data-tool="select"]').classes()).toContain('is-active')
  })

  it('puts down whatever was held before it started', async () => {
    const board = useBoard()
    const id = board.startArrow({ x: 20, y: 30 }, '#ffffff', 'pass')
    board.updateSegment(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    wrapper = mountApp()

    const path = wrapper.find('[data-drawing]').element
    await firePointer(path, 'pointerdown', clientFor(40, 30))
    await firePointer(wrapper.find('.stage svg').element, 'pointerup', clientFor(40, 30))
    expect(wrapper.find('[data-inspector]').exists()).toBe(true)

    await wrapper.find('[data-present-toggle]').trigger('click')
    await wrapper.find('[data-present-toggle]').trigger('click')

    expect(wrapper.find('[data-inspector]').exists()).toBe(false)
  })
})

describe('the ball shortcut', () => {
  it('toggles the ball on b', async () => {
    const board = useBoard()
    wrapper = mount(App, { attachTo: document.body })
    await wrapper.vm.$nextTick()

    fire({ key: 'b' })
    await wrapper.vm.$nextTick()
    expect(board.state.ballsVisible).toBe(false)
  })

  it('leaves the ball alone on Ctrl+B, which belongs to the browser', async () => {
    const board = useBoard()
    wrapper = mount(App, { attachTo: document.body })
    await wrapper.vm.$nextTick()

    fire({ key: 'b', ctrlKey: true })
    await wrapper.vm.$nextTick()
    expect(board.state.ballsVisible).toBe(true)
  })
})

describe('adding a label', () => {
  it('asks for the text, then puts it on the pitch', async () => {
    const board = useBoard()
    wrapper = mount(App, { attachTo: document.body })
    await wrapper.vm.$nextTick()

    await wrapper.findComponent({ name: 'PitchBoard' }).vm.$emit('addLabel', { x: 30, y: 20 })
    await wrapper.vm.$nextTick()
    await nextTick()

    const input = wrapper.find('[data-label-input]')
    expect(input.exists()).toBe(true)
    expect(document.activeElement).toBe(input.element)

    await input.setValue('Press trigger')
    await wrapper.find('[data-label-save]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(board.state.labels).toHaveLength(1)
    expect(board.state.labels[0].text).toBe('Press trigger')
  })

  it('adds nothing when the prompt is cancelled', async () => {
    const board = useBoard()
    wrapper = mount(App, { attachTo: document.body })
    await wrapper.vm.$nextTick()

    await wrapper.findComponent({ name: 'PitchBoard' }).vm.$emit('addLabel', { x: 30, y: 20 })
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-label-cancel]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(board.state.labels).toHaveLength(0)
  })

  it('edits an existing label, pre-filled with its text', async () => {
    const board = useBoard()
    const label = board.addLabel({ x: 30, y: 20 }, 'Before')!
    wrapper = mount(App, { attachTo: document.body })
    await wrapper.vm.$nextTick()

    await wrapper.findComponent({ name: 'PitchBoard' }).vm.$emit('editLabel', label.id)
    await wrapper.vm.$nextTick()
    await nextTick()

    const input = wrapper.find('[data-label-input]')
    expect((input.element as HTMLInputElement).value).toBe('Before')
    await input.setValue('After')
    await wrapper.find('[data-label-save]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(board.labelById(label.id)!.text).toBe('After')
  })
})

describe('drill notes', () => {
  /** The panel is a strip until a coach asks for it. */
  async function openNotes(app: VueWrapper) {
    await app.find('[data-inspector-open]').trigger('click')
    await app.vm.$nextTick()
  }

  it('types into the board notes', async () => {
    const board = useBoard()
    wrapper = mount(App, { attachTo: document.body })
    await wrapper.vm.$nextTick()
    await openNotes(wrapper)

    await wrapper.find('[data-notes]').setValue('Two touch max.\nSwitch after 90 seconds.')
    await wrapper.vm.$nextTick()

    expect(board.state.notes).toBe('Two touch max.\nSwitch after 90 seconds.')
  })

  it('shows notes loaded with a pattern', async () => {
    const board = useBoard()
    board.setNotes('Coaching points')
    wrapper = mount(App, { attachTo: document.body })
    await wrapper.vm.$nextTick()
    await openNotes(wrapper)
    expect((wrapper.find('[data-notes]').element as HTMLTextAreaElement).value).toBe(
      'Coaching points',
    )
  })

  it('is a strip until the coach asks for it', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-notes]').exists()).toBe(false)

    await openNotes(wrapper)
    expect(wrapper.find('[data-notes]').exists()).toBe(true)

    await wrapper.find('[data-inspector-close]').trigger('click')
    expect(wrapper.find('[data-notes]').exists()).toBe(false)
  })

  /**
   * Typing a drill name must not drive the tool shortcuts, and a textarea
   * has to be exempt for the same reason an input is.
   */
  it('does not fire tool shortcuts while typing notes', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await wrapper.vm.$nextTick()
    await openNotes(wrapper)

    const notes = wrapper.find('[data-notes]')
    ;(notes.element as HTMLTextAreaElement).focus()
    notes.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-tool="arrow-run"]').classes()).not.toContain('is-active')
  })
})

describe('a fresh board on a portrait screen', () => {
  function stubPortrait(portrait: boolean) {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('orientation') ? portrait : false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    __resetViewportForTests()
  }

  afterEach(() => __resetViewportForTests())

  /**
   * A landscape pitch on a portrait phone fills under a third of the
   * screen. Starting rotated makes the board usable without the coach
   * having to know the Rotate button exists.
   */
  it('starts rotated so the pitch fills the screen', async () => {
    stubPortrait(true)
    const board = useBoard()
    wrapper = mount(App)
    await wrapper.vm.$nextTick()
    expect(board.state.pitch.rotated).toBe(true)
  })

  it('leaves a landscape screen alone', async () => {
    stubPortrait(false)
    const board = useBoard()
    wrapper = mount(App)
    await wrapper.vm.$nextTick()
    expect(board.state.pitch.rotated).toBe(false)
  })

  it('adds nothing to the undo stack', async () => {
    stubPortrait(true)
    const board = useBoard()
    wrapper = mount(App)
    await wrapper.vm.$nextTick()
    expect(board.canUndo.value).toBe(false)
  })

  /**
   * Rotation is a property of the saved drill. A coach who deliberately
   * saved a landscape pattern must get it back landscape, whatever they
   * are holding.
   */
  it('never overrides what a restored draft says', async () => {
    stubPortrait(true)
    const storage = useStorage()
    const board = useBoard()
    storage.saveDraft({
      ...board.snapshot(),
      pitch: { type: 'full', rotated: false },
    })
    __resetBoardForTests()

    wrapper = mount(App)
    await wrapper.vm.$nextTick()
    expect(board.state.pitch.rotated).toBe(false)
  })
})

/**
 * One rail, at every width. A coach who plans a session on a desktop and
 * runs it from a tablet used to learn the tool twice: the same controls sat
 * in a bar across the top on one and down the edge on the other.
 */
describe('the rail at every width', () => {
  function stubScreen({ compact, portrait = false }: { compact: boolean; portrait?: boolean }) {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('orientation') ? portrait : compact,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    __resetViewportForTests()
  }

  afterEach(() => __resetViewportForTests())

  it('stands beside the board on a wide screen', async () => {
    stubScreen({ compact: false })
    wrapper = mount(App)
    await nextTick()
    const rail = wrapper.find('.rail')
    expect(rail.exists()).toBe(true)
    expect(rail.classes()).not.toContain('rail--horizontal')
  })

  /** Held upright, an 88px column is a fifth of a phone's width. */
  it('lies along the bottom on a small screen held upright', async () => {
    stubScreen({ compact: true, portrait: true })
    wrapper = mount(App)
    await nextTick()
    const rail = wrapper.find('.rail')
    expect(rail.exists()).toBe(true)
    expect(rail.classes()).toContain('rail--horizontal')
  })

  /**
   * Turned on its side the same phone has width to spare and barely 300px
   * of height once the header is off, and a rail lying down there took the
   * pitch away entirely.
   */
  it('stands back up on a small screen turned on its side', async () => {
    stubScreen({ compact: true, portrait: false })
    wrapper = mount(App)
    await nextTick()
    expect(wrapper.find('.rail').classes()).not.toContain('rail--horizontal')
  })

  it('carries the same controls either way round', async () => {
    for (const portrait of [false, true]) {
      stubScreen({ compact: true, portrait })
      wrapper = mount(App)
      await nextTick()
      for (const hook of ['[data-tool="pen"]', '[data-add-counter="red"]', '[data-add-ball]', '[data-pitch-menu]']) {
        expect(wrapper.findAll(hook)).toHaveLength(1)
      }
      wrapper.unmount()
    }
  })

  it('changes tool from the rail', async () => {
    stubScreen({ compact: false })
    wrapper = mount(App)
    await nextTick()
    await wrapper.find('[data-tool="cone"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-tool="cone"]').classes()).toContain('is-active')
  })
})

describe('the frame strip', () => {
  it('is on the page', () => {
    wrapper = mountApp()
    expect(wrapper.find('[data-add-frame]').exists()).toBe(true)
  })
})

/**
 * jsdom has no canvas, so `boardToGifBlob` always rejects here — every
 * export in this suite runs the `finally` path. That is exactly what these
 * pin: exportGif had no test at all before this, and separately, the GIF
 * button was declared `exporting` but never wired to it, so nothing on
 * screen showed an export was under way.
 */
describe('exporting an animation', () => {
  it('restores the playhead and reports the failure, rather than leaving the board wherever it last sampled to', async () => {
    const board = useBoard()
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    const app = (wrapper = mountApp())
    await nextTick()

    const wasAt = board.playback.at
    await app.find('[data-export-gif]').trigger('click')

    await vi.waitFor(() => {
      expect(app.find('.notice').text()).toMatch(/could not create the image/i)
    })

    expect(board.playback.at).toBe(wasAt)
    expect(board.isDerived.value).toBe(false)
  })

  it('disables the GIF button for as long as the export is running', async () => {
    const board = useBoard()
    board.addFrame()
    const app = (wrapper = mountApp())
    await nextTick()

    const click = app.find('[data-export-gif]').trigger('click')
    await nextTick()
    expect(app.find('[data-export-gif]').attributes('disabled')).toBeDefined()

    await click
    await vi.waitFor(() => {
      expect(app.find('.notice').text()).toMatch(/could not create the image/i)
    })

    expect(app.find('[data-export-gif]').attributes('disabled')).toBeUndefined()
  })

  /**
   * The frame strip's own transport must not be able to race the export's
   * seek loop. Space is the case a disabled button cannot catch: it drives
   * `board.play()` directly, so the lock has to live under the button, not
   * only on it.
   */
  it('refuses to start playing from the keyboard while it runs', async () => {
    const board = useBoard()
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    const app = (wrapper = mountApp())
    await nextTick()

    const click = app.find('[data-export-gif]').trigger('click')
    await nextTick()

    fire({ key: ' ' })
    await nextTick()
    expect(board.playback.playing).toBe(false)

    await click
    await vi.waitFor(() => {
      expect(app.find('.notice').text()).toMatch(/could not create the image/i)
    })
  })
})

describe('space plays and pauses', () => {
  it('toggles playback', async () => {
    const board = useBoard()
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    wrapper = mountApp()

    fire({ key: ' ' })
    await nextTick()
    expect(board.playback.playing).toBe(true)

    fire({ key: ' ' })
    await nextTick()
    expect(board.playback.playing).toBe(false)
  })

  it('is left alone while the coach is typing in the notes', async () => {
    const board = useBoard()
    board.addFrame()
    board.setFrameDuration(1, 1000)
    wrapper = mountApp()
    await wrapper.find('[data-inspector-open]').trigger('click')

    const notes = wrapper.find('[data-notes]').element as HTMLTextAreaElement
    notes.focus()
    fire({ key: ' ' }, notes)
    await nextTick()
    expect(board.playback.playing).toBe(false)

    // A control, not an afterthought: without it this test cannot fail,
    // because Space typed nowhere at all would also leave playback alone.
    // Firing the same key on the window proves the shortcut really exists
    // and that the notes field is the reason it did not fire above.
    fire({ key: ' ' })
    await nextTick()
    expect(board.playback.playing).toBe(true)
  })

  it('leaves a focused chip alone, so the chip still responds to its own Space press', async () => {
    const board = useBoard()
    board.addFrame()
    board.setFrameDuration(1, 1000)
    wrapper = mountApp()

    // The add-phase card is a real <button>, exactly like every control in
    // the rail and the timeline. Space is the platform's own way to
    // press a focused button, so the shortcut must not steal it — a coach
    // who just clicked a chip still has that chip focused.
    const chip = wrapper.find('[data-add-frame]').element as HTMLButtonElement
    chip.focus()
    const notPrevented = fire({ key: ' ' }, chip)
    await nextTick()
    expect(board.playback.playing).toBe(false)
    // Not prevented: the chip's own native activation must survive, or
    // clicking a chip and then pressing Space would appear to do nothing.
    expect(notPrevented).toBe(true)
  })
})

/**
 * Round 1 of this feature exempted a focused button/link/select from the
 * *shared* typing guard, on the reasoning that "one guard, one place this
 * decision lives". That fixed Space stealing a chip's own press, but the
 * same guard sits in front of every other shortcut too: Escape, Delete,
 * Backspace and the tool letters do nothing on a focused button natively,
 * so exempting BUTTON there was never protecting anything — it was only
 * silencing them. A coach who clicks Move, boxes a group, and presses
 * Delete does this constantly, since the button they just clicked keeps
 * focus. These three pin that the fix belongs on Space alone.
 */
describe('other shortcuts still work with a chip focused', () => {
  /** Draw an arrow and select it by pressing it, as a coach would. */
  async function selectAnArrow(app: VueWrapper) {
    const board = useBoard()
    const id = board.startArrow({ x: 20, y: 30 }, '#ffffff', 'pass')
    board.updateSegment(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    await app.vm.$nextTick()
    const path = app.find('[data-drawing]').element
    await firePointer(path, 'pointerdown', clientFor(40, 30))
    await firePointer(app.find('.stage svg').element, 'pointerup', clientFor(40, 30))
  }

  it('still clears the selection on Escape', async () => {
    wrapper = mountApp()
    await selectAnArrow(wrapper)
    expect(wrapper.find('[data-selected]').exists()).toBe(true)

    const chip = wrapper.find('[data-add-frame]').element as HTMLButtonElement
    chip.focus()
    fire({ key: 'Escape' }, chip)
    await nextTick()

    expect(wrapper.find('[data-selected]').exists()).toBe(false)
  })

  it('still deletes the selection on Delete', async () => {
    const board = useBoard()
    wrapper = mountApp()
    await selectAnArrow(wrapper)

    const chip = wrapper.find('[data-add-frame]').element as HTMLButtonElement
    chip.focus()
    fire({ key: 'Delete' }, chip)
    await nextTick()

    expect(board.state.drawings).toEqual([])
  })

  it('still switches tool on a tool letter', async () => {
    wrapper = mountApp()

    const chip = wrapper.find('[data-add-frame]').element as HTMLButtonElement
    chip.focus()
    fire({ key: 'd' }, chip)
    await nextTick()

    expect(wrapper.find('[data-tool="pen"]').classes()).toContain('is-active')
  })
})

describe('autosave during playback', () => {
  it('does not write a half-tweened board to the draft', async () => {
    const board = useBoard()
    const storage = useStorage()
    wrapper = mountApp()

    // Three frames, two moves, so scrubbing into the second move changes
    // `currentFrame` (0 -> 1) while still leaving the view a blend. With
    // only two frames the index cannot change without also landing exactly
    // on a frame (t === 0), which would not exercise the guard at all.
    board.addCounter('red')
    board.addFrame()
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.setFrameDuration(2, 1000)
    board.goToFrame(0)

    // Let that settle into a real saved draft, so what follows is checked
    // against an actual baseline rather than "nothing was ever written".
    await new Promise((resolve) => setTimeout(resolve, 500))
    const before = localStorage.getItem('fct.draft.v1')
    expect(before).toBeTruthy()

    board.play()
    board.scrubTo(1500)
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(localStorage.getItem('fct.draft.v1')).toBe(before)

    board.pause()
    void storage
  })
})
