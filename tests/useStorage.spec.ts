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
    expect(saved.drawings).toBeUndefined()
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
    const future = { ...saved, version: 4 }
    expect(() => parsePattern(future)).toThrow(/different version/i)
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
      // The pre-version-3 shape is still read, so a damaged one is still refused.
      ['a damaged ball in the older single-ball shape', withFrame({ balls: undefined, ball: { attachedTo: null } })],
      ['neither a list of balls nor an older single one', withFrame({ balls: undefined, ball: undefined })],
      ['no drawings', withFrame({ drawings: undefined })],
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

  it('reads an older drill’s answer off the ball it kept it on', () => {
    const store = useStorage()
    const saved = store.savePattern('Older drill', snap())
    const legacy = structuredClone(saved) as Record<string, unknown>
    delete legacy.ballsVisible
    const frames = legacy.frames as Record<string, unknown>[]
    // The pre-version-3 shape: one ball on the frame, carrying the flag.
    frames[0].ball = { pos: { x: 50, y: 30 }, attachedTo: null, visible: false }
    delete frames[0].balls

    expect(store.patternToSnapshot(parsePattern(legacy)).ballsVisible).toBe(false)
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

describe('opening a pattern saved before playback existed', () => {
  it('reads its pattern-level drawings into the first frame', () => {
    const v1 = {
      id: 'p1',
      name: 'Old drill',
      version: 1,
      pitch: { type: 'full', rotated: false },
      drawings: [{ id: 'd1', kind: 'line', color: '#fff', from: { x: 0, y: 0 }, to: { x: 9, y: 9 } }],
      frames: [
        {
          counters: [{ id: 'c1', color: 'red', label: '', pos: { x: 10, y: 10 } }],
          markers: [],
          labels: [],
          balls: [{ id: 'b1', pos: { x: 50, y: 30 }, attachedTo: null }],
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    localStorage.setItem(PATTERNS_KEY, JSON.stringify([v1]))

    const storage = useStorage()
    const [pattern] = storage.listPatterns()
    const snap = storage.patternToSnapshot(pattern)

    expect(snap.frames).toHaveLength(1)
    expect(snap.frames[0].drawings).toHaveLength(1)
    expect(snap.frames[0].counters).toHaveLength(1)
    expect(snap.currentFrame).toBe(0)
  })

  it('is written back at the current version, with the drawings on the frame', () => {
    const storage = useStorage()
    const saved = storage.savePattern('Drill', {
      frames: [
        {
          counters: [],
          markers: [],
          labels: [],
          balls: [{ id: 'b1', pos: { x: 50, y: 30 }, attachedTo: null }],
          drawings: [{ id: 'd1', kind: 'line', color: '#fff', from: { x: 0, y: 0 }, to: { x: 9, y: 9 } }],
        },
      ],
      currentFrame: 0,
      labelsVisible: true,
      ballsVisible: true,
      notes: '',
      notesVisible: true,
      pitch: { type: 'blank', rotated: false },
    })

    expect(saved.version).toBe(3)
    expect(saved.drawings).toBeUndefined()
    expect(saved.frames[0].drawings).toHaveLength(1)
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

describe('restoring a draft saved before playback existed', () => {
  it('wraps the flat board into a single frame', () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        counters: [{ id: 'c1', color: 'red', label: '', pos: { x: 10, y: 10 } }],
        markers: [],
        labels: [],
        labelsVisible: true,
        ballsVisible: true,
        notes: 'old',
        notesVisible: true,
        balls: [{ id: 'b1', pos: { x: 50, y: 30 }, attachedTo: null }],
        drawings: [{ id: 'd1', kind: 'line', color: '#fff', from: { x: 0, y: 0 }, to: { x: 9, y: 9 } }],
        pitch: { type: 'blank', rotated: false },
      }),
    )

    const draft = useStorage().loadDraft()
    expect(draft).not.toBeNull()
    expect(draft!.frames).toHaveLength(1)
    expect(draft!.frames[0].counters).toHaveLength(1)
    expect(draft!.frames[0].drawings).toHaveLength(1)
    expect(draft!.notes).toBe('old')
    expect(draft!.currentFrame).toBe(0)
  })

  it('reads a framed draft straight back', () => {
    const storage = useStorage()
    storage.saveDraft({
      frames: [
        {
          counters: [],
          markers: [],
          labels: [],
          balls: [{ id: 'b1', pos: { x: 50, y: 30 }, attachedTo: null }],
          drawings: [],
        },
        {
          counters: [],
          markers: [],
          labels: [],
          balls: [{ id: 'b1', pos: { x: 50, y: 30 }, attachedTo: null }],
          drawings: [],
          duration: 250,
        },
      ],
      currentFrame: 1,
      labelsVisible: true,
      ballsVisible: true,
      notes: '',
      notesVisible: true,
      pitch: { type: 'blank', rotated: false },
    })
    const draft = storage.loadDraft()
    expect(draft!.frames).toHaveLength(2)
    expect(draft!.currentFrame).toBe(1)
  })

  it('still throws away a draft whose frame is damaged, rather than bricking the app', () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ frames: [{ counters: 'not an array' }], currentFrame: 0 }),
    )
    expect(useStorage().loadDraft()).toBeNull()
  })

  /**
   * The framed case above is already rejected by the pre-frames validator, so
   * it cannot tell a real check from a rubber stamp. A flat draft is the
   * shape this task actually taught the validator to read, so it needs its
   * own damaged case to prove that path still checks anything at all.
   */
  it('still throws away a flat draft with a damaged frame field', () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        counters: 'not an array',
        markers: [],
        labels: [],
        balls: [{ id: 'b1', pos: { x: 50, y: 30 }, attachedTo: null }],
        drawings: [],
        pitch: { type: 'blank', rotated: false },
      }),
    )
    expect(useStorage().loadDraft()).toBeNull()
  })

  /**
   * This one is rejected by `isValidPitch`, a guard that sits ABOVE the
   * flat/framed branch and applies to both shapes equally. It pins that
   * shared guard, not the flat branch itself — see the two cases below for
   * coverage of `isValidFrame` on the flat shape.
   */
  it('still throws away a draft with no pitch, flat or not', () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        counters: [],
        markers: [],
        labels: [],
        balls: [{ id: 'b1', pos: { x: 50, y: 30 }, attachedTo: null }],
        drawings: [],
      }),
    )
    expect(useStorage().loadDraft()).toBeNull()
  })

  /**
   * Ball and drawings are the two fields whose flat-versus-framed position
   * differs most, so they are the likeliest to be got wrong by a future
   * edit. Unlike the no-pitch case above, both of these are only caught by
   * `isValidFrame(value)` inside the flat branch itself: replacing that
   * branch with `return true` makes each of these load successfully instead
   * of returning null.
   */
  it('still throws away a flat draft with a damaged ball', () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        counters: [],
        markers: [],
        labels: [],
        ball: { attachedTo: null, visible: true },
        drawings: [],
        pitch: { type: 'blank', rotated: false },
      }),
    )
    expect(useStorage().loadDraft()).toBeNull()
  })

  it('still throws away a flat draft whose drawings are not an array', () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        counters: [],
        markers: [],
        labels: [],
        balls: [{ id: 'b1', pos: { x: 50, y: 30 }, attachedTo: null }],
        drawings: 'nope',
        pitch: { type: 'blank', rotated: false },
      }),
    )
    expect(useStorage().loadDraft()).toBeNull()
  })

  /**
   * `isValidFrame` never checked `duration` at all, so a hand-edited or
   * corrupted draft with `duration: 0` loaded straight through, past the
   * comment above it claiming this validator holds to the same standard as
   * `parsePattern` — which already rejects exactly this for a saved
   * pattern's frames. A restored `0` reaches `durationOf` and, through it,
   * divides the timeline by a duration that can never be reached.
   */
  it('still throws away a draft whose frame duration is not a positive number', () => {
    const framed = (duration: unknown) => ({
      frames: [
        {
          counters: [],
          markers: [],
          labels: [],
          balls: [{ id: 'b1', pos: { x: 50, y: 30 }, attachedTo: null }],
          drawings: [],
        },
        {
          counters: [],
          markers: [],
          labels: [],
          balls: [{ id: 'b1', pos: { x: 50, y: 30 }, attachedTo: null }],
          drawings: [],
          duration,
        },
      ],
      currentFrame: 1,
      labelsVisible: true,
      ballsVisible: true,
      notes: '',
      notesVisible: true,
      pitch: { type: 'blank', rotated: false },
    })

    for (const bad of [0, -100, Number.POSITIVE_INFINITY, 'soon']) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(framed(bad)))
      expect(useStorage().loadDraft()).toBeNull()
    }
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
 * A drill used to have exactly one ball, held as `frame.ball`, and its
 * visibility rode along on that object. Both change together in version 3:
 * a frame holds a list of balls, and whether they are shown is a drill-wide
 * setting like the labels and the notes.
 */
