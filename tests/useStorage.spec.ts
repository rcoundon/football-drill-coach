import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  useStorage,
  PATTERNS_KEY,
  DRAFT_KEY,
  parsePattern,
} from '../src/composables/useStorage'
import type { BoardSnapshot } from '../src/composables/useBoard'

function snap(): BoardSnapshot {
  return {
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
  }
}

beforeEach(() => {
  localStorage.clear()
  useStorage().lastError.value = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * A library that has never been written gets one drill to start from, so the
 * first thing a coach sees is a worked example rather than an empty list.
 * Only ever the never-written library: a coach who deleted their last drill
 * has an empty one on purpose, and must not find the starter back.
 */
describe('seedStarterLibrary', () => {
  it('files the starter drill into a library that was never written', () => {
    expect(useStorage().seedStarterLibrary()).toBe(true)
    const patterns = useStorage().listPatterns()
    expect(patterns).toHaveLength(1)
    expect(patterns[0].name).toBe('Endzone')
    expect(patterns[0].frames.length).toBeGreaterThan(1)
  })

  it('is a real pattern by the same rules as an imported one', () => {
    useStorage().seedStarterLibrary()
    const raw = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    expect(() => parsePattern(raw[0])).not.toThrow()
  })

  it('leaves a library the coach emptied alone', () => {
    const storage = useStorage()
    const saved = storage.savePattern('Mine', snap())
    storage.deletePattern(saved.id)
    expect(storage.seedStarterLibrary()).toBe(false)
    expect(storage.listPatterns()).toHaveLength(0)
  })

  it('leaves a library with drills in it alone', () => {
    const storage = useStorage()
    storage.savePattern('Mine', snap())
    expect(storage.seedStarterLibrary()).toBe(false)
    expect(storage.listPatterns().map((p) => p.name)).toEqual(['Mine'])
  })

  it('leaves an unreadable library untouched', () => {
    localStorage.setItem(PATTERNS_KEY, '{not json')
    expect(useStorage().seedStarterLibrary()).toBe(false)
    expect(localStorage.getItem(PATTERNS_KEY)).toBe('{not json')
  })
})

describe('savePattern and listPatterns', () => {
  it('round-trips a pattern', () => {
    const store = useStorage()
    const saved = store.savePattern('Press trigger', snap())
    const listed = store.listPatterns()
    expect(listed).toHaveLength(1)
    expect(listed[0].name).toBe('Press trigger')
    expect(listed[0].frames[0].counters[0].pos).toEqual({ x: 10, y: 10 })
    expect(listed[0].id).toBe(saved.id)
  })

  it('wraps the snapshot in a single frame', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    expect(saved.frames).toHaveLength(1)
    expect(saved.version).toBe(3)
  })

  it('keeps drawings on the frame that owns them, not the pattern', () => {
    const store = useStorage()
    const withDrawing: BoardSnapshot = {
      ...snap(),
      frames: [
        {
          ...snap().frames[0],
          drawings: [{ id: 'd1', kind: 'arrow', color: '#fff', style: 'run', from: { x: 0, y: 0 }, to: { x: 9, y: 9 } }],
        },
      ],
    }
    const saved = store.savePattern('Drill', withDrawing)
    expect(saved.frames[0].drawings).toHaveLength(1)
  })

  it('updates in place when given an existing id', () => {
    const store = useStorage()
    const first = store.savePattern('Drill', snap())
    store.savePattern('Drill', snap(), first.id)
    expect(store.listPatterns()).toHaveLength(1)
  })

  it('advances updatedAt but keeps createdAt when updating', () => {
    const store = useStorage()
    const first = store.savePattern('Drill', snap())
    const again = store.savePattern('Drill', snap(), first.id)
    expect(again.createdAt).toBe(first.createdAt)
  })
})

describe('patternToSnapshot', () => {
  it('unwraps the first frame back into a board snapshot', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const restored = store.patternToSnapshot(saved)
    expect(restored.frames[0].counters[0].pos).toEqual({ x: 10, y: 10 })
    expect(restored.pitch.type).toBe('full')
  })
})

describe('deletePattern and renamePattern', () => {
  it('deletes', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    store.deletePattern(saved.id)
    expect(store.listPatterns()).toHaveLength(0)
  })

  it('renames', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    store.renamePattern(saved.id, 'Better name')
    expect(store.listPatterns()[0].name).toBe('Better name')
  })
})

