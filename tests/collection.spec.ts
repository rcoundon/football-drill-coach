import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readCollection, writeCollection, lastError } from '../src/composables/collection'

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
  lastError.value = null
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

    writeCollection(KEY, [...read.items, { id: 'b', n: 2 }], read.damaged)

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

    expect(writeCollection(KEY, [{ id: 'a', n: 1 }], [])).toBe(false)
    expect(lastError.value).toContain('out of space')

    vi.restoreAllMocks()
  })
})
