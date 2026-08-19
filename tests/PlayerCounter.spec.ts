import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayerCounter from '../src/components/PlayerCounter.vue'
import type { Counter } from '../src/types'

function makeCounter(): Counter {
  return { id: 'c1', color: 'red', label: '1', pos: { x: 10, y: 10 } }
}

function mountCounter(hasBall = false) {
  return mount(PlayerCounter, { props: { counter: makeCounter(), rotated: false, hasBall } })
}

describe('grabbing', () => {
  it('emits grab from the hit circle on pointerdown', async () => {
    const wrapper = mountCounter()
    // The hit circle is the last child of the group, per PlayerCounter's paint order.
    const hit = wrapper.find('[data-counter]').element.lastElementChild as Element
    hit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('grab')).toBeTruthy()
  })

  /**
   * Rename is detected from repeated presses in PitchBoard, not from a
   * `dblclick` handler here. Pointer capture retargets the compatibility
   * mouse events at the capturing `<svg>`, so a `dblclick` listener on the
   * counter never fires in a real browser. There must be exactly one
   * mechanism, so this component must not carry a second, dead one.
   */
  it('does not answer dblclick, which pointer capture would make unreachable', async () => {
    const wrapper = mountCounter()
    const hit = wrapper.find('[data-counter]').element.lastElementChild as Element
    hit.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('rename')).toBeUndefined()
  })
})
