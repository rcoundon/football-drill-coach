import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import BoardMenus from '../src/components/BoardMenus.vue'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { PITCHES } from '../src/components/controls'

const board = useBoard()

beforeEach(() => __resetBoardForTests())

function mountMenus() {
  return mount(BoardMenus, { attachTo: document.body })
}

describe('the two menus', () => {
  /**
   * Seven pills that looked like every other pill, gathered into the two
   * questions they were really answering.
   */
  it('keep their contents out of the way until they are opened', async () => {
    const wrapper = mountMenus()
    expect(wrapper.find('[data-pitch-panel]').isVisible()).toBe(false)
    expect(wrapper.find('[data-view-panel]').isVisible()).toBe(false)

    await wrapper.find('[data-pitch-menu]').trigger('click')
    expect(wrapper.find('[data-pitch-panel]').isVisible()).toBe(true)
  })

  it('give way to each other rather than sitting open side by side', async () => {
    const wrapper = mountMenus()
    await wrapper.find('[data-pitch-menu]').trigger('click')
    await wrapper.find('[data-view-menu]').trigger('click')
    expect(wrapper.find('[data-pitch-panel]').isVisible()).toBe(false)
    expect(wrapper.find('[data-view-panel]').isVisible()).toBe(true)
  })

  it('close on Escape', async () => {
    const wrapper = mountMenus()
    await wrapper.find('[data-view-menu]').trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-view-panel]').isVisible()).toBe(false)
  })

  it('close when the coach goes back to the board', async () => {
    const wrapper = mountMenus()
    await wrapper.find('[data-view-menu]').trigger('click')
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-view-panel]').isVisible()).toBe(false)
  })
})

describe('the pitch menu', () => {
  /**
   * What a coach is choosing between is what the board will look like, so
   * that is what the choice shows — a picture of each pitch rather than the
   * words Blank, Full and Half.
   */
  it('draws each pitch rather than naming it alone', () => {
    const wrapper = mountMenus()
    expect(wrapper.findAll('.thumb-art')).toHaveLength(PITCHES.length)
  })

  it('changes the pitch type, and marks the one in use', async () => {
    const wrapper = mountMenus()
    await wrapper.find('[data-pitch="half"]').trigger('click')
    expect(board.state.pitch.type).toBe('half')
    expect(wrapper.find('[data-pitch="half"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.find('[data-pitch="full"]').attributes('aria-checked')).toBe('false')
  })

  /**
   * `Rotate` said what pressing it would do but never which way round the
   * board currently was, so a coach had to press it to find out.
   */
  it('says which way round the board is, rather than offering to turn it', async () => {
    const wrapper = mountMenus()
    expect(wrapper.find('[data-orientation="landscape"]').attributes('aria-checked')).toBe('true')

    await wrapper.find('[data-orientation="portrait"]').trigger('click')
    expect(board.state.pitch.rotated).toBe(true)
    expect(wrapper.find('[data-orientation="portrait"]').attributes('aria-checked')).toBe('true')
  })

  it('does nothing when the board is already that way round', async () => {
    const wrapper = mountMenus()
    const before = board.canUndo.value
    await wrapper.find('[data-orientation="landscape"]').trigger('click')
    expect(board.state.pitch.rotated).toBe(false)
    expect(board.canUndo.value).toBe(before)
  })
})

describe('the view menu', () => {
  it('switches the player labels', async () => {
    const wrapper = mountMenus()
    expect(wrapper.find('[data-toggle-labels]').attributes('aria-checked')).toBe('true')
    await wrapper.find('[data-toggle-labels]').trigger('click')
    expect(board.state.labelsVisible).toBe(false)
    expect(wrapper.find('[data-toggle-labels]').attributes('aria-checked')).toBe('false')
  })

  it('switches the balls', async () => {
    const wrapper = mountMenus()
    await wrapper.find('[data-toggle-ball]').trigger('click')
    expect(board.state.ballsVisible).toBe(false)
    expect(wrapper.find('[data-toggle-ball]').attributes('aria-checked')).toBe('false')
  })

  /** The same state the panel beside the pitch is in, said once. */
  it('mirrors whether the notes panel is open', async () => {
    const wrapper = mountMenus()
    expect(wrapper.find('[data-toggle-notes]').attributes('aria-checked')).toBe('false')
    await wrapper.find('[data-toggle-notes]').trigger('click')
    expect(board.state.notesVisible).toBe(true)
    expect(wrapper.find('[data-toggle-notes]').attributes('aria-checked')).toBe('true')
  })
})
