import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { ToolMode } from '../src/types'
import Toolbar from '../src/components/Toolbar.vue'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { COUNTER_COLORS } from '../src/geometry'
import { __resetViewportForTests } from '../src/composables/useViewport'

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

  it('switches to Move, so the new player can be dragged straight away', async () => {
    const wrapper = mountToolbar('arrow-pass')
    await wrapper.find('[data-add-counter="blue"]').trigger('click')
    expect(wrapper.emitted('update:tool')!.at(-1)).toEqual(['select'])
  })

  it('does not bother emitting when Move is already selected', async () => {
    const wrapper = mountToolbar('select')
    await wrapper.find('[data-add-counter="blue"]').trigger('click')
    expect(wrapper.emitted('update:tool')).toBeUndefined()
  })

  it('will not add a player while the drill is playing', async () => {
    const board = useBoard()
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    board.scrubTo(500)

    const wrapper = mountToolbar()
    expect(wrapper.find('[data-add-counter="red"]').attributes('disabled')).toBeDefined()
    board.endScrub()
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

/**
 * A tablet has no Cmd key and no Delete key, so the only way to copy or
 * remove a gathered group there is a button. They sit with Undo and Redo,
 * which is the one group that is never folded away behind the More menu.
 */
describe('acting on what is held', () => {
  it('offers nothing to press when nothing is held', () => {
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-duplicate]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-delete-selection]').attributes('disabled')).toBeDefined()
  })

  it('comes alive once something is', () => {
    const wrapper = mount(Toolbar, {
      props: { tool: 'select' as ToolMode, drawColor: '#ffffff', selectionSize: 3 },
    })
    expect(wrapper.find('[data-duplicate]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-delete-selection]').attributes('disabled')).toBeUndefined()
  })

  it('emits duplicate', async () => {
    const wrapper = mount(Toolbar, {
      props: { tool: 'select' as ToolMode, drawColor: '#ffffff', selectionSize: 2 },
    })
    await wrapper.find('[data-duplicate]').trigger('click')
    expect(wrapper.emitted('duplicate')).toBeTruthy()
  })

  it('emits deleteSelection', async () => {
    const wrapper = mount(Toolbar, {
      props: { tool: 'select' as ToolMode, drawColor: '#ffffff', selectionSize: 2 },
    })
    await wrapper.find('[data-delete-selection]').trigger('click')
    expect(wrapper.emitted('deleteSelection')).toBeTruthy()
  })

  it('says how many things the buttons would act on', () => {
    const wrapper = mount(Toolbar, {
      props: { tool: 'select' as ToolMode, drawColor: '#ffffff', selectionSize: 3 },
    })
    expect(wrapper.find('[data-duplicate]').attributes('title')).toContain('3')
  })
})

/**
 * A coach who does not know what a control does has no way to find out —
 * that gap is what the Help panel exists to close. The chip sits beside
 * Undo, Redo, Copy and Delete: the one group never folded behind ☰ More.
 */
describe('Help', () => {
  it('sits beside Undo, Redo, Copy and Delete', () => {
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-help]').exists()).toBe(true)
  })

  it('emits help when pressed', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('[data-help]').trigger('click')
    expect(wrapper.emitted('help')).toBeTruthy()
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

  /**
   * `undo` and `redo` both refuse outright while the view is derived — a
   * blend is not something an earlier snapshot could be applied under. Left
   * unreflected, a coach pausing mid-move saw two live-looking buttons that
   * quietly did nothing.
   */
  it('are disabled while the drill is mid-move, even though there is something to undo and redo', () => {
    const board = useBoard()
    board.addCounter('red')
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    board.undo() // leaves something to undo AND something to redo
    expect(board.canUndo.value).toBe(true)
    expect(board.canRedo.value).toBe(true)

    board.scrubTo(500)
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-undo]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-redo]').attributes('disabled')).toBeDefined()

    board.endScrub()
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

  /**
   * Counters, markers and labels are drill-wide, so the current frame's own
   * length already speaks for every frame. Drawings and the ball's
   * possession are not: a coach parked on an empty frame must still be
   * offered Clear drawings and Reset when an earlier or later frame has
   * something to lose, or there is no way to reach it from that frame.
   */
  it('are not disabled just because the frame showing has nothing, when another frame does', () => {
    const board = useBoard()
    board.addFrame()
    board.goToFrame(0)
    const line = board.startLine({ x: 5, y: 5 }, '#fff')
    board.updateSegment(line, { x: 60, y: 5 })
    board.finishDrawing(line)
    board.goToFrame(1) // parked on the frame with nothing on it

    const wrapper = mountToolbar()
    expect(wrapper.find('[data-clear-drawings]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-reset]').attributes('disabled')).toBeUndefined()
  })

  /**
   * Every mutator these buttons call refuses outright while the view is
   * derived, so pausing mid-move used to leave five live-looking buttons
   * that quietly did nothing when pressed.
   */
  it('are disabled while the drill is mid-move, even though there is something to act on', () => {
    const board = useBoard()
    board.addCounter('red')
    const line = board.startLine({ x: 5, y: 5 }, '#fff')
    board.updateSegment(line, { x: 60, y: 5 })
    board.finishDrawing(line)
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    board.scrubTo(500)

    const wrapper = mountToolbar()
    expect(wrapper.find('[data-clear-players]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-clear-drawings]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-reset]').attributes('disabled')).toBeDefined()

    board.endScrub()
  })

  /**
   * `board.resetBoard()` already refuses while the view is derived — but
   * `Toolbar.resetBoard()` used to emit `reset` unconditionally regardless,
   * so the app forgot the pattern that was open even though nothing on the
   * board had actually changed. The next Save then wrote a duplicate under a
   * new id, silently, with no undo.
   */
  it('emits nothing while mid-move, so a saved pattern is not silently detached', async () => {
    const board = useBoard()
    board.addCounter('red')
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    board.scrubTo(500)

    const wrapper = mountToolbar()
    await wrapper.find('[data-reset]').trigger('click')

    expect(board.state.frames).toHaveLength(2)
    expect(board.state.counters).toHaveLength(1)
    expect(wrapper.emitted('reset')).toBeUndefined()

    board.endScrub()
  })
})