describe('corrupt storage', () => {
  it('returns an empty library instead of throwing', () => {
    localStorage.setItem(PATTERNS_KEY, '{not json at all')
    const store = useStorage()
    expect(store.listPatterns()).toEqual([])
  })

  it('reports the problem', () => {
    localStorage.setItem(PATTERNS_KEY, '{not json at all')
    const store = useStorage()
    store.listPatterns()
    expect(store.lastError.value).toMatch(/could not be read/i)
  })

  it('does NOT clear the bad data, so it stays recoverable by hand', () => {
    localStorage.setItem(PATTERNS_KEY, '{not json at all')
    useStorage().listPatterns()
    expect(localStorage.getItem(PATTERNS_KEY)).toBe('{not json at all')
  })

  it('drops individual malformed entries but keeps the valid ones', () => {
    const store = useStorage()
    const good = store.savePattern('Good', snap())
    const raw = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    raw.push({ id: 'junk', name: 'Bad' })
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(raw))
    const listed = store.listPatterns()
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(good.id)
  })

  it('drops an entry with a corrupted counter but keeps the valid ones', () => {
    const store = useStorage()
    const good = store.savePattern('Good', snap())
    const raw = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    raw.push({
      ...good,
      id: 'bad-counter',
      frames: [{ counters: [42], balls: good.frames[0].balls }],
    })
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(raw))
    const listed = store.listPatterns()
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(good.id)
  })

  it('refuses to save over an unreadable library, leaving the bad bytes intact', () => {
    localStorage.setItem(PATTERNS_KEY, '{not json at all')
    const store = useStorage()
    store.savePattern('Drill', snap())
    expect(localStorage.getItem(PATTERNS_KEY)).toBe('{not json at all')
    expect(store.lastError.value).toMatch(/could not be read/i)
    expect(store.lastError.value).toMatch(/overwrite/i)
  })

  it('refuses to delete over an unreadable library, leaving the bad bytes intact', () => {
    localStorage.setItem(PATTERNS_KEY, '{not json at all')
    const store = useStorage()
    store.deletePattern('some-id')
    expect(localStorage.getItem(PATTERNS_KEY)).toBe('{not json at all')
    expect(store.lastError.value).toMatch(/could not be read/i)
  })

  it('refuses to rename over an unreadable library, leaving the bad bytes intact', () => {
    localStorage.setItem(PATTERNS_KEY, '{not json at all')
    const store = useStorage()
    store.renamePattern('some-id', 'New name')
    expect(localStorage.getItem(PATTERNS_KEY)).toBe('{not json at all')
    expect(store.lastError.value).toMatch(/could not be read/i)
  })

  it('refuses to set tags over an unreadable library, leaving the bad bytes intact', () => {
    localStorage.setItem(PATTERNS_KEY, '{not json at all')
    const store = useStorage()
    store.setTags('some-id', ['rondo'])
    expect(localStorage.getItem(PATTERNS_KEY)).toBe('{not json at all')
    expect(store.lastError.value).toMatch(/could not be read/i)
  })

  it('still saves normally when the library merely has a skippable malformed entry', () => {
    const store = useStorage()
    const good = store.savePattern('Good', snap())
    const raw = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    raw.push({ id: 'junk', name: 'Bad' })
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(raw))

    const second = store.savePattern('Second', snap())

    const stored = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    expect(Array.isArray(stored)).toBe(true)
    const ids = stored.map((p: { id: string }) => p.id)
    expect(ids).toContain(good.id)
    expect(ids).toContain(second.id)
    // The damaged row must survive the write: the spec promises corrupt data
    // is "left untouched so it can be recovered", and a save that drops it
    // destroys it permanently.
    expect(ids).toContain('junk')
  })

  it('tells the coach when a save has left damaged rows behind', () => {
    const store = useStorage()
    store.savePattern('Good', snap())
    const raw = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    raw.push({ id: 'junk', name: 'Bad' })
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(raw))

    store.savePattern('Second', snap())
    expect(store.lastError.value).toMatch(/could not be read/i)
  })

  it('preserves a damaged row when deleting another pattern', () => {
    const store = useStorage()
    const good = store.savePattern('Good', snap())
    const raw = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    raw.push({ id: 'junk', name: 'Bad' })
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(raw))

    store.deletePattern(good.id)

    const stored = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    const ids = stored.map((p: { id: string }) => p.id)
    expect(ids).not.toContain(good.id)
    expect(ids).toContain('junk')
    expect(store.lastError.value).toMatch(/could not be read/i)
  })

  it('preserves a damaged row when renaming another pattern', () => {
    const store = useStorage()
    const good = store.savePattern('Good', snap())
    const raw = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    raw.push({ id: 'junk', name: 'Bad' })
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(raw))

    store.renamePattern(good.id, 'Better name')

    const stored = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    const ids = stored.map((p: { id: string }) => p.id)
    expect(ids).toContain('junk')
    expect(stored.find((p: { id: string }) => p.id === good.id).name).toBe('Better name')
    expect(store.lastError.value).toMatch(/could not be read/i)
  })

  it('preserves a damaged row when setting tags on another pattern', () => {
    const store = useStorage()
    const good = store.savePattern('Good', snap())
    const raw = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    raw.push({ id: 'junk', name: 'Bad' })
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(raw))

    store.setTags(good.id, ['rondo'])

    const stored = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    const ids = stored.map((p: { id: string }) => p.id)
    expect(ids).toContain('junk')
    expect(stored.find((p: { id: string }) => p.id === good.id).tags).toEqual(['rondo'])
    expect(store.lastError.value).toMatch(/could not be read/i)
  })

  it('keeps a damaged row byte-for-byte, so it stays recoverable by hand', () => {
    const store = useStorage()
    store.savePattern('Good', snap())
    const raw = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    const damaged = { id: 'junk', name: 'Bad', notes: 'the coach wants this back' }
    raw.push(damaged)
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(raw))

    store.savePattern('Second', snap())

    const stored = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    expect(stored.find((p: { id: string }) => p.id === 'junk')).toEqual(damaged)
  })
})

