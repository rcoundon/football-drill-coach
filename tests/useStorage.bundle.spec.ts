import { describe, it, expect, beforeEach } from 'vitest'
import { PATTERNS_KEY, useStorage } from '../src/composables/useStorage'
import { SESSIONS_KEY, useSessions } from '../src/composables/useSessions'
import { __resetBoardForTests, useBoard } from '../src/composables/useBoard'

const storage = useStorage()
const sessions = useSessions()

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
})

function bundleOfOneSession() {
  const pattern = storage.savePattern('Rondo', useBoard().snapshot())
  const session = sessions.createSession('Tuesday')
  sessions.saveSession({ ...session, entries: [sessions.newEntry(pattern.id, 12)] })
  return { json: storage.exportBundleJson(storage.listPatterns(), sessions.listSessions()), patternId: pattern.id }
}

describe('bundle export and import', () => {
  it('writes both collections', () => {
    const { json } = bundleOfOneSession()
    const raw = JSON.parse(json)

    expect(raw.patterns).toHaveLength(1)
    expect(raw.sessions).toHaveLength(1)
  })

  it('round trips into an empty library', () => {
    const { json } = bundleOfOneSession()
    localStorage.clear()

    storage.importBundle(json)

    expect(storage.listPatterns()).toHaveLength(1)
    expect(sessions.listSessions()[0].entries[0].patternId).toBe(storage.listPatterns()[0].id)
  })

  it('re-ids a colliding pattern and follows it through the session', () => {
    const { json, patternId } = bundleOfOneSession()

    // Import onto a library that already holds that exact id.
    storage.importBundle(json)

    const patterns = storage.listPatterns()
    expect(patterns).toHaveLength(2)

    const added = patterns.find((p) => p.id !== patternId)!
    const imported = sessions.listSessions().find((s) => s.entries[0].patternId === added.id)

    expect(imported).toBeTruthy()
    expect(added.id).not.toBe(patternId)
  })

  it('refuses a bare array, which is not a bundle', () => {
    expect(() => storage.importBundle('[]')).toThrow(/not a saved bundle/i)
  })

  it('writes nothing when the sessions store cannot be read', () => {
    const { json } = bundleOfOneSession()
    const patternsBefore = localStorage.getItem(PATTERNS_KEY)
    localStorage.setItem(SESSIONS_KEY, '{not json')

    expect(() => storage.importBundle(json)).toThrow(/sessions could not be read/i)

    // Both stores untouched: the check runs before either write, so a bad
    // sessions store cannot leave patterns imported and sessions destroyed.
    expect(localStorage.getItem(SESSIONS_KEY)).toBe('{not json')
    expect(localStorage.getItem(PATTERNS_KEY)).toBe(patternsBefore)
  })

  it('re-ids the second of two sessions sharing an id within one file', () => {
    const { json } = bundleOfOneSession()
    const raw = JSON.parse(json)
    raw.sessions.push({ ...raw.sessions[0] })
    localStorage.clear()

    const { sessions: added } = storage.importBundle(JSON.stringify(raw))

    expect(new Set(added.map((s) => s.id)).size).toBe(2)
  })

  it('refuses invalid JSON with a readable reason', () => {
    expect(() => storage.importBundle('{oh no')).toThrow(/not valid JSON/i)
  })
})