describe('the cone tool', () => {
  it('is offered alongside the other tools', () => {
    expect(mountToolbar().find('[data-tool="cone"]').exists()).toBe(true)
  })

  it('emits the cone tool when chosen', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('[data-tool="cone"]').trigger('click')
    expect(wrapper.emitted('update:tool')![0]).toEqual(['cone'])
  })

  it('offers Reset once there are only cones on the board', () => {
    useBoard().addMarker({ x: 20, y: 20 })
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-reset]').attributes('disabled')).toBeUndefined()
  })
})

describe('the ball toggle', () => {
  it('hides the ball when pressed', async () => {
    const board = useBoard()
    const wrapper = mountToolbar()
    await wrapper.find('[data-toggle-ball]').trigger('click')
    expect(board.state.ball.visible).toBe(false)
  })

  it('shows whether the ball is currently on the pitch', async () => {
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-toggle-ball]').classes()).toContain('is-active')
    await wrapper.find('[data-toggle-ball]').trigger('click')
    expect(wrapper.find('[data-toggle-ball]').classes()).not.toContain('is-active')
  })
})

describe('the text tool', () => {
  it('is offered alongside the other tools', () => {
    expect(mountToolbar().find('[data-tool="text"]').exists()).toBe(true)
  })

  it('toggles the labels, and shows whether they are on', async () => {
    const board = useBoard()
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-toggle-labels]').classes()).toContain('is-active')
    await wrapper.find('[data-toggle-labels]').trigger('click')
    expect(board.state.labelsVisible).toBe(false)
    expect(wrapper.find('[data-toggle-labels]').classes()).not.toContain('is-active')
  })

  it('offers Reset once there is only a label on the board', () => {
    useBoard().addLabel({ x: 20, y: 20 }, 'Something')
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-reset]').attributes('disabled')).toBeUndefined()
  })
})

describe('the notes toggle', () => {
  it('hides the notes panel, and shows whether it is on', async () => {
    const board = useBoard()
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-toggle-notes]').classes()).toContain('is-active')
    await wrapper.find('[data-toggle-notes]').trigger('click')
    expect(board.state.notesVisible).toBe(false)
    expect(wrapper.find('[data-toggle-notes]').classes()).not.toContain('is-active')
  })

  it('offers Reset once there are only notes', () => {
    useBoard().setNotes('Coaching points')
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-reset]').attributes('disabled')).toBeUndefined()
  })
})