describe('parsePattern', () => {
  it('rejects an unknown schema version', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const future = { ...saved, version: 4 }
    expect(() => parsePattern(future)).toThrow(/newer version.*Update the app/i)
  })

  it('does not tell a coach to update the app for an older format', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    for (const version of [1, 2, '3']) {
      expect(() => parsePattern({ ...saved, version })).toThrow(/older format/i)
    }
  })

  it('rejects a pattern with no frames', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    expect(() => parsePattern({ ...saved, frames: [] })).toThrow()
  })

  it('rejects a non-object', () => {
    expect(() => parsePattern('nope')).toThrow()
  })

  it('rejects a counter with malformed shape', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const corrupted = {
      ...saved,
      frames: [{ ...saved.frames[0], counters: [42] }],
    }
    expect(() => parsePattern(corrupted)).toThrow()
  })

  it('rejects a drawing with malformed shape', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const corrupted = { ...saved, frames: [{ ...saved.frames[0], drawings: ['oops'] }] }
    expect(() => parsePattern(corrupted)).toThrow('That pattern has a damaged drawing.')
  })

  it('accepts a pattern this module itself saved', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    expect(() => parsePattern(saved)).not.toThrow()
    expect(parsePattern(saved).name).toBe('Drill')
  })
})

describe('quota exceeded', () => {
  it('reports the error without throwing', () => {
    const store = useStorage()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const error = new Error('quota') as Error & { name: string }
      error.name = 'QuotaExceededError'
      throw error
    })
    expect(() => store.savePattern('Drill', snap())).not.toThrow()
    expect(store.lastError.value).toMatch(/out of space/i)
  })

  it('clears lastError after a successful save following a failed one', () => {
    const store = useStorage()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      const error = new Error('quota') as Error & { name: string }
      error.name = 'QuotaExceededError'
      throw error
    })
    store.savePattern('Drill', snap())
    expect(store.lastError.value).toMatch(/out of space/i)

    store.savePattern('Drill 2', snap())
    expect(store.lastError.value).toBeNull()
  })
})

describe('goals', () => {
  const goal = { id: 'g1', a: { x: 10, y: 20 }, b: { x: 10, y: 23 }, flipped: true }

  it('are saved with the drill and come back with it', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', { ...snap(), goals: [goal] })
    const listed = store.listPatterns().find((p) => p.id === saved.id)!
    expect(store.patternToSnapshot(listed).goals).toEqual([goal])
  })

  it('read as none on a drill saved before they existed', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const { goals: _, ...old } = saved
    expect(store.patternToSnapshot(old).goals).toEqual([])
  })

  it('make a pattern with a broken one unreadable', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    expect(() => parsePattern({ ...saved, goals: [{ id: 'g1', a: { x: 1 } }] })).toThrow(/goal/i)
  })

  it('round-trip through the draft', () => {
    const store = useStorage()
    store.saveDraft({ ...snap(), goals: [goal] })
    expect(store.loadDraft()!.goals).toEqual([goal])
  })
})

describe('draft autosave', () => {
  it('round-trips the working board', () => {
    const store = useStorage()
    store.saveDraft(snap())
    expect(store.loadDraft()!.frames[0].counters[0].id).toBe('a')
  })

  it('returns null when there is no draft', () => {
    expect(useStorage().loadDraft()).toBeNull()
  })

  it('returns null rather than throwing on a corrupt draft', () => {
    localStorage.setItem(DRAFT_KEY, 'garbage')
    expect(useStorage().loadDraft()).toBeNull()
  })

  /** A draft with its one frame's fields overridden, for the malformed-frame cases below. */
  function withFrame(overrides: Record<string, unknown>): unknown {
    return { ...snap(), frames: [{ ...snap().frames[0], ...overrides }] }
  }

  /**
   * A draft is restored on every load, so an accepted-but-invalid draft
   * bricks the app on every load with no in-app way out. It is transient
   * working state, so the safe answer is to discard it and start clean —
   * unlike the library, which must be preserved for recovery.
   */
  describe('rejects a draft that would break the board', () => {
    const cases: [string, unknown][] = [
      // These used to override `ball`, which a frame no longer has — so the
      // damage sat beside a perfectly good `balls` list and was ignored,
      // and three tests that read as rejections quietly asserted nothing.
      ['balls that are not a list', withFrame({ balls: 'nope' })],
      ['a ball with no position', withFrame({ balls: [{ id: 'b1', attachedTo: null }] })],
      [
        'a ball attached to a number',
        withFrame({ balls: [{ id: 'b1', pos: { x: 1, y: 1 }, attachedTo: 7 }] }),
      ],
      ['one damaged ball among good ones', withFrame({ balls: [{ id: 'b1', pos: { x: 1, y: 1 }, attachedTo: null }, { id: 'b2' }] })],
      ['a damaged drawing', withFrame({ drawings: ['oops'] })],
      ['a damaged counter', withFrame({ counters: [42] })],
      ['no pitch type', { ...snap(), pitch: { rotated: false } }],
      ['a non-boolean rotation', { ...snap(), pitch: { type: 'full', rotated: 'yes' } }],
    ]

    it('keeps a draft with no balls at all — a shape drill has none', () => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(withFrame({ balls: [] })))
      const draft = useStorage().loadDraft()
      expect(draft).not.toBeNull()
      expect(draft!.frames[0].balls).toEqual([])
    })

    for (const [label, draft] of cases) {
      it(`returns null for a draft with ${label}`, () => {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
        expect(useStorage().loadDraft()).toBeNull()
      })
    }

    it('still accepts a draft this module itself wrote', () => {
      const store = useStorage()
      store.saveDraft(snap())
      expect(store.loadDraft()).not.toBeNull()
    })
  })
})

