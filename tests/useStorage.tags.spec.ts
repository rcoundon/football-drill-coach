import { describe, it, expect, beforeEach } from 'vitest'
import { useStorage, normaliseTags, PATTERNS_KEY } from '../src/composables/useStorage'
import { __resetBoardForTests, useBoard } from '../src/composables/useBoard'

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
