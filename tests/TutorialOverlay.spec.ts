import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import TutorialOverlay from '../src/components/TutorialOverlay.vue'
import { __resetBoardForTests } from '../src/composables/useBoard'
import { useTutorial, __resetTutorialForTests } from '../src/composables/useTutorial'

const tutorial = useTutorial()
let wrapper: VueWrapper | undefined

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
  __resetTutorialForTests()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

const RECT = {
  left: 100, top: 200, width: 40, height: 40,
  right: 140, bottom: 240, x: 100, y: 200, toJSON: () => ({}),
} as DOMRect

/**
 * Put the red swatch on the page, which is what the `place` step anchors to.
 * jsdom gives every element a zero rect, and a zero rect is how the overlay
 * recognises an anchor that is not really on screen — so it is stubbed.
 */
function redSwatch(): void {
  const el = document.createElement('button')
  el.setAttribute('data-add-counter', 'red')
  el.getBoundingClientRect = () => RECT
  document.body.appendChild(el)
}

function mountOverlay() {
  wrapper = mount(TutorialOverlay, { attachTo: document.body })
  return wrapper
}

describe('when no tour is running', () => {
  it('renders nothing', () => {
    const overlay = mountOverlay()
    expect(overlay.find('.tour').exists()).toBe(false)
  })
})

describe('while the tour runs', () => {
  beforeEach(() => tutorial.start({ patternId: null, name: '' }))

  it('renders the card for the current step', async () => {
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.find('[data-tour-card]').text()).toContain(tutorial.steps[0].title)
  })

  /* An export taken mid-tour must not have the tour in it. */
  it('marks itself transient so exports strip it', async () => {
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.find('.tour').attributes('data-transient')).toBeDefined()
  })

  it('says which step this is', async () => {
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.find('[data-tour-card]').text()).toContain(`1 of ${tutorial.steps.length}`)
  })

  it('offers Next on a step that only says something', async () => {
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.find('[data-tour-next]').exists()).toBe(true)
  })

  it('moves on when Next is pressed', async () => {
    const overlay = mountOverlay()
    await overlay.find('[data-tour-next]').trigger('click')
    expect(tutorial.stepIndex.value).toBe(1)
  })

  it('offers no Next on a step the coach has to act on', async () => {
    const overlay = mountOverlay()
    await overlay.find('[data-tour-next]').trigger('click')
    await nextTick()
    expect(overlay.find('[data-tour-next]').exists()).toBe(false)
  })

  it('cannot go back from the first step', async () => {
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.find('[data-tour-back]').attributes('disabled')).toBeDefined()
  })

  it('goes back when Back is pressed', async () => {
    const overlay = mountOverlay()
    await overlay.find('[data-tour-next]').trigger('click')
    await overlay.find('[data-tour-back]').trigger('click')
    expect(tutorial.stepIndex.value).toBe(0)
  })

  /* App owns ending, so that the drill and its name come back together. */
  it('asks App to end the tour when Skip is pressed', async () => {
    const overlay = mountOverlay()
    await overlay.find('[data-tour-skip]').trigger('click')
    expect(overlay.emitted('end')).toBeTruthy()
  })
})

describe('the last step', () => {
  beforeEach(() => {
    tutorial.start({ patternId: null, name: '' })
    for (let i = 0; i < tutorial.steps.length; i++) tutorial.next()
  })

  it('offers Help instead of Next', async () => {
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.find('[data-tour-next]').exists()).toBe(false)
    expect(overlay.find('[data-tour-help]').exists()).toBe(true)
  })

  it('asks App to open Help', async () => {
    const overlay = mountOverlay()
    await overlay.find('[data-tour-help]').trigger('click')
    expect(overlay.emitted('openHelp')).toBeTruthy()
  })
})

describe('the spotlight', () => {
  it('cuts four boxes round an anchor that is on screen', async () => {
    redSwatch()
    tutorial.start({ patternId: null, name: '' })
    tutorial.next() // `place`, which anchors to the red swatch
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.findAll('[data-tour-dim]')).toHaveLength(4)
  })

  it('covers the screen with one box when the step has no anchor', async () => {
    tutorial.start({ patternId: null, name: '' })
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.findAll('[data-tour-dim]')).toHaveLength(1)
  })

  /*
   * With no anchor, `rect` is `null` before the resize and `null` after it —
   * equal, so it cannot be what tells the dim box a resize happened. It has
   * to track the viewport itself, or an orientation change on a no-anchor
   * step leaves the old size painted over the new one.
   */
  it('tracks a genuine viewport resize while a no-anchor step is showing', async () => {
    tutorial.start({ patternId: null, name: '' })
    const overlay = mountOverlay()
    await nextTick()

    const originalWidth = window.innerWidth
    const originalHeight = window.innerHeight
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 })
      window.dispatchEvent(new Event('resize'))
      await nextTick()

      const style = overlay.get('[data-tour-dim]').attributes('style')
      expect(style).toContain('width: 500px')
      expect(style).toContain('height: 700px')
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight })
    }
  })

  /*
   * A control that is not on screen at this width — the rail lies down on a
   * phone and not every anchor survives — must not take the step away. The
   * card still shows and the goal still completes.
   */
  it('falls back to the plain card when the anchor is missing', async () => {
    tutorial.start({ patternId: null, name: '' })
    tutorial.next()
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.findAll('[data-tour-dim]')).toHaveLength(1)
    expect(overlay.find('[data-tour-card]').exists()).toBe(true)
  })
})
