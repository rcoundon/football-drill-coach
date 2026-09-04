import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import DrillHeader from '../src/components/DrillHeader.vue'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { __resetViewportForTests } from '../src/composables/useViewport'

beforeEach(() => {
  __resetBoardForTests()
  __resetViewportForTests()
})

afterEach(() => __resetViewportForTests())

/** A screen too narrow for the header's full row, as a phone in portrait. */
function stubNarrow(narrow: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('max-width: 640px') ? narrow : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  __resetViewportForTests()
}

function mountHeader(props: Record<string, unknown> = {}) {
  return mount(DrillHeader, { props, attachTo: document.body })
}

describe('the drill name', () => {
  it('shows the open drill, ready to edit in place', () => {
    const wrapper = mountHeader({ patternName: 'Press trigger' })
    const field = wrapper.find('[data-current-pattern]').element as HTMLInputElement
    expect(field.value).toBe('Press trigger')
  })

  it('asks the app to rename once the coach is done typing', async () => {
    const wrapper = mountHeader({ patternName: 'Press trigger' })
    const field = wrapper.find('[data-current-pattern]')
    await field.setValue('Counter press')
    await field.trigger('change')
    expect(wrapper.emitted('rename')!.at(-1)).toEqual(['Counter press'])
  })

  /**
   * A drill with no name cannot be told apart in the library, so an emptied
   * field puts the old name back rather than filing a blank one.
   */
  it('refuses to rename a drill to nothing', async () => {
    const wrapper = mountHeader({ patternName: 'Press trigger' })
    const field = wrapper.find('[data-current-pattern]')
    await field.setValue('   ')
    await field.trigger('change')
    expect(wrapper.emitted('rename')).toBeUndefined()
    expect((field.element as HTMLInputElement).value).toBe('Press trigger')
  })

  it('says nothing when the name comes back unchanged', async () => {
    const wrapper = mountHeader({ patternName: 'Press trigger' })
    await wrapper.find('[data-current-pattern]').trigger('change')
    expect(wrapper.emitted('rename')).toBeUndefined()
  })
})

describe('the save status', () => {
  it('says a board that has never been saved is not saved', () => {
    expect(mountHeader().find('[data-save-status]').text()).toMatch(/not saved/i)
  })

  it('says so between a change and the autosave that follows it', () => {
    const wrapper = mountHeader({ patternName: 'Press trigger', saveStatus: 'dirty' })
    expect(wrapper.find('[data-save-status]').text()).toMatch(/unsaved changes/i)
  })

  it('counts the minutes since the last save', () => {
    const wrapper = mountHeader({
      patternName: 'Press trigger',
      saveStatus: 'saved',
      lastSavedAt: Date.now() - 3 * 60_000,
    })
    expect(wrapper.find('[data-save-status]').text()).toBe('Saved 3m ago')
  })

  it('says just now while the save is fresh', () => {
    const wrapper = mountHeader({
      patternName: 'Press trigger',
      saveStatus: 'saved',
      lastSavedAt: Date.now(),
    })
    expect(wrapper.find('[data-save-status]').text()).toBe('Saved just now')
  })
})

