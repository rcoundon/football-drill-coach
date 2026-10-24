import type { Pattern, Session } from '../types'
import type { BoardSnapshot } from './useBoard'
import { parseWith, PatternSchema, SnapshotSchema } from '../schema'
import {
  createCollectionErrors,
  damagedMessage,
  discardUnreadable,
  readCollection,
  recordWrite,
  unreadableText,
  writeCollection,
  writeRaw,
} from './collection'
import { parseSession, SESSIONS_KEY, useSessions } from './useSessions'
import starterEndzone from '../starter/endzone.json'

const sessions = useSessions()

/**
 * This store's own error pair — not shared with the sessions store. See the
 * comment on `CollectionErrors` in collection.ts for why that matters: it
 * used to be one module-level ref pair, and a healthy `listPatterns()` read
 * was silently erasing a damaged-session warning the sessions store had just
 * set, every time the Sessions panel opened.
 */
const errors = createCollectionErrors()
const { lastError, lastWriteSucceeded } = errors

export const PATTERNS_KEY = 'fct.patterns.v1'
export const DRAFT_KEY = 'fct.draft.v1'

const SCHEMA_VERSION = 3

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}


/**
 * Tags as they are stored: trimmed, lowercased, deduplicated, empties gone.
 *
 * Order is the coach's, not alphabetical — they typed it in the order they
 * think about the drill. `allTags` sorts for the filter row, where the order
 * is the app's business rather than theirs.
 */
export function normaliseTags(input: string[]): string[] {
  const out: string[] = []
  for (const raw of input) {
    const tag = raw.trim().toLowerCase()
    if (tag && !out.includes(tag)) out.push(tag)
  }
  return out
}

/**
 * Whether a drill carries every one of the coach's chosen tags. Lives here
 * rather than in a component so the filter row and the library panel share
 * one definition of what "matches" means.
 *
 * Takes only `tags`, not a whole `Pattern`, because that is all it reads —
 * the honest signature means a rename of `Pattern.tags` cannot slip past a
 * call site that only ever built `{ tags }`.
 */
/**
 * A tag list with one tag flipped in or out.
 *
 * Shared because both chip rows do it — the library's filter and the save
 * prompt's — and two spellings of "on if it was off" is how the two come to
 * behave differently under the same finger.
 */
export function toggleTag(tags: string[], tag: string): string[] {
  return tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]
}

export function matchesTags(pattern: Pick<Pattern, 'tags'>, selected: string[]): boolean {
  return selected.every((tag) => (pattern.tags ?? []).includes(tag))
}

/**
 * Validate an untrusted value as a Pattern. Throws with a readable reason.
 *
 * The shape itself lives in schema.ts, shared with the draft, the import
 * and the published JSON Schema; this is the library's name for it. Fields
 * a drill may leave out come back filled in with their defaults.
 */
export function parsePattern(value: unknown): Pattern {
  return parseWith(PatternSchema, 'pattern', value)
}

const UNREADABLE_LIBRARY_MESSAGE =
  'Your saved patterns could not be read, so saving now would overwrite them. Export or clear your saved patterns first, then try again.'

/**
 * Read the library through the shared collection helper. A thin wrapper
 * rather than a call site rename, so `patterns`/`unreadable`/`damaged` stay
 * the names every function below already reads.
 */
function readLibrary() {
  const { items, unreadable, damaged } = readCollection(PATTERNS_KEY, parsePattern)
  return { patterns: items, unreadable, damaged }
}

/**
 * Write the library back, damaged rows included, through the shared
 * collection helper. Every write goes through here so no code path can drop
 * a row it merely failed to understand.
 */
function writeLibrary(patterns: Pattern[], damaged: unknown[]): boolean {
  return writeCollection(errors, PATTERNS_KEY, patterns, damaged)
}

/**
 * Give a library that has never been written one drill to start from, so
 * the first Open shows a worked example rather than an empty list.
 *
 * Keyed on the key being absent, not on the list being empty: a coach who
 * deleted their last drill has an empty library on purpose, and finding the
 * starter back would read as the app refusing to let go of it. Nothing is
 * written over a library that exists in any state, readable or not.
 *
 * True when the starter was filed.
 */
function seedStarterLibrary(): boolean {
  if (localStorage.getItem(PATTERNS_KEY) !== null) return false
  const starter = parsePattern(starterEndzone)
  return writeLibrary([starter], [])
}

