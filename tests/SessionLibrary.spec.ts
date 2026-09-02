import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SessionLibrary from '../src/components/SessionLibrary.vue'
import { useSessions } from '../src/composables/useSessions'
import { useStorage } from '../src/composables/useStorage'
import { __resetBoardForTests, useBoard } from '../src/composables/useBoard'

const sessions = useSessions()
const storage = useStorage()

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
})

describe('SessionLibrary', () => {
  it('says so when there is nothing saved', () => {
    const wrapper = mount(SessionLibrary, { props: { open: true } })
    expect(wrapper.text()).toContain('No sessions yet')
  })

  it('creates a session from a typed name', async () => {
    const wrapper = mount(SessionLibrary, { props: { open: true } })
    await wrapper.find('[data-new-name]').setValue('Tuesday U12')
    await wrapper.find('[data-new-session]').trigger('click')

    expect(sessions.listSessions().map((s) => s.name)).toEqual(['Tuesday U12'])
  })

  it('will not create a session with no name', async () => {
    const wrapper = mount(SessionLibrary, { props: { open: true } })
    await wrapper.find('[data-new-session]').trigger('click')

    expect(sessions.listSessions()).toEqual([])
  })

  it('reports the session the coach opened', async () => {
    sessions.createSession('Tuesday')
    const wrapper = mount(SessionLibrary, { props: { open: true } })
    await wrapper.find('[data-open]').trigger('click')

    expect(wrapper.emitted('open')?.[0]?.[0]).toMatchObject({ name: 'Tuesday' })
  })

  it('renames', async () => {
    sessions.createSession('Tuesday')
    const wrapper = mount(SessionLibrary, { props: { open: true } })
    await wrapper.find('[data-rename]').trigger('click')
    await wrapper.find('[data-rename-input]').setValue('Wednesday')
    await wrapper.find('[data-rename-save]').trigger('click')

    expect(sessions.listSessions()[0].name).toBe('Wednesday')
  })

  it('leaves a drill that is gone out of the session total', () => {
    const pattern = storage.savePattern('Rondo', useBoard().snapshot())
    const created = sessions.createSession('Tuesday')
    sessions.saveSession({
      ...created,
      entries: [sessions.newEntry(pattern.id, 12), sessions.newEntry('gone', 20)],
    })

    const wrapper = mount(SessionLibrary, { props: { open: true } })

    // The panel and the PDF must agree: both leave out a drill that will not
    // be run. Showing 32 here and 12 on the page is the discrepancy.
    expect(wrapper.find('[data-session]').text()).toContain('12 min')
    expect(wrapper.find('[data-session]').text()).not.toContain('32 min')
  })

  it('asks before deleting', async () => {
    sessions.createSession('Tuesday')
    const wrapper = mount(SessionLibrary, { props: { open: true } })

    await wrapper.find('[data-delete]').trigger('click')
    expect(sessions.listSessions()).toHaveLength(1)

    await wrapper.find('[data-confirm-delete]').trigger('click')
    expect(sessions.listSessions()).toEqual([])
  })
})