describe('import and export', () => {
  it('imports patterns from exported JSON', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const json = store.exportBundleJson([saved], [])
    localStorage.clear()
    const { patterns: imported } = store.importBundle(json)
    expect(imported).toHaveLength(1)
    expect(store.listPatterns()).toHaveLength(1)
  })

  it('never overwrites an existing pattern on an id collision', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const json = store.exportBundleJson([saved], [])
    const { patterns: imported } = store.importBundle(json)
    expect(store.listPatterns()).toHaveLength(2)
    expect(imported[0].id).not.toBe(saved.id)
    expect(imported[0].name).toBe('Drill (imported)')
  })

  it('rejects a malformed file whole, importing nothing', () => {
    const store = useStorage()
    store.savePattern('Existing', snap())
    expect(() => store.importBundle('[[[')).toThrow()
    expect(store.listPatterns()).toHaveLength(1)
  })

  it('rejects the file if ANY pattern in it is invalid', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const bad = JSON.stringify({ patterns: [saved, { id: 'x', name: 'broken' }], sessions: [] })
    expect(() => store.importBundle(bad)).toThrow()
    expect(store.listPatterns()).toHaveLength(1)
  })

  it('re-issues ids for duplicate ids within the same imported file', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const json = JSON.stringify({ patterns: [saved, { ...saved }], sessions: [] })
    localStorage.clear()

    const { patterns: imported } = store.importBundle(json)

    expect(imported).toHaveLength(2)
    expect(imported[0].id).toBe(saved.id)
    expect(imported[1].id).not.toBe(saved.id)
    expect(imported[1].name).toBe('Drill (imported)')

    const listed = store.listPatterns()
    expect(listed).toHaveLength(2)
    expect(new Set(listed.map((p) => p.id)).size).toBe(2)
  })

  it('normalises tags on import, so a hand-edited file cannot duplicate a chip', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const messy = { ...saved, tags: [' Rondo ', 'rondo', 'WARM UP'] }
    const json = JSON.stringify({ patterns: [messy], sessions: [] })
    localStorage.clear()

    const { patterns: imported } = store.importBundle(json)

    expect(imported[0].tags).toEqual(['rondo', 'warm up'])
    expect(store.listPatterns()[0].tags).toEqual(['rondo', 'warm up'])
  })

  it('keeps tags absent, rather than an empty array, for an incoming pattern that had none', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const { tags: _tags, ...withoutTags } = saved
    const json = JSON.stringify({ patterns: [withoutTags], sessions: [] })
    localStorage.clear()

    const { patterns: imported } = store.importBundle(json)

    expect(imported[0].tags).toBeUndefined()
    expect(store.listPatterns()[0].tags).toBeUndefined()
    expect(JSON.parse(localStorage.getItem(PATTERNS_KEY)!)[0]).not.toHaveProperty('tags')
  })

  it('refuses to import over an unreadable library, leaving the bad bytes intact', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const json = store.exportBundleJson([saved], [])

    localStorage.setItem(PATTERNS_KEY, '{not json at all')

    expect(() => store.importBundle(json)).toThrow(/could not be read/i)
    expect(localStorage.getItem(PATTERNS_KEY)).toBe('{not json at all')
  })

  it('still imports normally when the library merely has a skippable malformed entry', () => {
    const store = useStorage()
    const existing = store.savePattern('Existing', snap())
    const raw = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    raw.push({ id: 'junk', name: 'Bad' })
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(raw))

    const toImport = { ...existing, id: 'incoming-id', name: 'Incoming' }
    const json = JSON.stringify({ patterns: [toImport], sessions: [] })

    const { patterns: imported } = store.importBundle(json)

    expect(imported).toHaveLength(1)
    const listed = store.listPatterns()
    expect(listed.map((p) => p.id)).toContain(existing.id)
    expect(listed.map((p) => p.id)).toContain(imported[0].id)

    // Importing must not quietly destroy the row it could not parse either.
    const stored = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    expect(stored.map((p: { id: string }) => p.id)).toContain('junk')
  })
})

