import { mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import PhaseTimeline from '../src/components/PhaseTimeline.vue'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { MAX_FRAME_MS, MIN_FRAME_MS } from '../src/animation'

const board = useBoard()

beforeEach(() => {
  __resetBoardForTests()
})

describe('a drill with one frame', () => {
  it('offers a way to add another, and none of the machinery for playing one', () => {
    const wrapper = mount(PhaseTimeline)
    expect(wrapper.find('[data-add-frame]').exists()).toBe(true)
    expect(wrapper.find('[data-play]').exists()).toBe(false)
    expect(wrapper.find('[data-scrub]').exists()).toBe(false)
    // Delete and reorder are there, but a one-phase drill has nothing to
    // delete and nowhere to move it to.
    expect(wrapper.find('[data-delete-frame]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-frame-earlier]').attributes('disabled')).toBeDefined()
  })

  /**
   * The numbering shows from the very first phase. Without it the strip named
   * no phase at all, so pressing Add a phase took a coach from nowhere to
   * "phase 2" and read as being sent somewhere rather than moving on by one.
   * Seeing "1" first is what makes the second one obviously the next.
   */
  it('shows the phase you are on, even when it is the only one', () => {
    const wrapper = mount(PhaseTimeline)
    const only = wrapper.find('[data-frame="0"]')
    expect(only.exists()).toBe(true)
    expect(only.text()).toContain('1')
    expect(only.classes()).toContain('is-active')
  })

  it('adding one opens the strip', async () => {
    const wrapper = mount(PhaseTimeline)
    await wrapper.find('[data-add-frame]').trigger('click')
    expect(board.state.frames).toHaveLength(2)
    expect(wrapper.find('[data-frame="0"]').exists()).toBe(true)
    expect(wrapper.find('[data-play]').exists()).toBe(true)
  })
})

describe('saying what the strip is for', () => {
  /**
   * The strip used to state an action with no purpose attached: a chip that
   * added a "frame", then a "moment", neither of which told a coach that this
   * is how a drill gets built and played back. Naming the container better was
   * never going to fix that — the region has to say what it is FOR.
   */
  it('leads with the purpose rather than the name of the thing', () => {
    const wrapper = mount(PhaseTimeline)
    expect(wrapper.find('[data-strip-label]').text()).toBe('Build the drill')
  })

  it('explains itself while the drill is a single phase', () => {
    const wrapper = mount(PhaseTimeline)
    expect(wrapper.find('[data-strip-hint]').text()).toBe(
      'Show it phase by phase, then play it back.',
    )
  })

  /**
   * The heading and its explanation are teaching, and a coach who has built
   * a sequence has learnt it. Leaving them there would cost space on every
   * board forever to say something its owner already knows — and by then the
   * strip is a row of phases beside a play button, which says it itself.
   */
  it('drops both once the coach has plainly understood', () => {
    board.addFrame()
    const wrapper = mount(PhaseTimeline)
    expect(wrapper.find('[data-strip-hint]').exists()).toBe(false)
    expect(wrapper.find('[data-strip-label]').exists()).toBe(false)
  })

  /**
   * It used to be the only green control on the board, which made the thing
   * a coach reaches for least the loudest thing on screen. It is now the
   * next phase, drawn in the place the next phase would go.
   */
  it('offers the next phase as the last card in the strip', () => {
    const wrapper = mount(PhaseTimeline)
    const add = wrapper.find('[data-add-frame]')
    expect(add.classes()).toContain('card')
    expect(add.text()).toContain('Add phase')
  })

  /** A coach who has never pressed it cannot know what they would get. */
  it('says what a new phase starts from', () => {
    const wrapper = mount(PhaseTimeline)
    expect(wrapper.find('[data-add-frame]').attributes('title')).toBe(
      'New phases start from a copy of the one you are on',
    )
  })

  it('calls it a phase throughout, so two controls cannot disagree', () => {
    board.addFrame()
    const wrapper = mount(PhaseTimeline)
    expect(wrapper.find('[data-delete-frame]').text()).toBe('Delete phase')
  })
})

describe('a drill with several frames', () => {
  beforeEach(() => {
    board.addFrame()
    board.addFrame()
    board.goToFrame(1)
  })

  it('marks the frame you are on', () => {
    const wrapper = mount(PhaseTimeline)
    expect(wrapper.find('[data-frame="1"]').classes()).toContain('is-active')
    expect(wrapper.find('[data-frame="0"]').classes()).not.toContain('is-active')
  })

  it('pressing a frame goes to it', async () => {
    const wrapper = mount(PhaseTimeline)
    await wrapper.find('[data-frame-select="2"]').trigger('click')
    expect(board.state.currentFrame).toBe(2)
  })

  /**
   * Each card carries its own menu, so a phase can be deleted or moved
   * without visiting it first — the controls used to act on whichever phase
   * the coach happened to be on.
   */
  it('deletes the phase whose menu it belongs to', async () => {
    const wrapper = mount(PhaseTimeline)
    await wrapper.find('[data-frame="0"] [data-delete-frame]').trigger('click')
    expect(board.state.frames).toHaveLength(2)
  })

  it('will not delete the last remaining phase', async () => {
    board.deleteFrame(2)
    board.deleteFrame(1)
    const wrapper = mount(PhaseTimeline)
    expect(wrapper.find('[data-delete-frame]').attributes('disabled')).toBeDefined()
  })

  it('duplicates the phase whose menu it belongs to', async () => {
    const wrapper = mount(PhaseTimeline)
    await wrapper.find('[data-frame="0"] [data-duplicate-frame]').trigger('click')
    expect(board.state.frames).toHaveLength(4)
    expect(board.state.currentFrame).toBe(1)
  })

  it('moves a phase earlier and later', async () => {
    const wrapper = mount(PhaseTimeline)
    await wrapper.find('[data-frame="1"] [data-frame-earlier]').trigger('click')
    expect(board.state.currentFrame).toBe(0)
    await wrapper.find('[data-frame="0"] [data-frame-later]').trigger('click')
    expect(board.state.currentFrame).toBe(1)
  })

  it('cannot move the first phase earlier or the last one later', () => {
    const wrapper = mount(PhaseTimeline)
    expect(
      wrapper.find('[data-frame="0"] [data-frame-earlier]').attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.find('[data-frame="2"] [data-frame-later]').attributes('disabled')).toBeDefined()
  })
})

describe('the duration field', () => {
  beforeEach(() => {
    board.addFrame()
  })

  it('shows the current frame’s duration in seconds', () => {
    board.setFrameDuration(1, 1500)
    const wrapper = mount(PhaseTimeline)
    expect((wrapper.find('[data-frame-duration]').element as HTMLInputElement).value).toBe('1.5')
  })

  it('sets it, in seconds', async () => {
    const wrapper = mount(PhaseTimeline)
    const field = wrapper.find('[data-frame-duration]')
    await field.setValue('2.5')
    await field.trigger('change')
    expect(board.state.frames[1].duration).toBe(2500)
  })

  it('clamps what a coach can type', async () => {
    const wrapper = mount(PhaseTimeline)
    const field = wrapper.find('[data-frame-duration]')
    await field.setValue('0.01')
    await field.trigger('change')
    expect(board.state.frames[1].duration).toBe(MIN_FRAME_MS)
    await field.setValue('900')
    await field.trigger('change')
    expect(board.state.frames[1].duration).toBe(MAX_FRAME_MS)
  })

  it('is hidden on the first frame, which nothing moves into', async () => {
    board.goToFrame(0)
    const wrapper = mount(PhaseTimeline)
    expect(wrapper.find('[data-frame-duration]').exists()).toBe(false)
  })

  // Not in the brief: a coach can clear a number field, or a browser can
  // hand back an empty string mid-edit. `Number('')` is 0, which would
  // otherwise sail past `Number.isFinite` and silently set the duration to
  // the minimum — this pins down that a blank field leaves the frame alone.
  it('leaves the duration alone when the field is emptied', async () => {
    board.setFrameDuration(1, 1500)
    const wrapper = mount(PhaseTimeline)
    const field = wrapper.find('[data-frame-duration]')
    await field.setValue('')
    await field.trigger('change')
    expect(board.state.frames[1].duration).toBe(1500)
  })
})

describe('the transport', () => {
  beforeEach(() => {
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
  })

  it('plays and pauses', async () => {
    const wrapper = mount(PhaseTimeline)
    await wrapper.find('[data-play]').trigger('click')
    expect(board.playback.playing).toBe(true)
    await wrapper.find('[data-play]').trigger('click')
    expect(board.playback.playing).toBe(false)
  })

  it('says which it will do', async () => {
    const wrapper = mount(PhaseTimeline)
    expect(wrapper.find('[data-play]').attributes('aria-label')).toBe('Play the drill')
    await wrapper.find('[data-play]').trigger('click')
    expect(wrapper.find('[data-play]').attributes('aria-label')).toBe('Pause')
    board.pause()
  })

  it('rewinds', async () => {
    board.scrubTo(600)
    const wrapper = mount(PhaseTimeline)
    await wrapper.find('[data-rewind]').trigger('click')
    expect(board.playback.at).toBe(0)
  })

  it('scrubs, and lands on a frame when released', async () => {
    const wrapper = mount(PhaseTimeline)
    const slider = wrapper.find('[data-scrub]')
    // Not `slider.setValue()`: it fires 'input' and 'change' together, which
    // would collapse the very distinction this test exists to check — a
    // drag moves the playhead live on 'input', and only 'change' (release)
    // commits to a frame. Driving the DOM directly keeps the two apart.
    ;(slider.element as HTMLInputElement).value = '700'
    await slider.trigger('input')
    expect(board.playback.at).toBe(700)
    await slider.trigger('change')
    expect(board.state.currentFrame).toBe(1)
    expect(board.isDerived.value).toBe(false)
  })

  it('spans the whole drill', () => {
    const wrapper = mount(PhaseTimeline)
    expect(wrapper.find('[data-scrub]').attributes('max')).toBe('1000')
  })
})

/**
 * This is the strip that CREATES the derived state, and it is the one
 * component that used to ignore it entirely: pressing Play and then + Frame
 * did nothing, with no sign why. Every mutator these controls call refuses
 * outright while the view is a blend.
 */
describe('while the drill is mid-move', () => {
  beforeEach(() => {
    board.addFrame()
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.setFrameDuration(2, 1000)
    board.goToFrame(1)
    board.scrubTo(1500) // between the second and third frame
  })

  afterEach(() => board.endScrub())

  it('locks every control that would change the drill', () => {
    const wrapper = mount(PhaseTimeline)
    expect(wrapper.find('[data-add-frame]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-frame="1"] [data-delete-frame]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-frame="1"] [data-frame-earlier]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-frame="1"] [data-frame-later]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-frame-duration]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-frame="1"] [data-duplicate-frame]').attributes('disabled')).toBeDefined()
  })

  /**
   * A safeguard the other way: the transport is how a coach gets OUT of a
   * blend, so it must never be caught by the same lock — pausing mid-move
   * must not also disable Pause.
   */
  it('leaves the transport itself live', () => {
    const wrapper = mount(PhaseTimeline)
    expect(wrapper.find('[data-play]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-rewind]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-scrub]').attributes('disabled')).toBeUndefined()
  })
})

/**
 * An export drives the playhead itself, one sample at a time. Unlike an
 * ordinary blend, the transport must NOT stay live here: Play racing the
 * export's own seek loop is exactly what corrupts the samples.
 */
describe('while an export is running', () => {
  beforeEach(() => {
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
  })

  it('locks the transport too', () => {
    const wrapper = mount(PhaseTimeline, { props: { exporting: true } })
    expect(wrapper.find('[data-play]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-rewind]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-scrub]').attributes('disabled')).toBeDefined()
  })

  it('leaves the transport alone otherwise', () => {
    const wrapper = mount(PhaseTimeline, { props: { exporting: false } })
    expect(wrapper.find('[data-play]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-rewind]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-scrub]').attributes('disabled')).toBeUndefined()
  })
})

/**
 * A number alone said nothing about what was in a phase, so telling two
 * apart meant visiting both. Each card draws the phase it stands for.
 */
describe('the phase cards', () => {
  beforeEach(() => {
    board.addFrame()
    board.goToFrame(0)
  })

  it('draws each phase, not just its number', () => {
    const wrapper = mount(PhaseTimeline)
    expect(wrapper.findAll('.mini')).toHaveLength(board.state.frames.length)
  })

  it('shows what each phase is worth in seconds', () => {
    board.setFrameDuration(1, 2000)
    const wrapper = mount(PhaseTimeline)
    expect(wrapper.find('[data-frame="1"]').text()).toContain('2s')
  })

  /** Nothing moves into the start of a drill, so the first has no duration. */
  it('gives the first phase no duration at all', () => {
    const wrapper = mount(PhaseTimeline)
    expect(wrapper.find('[data-frame="0"] .badge--duration').exists()).toBe(false)
    expect(wrapper.find('[data-frame="1"] .badge--duration').exists()).toBe(true)
  })
})

/**
 * Each card carries its own menu. A finger has no hover, so it cannot be
 * something that only appears when a mouse is over the card.
 */
describe('a phase card menu', () => {
  beforeEach(() => {
    board.addFrame()
  })

  it('keeps its items out of the way until it is opened', async () => {
    const wrapper = mount(PhaseTimeline, { attachTo: document.body })
    expect(wrapper.find('[data-frame="0"] [data-delete-frame]').isVisible()).toBe(false)

    await wrapper.find('[data-frame-menu="0"]').trigger('click')
    expect(wrapper.find('[data-frame="0"] [data-delete-frame]').isVisible()).toBe(true)
  })

  it('closes behind whatever was chosen', async () => {
    const wrapper = mount(PhaseTimeline, { attachTo: document.body })
    await wrapper.find('[data-frame-menu="0"]').trigger('click')
    await wrapper.find('[data-frame="0"] [data-duplicate-frame]').trigger('click')
    expect(wrapper.find('[data-frame="0"] [data-duplicate-frame]').isVisible()).toBe(false)
  })

  it('closes on Escape', async () => {
    const wrapper = mount(PhaseTimeline, { attachTo: document.body })
    await wrapper.find('[data-frame-menu="0"]').trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-frame="0"] [data-delete-frame]').isVisible()).toBe(false)
  })

  /** Two menus open at once over a strip this small helps nobody. */
  it('gives way to another card’s menu rather than sitting open beside it', async () => {
    const wrapper = mount(PhaseTimeline, { attachTo: document.body })
    await wrapper.find('[data-frame-menu="0"]').trigger('click')
    await wrapper.find('[data-frame-menu="1"]').trigger('click')
    expect(wrapper.find('[data-frame="0"] [data-delete-frame]').isVisible()).toBe(false)
    expect(wrapper.find('[data-frame="1"] [data-delete-frame]').isVisible()).toBe(true)
  })
})

