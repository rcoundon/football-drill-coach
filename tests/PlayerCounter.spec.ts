import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayerCounter from '../src/components/PlayerCounter.vue'
import type { Counter } from '../src/types'

function makeCounter(): Counter {
  return { id: 'c1', color: 'red', label: '1', pos: { x: 10, y: 10 } }
}

describe('renaming', () => {
  it('emits rename with the counter id on double-click of the hit circle', async () => {
    const wrapper = mount(PlayerCounter, {
      props: { counter: makeCounter(), rotated: false, hasBall: false },
    })
    // The hit circle is the last child of the group, per PlayerCounter's paint order.
    const hit = wrapper.find('[data-counter]').element.lastElementChild as Element
    hit.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()

    const emitted = wrapper.emitted('rename')
    expect(emitted).toBeTruthy()
    expect(emitted?.[0]).toEqual(['c1'])
  })
})