function listPatterns(): Pattern[] {
  lastError.value = null
  const { patterns, unreadable, damaged } = readLibrary()

  if (unreadable) {
    lastError.value =
      'Your saved patterns could not be read. The stored data has been left untouched so it can be recovered.'
    return []
  }

  if (damaged.length > 0) lastError.value = damagedMessage(damaged.length, 'pattern')
  return patterns
}

function nowIso(): string {
  return new Date().toISOString()
}

function makeId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function toPattern(name: string, snap: BoardSnapshot, id: string, createdAt: string): Pattern {
  const copy = structuredClone(snap)
  return {
    id,
    name,
    version: SCHEMA_VERSION,
    pitch: copy.pitch,
    frames: copy.frames,
    labelsVisible: copy.labelsVisible ?? true,
    counterLabelsVisible: copy.counterLabelsVisible ?? true,
    ballsVisible: copy.ballsVisible ?? true,
    notes: copy.notes ?? '',
    notesVisible: copy.notesVisible ?? true,
    goals: copy.goals ?? [],
    tags: [],
    createdAt,
    updatedAt: nowIso(),
  }
}

/**
 * `forkFromId` is separate from `id`: a fork deliberately saves under a
 * fresh id (so `id` is undefined, and `existing` below is too) while still
 * needing to know which drill it was copied from, to carry its tags across.
 */
function savePattern(name: string, snap: BoardSnapshot, id?: string, forkFromId?: string): Pattern {
  lastError.value = null
  const { patterns, unreadable, damaged } = readLibrary()

  if (unreadable) {
    lastError.value = UNREADABLE_LIBRARY_MESSAGE
    lastWriteSucceeded.value = false
    return toPattern(name, snap, id ?? makeId(), nowIso())
  }

  const existing = id ? patterns.find((p) => p.id === id) : undefined
  const pattern = toPattern(name, snap, existing?.id ?? id ?? makeId(), existing?.createdAt ?? nowIso())
  // Saving the board over a drill must not silently untag it, and neither
  // must forking one: a copy of a rondo is still a rondo, and having to
  // refile a fork by hand is the exact problem tags exist to solve. A
  // brand new drill has none, which is what `toPattern` already gave it.
  const forkSource = forkFromId ? patterns.find((p) => p.id === forkFromId) : undefined
  pattern.tags = existing?.tags ?? forkSource?.tags ?? []

  const index = patterns.findIndex((p) => p.id === pattern.id)
  if (index === -1) patterns.push(pattern)
  else patterns[index] = pattern

  if (recordWrite(errors, writeLibrary(patterns, damaged), damaged)) {
    lastError.value = damagedMessage(damaged.length, 'pattern')
  }
  return pattern
}

function deletePattern(id: string): void {
  lastError.value = null
  const { patterns, unreadable, damaged } = readLibrary()
  if (unreadable) {
    lastError.value = UNREADABLE_LIBRARY_MESSAGE
    lastWriteSucceeded.value = false
    return
  }
  if (recordWrite(errors, writeLibrary(patterns.filter((p) => p.id !== id), damaged), damaged)) {
    lastError.value = damagedMessage(damaged.length, 'pattern')
  }
}

function renamePattern(id: string, name: string): void {
  lastError.value = null
  const { patterns, unreadable, damaged } = readLibrary()
  if (unreadable) {
    lastError.value = UNREADABLE_LIBRARY_MESSAGE
    lastWriteSucceeded.value = false
    return
  }
  const pattern = patterns.find((p) => p.id === id)
  if (!pattern) return
  pattern.name = name
  pattern.updatedAt = nowIso()
  if (recordWrite(errors, writeLibrary(patterns, damaged), damaged)) {
    lastError.value = damagedMessage(damaged.length, 'pattern')
  }
}

function setTags(id: string, tags: string[]): void {
  lastError.value = null
  const { patterns, unreadable, damaged } = readLibrary()
  if (unreadable) {
    lastError.value = UNREADABLE_LIBRARY_MESSAGE
    lastWriteSucceeded.value = false
    return
  }
  const pattern = patterns.find((p) => p.id === id)
  if (!pattern) return
  pattern.tags = normaliseTags(tags)
  pattern.updatedAt = nowIso()
  if (recordWrite(errors, writeLibrary(patterns, damaged), damaged)) {
    lastError.value = damagedMessage(damaged.length, 'pattern')
  }
}