describe('straight-line drawings', () => {
  const line = { id: 'l1', kind: 'line' as const, color: '#fff', from: { x: 0, y: 0 }, to: { x: 40, y: 0 } }

  it('round-trips a line through save and load', () => {
    const store = useStorage()
    const saved = store.savePattern('Zones', { ...snap(), frames: [{ ...snap().frames[0], drawings: [line] }] })
    const restored = store.patternToSnapshot(saved)
    expect(restored.frames[0].drawings).toEqual([line])
  })

  it('accepts a line in an imported file', () => {
    const store = useStorage()
    const saved = store.savePattern('Zones', { ...snap(), frames: [{ ...snap().frames[0], drawings: [line] }] })
    expect(() => parsePattern(saved)).not.toThrow()
  })

  it('rejects a line with a malformed endpoint', () => {
    const store = useStorage()
    const saved = store.savePattern('Zones', { ...snap(), frames: [{ ...snap().frames[0], drawings: [line] }] })
    const broken = structuredClone(saved)
    ;(broken.frames[0].drawings[0] as { to: unknown }).to = 'over there'
    expect(() => parsePattern(broken)).toThrow(/damaged drawing/i)
  })
})

describe('curved arrows', () => {
  const curved = {
    id: 'a1',
    kind: 'arrow' as const,
    color: '#fff',
    style: 'pass' as const,
    from: { x: 20, y: 30 },
    to: { x: 60, y: 30 },
    bend: 6,
  }

  it('round-trips a bend through save and load', () => {
    const store = useStorage()
    const saved = store.savePattern('Switch', { ...snap(), frames: [{ ...snap().frames[0], drawings: [curved] }] })
    expect(store.patternToSnapshot(saved).frames[0].drawings).toEqual([curved])
  })

  it('accepts a curved arrow in an imported file', () => {
    const store = useStorage()
    const saved = store.savePattern('Switch', { ...snap(), frames: [{ ...snap().frames[0], drawings: [curved] }] })
    expect(() => parsePattern(saved)).not.toThrow()
  })

  it('loads an arrow saved before curves existed as the straight one it was', () => {
    const store = useStorage()
    const saved = store.savePattern('Switch', { ...snap(), frames: [{ ...snap().frames[0], drawings: [curved] }] })
    const old = structuredClone(saved)
    delete (old.frames[0].drawings[0] as { bend?: number }).bend
    expect(() => parsePattern(old)).not.toThrow()
    expect(store.patternToSnapshot(old).frames[0].drawings[0]).not.toHaveProperty('bend')
  })

  it('rejects a bend that is not a number, which would draw an unreadable path', () => {
    const store = useStorage()
    const saved = store.savePattern('Switch', { ...snap(), frames: [{ ...snap().frames[0], drawings: [curved] }] })
    const broken = structuredClone(saved)
    ;(broken.frames[0].drawings[0] as { bend: unknown }).bend = 'a lot'
    expect(() => parsePattern(broken)).toThrow(/damaged drawing/i)
  })

  it('round-trips a skewed bow through save and load', () => {
    const store = useStorage()
    const skewed = { ...curved, bendAlong: 0.2 }
    const saved = store.savePattern('Switch', { ...snap(), frames: [{ ...snap().frames[0], drawings: [skewed] }] })
    expect(store.patternToSnapshot(saved).frames[0].drawings).toEqual([skewed])
  })

  it('rejects an offset along the arrow that is not a number', () => {
    const store = useStorage()
    const saved = store.savePattern('Switch', { ...snap(), frames: [{ ...snap().frames[0], drawings: [curved] }] })
    const broken = structuredClone(saved)
    ;(broken.frames[0].drawings[0] as { bendAlong?: unknown }).bendAlong = 'near the end'
    expect(() => parsePattern(broken)).toThrow(/damaged drawing/i)
  })

  it('rejects a bend of Infinity, which has no place on a pitch', () => {
    const store = useStorage()
    const saved = store.savePattern('Switch', { ...snap(), frames: [{ ...snap().frames[0], drawings: [curved] }] })
    const broken = structuredClone(saved)
    ;(broken.frames[0].drawings[0] as { bend: unknown }).bend = Infinity
    expect(() => parsePattern(broken)).toThrow(/damaged drawing/i)
  })
})

