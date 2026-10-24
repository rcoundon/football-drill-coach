import type { Session, SessionEntry } from '../types'
import { parseWith, SessionSchema } from '../schema'
import {
  createCollectionErrors,
  damagedMessage,
  discardUnreadable,
  readCollection,
  recordWrite,
  unreadableText,
  writeCollection,
} from './collection'

export const SESSIONS_KEY = 'fct.sessions.v1'

/**
 * This store's own error pair — not shared with the patterns store. See the
 * comment on `CollectionErrors` in collection.ts: a single module-level pair
 * meant a healthy `listPatterns()` silently erased a damaged-session warning
 * this store had just set, on every open of the Sessions panel.
 */
const errors = createCollectionErrors()
const { lastError, lastWriteSucceeded } = errors

const SESSION_VERSION = 1

const UNREADABLE_MESSAGE =
  'Your saved sessions could not be read, so saving now would overwrite them. Export or clear them first, then try again.'

/** Validate an untrusted value as a Session. The shape lives in schema.ts. */
export function parseSession(value: unknown): Session {
  return parseWith(SessionSchema, 'session', value)
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
  const ok = writeCollection(errors, SESSIONS_KEY, items, damaged)
  if (recordWrite(errors, ok, damaged)) {
    lastError.value = damagedMessage(damaged.length, 'session')
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
    lastError.value = damagedMessage(damaged.length, 'session')
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
  saveSessions([session])
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
 * Every session holding this drill, once each however many times it appears,
 * alongside whether the sessions store could be read at all.
 *
 * Backs the warning shown before a drill is deleted. It reads one key at a
 * moment the coach has already paused over a confirmation, so its cost does
 * not matter. `unreadable` matters just as much as the matches: an unreadable
 * store used to come back as an empty array indistinguishable from "no
 * session uses this drill", which is exactly the moment the caller cannot
 * know that.
 */
function sessionsUsing(patternId: string): { sessions: Session[]; unreadable: boolean } {
  const { items, unreadable } = read()
  return {
    sessions: items.filter((session) =>
      session.entries.some((entry) => entry.patternId === patternId),
    ),
    unreadable,
  }
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

/** The saved sessions the app could not read, as stored, or null if none. */
function unreadableSessions(): string | null {
  return unreadableText(SESSIONS_KEY, parseSession)
}

/** Drop the saved sessions the app could not read; every readable one stays. */
function discardUnreadableSessions(): boolean {
  return discardUnreadable(errors, SESSIONS_KEY, parseSession)
}

const api = {
  listSessions,
  unreadableSessions,
  discardUnreadableSessions,
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