describe('on a narrow screen', () => {
  function stubNarrow(narrow: boolean) {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width') ? narrow : false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    __resetViewportForTests()
  }

  afterEach(() => __resetViewportForTests())

  it('keeps the tools and colours in reach without opening anything', () => {
    stubNarrow(true)
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-tool="pen"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-add-counter]')).toHaveLength(COUNTER_COLORS.length)
    expect(wrapper.find('[data-undo]').exists()).toBe(true)
  })

  /**
   * These are not conveniences on a touch screen, they are the only way in:
   * there is no Cmd+D and no Delete key under a finger. Behind the More menu
   * they would be unreachable in practice, so they sit with Undo, which is
   * the one group never folded away.
   */
  it('keeps Copy and Delete out in the open, where a finger can reach them', () => {
    stubNarrow(true)
    const wrapper = mount(Toolbar, {
      props: { tool: 'select' as ToolMode, drawColor: '#ffffff', selectionSize: 2 },
    })
    expect(wrapper.find('[data-duplicate]').exists()).toBe(true)
    expect(wrapper.find('[data-delete-selection]').exists()).toBe(true)
    expect(wrapper.find('[data-more]').exists()).toBe(true)
  })

  it('keeps them in the open on a tablet rail layout too', () => {
    stubNarrow(false)
    const wrapper = mount(Toolbar, {
      props: {
        tool: 'select' as ToolMode,
        drawColor: '#ffffff',
        selectionSize: 2,
        railed: true,
      },
    })
    expect(wrapper.find('[data-duplicate]').exists()).toBe(true)
    expect(wrapper.find('[data-delete-selection]').exists()).toBe(true)
  })

  /**
   * Help belongs with Undo, Redo, Copy and Delete rather than behind ☰ More:
   * a coach who does not know what a control does needs the explanation to
   * be as reachable as the control itself, on the device this board is
   * mostly used on.
   */
  it('keeps Help out in the open on a narrow screen too', () => {
    stubNarrow(true)
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-help]').exists()).toBe(true)
  })

  /**
   * The controls used once per drill move behind a menu so the ones used
   * constantly can be big enough to hit.
   */
  it('puts the set-up controls behind a menu', () => {
    stubNarrow(true)
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-more]').exists()).toBe(true)
    expect(wrapper.find('[data-save]').exists()).toBe(false)
    expect(wrapper.find('[data-pitch="full"]').exists()).toBe(false)
  })

  it('reveals them when the menu is opened', async () => {
    stubNarrow(true)
    const wrapper = mountToolbar()
    await wrapper.find('[data-more]').trigger('click')
    expect(wrapper.find('[data-save]').exists()).toBe(true)
    expect(wrapper.find('[data-pitch="full"]').exists()).toBe(true)
    expect(wrapper.find('[data-reset]').exists()).toBe(true)
  })

  it('closes the menu once something in it is used', async () => {
    stubNarrow(true)
    const wrapper = mountToolbar()
    await wrapper.find('[data-more]').trigger('click')
    await wrapper.find('[data-pitch="full"]').trigger('click')
    expect(wrapper.find('[data-save]').exists()).toBe(false)
  })

  it('shows everything at once on a wide screen, with no menu', () => {
    stubNarrow(false)
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-more]').exists()).toBe(false)
    expect(wrapper.find('[data-save]').exists()).toBe(true)
    expect(wrapper.find('[data-pitch="full"]').exists()).toBe(true)
  })
})

/**
 * A GIF of a single still is a worse PNG, so the button only appears once
 * there is a second frame for it to actually animate between.
 */
describe('the GIF button', () => {
  it('is hidden while the drill is a single moment, because PNG covers that', () => {
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-export-gif]').exists()).toBe(false)
  })

  it('appears once there is something to animate', async () => {
    const board = useBoard()
    board.addFrame()
    const wrapper = mountToolbar()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-export-gif]').exists()).toBe(true)
  })

  it('asks the app to export', async () => {
    const board = useBoard()
    board.addFrame()
    const wrapper = mountToolbar()
    await wrapper.find('[data-export-gif]').trigger('click')
    expect(wrapper.emitted('exportGif')).toHaveLength(1)
  })
})

describe('when a rail is carrying the tools', () => {
  function mountRailed() {
    return mount(Toolbar, {
      props: { tool: 'select' as ToolMode, drawColor: '#ffffff', railed: true },
    })
  }

  /** The rail owns these; showing them twice would be two sources of truth. */
  it('leaves the tools and player colours to the rail', () => {
    const wrapper = mountRailed()
    expect(wrapper.find('[data-tool="pen"]').exists()).toBe(false)
    expect(wrapper.find('[data-add-counter="red"]').exists()).toBe(false)
  })

  it('keeps undo and redo, which the rail deliberately does not carry', () => {
    const wrapper = mountRailed()
    expect(wrapper.find('[data-undo]').exists()).toBe(true)
    expect(wrapper.find('[data-redo]').exists()).toBe(true)
  })

  it('still carries everything the rail does not', () => {
    const wrapper = mountRailed()
    expect(wrapper.find('[data-pitch="full"]').exists()).toBe(true)
    expect(wrapper.find('[data-save]').exists()).toBe(true)
    expect(wrapper.find('[data-reset]').exists()).toBe(true)
    expect(wrapper.find('[data-toggle-notes]').exists()).toBe(true)
  })

  it('needs no More menu, because what is left already fits', () => {
    expect(mountRailed().find('[data-more]').exists()).toBe(false)
  })
})
