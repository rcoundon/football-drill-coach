import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import FrameStrip from '../src/components/FrameStrip.vue'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { MAX_FRAME_MS, MIN_FRAME_MS } from '../src/animation'

const board = useBoard()

beforeEach(() => {
  __resetBoardForTests()
})

describe('a drill with one frame', () => {
  it('offers only a way to add another', () => {
    const wrapper = mount(FrameStrip)
    expect(wrapper.find('[data-add-frame]').exists()).toBe(true)
    expect(wrapper.find('[data-play]').exists()).toBe(false)
    expect(wrapper.find('[data-scrub]').exists()).toBe(false)
    expect(wrapper.find('[data-frame="0"]').exists()).toBe(false)
  })

  it('adding one opens the strip', async () => {
    const wrapper = mount(FrameStrip)
    await wrapper.find('[data-add-frame]').trigger('click')
    expect(board.state.frames).toHaveLength(2)
    expect(wrapper.find('[data-frame="0"]').exists()).toBe(true)
    expect(wrapper.find('[data-play]').exists()).toBe(true)
  })
})

describe('finding your way in', () => {
  /**
   * The way into frames was a grey chip below the pitch, identical to every
   * other chip and the only control region on the page with no heading. A
   * coach who did not already know frames existed had no reason to press it.
   */
  it('names the region, as every other group of controls does', () => {
    const wrapper = mount(FrameStrip)
    expect(wrapper.find('[data-strip-label]').text()).toBe('Moments')
  })

  it('keeps the heading once the strip opens, so the row is not unexplained', () => {
    board.addFrame()
    const wrapper = mount(FrameStrip)
    expect(wrapper.find('[data-strip-label]').exists()).toBe(true)
  })

  it('makes the way in the one control that does not look like the others', () => {
    const wrapper = mount(FrameStrip)
    const add = wrapper.find('[data-add-frame]')
    expect(add.classes()).toContain('chip--primary')
    // Nothing else may claim it, or it stops standing out.
    const others = wrapper.findAll('.chip--primary')
    expect(others).toHaveLength(1)
  })

  it('says what it does rather than naming the data structure', () => {
    const wrapper = mount(FrameStrip)
    expect(wrapper.find('[data-add-frame]').text()).toBe('+ Add a moment')
  })

  it('calls a moment a moment throughout, so two controls cannot disagree', () => {
    board.addFrame()
    const wrapper = mount(FrameStrip)
    expect(wrapper.find('[data-delete-frame]').text()).toBe('Delete moment')
  })
})

describe('a drill with several frames', () => {
  beforeEach(() => {
    board.addFrame()
    board.addFrame()
    board.goToFrame(1)
  })

  it('marks the frame you are on', () => {
    const wrapper = mount(FrameStrip)
    expect(wrapper.find('[data-frame="1"]').classes()).toContain('is-active')
    expect(wrapper.find('[data-frame="0"]').classes()).not.toContain('is-active')
  })

  it('pressing a frame goes to it', async () => {
    const wrapper = mount(FrameStrip)
    await wrapper.find('[data-frame="2"]').trigger('click')
    expect(board.state.currentFrame).toBe(2)
  })

  it('deletes the frame you are on', async () => {
    const wrapper = mount(FrameStrip)
    await wrapper.find('[data-delete-frame]').trigger('click')
    expect(board.state.frames).toHaveLength(2)
  })

  it('will not delete the last frame', async () => {
    board.deleteFrame(2)
    board.deleteFrame(1)
    const wrapper = mount(FrameStrip)
    expect(wrapper.find('[data-delete-frame]').exists()).toBe(false)
  })

  it('moves the frame you are on earlier and later', async () => {
    const wrapper = mount(FrameStrip)
    await wrapper.find('[data-frame-earlier]').trigger('click')
    expect(board.state.currentFrame).toBe(0)
    await wrapper.find('[data-frame-later]').trigger('click')
    expect(board.state.currentFrame).toBe(1)
  })

  it('cannot move the first frame earlier or the last one later', async () => {
    const wrapper = mount(FrameStrip)
    board.goToFrame(0)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-frame-earlier]').attributes('disabled')).toBeDefined()
    board.goToFrame(2)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-frame-later]').attributes('disabled')).toBeDefined()
  })
})

describe('the duration field', () => {
  beforeEach(() => {
    board.addFrame()
  })

  it('shows the current frame’s duration in seconds', () => {
    board.setFrameDuration(1, 1500)
    const wrapper = mount(FrameStrip)
    expect((wrapper.find('[data-frame-duration]').element as HTMLInputElement).value).toBe('1.5')
  })

  it('sets it, in seconds', async () => {
    const wrapper = mount(FrameStrip)
    const field = wrapper.find('[data-frame-duration]')
    await field.setValue('2.5')
    await field.trigger('change')
    expect(board.state.frames[1].duration).toBe(2500)
  })

  it('clamps what a coach can type', async () => {
    const wrapper = mount(FrameStrip)
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
    const wrapper = mount(FrameStrip)
    expect(wrapper.find('[data-frame-duration]').exists()).toBe(false)
  })

  // Not in the brief: a coach can clear a number field, or a browser can
  // hand back an empty string mid-edit. `Number('')` is 0, which would
  // otherwise sail past `Number.isFinite` and silently set the duration to
  // the minimum — this pins down that a blank field leaves the frame alone.
  it('leaves the duration alone when the field is emptied', async () => {
    board.setFrameDuration(1, 1500)
    const wrapper = mount(FrameStrip)
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
    const wrapper = mount(FrameStrip)
    await wrapper.find('[data-play]').trigger('click')
    expect(board.playback.playing).toBe(true)
    await wrapper.find('[data-play]').trigger('click')
    expect(board.playback.playing).toBe(false)
  })

  it('says which it will do', async () => {
    const wrapper = mount(FrameStrip)
    expect(wrapper.find('[data-play]').attributes('aria-label')).toBe('Play the drill')
    await wrapper.find('[data-play]').trigger('click')
    expect(wrapper.find('[data-play]').attributes('aria-label')).toBe('Pause')
    board.pause()
  })

  it('rewinds', async () => {
    board.scrubTo(600)
    const wrapper = mount(FrameStrip)
    await wrapper.find('[data-rewind]').trigger('click')
    expect(board.playback.at).toBe(0)
  })

  it('scrubs, and lands on a frame when released', async () => {
    const wrapper = mount(FrameStrip)
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
    const wrapper = mount(FrameStrip)
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
    const wrapper = mount(FrameStrip)
    expect(wrapper.find('[data-add-frame]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-delete-frame]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-frame-earlier]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-frame-later]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-frame-duration]').attributes('disabled')).toBeDefined()
  })

  /**
   * A safeguard the other way: the transport is how a coach gets OUT of a
   * blend, so it must never be caught by the same lock — pausing mid-move
   * must not also disable Pause.
   */
  it('leaves the transport itself live', () => {
    const wrapper = mount(FrameStrip)
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
    const wrapper = mount(FrameStrip, { props: { exporting: true } })
    expect(wrapper.find('[data-play]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-rewind]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-scrub]').attributes('disabled')).toBeDefined()
  })

  it('leaves the transport alone otherwise', () => {
    const wrapper = mount(FrameStrip, { props: { exporting: false } })
    expect(wrapper.find('[data-play]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-rewind]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-scrub]').attributes('disabled')).toBeUndefined()
  })
})
