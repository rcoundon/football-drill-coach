import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TagInput from '../src/components/TagInput.vue'

function mountInput(props: { available?: string[]; initial?: string[] } = {}) {
  return mount(TagInput, {
    props: { available: [], initial: [], ...props },
  })
}

describe('TagInput', () => {
  it('offers a chip for every tag already in use', () => {
    const wrapper = mountInput({ available: ['pressing', 'rondo'] })
    expect(wrapper.findAll('[data-chip]')).toHaveLength(2)
  })

  it('shows no chip row at all when nothing has been tagged yet', () => {
    const wrapper = mountInput({ available: [] })
    expect(wrapper.find('[data-chip]').exists()).toBe(false)
    // The field is the whole control at that point, so it must still be there.
    expect(wrapper.find('[data-tag-new]').exists()).toBe(true)
  })

  it('marks the chips that are already on the drill', () => {
    const wrapper = mountInput({ available: ['pressing', 'rondo'], initial: ['rondo'] })
    const chips = wrapper.findAll('[data-chip]')

    expect(chips[0].attributes('aria-pressed')).toBe('false')
    expect(chips[1].attributes('aria-pressed')).toBe('true')
  })

  it('adds a tag when its chip is pressed', async () => {
    const wrapper = mountInput({ available: ['pressing', 'rondo'], initial: [] })
    await wrapper.findAll('[data-chip]')[1].trigger('click')

    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual(['rondo'])
  })

  it('takes a tag off when its chip is pressed again', async () => {
    const wrapper = mountInput({ available: ['rondo'], initial: ['rondo'] })
    await wrapper.find('[data-chip]').trigger('click')

    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual([])
  })

  it('adds tags typed into the field, alongside the chips already chosen', async () => {
    const wrapper = mountInput({ available: ['rondo'], initial: ['rondo'] })
    await wrapper.find('[data-tag-new]').setValue('warm up, finishing')

    expect(wrapper.emitted('update')?.slice(-1)[0]?.[0]).toEqual([
      'rondo',
      'warm up',
      'finishing',
    ])
  })

  it('normalises what is typed, so case and spacing cannot fork a tag', async () => {
    const wrapper = mountInput({ available: [], initial: [] })
    await wrapper.find('[data-tag-new]').setValue('  Warm Up ,, WARM UP ')

    expect(wrapper.emitted('update')?.slice(-1)[0]?.[0]).toEqual(['warm up'])
  })

  it('does not repeat a tag that is typed and also chosen as a chip', async () => {
    const wrapper = mountInput({ available: ['rondo'], initial: ['rondo'] })
    await wrapper.find('[data-tag-new]').setValue('Rondo')

    expect(wrapper.emitted('update')?.slice(-1)[0]?.[0]).toEqual(['rondo'])
  })

  /**
   * The parent stores what this emits, so anything folded into the emitted
   * list can come straight back as a prop. A merge that re-read the prop
   * therefore re-merged its own output: typing "rondo" one letter at a time
   * filed a drill under "r", "ro", "ron", "rond" and "rondo". Feeding the
   * emission back here is what proves the prop is read once, not watched.
   */
  it('does not accumulate the prefixes of what is being typed', async () => {
    const wrapper = mountInput({ available: [], initial: [] })
    const field = wrapper.find('[data-tag-new]')

    for (const draft of ['r', 'ro', 'ron', 'rond', 'rondo']) {
      await field.setValue(draft)
      // Exactly what `@update="saveTagsDraft = $event"` does in the prompt.
      await wrapper.setProps({ initial: wrapper.emitted('update')!.slice(-1)[0][0] as string[] })
    }

    expect(wrapper.emitted('update')?.slice(-1)[0]?.[0]).toEqual(['rondo'])
  })

  it('lets a chip be pressed off again even while its tag is being typed', async () => {
    const wrapper = mountInput({ available: ['rondo'], initial: ['rondo'] })
    await wrapper.find('[data-tag-new]').setValue('rondo')
    await wrapper.find('[data-chip]').trigger('click')

    expect(wrapper.emitted('update')?.slice(-1)[0]?.[0]).toEqual([])
  })

  it('keeps typed tags when a chip is pressed afterwards', async () => {
    const wrapper = mountInput({ available: ['rondo'], initial: [] })
    await wrapper.find('[data-tag-new]').setValue('warm up')
    await wrapper.find('[data-chip]').trigger('click')

    expect(wrapper.emitted('update')?.slice(-1)[0]?.[0]).toEqual(['rondo', 'warm up'])
  })
})
