import { describe, it, expect, beforeEach } from 'vitest'
import { useStorage, normaliseTags, matchesTags, PATTERNS_KEY } from '../src/composables/useStorage'
import { __resetBoardForTests, useBoard } from '../src/composables/useBoard'
import type { Pattern } from '../src/types'

const storage = useStorage()

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
})

function save(name: string) {
  return storage.savePattern(name, useBoard().snapshot())
}

describe('normaliseTags', () => {
  it('trims, lowercases and deduplicates', () => {
    expect(normaliseTags([' Rondo ', 'rondo', 'PRESSING'])).toEqual(['rondo', 'pressing'])
  })

  it('drops empties', () => {
    expect(normaliseTags(['', '   ', 'rondo'])).toEqual(['rondo'])
  })

  it('keeps the order they were given in', () => {
    expect(normaliseTags(['warm up', 'rondo'])).toEqual(['warm up', 'rondo'])
  })
})

describe('tags on a pattern', () => {
  it('reads a pattern with no tags as having none', () => {
    const saved = save('Rondo')
    expect(storage.listPatterns()[0].tags ?? []).toEqual([])
    expect(saved.tags ?? []).toEqual([])
  })

  it('stores tags normalised', () => {
    const saved = save('Rondo')
    storage.setTags(saved.id, [' Rondo ', 'RONDO', 'warm up'])

    expect(storage.listPatterns()[0].tags).toEqual(['rondo', 'warm up'])
  })

  it('gathers every tag in use, sorted, without duplicates', () => {
    const a = save('Rondo')
    const b = save('Pressing trap')
    storage.setTags(a.id, ['rondo', 'warm up'])
    storage.setTags(b.id, ['pressing', 'rondo'])

    expect(storage.allTags()).toEqual(['pressing', 'rondo', 'warm up'])
  })

  it('refuses a pattern whose tags are not strings', () => {
    const saved = save('Rondo')
    const raw = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    raw[0].tags = [1, 2]
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(raw))

    // The damaged row is carried, not read: the library reports it and
    // returns the rest.
    expect(storage.listPatterns()).toHaveLength(0)
    expect(storage.lastError.value).toContain('could not be read')
    expect(saved.id).toBeTruthy()
  })

  it('leaves a rename alone', () => {
    const saved = save('Rondo')
    storage.setTags(saved.id, ['rondo'])
    storage.renamePattern(saved.id, 'Rondo 4v2')

    expect(storage.listPatterns()[0].tags).toEqual(['rondo'])
  })

  it('saving the board over a tagged drill keeps its tags', () => {
    const first = save('Rondo')
    storage.setTags(first.id, ['rondo', 'warm up'])
    const again = storage.savePattern('Rondo', useBoard().snapshot(), first.id)

    expect(again.tags).toEqual(['rondo', 'warm up'])
    expect(storage.listPatterns()[0].tags).toEqual(['rondo', 'warm up'])
  })
})

/**
 * `matchesTags` only reads `tags`, so a bare object is enough to exercise it —
 * no need to round-trip through the board or localStorage.
 */
function withTags(tags?: string[]): Pattern {
  return { tags } as Pattern
}

describe('matchesTags', () => {
  it('matches every drill when nothing is selected, tagged or not', () => {
    expect(matchesTags(withTags(['rondo']), [])).toBe(true)
    expect(matchesTags(withTags(undefined), [])).toBe(true)
  })

  it('matches a drill carrying the one chosen tag', () => {
    expect(matchesTags(withTags(['rondo', 'u12']), ['rondo'])).toBe(true)
  })

  it('rejects a drill missing the one chosen tag', () => {
    expect(matchesTags(withTags(['pressing']), ['rondo'])).toBe(false)
  })

  it('matches a drill carrying both chosen tags', () => {
    expect(matchesTags(withTags(['rondo', 'u12', 'warm up']), ['rondo', 'u12'])).toBe(true)
  })

  it('rejects a drill missing one of two chosen tags', () => {
    expect(matchesTags(withTags(['rondo']), ['rondo', 'u12'])).toBe(false)
  })

  it('treats a drill with no tags as matching only an empty selection', () => {
    expect(matchesTags(withTags(undefined), ['rondo'])).toBe(false)
  })
})
