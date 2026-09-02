import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createCollectionErrors, readCollection, writeCollection } from '../src/composables/collection'

type Thing = { id: string; n: number }

function parseThing(value: unknown): Thing {
  if (typeof value !== 'object' || value === null) throw new Error('not a thing')
  const thing = value as Record<string, unknown>
  if (typeof thing.id !== 'string' || typeof thing.n !== 'number') throw new Error('not a thing')
  return { id: thing.id, n: thing.n }
}

const KEY = 'test.things'

beforeEach(() => {
  localStorage.clear()
})

describe('readCollection', () => {
  it('reads an empty key as an empty collection', () => {
    expect(readCollection(KEY, parseThing)).toEqual({ items: [], unreadable: false, damaged: [] })
  })

  it('calls bad JSON unreadable rather than empty', () => {
    localStorage.setItem(KEY, '{oh no')
    expect(readCollection(KEY, parseThing).unreadable).toBe(true)
  })

  it('calls a non-array unreadable', () => {
    localStorage.setItem(KEY, '{"not":"an array"}')
    expect(readCollection(KEY, parseThing).unreadable).toBe(true)
  })

  it('separates the rows it cannot parse from the ones it can', () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: 'a', n: 1 }, { broken: true }]))
    const read = readCollection(KEY, parseThing)

    expect(read.items).toEqual([{ id: 'a', n: 1 }])
    expect(read.damaged).toEqual([{ broken: true }])
    expect(read.unreadable).toBe(false)
  })
})

describe('writeCollection', () => {
  it('puts damaged rows back so they survive a write', () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: 'a', n: 1 }, { broken: true }]))
    const read = readCollection(KEY, parseThing)
    const errors = createCollectionErrors()

    writeCollection(errors, KEY, [...read.items, { id: 'b', n: 2 }], read.damaged)

    const raw = JSON.parse(localStorage.getItem(KEY)!)
    expect(raw).toContainEqual({ broken: true })
    expect(raw).toContainEqual({ id: 'b', n: 2 })
  })

  it('reports a quota failure rather than throwing', () => {
    // jsdom's Storage is a legacy platform object: assigning
    // `localStorage.setItem = fn` directly is silently dropped, so the
    // override has to go through the prototype, same as useStorage.spec.ts.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const error = new Error('full')
      error.name = 'QuotaExceededError'
      throw error
    })

    const errors = createCollectionErrors()
    expect(writeCollection(errors, KEY, [{ id: 'a', n: 1 }], [])).toBe(false)
    expect(errors.lastError.value).toContain('out of space')

    vi.restoreAllMocks()
  })

  /**
   * The bug this plan shipped once: a single module-level `lastError` meant
   * one collection's read or write could erase another's unresolved
   * warning. Two independent `createCollectionErrors()` pairs must not
   * touch each other at all.
   */
  it('keeps two collections error state independent', () => {
    const a = createCollectionErrors()
    const b = createCollectionErrors()

    a.lastError.value = 'Collection A is damaged.'
    b.lastError.value = null

    expect(a.lastError.value).toBe('Collection A is damaged.')
    expect(b.lastError.value).toBeNull()
  })
})
