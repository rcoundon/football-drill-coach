import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest'
import {
  decodeImportPayload,
  encodeImportPayload,
  fetchImport,
  readImportRequest,
  reviewImport,
} from '../src/importLink'
import demoDrills from '../docs/demo-drills.json'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('readImportRequest', () => {
  it('reads drills carried in the fragment', () => {
    expect(readImportRequest({ hash: '#import=abc', search: '' })).toEqual({ kind: 'inline', payload: 'abc' })
  })

  it('reads a file address from the query', () => {
    expect(readImportRequest({ hash: '', search: '?import=https://example.com/d.json' })).toEqual({
      kind: 'url',
      url: 'https://example.com/d.json',
    })
  })

  it('is null for an ordinary visit', () => {
    expect(readImportRequest({ hash: '', search: '' })).toBeNull()
  })
})

describe('import payloads', () => {
  // Every browser the board runs in has these; jsdom does not, so Node's own
  // stand in for it here.
  beforeAll(async () => {
    const web = await import('node:stream/web')
    vi.stubGlobal('CompressionStream', web.CompressionStream)
    vi.stubGlobal('DecompressionStream', web.DecompressionStream)
  })
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips a gzipped file, non-ASCII text included', async () => {
    const json = JSON.stringify({ ...demoDrills, note: 'Coaches’ notes — ½ pitch' })
    const payload = await encodeImportPayload(json)
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(await decodeImportPayload(payload)).toBe(json)
  })

  it('reads plain, ungzipped base64url as well', async () => {
    const bytes = new TextEncoder().encode('{"patterns":[],"sessions":[]}')
    const payload = btoa(String.fromCharCode(...bytes)).replace(/=+$/, '')
    expect(await decodeImportPayload(payload)).toBe('{"patterns":[],"sessions":[]}')
  })

  it('reports a payload that is not base64 at all', async () => {
    await expect(decodeImportPayload('%%%')).rejects.toThrow('could not be decoded')
  })
})

describe('fetchImport', () => {
  it('refuses a plain-http address on another site', async () => {
    await expect(fetchImport('http://example.com/d.json')).rejects.toThrow('https://')
  })

  it('fetches without cookies and returns the text', async () => {
    const fetchMock = vi.fn(async () => new Response('{"patterns":[],"sessions":[]}'))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchImport('https://example.com/d.json')).toBe('{"patterns":[],"sessions":[]}')
    expect((fetchMock.mock.calls[0] as unknown[])[1]).toEqual({ credentials: 'omit' })
    vi.unstubAllGlobals()
  })
})

describe('reviewImport', () => {
  it('summarises the drills and sessions in a file', () => {
    const review = reviewImport(JSON.stringify(demoDrills), 'link')
    expect(review.patterns).toHaveLength(6)
    expect(review.sessions[0]).toMatchObject({ name: 'Tuesday: Possession and Pressing', drills: 5, minutes: 75 })
    expect(review.lint.refused).toBe(false)
  })

  it('refuses text that is not JSON', () => {
    expect(reviewImport('not json', 'file').lint).toMatchObject({ refused: true })
  })
})