describe('the drill menu', () => {
  it('keeps its items out of the way until it is opened', async () => {
    const wrapper = mountHeader()
    expect(wrapper.find('[data-save]').isVisible()).toBe(false)

    await wrapper.find('[data-drill-menu]').trigger('click')
    expect(wrapper.find('[data-save]').isVisible()).toBe(true)
  })

  it('carries every file operation that used to be a pill', async () => {
    const wrapper = mountHeader()
    await wrapper.find('[data-drill-menu]').trigger('click')
    for (const hook of ['data-open', 'data-save', 'data-save-as', 'data-import-json']) {
      expect(wrapper.find(`[${hook}]`).isVisible()).toBe(true)
    }
  })

  /**
   * Sessions sit beside Open… rather than behind a separate control: both
   * are ways into a library the drill menu already owns, and a second menu
   * for one more button would be a second place to look for it.
   */
  it('asks the app to open the sessions panel', async () => {
    const wrapper = mountHeader()
    await wrapper.find('[data-drill-menu]').trigger('click')
    await wrapper.find('[data-open-sessions]').trigger('click')
    expect(wrapper.emitted('openSessions')).toHaveLength(1)
    expect(wrapper.find('[data-open-sessions]').isVisible()).toBe(false)
  })

  it('emits what was chosen and closes behind itself', async () => {
    const wrapper = mountHeader()
    await wrapper.find('[data-drill-menu]').trigger('click')
    await wrapper.find('[data-save-as]').trigger('click')
    expect(wrapper.emitted('saveAs')).toHaveLength(1)
    expect(wrapper.emitted('save')).toBeFalsy()
    expect(wrapper.find('[data-save-as]').isVisible()).toBe(false)
  })

  /**
   * There is nothing to copy or delete until the drill is in the library:
   * both act on a saved drill, not on what is currently drawn.
   */
  it('offers no Duplicate or Delete for a board that was never saved', async () => {
    const wrapper = mountHeader()
    await wrapper.find('[data-drill-menu]').trigger('click')
    expect(wrapper.find('[data-duplicate-drill]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-delete-drill]').attributes('disabled')).toBeDefined()
  })

  it('offers both once a drill is open', async () => {
    const wrapper = mountHeader({ patternName: 'Press trigger' })
    await wrapper.find('[data-drill-menu]').trigger('click')
    expect(wrapper.find('[data-duplicate-drill]').attributes('disabled')).toBeUndefined()
    await wrapper.find('[data-delete-drill]').trigger('click')
    expect(wrapper.emitted('deleteDrill')).toHaveLength(1)
  })

  it('closes on Escape, rather than needing somewhere harmless to click', async () => {
    const wrapper = mountHeader()
    await wrapper.find('[data-drill-menu]').trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-save]').isVisible()).toBe(false)
  })

  it('closes when the coach goes back to the board', async () => {
    const wrapper = mountHeader()
    await wrapper.find('[data-drill-menu]').trigger('click')
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-save]').isVisible()).toBe(false)
  })

  /** Two menus open at once is a state nobody asked for. */
  it('gives way to the Share menu rather than sitting open beside it', async () => {
    const wrapper = mountHeader()
    await wrapper.find('[data-drill-menu]').trigger('click')
    await wrapper.find('[data-share-menu]').trigger('click')
    expect(wrapper.find('[data-save]').isVisible()).toBe(false)
    expect(wrapper.find('[data-export-png]').isVisible()).toBe(true)
  })
})

describe('the Share menu', () => {
  it('carries the three exports', async () => {
    const board = useBoard()
    board.addFrame()
    const wrapper = mountHeader()
    await wrapper.find('[data-share-menu]').trigger('click')
    for (const hook of ['data-export-png', 'data-export-gif', 'data-export-json']) {
      expect(wrapper.find(`[${hook}]`).isVisible()).toBe(true)
    }
  })

  /*
   * The backup is named for what it does, not for the file it writes. PNG
   * and GIF are pictures a coach already knows; JSON is a word from our side
   * of the screen, and a menu is not where anyone learns it.
   */
  it('names the backup after the job, not the file format', async () => {
    const wrapper = mountHeader()
    await wrapper.find('[data-share-menu]').trigger('click')
    expect(wrapper.get('[data-export-json]').text()).toBe('Back up everything')
  })

  /*
   * A coach who wants to hand a session to an assistant has no other way to
   * do it, and nothing about the word "backup" suggests one. The tooltip is
   * the smallest place to say so, and Help says it again for the tablets
   * that never show a tooltip at all.
   */
  it('says the backup file is how drills reach another coach', async () => {
    const wrapper = mountHeader()
    await wrapper.find('[data-share-menu]').trigger('click')
    expect(wrapper.get('[data-export-json]').attributes('title')).toContain('another coach')
  })

  /** A GIF of a single still is a worse PNG. */
  it('offers no GIF while the drill is a single moment', async () => {
    const wrapper = mountHeader()
    await wrapper.find('[data-share-menu]').trigger('click')
    expect(wrapper.find('[data-export-gif]').exists()).toBe(false)
  })

  it('will not start a second animation while one is building', async () => {
    const board = useBoard()
    board.addFrame()
    const wrapper = mountHeader({ exporting: true })
    await wrapper.find('[data-share-menu]').trigger('click')
    expect(wrapper.find('[data-export-gif]').attributes('disabled')).toBeDefined()
  })
})

