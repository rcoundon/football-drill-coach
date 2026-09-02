import type { Session, SessionEntry } from '../types'
import {
  lastError,
  lastWriteSucceeded,
  readCollection,
  recordWrite,
  writeCollection,
} from './collection'

export const SESSIONS_KEY = 'fct.sessions.v1'

const SESSION_VERSION = 1

const UNREADABLE_MESSAGE =
  'Your saved sessions could not be read, so saving now would overwrite them. Export or clear them first, then try again.'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Minutes are held to what a frame's duration is held to: a finite number
 * above zero. It is the same kind of value with the same failure if it is
 * not one.
 */
function isValidEntry(value: unknown): value is SessionEntry {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.patternId === 'string' &&
    typeof value.minutes === 'number' &&
    Number.isFinite(value.minutes) &&
    value.minutes > 0
  )
}

export function parseSession(value: unknown): Session {
  if (!isObject(value)) throw new Error('That is not a saved session.')
  if (value.version !== SESSION_VERSION) {
    throw new Error('That session was saved by a different version of this app.')
  }
  if (typeof value.id !== 'string' || typeof value.name !== 'string') {
    throw new Error('That session is missing its name or id.')
  }
  if (!Array.isArray(value.entries) || !value.entries.every(isValidEntry)) {
    throw new Error('That session has a damaged drill.')
  }
  return value as unknown as Session
}

function read() {
  return readCollection(SESSIONS_KEY, parseSession)
}

function nowIso(): string {
  return new Date().toISOString()
}

function makeId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function newEntry(patternId: string, minutes: number): SessionEntry {
  return { id: makeId('e'), patternId, minutes }
}

/**
 * Write the sessions back, refusing when the store could not be read.
 *
 * Every mutator funnels through here so none of them can be the one that
 * forgets to check, which would destroy sessions the code merely failed to
 * parse.
 */
function mutate(change: (sessions: Session[]) => void): boolean {
  lastError.value = null
  const { items, unreadable, damaged } = read()
  if (unreadable) {
    lastError.value = UNREADABLE_MESSAGE
    lastWriteSucceeded.value = false
    return false
  }
  change(items)
  const ok = writeCollection(SESSIONS_KEY, items, damaged)
  if (recordWrite(ok, damaged)) {
    lastError.value = `${damaged.length} saved session(s) could not be read. They have been left untouched so they can be recovered.`
  }
  // `recordWrite` answers whether damaged rows rode along, not whether the
  // write landed — a quota failure would otherwise be reported as success.
  return ok
}

function listSessions(): Session[] {
  lastError.value = null
  const { items, unreadable, damaged } = read()
  if (unreadable) {
    lastError.value =
      'Your saved sessions could not be read. The stored data has been left untouched so it can be recovered.'
    return []
  }
  if (damaged.length > 0) {
    lastError.value = `${damaged.length} saved session(s) could not be read. They have been left untouched so they can be recovered.`
  }
  return items
}

function createSession(name: string): Session {
  const session: Session = {
    id: makeId('s'),
    name,
    version: SESSION_VERSION,
    entries: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  mutate((sessions) => sessions.push(session))
  return session
}

function saveSession(session: Session): void {
  mutate((sessions) => {
    const next = { ...session, updatedAt: nowIso() }
    const index = sessions.findIndex((s) => s.id === session.id)
    if (index === -1) sessions.push(next)
    else sessions[index] = next
  })
}

/**
 * Write a whole list of sessions in one read-modify-write cycle, upserting
 * each by id.
 *
 * Exists for the bundle importer: it remaps every incoming entry's
 * `patternId` through an old-id-to-new-id map and then has a batch of
 * sessions to land, not one to save. Calling `saveSession` in a loop would
 * do that as N separate writes — a quota failure partway through would leave
 * the bundle half-saved with nothing to say so, and each write would apply
 * to whatever the previous one left behind rather than to one consistent
 * snapshot of the store.
 */
function saveSessions(incoming: Session[]): void {
  mutate((sessions) => {
    for (const session of incoming) {
      const next = { ...session, updatedAt: nowIso() }
      const index = sessions.findIndex((s) => s.id === session.id)
      if (index === -1) sessions.push(next)
      else sessions[index] = next
    }
  })
}

function deleteSession(id: string): void {
  mutate((sessions) => {
    const index = sessions.findIndex((s) => s.id === id)
    if (index !== -1) sessions.splice(index, 1)
  })
}

function renameSession(id: string, name: string): void {
  mutate((sessions) => {
    const session = sessions.find((s) => s.id === id)
    if (session) {
      session.name = name
      session.updatedAt = nowIso()
    }
  })
}

/**
 * Every session holding this drill, once each however many times it appears.
 *
 * Backs the warning shown before a drill is deleted. It reads one key at a
 * moment the coach has already paused over a confirmation, so its cost does
 * not matter.
 */
function sessionsUsing(patternId: string): Session[] {
  return read().items.filter((session) =>
    session.entries.some((entry) => entry.patternId === patternId),
  )
}

/**
 * How long the session runs, counting only drills that still exist.
 *
 * A missing drill contributes nothing: it will not be run, and it is not in
 * the PDF, so counting its minutes would promise the coach time they are not
 * going to spend.
 */
function totalMinutes(session: Session, known: Set<string>): number {
  return session.entries
    .filter((entry) => known.has(entry.patternId))
    .reduce((sum, entry) => sum + entry.minutes, 0)
}

const api = {
  listSessions,
  createSession,
  saveSession,
  saveSessions,
  deleteSession,
  renameSession,
  sessionsUsing,
  totalMinutes,
  newEntry,
  lastError,
  lastWriteSucceeded,
}

export function useSessions() {
  return api
}
