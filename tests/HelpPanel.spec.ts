import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HelpPanel from '../src/components/HelpPanel.vue'

function mountHelp(open = true) {
  return mount(HelpPanel, { props: { open } })
}

describe('opening and closing', () => {
  it('renders nothing when closed', () => {
    const wrapper = mountHelp(false)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('renders the dialog when open', () => {
    const wrapper = mountHelp(true)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  })

  it('closes when Close is pressed', async () => {
    const wrapper = mountHelp(true)
    await wrapper.find('[data-close]').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('closes on a click outside the panel', async () => {
    const wrapper = mountHelp(true)
    await wrapper.find('.overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('does not close when the panel itself is clicked', async () => {
    const wrapper = mountHelp(true)
    await wrapper.find('.panel').trigger('click')
    expect(wrapper.emitted('close')).toBeFalsy()
  })

  /*
   * Escape moved to App, which now closes whatever dialog is topmost, so the
   * panel no longer listens for it — and must not, or a press would close it
   * twice over. The behaviour itself is covered in tests/App.spec.ts.
   */
  it('leaves Escape to App rather than listening for it', async () => {
    const wrapper = mountHelp(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toBeFalsy()
  })
})

/**
 * One test per area covered in the panel, so a feature that grows a whole
 * new part of the board without a word of help in here gets noticed by a
 * failing section rather than by nothing at all.
 */
describe('what it covers', () => {
  it('explains the board itself: dropping and moving players, cones, labels, the ball', () => {
    const section = mountHelp(true).get('[data-help-section="board"]')
    expect(section.text()).toMatch(/colour/i)
    expect(section.text()).toMatch(/possession/i)
    expect(section.text()).toMatch(/cone/i)
  })

  it('explains drawing: the tools, curving a pass, and picking a drawing back up', () => {
    const section = mountHelp(true).get('[data-help-section="drawing"]')
    expect(section.text()).toMatch(/curve|bow/i)
    expect(section.text()).toMatch(/ring/i)
    expect(section.text()).toMatch(/pick.*up/i)
  })

  it('explains working with several things at once: the box, Copy, Delete', () => {
    const section = mountHelp(true).get('[data-help-section="groups"]')
    expect(section.text()).toMatch(/box/i)
    expect(section.text()).toMatch(/copy/i)
    expect(section.text()).toMatch(/delete/i)
  })

  /**
   * The section that prompted the whole panel. It has to teach the idea —
   * a drill built from phases the board plays between — before it names a
   * single control, and it has to say "phase", never "frame" or "moment".
   */
  it('teaches what a phase is before naming a control, and calls it a phase', () => {
    const section = mountHelp(true).get('[data-help-section="drill"]')
    const text = section.text()
    expect(text).toMatch(/phase/i)
    expect(text.toLowerCase()).not.toContain('frame')
    expect(text.toLowerCase()).not.toContain('moment')
    // The idea, in the coach's own words, has to come before the first
    // control name — "Add phase" — or this section is just another list
    // of buttons.
    const ideaAt = text.search(/play.*back|sequence|slides/i)
    const firstControlAt = text.indexOf('Add phase')
    expect(ideaAt).toBeGreaterThanOrEqual(0)
    expect(firstControlAt).toBeGreaterThan(ideaAt)
  })

  it('explains presenting: how in, what is left, how out', () => {
    const section = mountHelp(true).get('[data-help-section="presenting"]')
    expect(section.text()).toMatch(/full screen/i)
    expect(section.text()).toMatch(/escape/i)
  })

  it('explains the destructive actions: where they are, and the way back', () => {
    const section = mountHelp(true).get('[data-help-section="destructive"]')
    expect(section.text()).toMatch(/undo/i)
    expect(section.text()).toMatch(/reset/i)
  })

  it('explains the pitch and view menus: presets, orientation, switches', () => {
    const section = mountHelp(true).get('[data-help-section="board-menus"]')
    expect(section.text()).toMatch(/half/i)
    expect(section.text()).toMatch(/portrait/i)
    expect(section.text()).toMatch(/switch/i)
  })

  it('explains the notes panel: the drill, the phase, and where it lives', () => {
    const section = mountHelp(true).get('[data-help-section="notes"]')
    expect(section.text()).toMatch(/phase/i)
    expect(section.text()).toMatch(/strip|edge/i)
  })

  it('explains saving and sharing: patterns, PNG, GIF, Export/Import, browser-only storage', () => {
    const section = mountHelp(true).get('[data-help-section="saving"]')
    expect(section.text()).toMatch(/gif/i)
    expect(section.text()).toMatch(/png/i)
    expect(section.text()).toMatch(/export/i)
    expect(section.text()).toMatch(/browser/i)
  })

  /**
   * sessionPdf.ts only prints a drill's notes on its page when that drill's
   * own `notesVisible` is on — notes a coach has hidden stay hidden in the
   * PDF too. The help text used to promise "its notes" unconditionally.
   */
  it('says a session PDF page carries a drill\'s notes only when they are showing', () => {
    const section = mountHelp(true).get('[data-help-section="saving"]')
    expect(section.text()).toMatch(/notes.{0,40}showing/i)
  })

  it('lists keyboard shortcuts in a table, including the Space exception', () => {
    const section = mountHelp(true).get('[data-help-section="shortcuts"]')
    expect(section.find('table').exists()).toBe(true)
    expect(section.text()).toContain('Space')
    expect(section.text()).toMatch(/button, link or select/i)
  })

  it('says "phase" throughout and never "frame" or "moment"', () => {
    const text = mountHelp(true).text().toLowerCase()
    expect(text).not.toContain('frame')
    expect(text).not.toContain('moment')
  })
})

/*
 * The one way back to the tour once it has been taken or skipped. It sits in
 * the header beside Close, because a coach looking for "show me again" opens
 * Help and looks at the top.
 */
describe('taking the tour', () => {
  it('offers it in the header', () => {
    const wrapper = mountHelp(true)
    expect(wrapper.find('[data-start-tour]').exists()).toBe(true)
  })

  it('asks App to start it', async () => {
    const wrapper = mountHelp(true)
    await wrapper.find('[data-start-tour]').trigger('click')
    expect(wrapper.emitted('startTour')).toBeTruthy()
  })

  /* App closes the panel itself, so the panel must not also ask for it. */
  it('does not ask to be closed as well', async () => {
    const wrapper = mountHelp(true)
    await wrapper.find('[data-start-tour]').trigger('click')
    expect(wrapper.emitted('close')).toBeFalsy()
  })

  it('tells a coach the tour exists, in the section about the board', () => {
    const wrapper = mountHelp(true)
    expect(wrapper.find('[data-help-section="board"]').text()).toContain('tour')
  })
})