describe('undo and redo', () => {
  it('are disabled when there is nothing to do', () => {
    const wrapper = mountHeader()
    expect(wrapper.find('[data-undo]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-redo]').attributes('disabled')).toBeDefined()
  })

  it('undoes', async () => {
    const board = useBoard()
    board.addCounter('red')
    const wrapper = mountHeader()
    await wrapper.find('[data-undo]').trigger('click')
    expect(board.state.counters).toHaveLength(0)
  })

  /**
   * Both refuse outright while the view is derived — a blend is not
   * something an earlier snapshot could be applied under. Left unreflected,
   * a coach pausing mid-move saw two live-looking buttons that did nothing.
   */
  it('are disabled mid-move, even with something to undo and redo', () => {
    const board = useBoard()
    board.addCounter('red')
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    board.undo()
    expect(board.canUndo.value).toBe(true)
    expect(board.canRedo.value).toBe(true)

    board.scrubTo(500)
    const wrapper = mountHeader()
    expect(wrapper.find('[data-undo]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-redo]').attributes('disabled')).toBeDefined()

    board.endScrub()
  })
})

/**
 * A coach who does not know what a control does needs the explanation to be
 * at least as reachable as the control itself, so Help is never behind a
 * menu.
 */
describe('Help', () => {
  it('is out in the open, not in a menu', async () => {
    const wrapper = mountHeader()
    expect(wrapper.find('[data-help]').isVisible()).toBe(true)
    await wrapper.find('[data-help]').trigger('click')
    expect(wrapper.emitted('help')).toHaveLength(1)
  })
})

/**
 * The destructive group. It used to sit in the toolbar beside the routine
 * controls, one mis-tap from Undo.
 */
describe('the destructive group', () => {
  it('keeps every clear behind the drill menu', async () => {
    const board = useBoard()
    board.addCounter('red')
    const wrapper = mountHeader()

    expect(wrapper.find('[data-clear-players]').isVisible()).toBe(false)
    await wrapper.find('[data-drill-menu]').trigger('click')
    expect(wrapper.find('[data-clear-players]').isVisible()).toBe(true)
    expect(wrapper.find('[data-clear-drawings]').isVisible()).toBe(true)
    expect(wrapper.find('[data-reset]').isVisible()).toBe(true)
  })

  it('asks the app rather than clearing the board itself', async () => {
    const board = useBoard()
    board.addCounter('red')
    const wrapper = mountHeader()
    await wrapper.find('[data-clear-players]').trigger('click')

    expect(wrapper.emitted('clearPlayers')).toHaveLength(1)
    // The app owns the undo toast, so the board is still untouched here.
    expect(board.state.counters).toHaveLength(1)
  })

  it('offers nothing to clear on a board with nothing on it', () => {
    const wrapper = mountHeader()
    expect(wrapper.find('[data-clear-players]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-clear-drawings]').attributes('disabled')).toBeDefined()
  })

  /** A drawing on another phase is still a drawing to rub out. */
  it('offers to clear drawings that are on some other phase', async () => {
    const board = useBoard()
    const id = board.startArrow({ x: 20, y: 30 }, '#ffffff', 'pass')
    board.updateSegment(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    // The new phase copies the drawing; rubbing it out here leaves the coach
    // standing on a phase with nothing on it and the first phase still drawn.
    board.addFrame()
    board.deleteDrawing(id)

    expect(board.state.drawings).toHaveLength(0)
    expect(board.state.frames[0].drawings).toHaveLength(1)

    const wrapper = mountHeader()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-clear-drawings]').attributes('disabled')).toBeUndefined()
  })

  it('refuses all three while the drill is mid-move', async () => {
    const board = useBoard()
    board.addCounter('red')
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    board.scrubTo(500)

    const wrapper = mountHeader()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-clear-players]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-clear-drawings]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-reset]').attributes('disabled')).toBeDefined()
    board.endScrub()
  })
})