describe('opening a drill saved when there was only one ball', () => {
  const oneBallFrame = (visible = true) => ({
    counters: [{ id: 'c1', color: 'red', label: '', pos: { x: 10, y: 10 } }],
    markers: [],
    labels: [],
    ball: { pos: { x: 40, y: 20 }, attachedTo: 'c1', visible },
    drawings: [],
  })

  const v2 = (visible = true) => ({
    id: 'p-old',
    name: 'One ball drill',
    version: 2,
    pitch: { type: 'full', rotated: false },
    frames: [oneBallFrame(visible), oneBallFrame(visible)],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })

  it('makes its one ball the first of a list, keeping where it was and who had it', () => {
    localStorage.setItem('fct.patterns.v1', JSON.stringify([v2()]))
    const snap = useStorage().patternToSnapshot(useStorage().listPatterns()[0])

    expect(snap.frames[0].balls).toHaveLength(1)
    expect(snap.frames[0].balls[0].pos).toEqual({ x: 40, y: 20 })
    expect(snap.frames[0].balls[0].attachedTo).toBe('c1')
  })

  it('gives that ball an id, so playback can follow it between phases', () => {
    localStorage.setItem('fct.patterns.v1', JSON.stringify([v2()]))
    const snap = useStorage().patternToSnapshot(useStorage().listPatterns()[0])

    const first = snap.frames[0].balls[0].id
    expect(first).toBeTruthy()
    // The same ball in both phases, or a tween has nothing to match up.
    expect(snap.frames[1].balls[0].id).toBe(first)
  })

  it('lifts its visibility out to the drill, where it belongs', () => {
    localStorage.setItem('fct.patterns.v1', JSON.stringify([v2(false)]))
    const snap = useStorage().patternToSnapshot(useStorage().listPatterns()[0])

    expect(snap.ballsVisible).toBe(false)
    expect(snap.frames[0].balls[0]).not.toHaveProperty('visible')
  })

  it('is written back as version 3, with the balls on the phase', () => {
    const storage = useStorage()
    const saved = storage.savePattern('Rondo', {
      frames: [
        {
          counters: [],
          markers: [],
          labels: [],
          balls: [
            { id: 'b1', pos: { x: 10, y: 10 }, attachedTo: null },
            { id: 'b2', pos: { x: 30, y: 30 }, attachedTo: null },
          ],
          drawings: [],
        },
      ],
      currentFrame: 0,
      labelsVisible: true,
      ballsVisible: true,
      notes: '',
      notesVisible: true,
      pitch: { type: 'blank', rotated: false },
    })

    expect(saved.version).toBe(3)
    expect(saved.frames[0].balls).toHaveLength(2)
    expect(saved.ballsVisible).toBe(true)
  })

  it('round-trips several balls without losing one or muddling their carriers', () => {
    const storage = useStorage()
    const saved = storage.savePattern('Two lanes', {
      frames: [
        {
          counters: [{ id: 'c1', color: 'red', label: '', pos: { x: 5, y: 5 } }],
          markers: [],
          labels: [],
          balls: [
            { id: 'b1', pos: { x: 10, y: 10 }, attachedTo: 'c1' },
            { id: 'b2', pos: { x: 30, y: 30 }, attachedTo: null },
          ],
          drawings: [],
        },
      ],
      currentFrame: 0,
      labelsVisible: true,
      ballsVisible: false,
      notes: '',
      notesVisible: true,
      pitch: { type: 'blank', rotated: false },
    })

    const back = storage.patternToSnapshot(saved)
    expect(back.frames[0].balls.map((b) => b.id)).toEqual(['b1', 'b2'])
    expect(back.frames[0].balls[0].attachedTo).toBe('c1')
    expect(back.frames[0].balls[1].attachedTo).toBeNull()
    expect(back.ballsVisible).toBe(false)
  })

  it('still throws away a draft whose balls are damaged', () => {
    localStorage.setItem(
      'fct.draft.v1',
      JSON.stringify({
        frames: [{ counters: [], markers: [], labels: [], balls: 'not an array', drawings: [] }],
        currentFrame: 0,
        pitch: { type: 'blank', rotated: false },
      }),
    )
    expect(useStorage().loadDraft()).toBeNull()
  })
})
