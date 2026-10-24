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

  it('reads standard base64, whose + the fragment parser turns into a space', async () => {
    const json = '{"a":">>>"}'
    const standard = btoa(json)
    expect(standard).toContain('+')

    const request = readImportRequest({ hash: `#import=${standard}`, search: '' })
    expect(request).toMatchObject({ kind: 'inline' })
    const payload = (request as { payload: string }).payload
    expect(payload).toContain(' ')
    expect(await decodeImportPayload(payload)).toBe(json)
  })

  it('ignores line breaks and tabs a chat app wrapped the link with', async () => {
    const json = '{"a":">>>"}'
    const wrapped = btoa(json).replace(/(.{4})/g, '$1\r\n\t')
    expect(await decodeImportPayload(wrapped)).toBe(json)
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

  it('refuses a file that says it is too large, without reading it', async () => {
    const response = new Response('{}', { headers: { 'content-length': '6000000' } })
    const read = vi.spyOn(response, 'text')
    vi.stubGlobal('fetch', vi.fn(async () => response))
    await expect(fetchImport('https://example.com/d.json')).rejects.toThrow('too large')
    expect(read).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('stops reading a file once it passes the limit, counting bytes', async () => {
    // 2.5 million two-byte characters: under the limit in characters,
    // over it in bytes, and sent with no length to check up front.
    const chunk = new TextEncoder().encode('é'.repeat(500_000))
    let pulled = 0
    const cancel = vi.fn()
    const { ReadableStream } = await import('node:stream/web')
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++
        if (pulled > 10) controller.close()
        else controller.enqueue(chunk)
      },
      cancel,
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body as unknown as BodyInit)))
    await expect(fetchImport('https://example.com/d.json')).rejects.toThrow('too large')
    expect(cancel).toHaveBeenCalled()
    expect(pulled).toBeLessThanOrEqual(7)
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