/*
 * The header is one row that does not wrap, and it needs about 590px to hold
 * everything — nearer 610 on a touch screen. A portrait phone gives it 360.
 * Everything past the name used to overflow the right edge and be gone: the
 * save status, Share, and Help, which is where "Take the tour" lives. So a
 * coach who skipped the tour on a phone had no way back to it.
 */
describe('on a screen too narrow for the whole row', () => {
  it('drops the save status and the divider, which are the row telling itself things', () => {
    stubNarrow(true)
    const wrapper = mountHeader({ patternName: 'Press trigger', saveStatus: 'saved' })
    expect(wrapper.find('[data-save-status]').exists()).toBe(false)
  })

  it('keeps the name, the menu and undo where they were', () => {
    stubNarrow(true)
    const wrapper = mountHeader({ patternName: 'Press trigger' })
    for (const hook of ['data-current-pattern', 'data-drill-menu', 'data-undo', 'data-redo']) {
      expect(wrapper.find(`[${hook}]`).exists(), hook).toBe(true)
    }
  })

  it('takes Share and Help out of the row', () => {
    stubNarrow(true)
    const wrapper = mountHeader()
    expect(wrapper.find('[data-share-menu]').exists()).toBe(false)
    // Still in the component, but in the menu rather than sitting in the row.
    expect(wrapper.find('.header > [data-help]').exists()).toBe(false)
    expect(wrapper.find('.menu [data-help]').exists()).toBe(true)
  })

  /* Into the one menu that is reachable at any width. */
  it('offers Help and every export from the drill menu instead', async () => {
    stubNarrow(true)
    const board = useBoard()
    board.addFrame()
    const wrapper = mountHeader()
    await wrapper.find('[data-drill-menu]').trigger('click')
    for (const hook of ['data-export-png', 'data-export-gif', 'data-export-json', 'data-help']) {
      expect(wrapper.find(`[${hook}]`).isVisible(), hook).toBe(true)
    }
  })

  it('asks the app for help from there, and closes behind itself', async () => {
    stubNarrow(true)
    const wrapper = mountHeader()
    await wrapper.find('[data-drill-menu]').trigger('click')
    await wrapper.find('[data-help]').trigger('click')
    expect(wrapper.emitted('help')).toHaveLength(1)
    expect(wrapper.find('[data-help]').isVisible()).toBe(false)
  })

  /*
   * One at a time, wherever it is. The tour spotlights `[data-help]`, and a
   * second copy hidden in the row would be the one `querySelector` found.
   */
  it('never has two of the same control at once', () => {
    stubNarrow(true)
    const wrapper = mountHeader()
    expect(wrapper.findAll('[data-help]')).toHaveLength(1)
    expect(wrapper.findAll('[data-export-json]')).toHaveLength(1)
  })

  it('leaves the wide layout exactly as it was', () => {
    stubNarrow(false)
    const wrapper = mountHeader({ patternName: 'Press trigger', saveStatus: 'saved' })
    expect(wrapper.find('[data-save-status]').exists()).toBe(true)
    expect(wrapper.find('[data-share-menu]').exists()).toBe(true)
    expect(wrapper.find('[data-help]').exists()).toBe(true)
  })
})
