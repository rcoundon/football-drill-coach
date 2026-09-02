import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PatternLibrary from '../src/components/PatternLibrary.vue'
import { useStorage } from '../src/composables/useStorage'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { useSessions, SESSIONS_KEY } from '../src/composables/useSessions'

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Same idiom `useStorage.spec.ts` uses to make the next write fail. */
function failNextWrite() {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    const error = new Error('quota') as Error & { name: string }
    error.name = 'QuotaExceededError'
    throw error
  })
}

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

  /**
   * refresh() starts with lastError cleared, so calling it unconditionally
   * after a failed delete erased the only thing telling the coach it did
   * not happen — and the drill silently stayed on the board.
   */
  it('tells the coach when a delete fails, rather than swallowing the error', async () => {
    const saved = seed('Press trigger')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-delete]').trigger('click')

    failNextWrite()
    await wrapper.find('[data-confirm-delete]').trigger('click')

    expect(useStorage().lastError.value).toMatch(/out of space/i)
    expect(wrapper.emitted('delete')).toBeUndefined()
    const listed = useStorage().listPatterns()
    expect(listed.map((p) => p.id)).toContain(saved.id)
  })

  /**
   * Deleting a drill a session still points at is allowed, not blocked — the
   * coach may well mean it — but the confirmation should say so, since the
   * session would otherwise be left pointing at nothing without warning.
   */
  it('says how many sessions use a drill before deleting it', async () => {
    const saved = seed('Rondo')
    const sessions = useSessions()
    const session = sessions.createSession('Tuesday')
    sessions.saveSession({ ...session, entries: [sessions.newEntry(saved.id, 12)] })

    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-delete]').trigger('click')

    expect(wrapper.find('[data-usage-warning]').text()).toContain('1 session')
  })

  it('says nothing when no session uses it', async () => {
    seed('Rondo')

    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-delete]').trigger('click')

    expect(wrapper.find('[data-usage-warning]').exists()).toBe(false)
  })

  /**
   * Regression: an unreadable sessions store used to make `sessionsUsing`
   * come back as an empty array, so this confirmation silently claimed the
   * drill was used by no session — exactly the moment it cannot know that.
   */
  it('warns that usage could not be checked when the sessions store is unreadable', async () => {
    seed('Rondo')
    localStorage.setItem(SESSIONS_KEY, '{not json')

    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-delete]').trigger('click')

    expect(wrapper.find('[data-usage-unknown]').text()).toMatch(/unable to check/i)
    expect(wrapper.find('[data-usage-warning]').exists()).toBe(false)
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

  /**
   * refresh() starts with lastError cleared, so calling it unconditionally
   * after a failed rename erased the only thing telling the coach it did
   * not happen. The row still shows the old name — the one case of these
   * three where the coach has any sign at all something is wrong, but the
   * error banner should say so too.
   */
  it('tells the coach when a rename fails, rather than swallowing the error', async () => {
    seed('Press trigger')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-rename]').trigger('click')
    await wrapper.find('[data-rename-input]').setValue('Counter press')

    failNextWrite()
    await wrapper.find('[data-rename-save]').trigger('click')

    expect(useStorage().lastError.value).toMatch(/out of space/i)
    expect(wrapper.emitted('rename')).toBeUndefined()
    expect(useStorage().listPatterns()[0].name).toBe('Press trigger')
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

    const chips = wrapper.findAll('[data-chip]')
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

  /**
   * setTags sets lastError to the quota message and leaves the write
   * unsucceeded — but refresh() calls listPatterns(), whose first line
   * clears lastError. On a full-but-readable library the coach pressed
   * Save, the editor closed, the tags were unchanged, and nothing was
   * reported. Tags are the worst of the three save-time failures in this
   * panel: unlike a rename, they are not shown on the row at all, so
   * without the error banner there is no sign anything went wrong.
   */
  it('tells the coach when saving tags fails, rather than swallowing the error', async () => {
    seed('Rondo')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-tags]').trigger('click')
    await wrapper.find('[data-tags-input]').setValue('rondo')

    failNextWrite()
    await wrapper.find('[data-tags-save]').trigger('click')

    expect(useStorage().lastError.value).toMatch(/out of space/i)
    expect(useStorage().listPatterns()[0].tags ?? []).toEqual([])
  })

  /**
   * With one chip selected, AND and OR agree — this is the case that would
   * pass even if `matchesTags` used `.some`. Only a drill carrying BOTH
   * chosen tags stays, while a drill with just one of them (u12) drops out.
   */
  it('keeps only the drill carrying every one of two chosen tags', async () => {
    const a = seed('Rondo')
    const b = seed('Pressing trap')
    const c = seed('Warm up jog')
    useStorage().setTags(a.id, ['rondo', 'u12'])
    useStorage().setTags(b.id, ['pressing', 'u12'])
    useStorage().setTags(c.id, ['rondo', 'u9'])

    const wrapper = mount(PatternLibrary, { props: { open: true } })
    const chips = wrapper.findAll('[data-chip]')
    await chips.find((chip) => chip.text() === 'rondo')!.trigger('click')
    await wrapper.findAll('[data-chip]').find((chip) => chip.text() === 'u12')!.trigger('click')

    expect(wrapper.findAll('[data-pattern]')).toHaveLength(1)
    expect(wrapper.find('[data-pattern]').text()).toContain('Rondo')
  })

  /**
   * Each tag alone matches a different drill, so an OR filter would show
   * both. AND requires both tags on the same drill, and neither has that —
   * the honest answer is nothing, and the panel says so distinctly from an
   * empty library.
   */
  it('shows nothing, with its own message, when two chosen tags never land on the same drill', async () => {
    const a = seed('Rondo')
    const b = seed('Pressing trap')
    useStorage().setTags(a.id, ['rondo'])
    useStorage().setTags(b.id, ['pressing'])

    const wrapper = mount(PatternLibrary, { props: { open: true } })
    const chips = wrapper.findAll('[data-chip]')
    await chips.find((chip) => chip.text() === 'rondo')!.trigger('click')
    await wrapper.findAll('[data-chip]').find((chip) => chip.text() === 'pressing')!.trigger('click')

    expect(wrapper.findAll('[data-pattern]')).toHaveLength(0)
    expect(wrapper.find('[data-no-matches]').exists()).toBe(true)
    expect(wrapper.find('[data-no-matches]').text()).toBe('No drills match these tags.')
    expect(wrapper.text()).not.toMatch(/nothing saved yet/i)
  })

  /**
   * The panel stays mounted across close/reopen, so a chip the coach chose
   * can outlive the tag it represents. Without pruning, editing the tag off
   * the last drill that had it leaves the list permanently empty with no
   * chip left to click to clear the selection.
   */
  it('drops a chosen tag from the filter once no drill carries it, so the list is not stuck empty', async () => {
    const saved = seed('Rondo')
    useStorage().setTags(saved.id, ['rondo'])

    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-chip]').trigger('click')
    expect(wrapper.findAll('[data-pattern]')).toHaveLength(1)

    await wrapper.find('[data-tags]').trigger('click')
    await wrapper.find('[data-tags-input]').setValue('')
    await wrapper.find('[data-tags-save]').trigger('click')

    expect(wrapper.findAll('[data-chip]')).toHaveLength(0)
    expect(wrapper.findAll('[data-pattern]')).toHaveLength(1)
  })
})