describe('cones', () => {
  it('round-trips cones through save and load', () => {
    const store = useStorage()
    const withCones = { ...snap(), frames: [{ ...snap().frames[0], markers: [{ id: 'm1', pos: { x: 20, y: 20 } }] }] }
    const saved = store.savePattern('Grid', withCones)
    expect(store.patternToSnapshot(saved).frames[0].markers).toEqual(withCones.frames[0].markers)
  })

  it('keeps cones in the frame, alongside the players', () => {
    const store = useStorage()
    const saved = store.savePattern('Grid', {
      ...snap(),
      frames: [{ ...snap().frames[0], markers: [{ id: 'm1', pos: { x: 20, y: 20 } }] }],
    })
    expect(saved.frames[0].markers).toHaveLength(1)
  })

  /**
   * Every pattern saved before cones existed has no markers array. Those
   * are the coach's real saved work and must keep loading.
   */
  it('loads a pattern saved before cones existed', () => {
    const store = useStorage()
    const saved = store.savePattern('Older drill', snap())
    const legacy = structuredClone(saved) as Record<string, unknown>
    delete (legacy.frames as Record<string, unknown>[])[0].markers

    expect(() => parsePattern(legacy)).not.toThrow()
    expect(store.patternToSnapshot(parsePattern(legacy)).frames[0].markers).toEqual([])
  })

  it('rejects a cone with a malformed position', () => {
    const store = useStorage()
    const saved = store.savePattern('Grid', {
      ...snap(),
      frames: [{ ...snap().frames[0], markers: [{ id: 'm1', pos: { x: 20, y: 20 } }] }],
    })
    const broken = structuredClone(saved)
    ;(broken.frames[0].markers[0] as { pos: unknown }).pos = 'somewhere'
    expect(() => parsePattern(broken)).toThrow()
  })

  it('survives a draft written before cones existed', () => {
    const store = useStorage()
    store.saveDraft(snap())
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY)!)
    delete raw.frames[0].markers
    localStorage.setItem(DRAFT_KEY, JSON.stringify(raw))
    expect(store.loadDraft()?.frames[0].markers).toEqual([])
  })
})


/**
 * These three used to read the flag off the ball itself. It is a drill-wide
 * setting now — which is what "hide them all" means, and what stops hiding on
 * one phase leaving the balls showing on the next. The intents are unchanged:
 * hidden round-trips as hidden, and a drill saved before the flag existed
 * reads as showing its balls.
 */
describe('ball visibility', () => {
  it('round-trips hidden balls', () => {
    const store = useStorage()
    const saved = store.savePattern('Shape drill', { ...snap(), ballsVisible: false })
    expect(store.patternToSnapshot(saved).ballsVisible).toBe(false)
  })

  it('treats a drill saved without the flag as showing its balls', () => {
    const store = useStorage()
    const saved = store.savePattern('Older drill', snap())
    const legacy = structuredClone(saved) as Record<string, unknown>
    delete legacy.ballsVisible

    expect(() => parsePattern(legacy)).not.toThrow()
    expect(store.patternToSnapshot(parsePattern(legacy)).ballsVisible).toBe(true)
  })


  it('treats a draft saved without the flag the same way', () => {
    const store = useStorage()
    store.saveDraft(snap())
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY)!)
    delete raw.ballsVisible
    localStorage.setItem(DRAFT_KEY, JSON.stringify(raw))
    expect(store.loadDraft()?.ballsVisible).toBe(true)
  })
})

describe('pitch labels', () => {
  const label = { id: 'l1', pos: { x: 20, y: 20 }, text: 'Press trigger' }

  it('round-trips labels and their visibility', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', {
      ...snap(),
      frames: [{ ...snap().frames[0], labels: [label] }],
      labelsVisible: false,
      ballsVisible: true,
    })
    const restored = store.patternToSnapshot(saved)
    expect(restored.frames[0].labels).toEqual([label])
    expect(restored.labelsVisible).toBe(false)
  })

  it('loads a pattern saved before labels existed', () => {
    const store = useStorage()
    const saved = store.savePattern('Older drill', snap())
    const legacy = structuredClone(saved) as Record<string, unknown>
    delete (legacy.frames as Record<string, unknown>[])[0].labels

    expect(() => parsePattern(legacy)).not.toThrow()
    const restored = store.patternToSnapshot(parsePattern(legacy))
    expect(restored.frames[0].labels).toEqual([])
    expect(restored.labelsVisible).toBe(true)
  })

  it('rejects a label with a malformed position', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', { ...snap(), frames: [{ ...snap().frames[0], labels: [label] }] })
    const broken = structuredClone(saved)
    ;(broken.frames[0].labels[0] as { pos: unknown }).pos = 'over there'
    expect(() => parsePattern(broken)).toThrow()
  })

  it('rejects a label whose text is not text', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', { ...snap(), frames: [{ ...snap().frames[0], labels: [label] }] })
    const broken = structuredClone(saved)
    ;(broken.frames[0].labels[0] as { text: unknown }).text = 42
    expect(() => parsePattern(broken)).toThrow()
  })
})