/**
 * Every tag in use, sorted. The filter row's order is the app's business.
 *
 * Does not check `readLibrary().unreadable` itself and report it the way
 * `listPatterns` does: every caller today calls `listPatterns()` first, on
 * the same read, so that error already surfaced. Reads unreadable as "no
 * tags" rather than duplicating the check — add it back if a caller ever
 * calls this without calling `listPatterns()` first.
 */
function allTags(): string[] {
  const tags = new Set<string>()
  for (const pattern of readLibrary().patterns) {
    for (const tag of pattern.tags ?? []) tags.add(tag)
  }
  return [...tags].sort()
}

function patternToSnapshot(pattern: Pattern): BoardSnapshot {
  const copy = structuredClone(pattern)
  return {
    frames: copy.frames,
    // A drill starts at the beginning. Reopening halfway through the
    // animation is never what anyone meant by opening a pattern.
    currentFrame: 0,
    labelsVisible: copy.labelsVisible ?? true,
    counterLabelsVisible: copy.counterLabelsVisible ?? true,
    ballsVisible: copy.ballsVisible ?? true,
    notes: copy.notes ?? '',
    notesVisible: copy.notesVisible ?? true,
    goals: copy.goals ?? [],
    pitch: copy.pitch,
  }
}

/**
 * The draft is a single value, not an array of entities, so it does not fit
 * `readCollection`'s per-row parsing — this stays local rather than moving
 * into `collection.ts`, which knows nothing but collections.
 */
function readRaw(key: string): unknown {
  const text = localStorage.getItem(key)
  if (text === null) return null
  return JSON.parse(text)
}

/**
 * Autosave the working board. It leaves `lastError` alone: it runs a moment
 * after every change, including the first one on load, and clearing here
 * wiped the library's "could not be read" warning before a coach could read
 * it, let alone act on it. A failed draft write still sets its own message.
 */
function saveDraft(snap: BoardSnapshot): void {
  writeRaw(errors, DRAFT_KEY, snap)
}

/**
 * The draft is transient working state, not the library, so a draft that
 * fails validation is discarded rather than preserved: starting on an empty
 * board loses at most the last few seconds, while restoring a broken one
 * loses the app. It is held to the same schema as a saved drill's frames:
 * a draft missing its ball's id would be restored, fail during render, and
 * be reloaded on every start with no way back from inside the app.
 */
