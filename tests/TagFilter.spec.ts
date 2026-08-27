import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TagFilter from '../src/components/TagFilter.vue'

describe('TagFilter', () => {
  it('shows a chip per tag', () => {
    const wrapper = mount(TagFilter, { props: { tags: ['rondo', 'pressing'], selected: [] } })
    expect(wrapper.findAll('[data-tag-chip]')).toHaveLength(2)
  })

  it('shows nothing at all when no drill has a tag', () => {
    const wrapper = mount(TagFilter, { props: { tags: [], selected: [] } })
    expect(wrapper.find('[data-tag-chip]').exists()).toBe(false)
  })

  it('adds a tag to the selection when its chip is pressed', async () => {
    const wrapper = mount(TagFilter, { props: { tags: ['rondo', 'pressing'], selected: [] } })
    await wrapper.findAll('[data-tag-chip]')[0].trigger('click')

    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual(['rondo'])
  })

  it('takes a tag back out when its chip is pressed again', async () => {
    const wrapper = mount(TagFilter, { props: { tags: ['rondo'], selected: ['rondo'] } })
    await wrapper.find('[data-tag-chip]').trigger('click')

    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual([])
  })

  it('marks the chosen chips', () => {
    const wrapper = mount(TagFilter, { props: { tags: ['rondo', 'pressing'], selected: ['rondo'] } })
    expect(wrapper.findAll('[data-tag-chip]')[0].classes()).toContain('chip--on')
  })
})