describe('a multi-frame pattern round-trips', () => {
  it('keeps every frame and its duration', () => {
    const storage = useStorage()
    const frame = (duration?: number) => ({
      counters: [],
      markers: [],
      labels: [],
      balls: [{ id: 'b1', pos: { x: 50, y: 30 }, attachedTo: null }],
      drawings: [],
      ...(duration === undefined ? {} : { duration }),
    })
    const saved = storage.savePattern('Drill', {
      frames: [frame(), frame(400), frame(600)],
      currentFrame: 2,
      labelsVisible: true,
      ballsVisible: true,
      notes: '',
      notesVisible: true,
      pitch: { type: 'blank', rotated: false },
    })

    const back = storage.patternToSnapshot(saved)
    expect(back.frames).toHaveLength(3)
    expect(back.frames[1].duration).toBe(400)
    expect(back.frames[2].duration).toBe(600)
  })

  it('keeps a phase’s hold, the first phase’s included', () => {
    const storage = useStorage()
    const frame = (hold?: number) => ({
      counters: [],
      markers: [],
      labels: [],
      balls: [{ id: 'b1', pos: { x: 50, y: 30 }, attachedTo: null }],
      drawings: [],
      ...(hold === undefined ? {} : { hold }),
    })
    const saved = storage.savePattern('Drill', {
      frames: [frame(700), frame(), frame(300)],
      currentFrame: 0,
      labelsVisible: true,
      ballsVisible: true,
      notes: '',
      notesVisible: true,
      pitch: { type: 'blank', rotated: false },
    })

    const back = storage.patternToSnapshot(saved)
    expect(back.frames[0].hold).toBe(700)
    expect(back.frames[1].hold).toBeUndefined()
    expect(back.frames[2].hold).toBe(300)
  })

  it('always opens on the first frame, because that is where a drill starts', () => {
    const storage = useStorage()
    const frame = () => ({
      counters: [],
      markers: [],
      labels: [],
      balls: [{ id: 'b1', pos: { x: 50, y: 30 }, attachedTo: null }],
      drawings: [],
    })
    const saved = storage.savePattern('Drill', {
      frames: [frame(), frame()],
      currentFrame: 1,
      labelsVisible: true,
      ballsVisible: true,
      notes: '',
      notesVisible: true,
      pitch: { type: 'blank', rotated: false },
    })
    expect(storage.patternToSnapshot(saved).currentFrame).toBe(0)
  })
})


describe('drill notes', () => {
  it('round-trips notes and their visibility', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', {
      ...snap(),
      notes: 'Setup:\n- 20x20 grid',
      notesVisible: false,
    })
    const restored = store.patternToSnapshot(saved)
    expect(restored.notes).toBe('Setup:\n- 20x20 grid')
    expect(restored.notesVisible).toBe(false)
  })

  it('keeps notes at the pattern level, not inside the frame', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', { ...snap(), notes: 'Coaching points' })
    expect(saved.notes).toBe('Coaching points')
    expect(saved.frames[0]).not.toHaveProperty('notes')
  })

  it('loads a pattern saved before notes existed', () => {
    const store = useStorage()
    const saved = store.savePattern('Older drill', snap())
    const legacy = structuredClone(saved) as Record<string, unknown>
    delete legacy.notes

    expect(() => parsePattern(legacy)).not.toThrow()
    const restored = store.patternToSnapshot(parsePattern(legacy))
    expect(restored.notes).toBe('')
    expect(restored.notesVisible).toBe(true)
  })

  it('rejects notes that are not text', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', { ...snap(), notes: 'Fine' })
    const broken = structuredClone(saved) as Record<string, unknown>
    broken.notes = 42
    expect(() => parsePattern(broken)).toThrow(/notes/i)
  })
})


/**
 * Every other thing on the board is rejected without an id; balls were not,
 * and the whole change rests on them having one. An imported drill with
 * id-less balls got as far as `removeBall(undefined)`, which filters on
 * `b.id !== undefined` and takes off every id-less ball at once — erasing one
 * would have erased several.
 */
describe('a ball without an id is damage', () => {
  const withBalls = (balls: unknown) => ({ ...snap(), frames: [{ ...snap().frames[0], balls }] })

  it('is refused in a draft', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(withBalls([{ pos: { x: 1, y: 1 }, attachedTo: null }])))
    expect(useStorage().loadDraft()).toBeNull()
  })

  it('is refused in a saved drill', () => {
    const store = useStorage()
    const saved = store.savePattern('Imported', snap())
    const damaged = structuredClone(saved) as Record<string, unknown>
    ;(damaged.frames as Record<string, unknown>[])[0].balls = [{ pos: { x: 1, y: 1 }, attachedTo: null }]
    expect(() => parsePattern(damaged)).toThrow(/ball/i)
  })

})

/**
 * Two balls sharing an id is the same class of damage as a ball with none:
 * playback matches by id, and `removeBall` filters on it, so erasing one
 * would take the other off with it.
 */
describe('balls sharing an id are damage', () => {
  const twoBalls = (ids: [string, string]) => [
    { id: ids[0], pos: { x: 10, y: 10 }, attachedTo: null },
    { id: ids[1], pos: { x: 30, y: 30 }, attachedTo: null },
  ]

  it('is refused in a saved drill', () => {
    const store = useStorage()
    const saved = store.savePattern('Two lanes', snap())
    const damaged = structuredClone(saved) as Record<string, unknown>
    ;(damaged.frames as Record<string, unknown>[])[0].balls = twoBalls(['b1', 'b1'])
    expect(() => parsePattern(damaged)).toThrow(/ball/i)
  })

  it('is refused in a draft', () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...snap(), frames: [{ ...snap().frames[0], balls: twoBalls(['b1', 'b1']) }] }),
    )
    expect(useStorage().loadDraft()).toBeNull()
  })

  it('but two different ids are fine', () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...snap(), frames: [{ ...snap().frames[0], balls: twoBalls(['b1', 'b2']) }] }),
    )
    expect(useStorage().loadDraft()?.frames[0].balls).toHaveLength(2)
  })
})

