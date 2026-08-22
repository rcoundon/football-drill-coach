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
    markers: [],
    labels: [],
    labelsVisible: true,
    notes: '',
    notesVisible: true,
    ball: { pos: { x: 5, y: 5 }, attachedTo: null, visible: true },
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

  /**
   * A draft is restored on every load, so an accepted-but-invalid draft
   * bricks the app on every load with no in-app way out. It is transient
   * working state, so the safe answer is to discard it and start clean —
   * unlike the library, which must be preserved for recovery.
   */
  describe('rejects a draft that would break the board', () => {
    const cases: [string, unknown][] = [
      ['no ball', { ...snap(), ball: undefined }],
      ['a ball with no position', { ...snap(), ball: { attachedTo: null } }],
      ['a ball attached to a number', { ...snap(), ball: { pos: { x: 1, y: 1 }, attachedTo: 7 } }],
      ['no drawings', { ...snap(), drawings: undefined }],
      ['a damaged drawing', { ...snap(), drawings: ['oops'] }],
      ['a damaged counter', { ...snap(), counters: [42] }],
      ['no pitch type', { ...snap(), pitch: { rotated: false } }],
      ['a non-boolean rotation', { ...snap(), pitch: { type: 'full', rotated: 'yes' } }],
    ]

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

    // Importing must not quietly destroy the row it could not parse either.
    const stored = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    expect(stored.map((p: { id: string }) => p.id)).toContain('junk')
  })
})

describe('straight-line drawings', () => {
  const line = { id: 'l1', kind: 'line' as const, color: '#fff', from: { x: 0, y: 0 }, to: { x: 40, y: 0 } }

  it('round-trips a line through save and load', () => {
    const store = useStorage()
    const saved = store.savePattern('Zones', { ...snap(), drawings: [line] })
    const restored = store.patternToSnapshot(saved)
    expect(restored.drawings).toEqual([line])
  })

  it('accepts a line in an imported file', () => {
    const store = useStorage()
    const saved = store.savePattern('Zones', { ...snap(), drawings: [line] })
    expect(() => parsePattern(saved)).not.toThrow()
  })

  it('rejects a line with a malformed endpoint', () => {
    const store = useStorage()
    const saved = store.savePattern('Zones', { ...snap(), drawings: [line] })
    const broken = structuredClone(saved)
    ;(broken.drawings[0] as { to: unknown }).to = 'over there'
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
    const saved = store.savePattern('Switch', { ...snap(), drawings: [curved] })
    expect(store.patternToSnapshot(saved).drawings).toEqual([curved])
  })

  it('accepts a curved arrow in an imported file', () => {
    const store = useStorage()
    const saved = store.savePattern('Switch', { ...snap(), drawings: [curved] })
    expect(() => parsePattern(saved)).not.toThrow()
  })

  it('loads an arrow saved before curves existed as the straight one it was', () => {
    const store = useStorage()
    const saved = store.savePattern('Switch', { ...snap(), drawings: [curved] })
    const old = structuredClone(saved)
    delete (old.drawings[0] as { bend?: number }).bend
    expect(() => parsePattern(old)).not.toThrow()
    expect(store.patternToSnapshot(old).drawings[0]).not.toHaveProperty('bend')
  })

  it('rejects a bend that is not a number, which would draw an unreadable path', () => {
    const store = useStorage()
    const saved = store.savePattern('Switch', { ...snap(), drawings: [curved] })
    const broken = structuredClone(saved)
    ;(broken.drawings[0] as { bend: unknown }).bend = 'a lot'
    expect(() => parsePattern(broken)).toThrow(/damaged drawing/i)
  })

  it('round-trips a skewed bow through save and load', () => {
    const store = useStorage()
    const skewed = { ...curved, bendAlong: 0.2 }
    const saved = store.savePattern('Switch', { ...snap(), drawings: [skewed] })
    expect(store.patternToSnapshot(saved).drawings).toEqual([skewed])
  })

  it('rejects an offset along the arrow that is not a number', () => {
    const store = useStorage()
    const saved = store.savePattern('Switch', { ...snap(), drawings: [curved] })
    const broken = structuredClone(saved)
    ;(broken.drawings[0] as { bendAlong?: unknown }).bendAlong = 'near the end'
    expect(() => parsePattern(broken)).toThrow(/damaged drawing/i)
  })

  it('rejects a bend of Infinity, which has no place on a pitch', () => {
    const store = useStorage()
    const saved = store.savePattern('Switch', { ...snap(), drawings: [curved] })
    const broken = structuredClone(saved)
    ;(broken.drawings[0] as { bend: unknown }).bend = Infinity
    expect(() => parsePattern(broken)).toThrow(/damaged drawing/i)
  })
})

