import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import TutorialOverlay from '../src/components/TutorialOverlay.vue'
import { __resetBoardForTests } from '../src/composables/useBoard'
import { useStorage } from '../src/composables/useStorage'
import { useTutorial, __resetTutorialForTests } from '../src/composables/useTutorial'

const tutorial = useTutorial()
let wrapper: VueWrapper | undefined

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
  __resetTutorialForTests()
  // `lastError` is a module singleton, same as `useTutorial.spec.ts` already
  // resets it for: a future test in this file that trips a storage error
  // would otherwise leave every `start()` after it silently refusing to run.
  useStorage().lastError.value = null
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
 * The grid the swatches sit in: two columns of colours down the left edge.
 * The red swatch is only its top-left cell, so this is the box a card has
 * to clear to leave the colours visible.
 */
const GRID_RECT = {
  left: 90, top: 190, width: 120, height: 200,
  right: 210, bottom: 390, x: 90, y: 190, toJSON: () => ({}),
} as DOMRect

/**
 * Put the red swatch on the page, in its grid, which is what the `place`
 * step anchors to. jsdom gives every element a zero rect, and a zero rect is
 * how the overlay recognises an anchor that is not really on screen — so
 * both are stubbed.
 */
function redSwatch(): void {
  const grid = document.createElement('div')
  grid.getBoundingClientRect = () => GRID_RECT
  const el = document.createElement('button')
  el.setAttribute('data-add-counter', 'red')
  el.getBoundingClientRect = () => RECT
  grid.appendChild(el)
  document.body.appendChild(grid)
}

/**
 * An anchor out in the middle of the pitch, well clear of every edge —
 * which is where the two steps about a player point.
 */
const MIDDLE_RECT = {
  left: 500, top: 360, width: 24, height: 24,
  right: 524, bottom: 384, x: 500, y: 360, toJSON: () => ({}),
} as DOMRect

function playerCounter(): void {
  const el = document.createElement('div')
  el.setAttribute('data-counter', '')
  el.getBoundingClientRect = () => MIDDLE_RECT
  document.body.appendChild(el)
}

/** The numbers the card's placement is measured against. */
function cardBox(overlay: VueWrapper): Record<string, number> {
  const style = overlay.get('[data-tour-card]').attributes('style') ?? ''
  const read = (prop: string) => Number(new RegExp(`${prop}:\\s*(-?\\d+)px`).exec(style)?.[1] ?? NaN)
  return { top: read('top'), left: read('left') }
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

  /* The spec calls for the step counter to be announced, not only shown. */
  it('announces the step counter', async () => {
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.find('[data-tour-live]').attributes('aria-live')).toBe('polite')
    expect(overlay.find('[data-tour-live]').find('[data-tour-count]').exists()).toBe(true)
  })

  /*
   * Second review, Finding 8. The counter and the body were each their own
   * `aria-live="polite"` region, with a plain, silent `h2` between them — a
   * screen reader heard the number and the instruction but never the title
   * itself, and two regions updating in the same tick risk a reader dropping
   * one of them. One region for all three closes both gaps at once.
   */
  it('announces the title in the same live region as the counter and body', async () => {
    const overlay = mountOverlay()
    await nextTick()
    const live = overlay.find('[data-tour-live]')
    expect(live.attributes('aria-live')).toBe('polite')
    expect(live.find('h2').text()).toBe(tutorial.steps[0].title)
    expect(live.text()).toContain(tutorial.steps[0].body)
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
    expect(overlay.get('[data-tour-skip]').text()).toBe('Skip')
    await overlay.find('[data-tour-skip]').trigger('click')
    expect(overlay.emitted('end')).toBeTruthy()
  })

  /*
   * A step's own action can open one of App's small prompts on top of the
   * live board — double-pressing a player on `label` opens the rename
   * prompt. That prompt has no `z-index` of its own, and the tour's card
   * has the highest in the app, so without stepping aside the card paints
   * over the very dialog it just caused to open.
   */
  it('steps aside while one of App\'s own dialogs is open', async () => {
    wrapper = mount(TutorialOverlay, { attachTo: document.body, props: { blocked: true } })
    await nextTick()
    expect(wrapper.find('.tour').exists()).toBe(false)
  })

  it('comes back once that dialog closes', async () => {
    wrapper = mount(TutorialOverlay, { attachTo: document.body, props: { blocked: true } })
    await nextTick()
    await wrapper.setProps({ blocked: false })
    await nextTick()
    expect(wrapper.find('[data-tour-card]').exists()).toBe(true)
  })
})

describe('the last step', () => {
  beforeEach(() => {
    tutorial.start({ patternId: null, name: '' })
    for (let i = 0; i < tutorial.steps.length; i++) tutorial.next()
  })

  /*
   * A coach on the last card is not abandoning the tour, they have finished
   * it. The button does the same thing either way; the word is what tells
   * them which of the two it is.
   */
  it('says Finish rather than Skip', async () => {
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.get('[data-tour-skip]').text()).toBe('Finish')
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

  /*
   * The rail runs down the left edge, and its swatches sit one under the
   * other — so a card placed below the red swatch lands on the rest of the
   * colours the step is asking the coach to choose from. Anything hugging
   * an edge has to be stepped away from, not stepped past.
   */
  it('steps sideways off a control that hugs an edge', async () => {
    redSwatch()
    tutorial.start({ patternId: null, name: '' })
    tutorial.next() // `place`, which anchors to the red swatch
    const overlay = mountOverlay()
    await nextTick()
    expect(cardBox(overlay).left).toBeGreaterThanOrEqual(RECT.right)
  })

  /*
   * Clearing the swatch alone is not enough: the colours are laid out in a
   * grid two columns wide, so a card that steps past the red one still sits
   * on the blue one beside it.
   */
  it('clears the whole group the control belongs to, not just the control', async () => {
    redSwatch()
    tutorial.start({ patternId: null, name: '' })
    tutorial.next()
    const overlay = mountOverlay()
    await nextTick()
    expect(cardBox(overlay).left).toBeGreaterThanOrEqual(GRID_RECT.right)
  })

  /* Out in the middle there is no rail to clear, and under reads better. */
  it('drops below an anchor that is clear of every edge', async () => {
    playerCounter()
    tutorial.start({ patternId: null, name: '' })
    tutorial.next()
    tutorial.next() // `label`, which anchors to a player
    const overlay = mountOverlay()
    await nextTick()
    expect(cardBox(overlay).top).toBeGreaterThanOrEqual(MIDDLE_RECT.bottom)
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
