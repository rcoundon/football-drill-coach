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
    counters: [{ id: 'a', color: 'red', label: '1', pos: { x: 10, y: 10 } }],
    ball: { pos: { x: 5, y: 5 }, attachedTo: null },
    drawings: [],
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
    expect(saved.version).toBe(1)
  })

  it('keeps drawings at the pattern level, not inside the frame', () => {
    const store = useStorage()
    const withDrawing: BoardSnapshot = {
      ...snap(),
      drawings: [{ id: 'd1', kind: 'arrow', color: '#fff', style: 'run', from: { x: 0, y: 0 }, to: { x: 9, y: 9 } }],
    }
    const saved = store.savePattern('Drill', withDrawing)
    expect(saved.drawings).toHaveLength(1)
    expect(saved.frames[0]).not.toHaveProperty('drawings')
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
    expect(restored.counters[0].pos).toEqual({ x: 10, y: 10 })
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
      frames: [{ counters: [42], ball: good.frames[0].ball }],
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
  })
})

describe('parsePattern', () => {
  it('rejects an unknown schema version', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const future = { ...saved, version: 2 }
    expect(() => parsePattern(future)).toThrow(/version 2/i)
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
    const corrupted = { ...saved, drawings: ['oops'] }
    expect(() => parsePattern(corrupted)).toThrow()
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

describe('draft autosave', () => {
  it('round-trips the working board', () => {
    const store = useStorage()
    store.saveDraft(snap())
    expect(store.loadDraft()!.counters[0].id).toBe('a')
  })

  it('returns null when there is no draft', () => {
    expect(useStorage().loadDraft()).toBeNull()
  })

  it('returns null rather than throwing on a corrupt draft', () => {
    localStorage.setItem(DRAFT_KEY, 'garbage')
    expect(useStorage().loadDraft()).toBeNull()
  })
})

describe('import and export', () => {
  it('imports patterns from exported JSON', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const json = store.exportPatternsJson([saved])
    localStorage.clear()
    const imported = store.importPatterns(json)
    expect(imported).toHaveLength(1)
    expect(store.listPatterns()).toHaveLength(1)
  })

  it('never overwrites an existing pattern on an id collision', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const json = store.exportPatternsJson([saved])
    const imported = store.importPatterns(json)
    expect(store.listPatterns()).toHaveLength(2)
    expect(imported[0].id).not.toBe(saved.id)
    expect(imported[0].name).toBe('Drill (imported)')
  })

  it('rejects a malformed file whole, importing nothing', () => {
    const store = useStorage()
    store.savePattern('Existing', snap())
    expect(() => store.importPatterns('[[[')).toThrow()
    expect(store.listPatterns()).toHaveLength(1)
  })

  it('rejects the file if ANY pattern in it is invalid', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const bad = JSON.stringify([saved, { id: 'x', name: 'broken' }])
    expect(() => store.importPatterns(bad)).toThrow()
    expect(store.listPatterns()).toHaveLength(1)
  })

  it('re-issues ids for duplicate ids within the same imported file', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const json = JSON.stringify([saved, { ...saved }])
    localStorage.clear()

    const imported = store.importPatterns(json)

    expect(imported).toHaveLength(2)
    expect(imported[0].id).toBe(saved.id)
    expect(imported[1].id).not.toBe(saved.id)
    expect(imported[1].name).toBe('Drill (imported)')

    const listed = store.listPatterns()
    expect(listed).toHaveLength(2)
    expect(new Set(listed.map((p) => p.id)).size).toBe(2)
  })

  it('refuses to import over an unreadable library, leaving the bad bytes intact', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const json = store.exportPatternsJson([saved])

    localStorage.setItem(PATTERNS_KEY, '{not json at all')

    expect(() => store.importPatterns(json)).toThrow(/could not be read/i)
    expect(localStorage.getItem(PATTERNS_KEY)).toBe('{not json at all')
  })

  it('still imports normally when the library merely has a skippable malformed entry', () => {
    const store = useStorage()
    const existing = store.savePattern('Existing', snap())
    const raw = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    raw.push({ id: 'junk', name: 'Bad' })
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(raw))

    const toImport = { ...existing, id: 'incoming-id', name: 'Incoming' }
    const json = JSON.stringify([toImport])

    const imported = store.importPatterns(json)

    expect(imported).toHaveLength(1)
    const listed = store.listPatterns()
    expect(listed.map((p) => p.id)).toContain(existing.id)
    expect(listed.map((p) => p.id)).toContain(imported[0].id)
  })
})