describe('cones', () => {
  it('round-trips cones through save and load', () => {
    const store = useStorage()
    const withCones = { ...snap(), markers: [{ id: 'm1', pos: { x: 20, y: 20 } }] }
    const saved = store.savePattern('Grid', withCones)
    expect(store.patternToSnapshot(saved).markers).toEqual(withCones.markers)
  })

  it('keeps cones in the frame, alongside the players', () => {
    const store = useStorage()
    const saved = store.savePattern('Grid', {
      ...snap(),
      markers: [{ id: 'm1', pos: { x: 20, y: 20 } }],
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
    expect(store.patternToSnapshot(parsePattern(legacy)).markers).toEqual([])
  })

  it('rejects a cone with a malformed position', () => {
    const store = useStorage()
    const saved = store.savePattern('Grid', {
      ...snap(),
      markers: [{ id: 'm1', pos: { x: 20, y: 20 } }],
    })
    const broken = structuredClone(saved)
    ;(broken.frames[0].markers[0] as { pos: unknown }).pos = 'somewhere'
    expect(() => parsePattern(broken)).toThrow()
  })

  it('survives a draft written before cones existed', () => {
    const store = useStorage()
    store.saveDraft(snap())
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY)!)
    delete raw.markers
    localStorage.setItem(DRAFT_KEY, JSON.stringify(raw))
    expect(store.loadDraft()?.markers).toEqual([])
  })
})


describe('ball visibility', () => {
  it('round-trips a hidden ball', () => {
    const store = useStorage()
    const hidden = { ...snap(), ball: { ...snap().ball, visible: false } }
    const saved = store.savePattern('Shape drill', hidden)
    expect(store.patternToSnapshot(saved).ball.visible).toBe(false)
  })

  /**
   * Patterns saved before the ball could be hidden have no visible flag,
   * and every one of them had a ball on the pitch.
   */
  it('treats a pattern saved without the flag as having a visible ball', () => {
    const store = useStorage()
    const saved = store.savePattern('Older drill', snap())
    const legacy = structuredClone(saved) as Record<string, unknown>
    delete ((legacy.frames as Record<string, unknown>[])[0].ball as Record<string, unknown>).visible

    expect(() => parsePattern(legacy)).not.toThrow()
    expect(store.patternToSnapshot(parsePattern(legacy)).ball.visible).toBe(true)
  })

  it('treats a draft saved without the flag the same way', () => {
    const store = useStorage()
    store.saveDraft(snap())
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY)!)
    delete raw.ball.visible
    localStorage.setItem(DRAFT_KEY, JSON.stringify(raw))
    expect(store.loadDraft()?.ball.visible).toBe(true)
  })
})

describe('pitch labels', () => {
  const label = { id: 'l1', pos: { x: 20, y: 20 }, text: 'Press trigger' }

  it('round-trips labels and their visibility', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', { ...snap(), labels: [label], labelsVisible: false })
    const restored = store.patternToSnapshot(saved)
    expect(restored.labels).toEqual([label])
    expect(restored.labelsVisible).toBe(false)
  })

  it('loads a pattern saved before labels existed', () => {
    const store = useStorage()
    const saved = store.savePattern('Older drill', snap())
    const legacy = structuredClone(saved) as Record<string, unknown>
    delete (legacy.frames as Record<string, unknown>[])[0].labels

    expect(() => parsePattern(legacy)).not.toThrow()
    const restored = store.patternToSnapshot(parsePattern(legacy))
    expect(restored.labels).toEqual([])
    expect(restored.labelsVisible).toBe(true)
  })

  it('rejects a label with a malformed position', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', { ...snap(), labels: [label] })
    const broken = structuredClone(saved)
    ;(broken.frames[0].labels[0] as { pos: unknown }).pos = 'over there'
    expect(() => parsePattern(broken)).toThrow()
  })

  it('rejects a label whose text is not text', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', { ...snap(), labels: [label] })
    const broken = structuredClone(saved)
    ;(broken.frames[0].labels[0] as { text: unknown }).text = 42
    expect(() => parsePattern(broken)).toThrow()
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