describe('a draft whose balls list is damaged', () => {
  it('is refused even when an older single ball sits beside it', () => {
    // The branch used to fall back to the legacy ball whenever `balls` was
    // not an array, so garbage in `balls` was excused by a good `ball`.
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        ...snap(),
        frames: [
          {
            ...snap().frames[0],
            balls: 'nope',
            ball: { pos: { x: 50, y: 30 }, attachedTo: null, visible: true },
          },
        ],
      }),
    )
    expect(useStorage().loadDraft()).toBeNull()
  })
})

/**
 * A note that belongs to one phase has to survive being saved, or it is a
 * note the coach loses the moment they close the drill.
 */
describe('a phase note', () => {
  it('goes round the library and comes back', () => {
    const store = useStorage()
    const board = snap()
    board.frames[0].note = 'Overload arrives late.'

    const saved = store.savePattern('Press trigger', board)
    const back = store.patternToSnapshot(store.listPatterns().find((p) => p.id === saved.id)!)

    expect(back.frames[0].note).toBe('Overload arrives late.')
  })

  it('is rejected when it is not text', () => {
    const raw = {
      version: 3,
      id: 'p1',
      name: 'Broken',
      pitch: { type: 'full', rotated: false },
      frames: [{ counters: [], markers: [], labels: [], balls: [], drawings: [], note: 7 }],
    }
    expect(() => parsePattern(raw)).toThrow(/phase note/i)
  })
})

/**
 * Whether the players' own labels are showing belongs to the drill, like
 * every other view setting, so it has to survive being saved.
 */
describe('the player-label setting', () => {
  it('goes round the library and comes back', () => {
    const store = useStorage()
    const board = snap()
    board.counterLabelsVisible = false

    const saved = store.savePattern('Press trigger', board)
    const back = store.patternToSnapshot(store.listPatterns().find((p) => p.id === saved.id)!)

    expect(back.counterLabelsVisible).toBe(false)
  })

  /** A drill saved before the setting existed comes back showing them. */
  it('defaults to showing them for a pattern that has no opinion', () => {
    const store = useStorage()
    const saved = store.savePattern('Press trigger', snap())
    const stored = store.listPatterns().find((p) => p.id === saved.id)!
    delete (stored as Record<string, unknown>).counterLabelsVisible

    expect(store.patternToSnapshot(stored).counterLabelsVisible).toBe(true)
  })
})

/**
 * A version-3 pattern object with one frame and the given counter.
 */
function patternWithCounter(counter: unknown) {
  return {
    id: 'p1',
    name: 'Test drill',
    version: 3,
    pitch: { type: 'full' as const, rotated: false },
    frames: [
      {
        counters: [counter],
        markers: [],
        labels: [],
        balls: [],
        drawings: [],
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('a curved run', () => {
  it('reads a counter carrying a bend', () => {
    const raw = patternWithCounter({ id: 'c1', color: 'red', label: '9', pos: { x: 10, y: 10 }, bend: 4, bendAlong: 0.1 })
    const parsed = parsePattern(raw)
    expect(parsed.frames[0].counters[0].bend).toBe(4)
    expect(parsed.frames[0].counters[0].bendAlong).toBe(0.1)
  })

  it('reads a counter saved before curves existed', () => {
    const raw = patternWithCounter({ id: 'c1', color: 'red', label: '9', pos: { x: 10, y: 10 } })
    const parsed = parsePattern(raw)
    expect(parsed.frames[0].counters[0].bend).toBeUndefined()
  })

  it('rejects a bend that is not a number', () => {
    const raw = patternWithCounter({ id: 'c1', color: 'red', label: '9', pos: { x: 10, y: 10 }, bend: 'lots' })
    expect(() => parsePattern(raw)).toThrow()
  })

  it('rejects a bend that is not finite', () => {
    const raw = patternWithCounter({ id: 'c1', color: 'red', label: '9', pos: { x: 10, y: 10 }, bend: Number.POSITIVE_INFINITY })
    expect(() => parsePattern(raw)).toThrow()
  })
})

describe('saveDraft and the library warning', () => {
  it('leaves a damaged-library warning on screen', () => {
    const storage = useStorage()
    localStorage.setItem(PATTERNS_KEY, JSON.stringify([{ id: 'old', name: 'Old', version: 1 }]))
    storage.listPatterns()
    expect(storage.lastError.value).toMatch(/could not be read/)

    storage.saveDraft(snap())

    expect(storage.lastError.value).toMatch(/could not be read/)
  })
})