function loadDraft(): BoardSnapshot | null {
  try {
    const result = SnapshotSchema.safeParse(readRaw(DRAFT_KEY))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function exportBundleJson(patterns: Pattern[], sessionList: Session[]): string {
  return JSON.stringify({ patterns, sessions: sessionList }, null, 2)
}

/**
 * One drill as a file, in the same bundle shape as the full backup so the
 * one Import reads both. A saved drill goes out as filed, tags and all; an
 * unsaved board goes out under a fresh id and the name on screen, without
 * being saved first — sending is not a decision to keep.
 */
function exportPatternJson(name: string, snap: BoardSnapshot, id: string | null): string {
  const filed = id ? listPatterns().find((p) => p.id === id) : undefined
  const pattern = filed ?? toPattern(name, snap, makeId(), nowIso())
  return exportBundleJson([pattern], [])
}

/**
 * Validate an exported file whole, then merge both collections.
 *
 * A pattern whose id already exists is added under a NEW id with a suffixed
 * name, so importing can never silently overwrite the coach's work. That
 * re-idding is why sessions cannot simply be written as they arrive: every
 * `patternId` in the file would point at an id that had just changed, and
 * the coach would open a session of entirely missing drills. The remap
 * threads the new ids through the incoming entries before they land.
 */
function importBundle(json: string): { patterns: Pattern[]; sessions: Session[] } {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('That file is not valid JSON.')
  }

  if (!isObject(raw) || !Array.isArray(raw.patterns) || !Array.isArray(raw.sessions)) {
    throw new Error('That file is not a saved bundle of drills and sessions.')
  }

  const { patterns, unreadable, damaged } = readLibrary()
  if (unreadable) {
    throw new Error(
      'Your saved patterns could not be read, so importing now would overwrite them. Export or clear your saved patterns first, then try again.',
    )
  }

  // parsePattern only checks tags are strings, not that they are normalised —
  // a hand-edited file can carry ["Rondo", "rondo "], which would otherwise
  // land as two chips in the filter row for what the coach meant as one tag.
  // Import is where untrusted data enters the library, so it is normalised
  // here, the same way `setTags` normalises a tag typed by hand.
  const incoming = raw.patterns.map((entry) => {
    const pattern = parsePattern(entry)
    // `tags?` is absent-means-empty (see the field's own comment), so a
    // pattern that arrived with none keeps it `undefined` rather than
    // gaining a `tags: []` the source never had.
    if (pattern.tags === undefined) return pattern
    const tags = normaliseTags(pattern.tags)
    return tags.length > 0 ? { ...pattern, tags } : { ...pattern, tags: undefined }
  })
  const incomingSessions = raw.sessions.map((entry) => parseSession(entry))

  // Tracked incrementally: a collision can be with the existing library OR
  // with an earlier entry in this same file. Either way the id must be
  // unique before it lands in localStorage. `remap` carries the old id
  // forward so the sessions below can follow a re-idded pattern to its new one.
  const seenIds = new Set(patterns.map((p) => p.id))
  const remap = new Map<string, string>()
  const added: Pattern[] = []

  for (const pattern of incoming) {
    if (!seenIds.has(pattern.id)) {
      seenIds.add(pattern.id)
      added.push(pattern)
      continue
    }
    const fresh = makeId()
    remap.set(pattern.id, fresh)
    seenIds.add(fresh)
    added.push({ ...pattern, id: fresh, name: `${pattern.name} (imported)` })
  }

  // The sessions store is read BEFORE either write, so an unreadable one
  // aborts the whole import rather than leaving patterns written and sessions
  // destroyed. Nothing has been written at this point, so throwing is clean.
  const sessionRead = readCollection(SESSIONS_KEY, parseSession)
  if (sessionRead.unreadable) {
    throw new Error(
      'Your saved sessions could not be read, so importing now would overwrite them. Export or clear your saved sessions first, then try again.',
    )
  }

  // Patterns first, deliberately. localStorage has no transaction, so if the
  // second write fails the import is partial either way — and patterns without
  // their sessions is the additive half. Sessions landing first would leave
  // entries pointing at drills that were never written: rows the coach has to
  // clear by hand.
  //
  // `recordWrite`'s return says whether damaged rows rode along, not whether
  // the write landed — that check is `patternsWritten` itself, same as every
  // other mutator in this file.
  const patternsWritten = writeLibrary([...patterns, ...added], damaged)
  if (recordWrite(errors, patternsWritten, damaged)) {
    lastError.value = damagedMessage(damaged.length, 'pattern')
  }
  if (!patternsWritten) {
    throw new Error('The imported drills could not be saved to this browser.')
  }

  const sessionIds = new Set(sessionRead.items.map((s) => s.id))
  const addedSessions = incomingSessions.map((session) => {
    // Tracked incrementally, exactly as the pattern loop above tracks
    // `seenIds`: a collision can be with the stored sessions OR with an
    // earlier session in this same file, and two sessions sharing an id
    // would render under duplicate keys and have rename and delete hit
    // whichever one `find` returned first.
    const id = sessionIds.has(session.id) ? makeId() : session.id
    sessionIds.add(id)
    return {
      ...session,
      id,
      entries: session.entries.map((entry) => ({
        ...entry,
        patternId: remap.get(entry.patternId) ?? entry.patternId,
      })),
    }
  })

  // Goes through the sessions module's own bulk write rather than poking
  // `writeCollection` directly here — that keeps the upsert-by-id and
  // damaged-row handling in the one place that already owns it.
  sessions.saveSessions(addedSessions)
  // The sessions store's own write flag, not this store's: they no longer
  // share one ref, and this write went through `sessions.saveSessions`, not
  // `writeLibrary`.
  if (!sessions.lastWriteSucceeded.value) {
    throw new Error('The imported sessions could not be saved to this browser.')
  }

  return { patterns: added, sessions: addedSessions }
}

/** The saved patterns the app could not read, as stored, or null if none. */
function unreadablePatterns(): string | null {
  return unreadableText(PATTERNS_KEY, parsePattern)
}

/** Drop the saved patterns the app could not read; every readable one stays. */
function discardUnreadablePatterns(): boolean {
  return discardUnreadable(errors, PATTERNS_KEY, parsePattern)
}

const storage = {
  listPatterns,
  unreadablePatterns,
  discardUnreadablePatterns,
  seedStarterLibrary,
  savePattern,
  deletePattern,
  renamePattern,
  setTags,
  allTags,
  patternToSnapshot,
  saveDraft,
  loadDraft,
  importBundle,
  exportBundleJson,
  exportPatternJson,
  lastError,
  lastWriteSucceeded,
}

export function useStorage() {
  return storage
}
