import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SessionPlan from '../src/components/SessionPlan.vue'
import { useSessions } from '../src/composables/useSessions'
import { useStorage } from '../src/composables/useStorage'
import { __resetBoardForTests, useBoard } from '../src/composables/useBoard'
import type { Session } from '../src/types'

const sessions = useSessions()
const storage = useStorage()

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Same idiom PatternLibrary.spec.ts and useStorage.spec.ts use to make the next write fail. */
function failNextWrite() {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    const error = new Error('quota') as Error & { name: string }
    error.name = 'QuotaExceededError'
    throw error
  })
}

function sessionWith(entries: Array<{ patternId: string; minutes: number }>): Session {
  const created = sessions.createSession('Tuesday')
  const full = { ...created, entries: entries.map((e, i) => ({ id: `e${i}`, ...e })) }
  sessions.saveSession(full)
  return full
}

describe('SessionPlan', () => {
  it('stays hidden when there is no session to show', () => {
    // Regression: SessionLibrary once had a local `open(session)` function
    // shadowing its `open` prop, so `v-if="open"` was always truthy. This
    // panel's prop is called `session` instead of a boolean, but the same
    // trap is available here — a local `session` ref or computed would
    // shadow `props.session` inside the template just as easily.
    const wrapper = mount(SessionPlan, { props: { session: null } })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('lists the drills in order with a running total', () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const b = storage.savePattern('Pressing trap', useBoard().snapshot())
    const session = sessionWith([
      { patternId: a.id, minutes: 12 },
      { patternId: b.id, minutes: 20 },
    ])

    const wrapper = mount(SessionPlan, { props: { session } })

    const rows = wrapper.findAll('[data-entry]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('Rondo')
    expect(wrapper.find('[data-total]').text()).toContain('32')
  })

  it('shows a drill that is gone as missing, and lets it be removed', async () => {
    const session = sessionWith([{ patternId: 'gone', minutes: 12 }])

    const wrapper = mount(SessionPlan, { props: { session } })
    expect(wrapper.find('[data-missing]').exists()).toBe(true)

    await wrapper.find('[data-remove]').trigger('click')
    expect(sessions.listSessions()[0].entries).toEqual([])
  })

  it('leaves a missing drill out of the total', () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const session = sessionWith([
      { patternId: a.id, minutes: 12 },
      { patternId: 'gone', minutes: 20 },
    ])

    const wrapper = mount(SessionPlan, { props: { session } })
    expect(wrapper.find('[data-total]').text()).toContain('12')
  })

  it('moves a drill up and saves the new order', async () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const b = storage.savePattern('Pressing trap', useBoard().snapshot())
    const session = sessionWith([
      { patternId: a.id, minutes: 12 },
      { patternId: b.id, minutes: 20 },
    ])

    const wrapper = mount(SessionPlan, { props: { session } })
    await wrapper.findAll('[data-up]')[1].trigger('click')

    expect(sessions.listSessions()[0].entries[0].patternId).toBe(b.id)
  })

  it('will not move the first drill up', async () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const session = sessionWith([{ patternId: a.id, minutes: 12 }])

    const wrapper = mount(SessionPlan, { props: { session } })
    expect(wrapper.findAll('[data-up]')[0].attributes('disabled')).toBeDefined()
  })

  it('changes a drill’s minutes', async () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const session = sessionWith([{ patternId: a.id, minutes: 12 }])

    const wrapper = mount(SessionPlan, { props: { session } })
    await wrapper.find('[data-minutes]').setValue('18')

    expect(sessions.listSessions()[0].entries[0].minutes).toBe(18)
  })

  it('adds a drill from the picker', async () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const session = sessionWith([])

    const wrapper = mount(SessionPlan, { props: { session } })
    await wrapper.find('[data-add-drill]').trigger('click')
    await wrapper.find('[data-pick]').trigger('click')

    expect(sessions.listSessions()[0].entries[0].patternId).toBe(a.id)
  })

  it('filters the picker by tag', async () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const b = storage.savePattern('Pressing trap', useBoard().snapshot())
    storage.setTags(a.id, ['rondo'])
    storage.setTags(b.id, ['pressing'])
    const session = sessionWith([])

    const wrapper = mount(SessionPlan, { props: { session } })
    await wrapper.find('[data-add-drill]').trigger('click')
    expect(wrapper.findAll('[data-pick]')).toHaveLength(2)

    // The picker's tag row is the same TagFilter/ChipRow used everywhere
    // else, so its chips carry the same `data-chip` marker as
    // TagFilter.spec.ts and PatternLibrary.spec.ts already assert on —
    // not a one-off name invented for this panel.
    const rondo = wrapper.findAll('[data-chip]').find((c) => c.text() === 'rondo')!
    await rondo.trigger('click')

    expect(wrapper.findAll('[data-pick]')).toHaveLength(1)
  })

  it('does not persist a change when the write fails, and leaves the list as saved', async () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const session = sessionWith([{ patternId: a.id, minutes: 12 }])

    const wrapper = mount(SessionPlan, { props: { session } })
    failNextWrite()
    await wrapper.find('[data-remove]').trigger('click')

    // `entries` was spliced optimistically before the write was attempted.
    // Unless that splice is rolled back on failure, the row disappears from
    // the panel while the storage row it claims to have removed is still
    // there — a removal, addition or reorder reported as done that never
    // actually happened.
    expect(wrapper.findAll('[data-entry]')).toHaveLength(1)
    expect(sessions.listSessions()[0].entries).toHaveLength(1)
  })

  it('rejects an emptied minutes value and puts the stored number back in the field', async () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const session = sessionWith([{ patternId: a.id, minutes: 12 }])

    const wrapper = mount(SessionPlan, { props: { session } })
    const input = wrapper.find('[data-minutes]')
    await input.setValue('')

    // `:value="entry.minutes"` does not repaint the input on its own here —
    // the bound number never changed, so Vue skips the DOM write — which
    // would otherwise leave the field showing blank while 12 is still what
    // is saved.
    expect((input.element as HTMLInputElement).value).toBe('12')
    expect(sessions.listSessions()[0].entries[0].minutes).toBe(12)
  })

  it('asks App to export rather than exporting itself', async () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const session = sessionWith([{ patternId: a.id, minutes: 12 }])

    const wrapper = mount(SessionPlan, { props: { session } })
    await wrapper.find('[data-export-pdf]').trigger('click')

    expect(wrapper.emitted('exportPdf')?.[0]?.[0]).toMatchObject({ id: session.id })
  })
})
