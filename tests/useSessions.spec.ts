import { describe, it, expect, beforeEach } from 'vitest'
import { useSessions, SESSIONS_KEY } from '../src/composables/useSessions'
import { useStorage } from '../src/composables/useStorage'
import type { Session } from '../src/types'

const sessions = useSessions()

beforeEach(() => {
  localStorage.clear()
  sessions.lastError.value = null
})

function withEntries(session: Session, entries: Array<{ patternId: string; minutes: number }>) {
  const full = { ...session, entries: entries.map((e, i) => ({ id: `e${i}`, ...e })) }
  sessions.saveSession(full)
  return full
}

describe('sessions storage', () => {
  it('starts empty', () => {
    expect(sessions.listSessions()).toEqual([])
  })

  it('round trips a session', () => {
    const created = sessions.createSession('Tuesday U12')
    withEntries(created, [{ patternId: 'p1', minutes: 12 }])

    const [read] = sessions.listSessions()
    expect(read.name).toBe('Tuesday U12')
    expect(read.entries).toEqual([{ id: 'e0', patternId: 'p1', minutes: 12 }])
    expect(read.version).toBe(1)
  })

  it('gives every entry its own id, so a drill can appear twice', () => {
    const created = sessions.createSession('Tuesday')
    const full = withEntries(created, [
      { patternId: 'p1', minutes: 10 },
      { patternId: 'p1', minutes: 5 },
    ])

    const ids = full.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('carries a damaged row through a write rather than dropping it', () => {
    const created = sessions.createSession('Tuesday')
    const raw = JSON.parse(localStorage.getItem(SESSIONS_KEY)!)
    raw.push({ garbage: true })
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(raw))

    sessions.renameSession(created.id, 'Wednesday')

    const after = JSON.parse(localStorage.getItem(SESSIONS_KEY)!)
    expect(after).toContainEqual({ garbage: true })
    expect(sessions.listSessions()[0].name).toBe('Wednesday')
  })

  it('refuses to write over a store it could not read', () => {
    localStorage.setItem(SESSIONS_KEY, '{not json')

    sessions.createSession('Tuesday')

    expect(localStorage.getItem(SESSIONS_KEY)).toBe('{not json')
    expect(sessions.lastError.value).toContain('could not be read')
  })

  it('rejects an entry whose minutes are not a positive number', () => {
    sessions.createSession('Tuesday')
    const raw = JSON.parse(localStorage.getItem(SESSIONS_KEY)!)
    raw[0].entries = [{ id: 'e0', patternId: 'p1', minutes: 0 }]
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(raw))

    expect(sessions.listSessions()).toEqual([])
  })

  it('deletes', () => {
    const created = sessions.createSession('Tuesday')
    sessions.deleteSession(created.id)
    expect(sessions.listSessions()).toEqual([])
  })
})

describe('sessionsUsing', () => {
  it('finds every session holding a drill, counting it once per session', () => {
    const a = sessions.createSession('Tuesday')
    withEntries(a, [{ patternId: 'p1', minutes: 10 }, { patternId: 'p1', minutes: 5 }])
    const b = sessions.createSession('Thursday')
    withEntries(b, [{ patternId: 'p2', minutes: 10 }])

    expect(sessions.sessionsUsing('p1').map((s) => s.name)).toEqual(['Tuesday'])
    expect(sessions.sessionsUsing('p3')).toEqual([])
  })
})

describe('totalMinutes', () => {
  it('counts only the drills that still exist', () => {
    const created = sessions.createSession('Tuesday')
    const full = withEntries(created, [
      { patternId: 'p1', minutes: 12 },
      { patternId: 'gone', minutes: 20 },
    ])

    expect(sessions.totalMinutes(full, new Set(['p1']))).toBe(12)
  })
})

describe('saveSessions', () => {
  // Task 5 imports a whole bundle of patterns and sessions from one file,
  // remapping patternIds through an old-id-to-new-id map before writing.
  // That must land as one write, not one `saveSession` call per session —
  // otherwise a quota failure partway through leaves some of the bundle
  // saved and the rest silently missing.
  it('writes several new sessions in a single call', () => {
    const a: Session = {
      id: 'sa',
      name: 'Tuesday',
      version: 1,
      entries: [],
      createdAt: 'now',
      updatedAt: 'now',
    }
    const b: Session = {
      id: 'sb',
      name: 'Thursday',
      version: 1,
      entries: [],
      createdAt: 'now',
      updatedAt: 'now',
    }

    sessions.saveSessions([a, b])

    expect(sessions.listSessions().map((s) => s.name).sort()).toEqual(['Thursday', 'Tuesday'])
  })

  it('upserts by id rather than duplicating an existing session', () => {
    const created = sessions.createSession('Tuesday')
    sessions.saveSessions([{ ...created, name: 'Renamed via bundle' }])

    const all = sessions.listSessions()
    expect(all.length).toBe(1)
    expect(all[0].name).toBe('Renamed via bundle')
  })

  it('carries damaged rows through a bulk write rather than dropping them', () => {
    sessions.createSession('Tuesday')
    const raw = JSON.parse(localStorage.getItem(SESSIONS_KEY)!)
    raw.push({ garbage: true })
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(raw))

    sessions.saveSessions([
      { id: 'sb', name: 'Thursday', version: 1, entries: [], createdAt: 'now', updatedAt: 'now' },
    ])

    const after = JSON.parse(localStorage.getItem(SESSIONS_KEY)!)
    expect(after).toContainEqual({ garbage: true })
  })

  it('refuses a bulk write over a store it could not read', () => {
    localStorage.setItem(SESSIONS_KEY, '{not json')

    sessions.saveSessions([
      { id: 'sb', name: 'Thursday', version: 1, entries: [], createdAt: 'now', updatedAt: 'now' },
    ])

    expect(localStorage.getItem(SESSIONS_KEY)).toBe('{not json')
    expect(sessions.lastError.value).toContain('could not be read')
  })
})

/**
 * The bug SessionLibrary shipped: its `refresh()` calls
 * `sessions.listSessions()` then `storage.listPatterns()`. Both used to read
 * the exact same module-level `lastError` ref, so a healthy patterns read
 * unconditionally set `lastError.value = null` and erased the damaged-session
 * warning the line above had just set — every single time the Sessions panel
 * opened or refreshed. This pins the two stores' errors as independent.
 */
describe('the sessions store error, beside the patterns store', () => {
  it('is not clobbered by a healthy listPatterns() call that follows it', () => {
    const storage = useStorage()
    storage.lastError.value = null

    sessions.createSession('Tuesday')
    const raw = JSON.parse(localStorage.getItem(SESSIONS_KEY)!)
    raw.push({ garbage: true })
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(raw))

    // Mirrors SessionLibrary.refresh(): read the damaged sessions collection,
    // then read the (healthy) patterns collection.
    expect(sessions.listSessions()[0]).toBeDefined()
    expect(sessions.lastError.value).toContain('could not be read')

    storage.listPatterns()

    expect(sessions.lastError.value).toContain('could not be read')
  })
})
