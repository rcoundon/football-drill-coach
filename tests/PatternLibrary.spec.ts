import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PatternLibrary from '../src/components/PatternLibrary.vue'
import { useStorage } from '../src/composables/useStorage'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
})

function seed(name: string) {
  return useStorage().savePattern(name, {
    frames: [
      {
        counters: [{ id: 'a', color: 'red', label: '1', pos: { x: 10, y: 10 } }],
        markers: [],
        labels: [],
        balls: [{ id: 'b1', pos: { x: 5, y: 5 }, attachedTo: null }],
        drawings: [],
      },
    ],
    currentFrame: 0,
    labelsVisible: true,
    ballsVisible: true,
    notes: '',
    notesVisible: true,
    pitch: { type: 'full', rotated: false },
  })
}

describe('listing', () => {
  it('shows every saved pattern', () => {
    seed('Press trigger')
    seed('Build from the back')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    expect(wrapper.findAll('[data-pattern]')).toHaveLength(2)
  })

  it('shows a message when the library is empty', () => {
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    expect(wrapper.text()).toMatch(/nothing saved yet/i)
  })

  it('renders nothing when closed', () => {
    seed('Press trigger')
    const wrapper = mount(PatternLibrary, { props: { open: false } })
    expect(wrapper.findAll('[data-pattern]')).toHaveLength(0)
  })
})

/**
 * The library reports what the coach chose and closes; App owns the board
 * and owns which pattern is open. When the library loaded the snapshot
 * itself, App never learned the pattern's id or name, so Save forked a
 * second pattern with the same name, and the PNG filename and the save
 * prompt both fell back to placeholders.
 */
describe('loading', () => {
  it('reports the chosen pattern and closes, rather than loading it behind Apps back', async () => {
    const saved = seed('Press trigger')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-load]').trigger('click')

    const loaded = wrapper.emitted('load')
    expect(loaded).toHaveLength(1)
    expect((loaded![0][0] as { id: string; name: string }).id).toBe(saved.id)
    expect((loaded![0][0] as { id: string; name: string }).name).toBe('Press trigger')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('does not touch the board itself', async () => {
    seed('Press trigger')
    const board = useBoard()
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-load]').trigger('click')
    expect(board.state.counters).toHaveLength(0)
  })
})

describe('deleting', () => {
  it('removes the pattern from the list', async () => {
    seed('Press trigger')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-delete]').trigger('click')
    await wrapper.find('[data-confirm-delete]').trigger('click')
    expect(wrapper.findAll('[data-pattern]')).toHaveLength(0)
    expect(useStorage().listPatterns()).toHaveLength(0)
  })

  it('asks for confirmation first, in the page rather than a browser dialog', async () => {
    seed('Press trigger')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-delete]').trigger('click')
    expect(wrapper.find('[data-confirm-delete]').exists()).toBe(true)
    expect(useStorage().listPatterns()).toHaveLength(1)
  })

  it('reports the delete so the app can stay in step', async () => {
    const saved = seed('Press trigger')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-delete]').trigger('click')
    await wrapper.find('[data-confirm-delete]').trigger('click')

    expect(wrapper.emitted('delete')).toEqual([[saved.id]])
  })
})

describe('renaming', () => {
  it('saves the new name', async () => {
    seed('Press trigger')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-rename]').trigger('click')
    const input = wrapper.find('[data-rename-input]')
    await input.setValue('Counter press')
    await wrapper.find('[data-rename-save]').trigger('click')
    expect(useStorage().listPatterns()[0].name).toBe('Counter press')
  })

  /**
   * App owns which pattern is open. The library renames through useStorage,
   * so without telling App the two drift apart: renaming the open pattern and
   * pressing Save wrote the old name straight back over it, silently, because
   * the in-place save no longer prompts.
   */
  it('reports the rename so the app can stay in step', async () => {
    const saved = seed('Press trigger')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-rename]').trigger('click')
    await wrapper.find('[data-rename-input]').setValue('Counter press')
    await wrapper.find('[data-rename-save]').trigger('click')

    expect(wrapper.emitted('rename')).toEqual([[{ id: saved.id, name: 'Counter press' }]])
  })
})

describe('calling a drill a drill', () => {
  it('titles the library after what a coach saved', () => {
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    expect(wrapper.find('h2').text()).toBe('Saved drills')
    expect(wrapper.attributes('aria-label') ?? wrapper.find('[role="dialog"]').attributes('aria-label')).toBe(
      'Saved drills',
    )
  })

  it('says what to do when there is nothing saved yet', () => {
    localStorage.clear()
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    expect(wrapper.find('.empty').text()).toBe('Nothing saved yet. Build a drill and press Save.')
  })
})

describe('tags', () => {
  it('narrows the list to drills carrying every chosen tag', async () => {
    const a = seed('Rondo')
    const b = seed('Pressing trap')
    useStorage().setTags(a.id, ['rondo', 'u12'])
    useStorage().setTags(b.id, ['pressing', 'u12'])

    const wrapper = mount(PatternLibrary, { props: { open: true } })
    expect(wrapper.findAll('[data-pattern]')).toHaveLength(2)

    const chips = wrapper.findAll('[data-tag-chip]')
    const rondo = chips.find((c) => c.text() === 'rondo')!
    await rondo.trigger('click')

    expect(wrapper.findAll('[data-pattern]')).toHaveLength(1)
    expect(wrapper.find('[data-pattern]').text()).toContain('Rondo')
  })

  it('edits a drill’s tags', async () => {
    seed('Rondo')

    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-tags]').trigger('click')
    await wrapper.find('[data-tags-input]').setValue('Rondo, warm up')
    await wrapper.find('[data-tags-save]').trigger('click')

    expect(useStorage().listPatterns()[0].tags).toEqual(['rondo', 'warm up'])
  })
})