/**
 * The clock and the track: where the drill is, said in a form a coach can
 * read at a glance while it plays.
 */
describe('the clock and the track', () => {
  beforeEach(() => {
    board.addFrame()
    board.setFrameDuration(1, 4000)
    board.goToFrame(0)
  })

  it('says where the playhead is and how long the drill runs', async () => {
    const wrapper = mount(PhaseTimeline)
    expect(wrapper.find('[data-clock]').text()).toBe('00:00 / 00:04')

    board.scrubTo(2000)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-clock]').text()).toBe('00:02 / 00:04')
    board.endScrub()
  })

  /** Scrubbing has to relate visibly to the cards beside it. */
  it('marks where each phase begins', () => {
    board.addFrame()
    board.setFrameDuration(2, 4000)
    const wrapper = mount(PhaseTimeline)
    // Two moves, so one boundary between them; the start and the end are the
    // ends of the track rather than marks on it.
    expect(wrapper.findAll('.scrub-tick')).toHaveLength(1)
  })
})

/**
 * Dragging a card is how a phase is reordered. A press that goes nowhere is
 * still a press, and selects the phase the way it always did.
 */
describe('dragging a phase into a new place', () => {
  beforeEach(() => {
    board.addFrame()
    board.addFrame()
    board.goToFrame(0)
  })

  /** jsdom gives every element a zero-sized rect, so the strip is faked. */
  function layOutCards(wrapper: VueWrapper) {
    const cards = Array.from(wrapper.element.querySelectorAll('[data-frame]')) as HTMLElement[]
    cards.forEach((card, index) => {
      card.getBoundingClientRect = () =>
        ({
          left: index * 100,
          right: index * 100 + 96,
          top: 0,
          bottom: 72,
          width: 96,
          height: 72,
          x: index * 100,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect
    })
  }

  async function dragCard(wrapper: VueWrapper, from: number, toX: number) {
    layOutCards(wrapper)
    const face = wrapper.find(`[data-frame-select="${from}"]`).element
    face.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: from * 100, clientY: 30 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: toX, clientY: 30 }))
    await wrapper.vm.$nextTick()
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: toX, clientY: 30 }))
    await wrapper.vm.$nextTick()
  }

  it('drops the phase on the card it was carried to', async () => {
    const wrapper = mount(PhaseTimeline, { attachTo: document.body })
    const moved = board.state.frames[0]

    await dragCard(wrapper, 0, 250)

    expect(board.state.frames.indexOf(moved)).toBe(2)
  })

  it('shows which card is being carried and where it would land', async () => {
    const wrapper = mount(PhaseTimeline, { attachTo: document.body })
    layOutCards(wrapper)
    const face = wrapper.find('[data-frame-select="0"]').element
    face.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 30 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 250, clientY: 30 }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-frame="0"]').classes()).toContain('is-dragging')
    expect(wrapper.find('[data-frame="2"]').classes()).toContain('is-target')

    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 250, clientY: 30 }))
    await wrapper.vm.$nextTick()
  })

  /** Let go anywhere but on a card and the phase stays where it was. */
  it('reorders nothing when the drag ends off the strip', async () => {
    const wrapper = mount(PhaseTimeline, { attachTo: document.body })
    const moved = board.state.frames[0]

    await dragCard(wrapper, 0, 900)

    expect(board.state.frames.indexOf(moved)).toBe(0)
  })

  /**
   * The click a drag leaves behind would otherwise land on whichever card
   * the phase was dropped onto, moving the coach somewhere they did not ask
   * to go straight after reordering.
   */
  it('does not also select the card it was dropped on', async () => {
    const wrapper = mount(PhaseTimeline, { attachTo: document.body })
    await dragCard(wrapper, 0, 250)
    await wrapper.find('[data-frame-select="2"]').trigger('click')

    // The reorder already moved the coach with the phase they carried; the
    // click that follows must not move them again.
    expect(board.state.currentFrame).toBe(2)
  })
})
