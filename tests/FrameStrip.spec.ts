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
