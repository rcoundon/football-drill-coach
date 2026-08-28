import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TagInput from '../src/components/TagInput.vue'

function mountInput(props: { available?: string[]; selected?: string[] } = {}) {
  return mount(TagInput, {
    props: { available: [], selected: [], ...props },
  })
}

describe('TagInput', () => {
  it('offers a chip for every tag already in use', () => {
    const wrapper = mountInput({ available: ['pressing', 'rondo'] })
    expect(wrapper.findAll('[data-tag-choice]')).toHaveLength(2)
  })

  it('shows no chip row at all when nothing has been tagged yet', () => {
    const wrapper = mountInput({ available: [] })
    expect(wrapper.find('[data-tag-choice]').exists()).toBe(false)
    // The field is the whole control at that point, so it must still be there.
    expect(wrapper.find('[data-tag-new]').exists()).toBe(true)
  })

  it('marks the chips that are already on the drill', () => {
    const wrapper = mountInput({ available: ['pressing', 'rondo'], selected: ['rondo'] })
    const chips = wrapper.findAll('[data-tag-choice]')

    expect(chips[0].attributes('aria-pressed')).toBe('false')
    expect(chips[1].attributes('aria-pressed')).toBe('true')
  })

  it('adds a tag when its chip is pressed', async () => {
    const wrapper = mountInput({ available: ['pressing', 'rondo'], selected: [] })
    await wrapper.findAll('[data-tag-choice]')[1].trigger('click')

    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual(['rondo'])
  })

  it('takes a tag off when its chip is pressed again', async () => {
    const wrapper = mountInput({ available: ['rondo'], selected: ['rondo'] })
    await wrapper.find('[data-tag-choice]').trigger('click')

    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual([])
  })

  it('adds tags typed into the field, alongside the chips already chosen', async () => {
    const wrapper = mountInput({ available: ['rondo'], selected: ['rondo'] })
    await wrapper.find('[data-tag-new]').setValue('warm up, finishing')

    expect(wrapper.emitted('update')?.slice(-1)[0]?.[0]).toEqual([
      'rondo',
      'warm up',
      'finishing',
    ])
  })

  it('normalises what is typed, so case and spacing cannot fork a tag', async () => {
    const wrapper = mountInput({ available: [], selected: [] })
    await wrapper.find('[data-tag-new]').setValue('  Warm Up ,, WARM UP ')

    expect(wrapper.emitted('update')?.slice(-1)[0]?.[0]).toEqual(['warm up'])
  })

  it('does not repeat a tag that is typed and also chosen as a chip', async () => {
    const wrapper = mountInput({ available: ['rondo'], selected: ['rondo'] })
    await wrapper.find('[data-tag-new]').setValue('Rondo')

    expect(wrapper.emitted('update')?.slice(-1)[0]?.[0]).toEqual(['rondo'])
  })

  it('keeps typed tags when a chip is pressed afterwards', async () => {
    const wrapper = mountInput({ available: ['rondo'], selected: [] })
    await wrapper.find('[data-tag-new]').setValue('warm up')
    await wrapper.find('[data-tag-choice]').trigger('click')

    expect(wrapper.emitted('update')?.slice(-1)[0]?.[0]).toEqual(['rondo', 'warm up'])
  })
})
