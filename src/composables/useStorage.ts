import { ref } from 'vue'
import type { Pattern } from '../types'
import type { BoardSnapshot } from './useBoard'

export const PATTERNS_KEY = 'fct.patterns.v1'
export const DRAFT_KEY = 'fct.draft.v1'

const SCHEMA_VERSION = 1

const lastError = ref<string | null>(null)

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A position in pitch units: { x: number, y: number }. */
function isVec(value: unknown): boolean {
  return isObject(value) && typeof value.x === 'number' && typeof value.y === 'number'
}

function isValidCounter(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.color === 'string' &&
    typeof value.label === 'string' &&
    isVec(value.pos)
  )
}

function isValidBall(value: unknown): boolean {
  return (
    isObject(value) &&
    isVec(value.pos) &&
    (value.attachedTo === null || typeof value.attachedTo === 'string')
  )
}

function isValidDrawing(value: unknown): boolean {
  if (!isObject(value)) return false
  if (value.kind === 'pen') return Array.isArray(value.points)
  if (value.kind === 'arrow') return isVec(value.from) && isVec(value.to)
  return false
}

/** Validate an untrusted value as a Pattern. Throws with a readable reason. */
export function parsePattern(value: unknown): Pattern {
  if (!isObject(value)) throw new Error('That is not a saved pattern.')

  if (value.version !== SCHEMA_VERSION) {
    throw new Error(
      `This pattern was saved by a newer version of the app (version ${String(value.version)}). Update the app to open it.`,
    )
  }

  if (typeof value.id !== 'string' || typeof value.name !== 'string') {
    throw new Error('That pattern is missing its name or id.')
  }

  if (
    !isObject(value.pitch) ||
    typeof value.pitch.type !== 'string' ||
    typeof value.pitch.rotated !== 'boolean'
  ) {
    throw new Error('That pattern is missing its pitch settings.')
  }

  if (!Array.isArray(value.drawings)) throw new Error('That pattern is missing its drawings.')
  if (!value.drawings.every(isValidDrawing)) {
    throw new Error('That pattern has a damaged drawing.')
  }

  if (!Array.isArray(value.frames) || value.frames.length === 0) {
    throw new Error('That pattern has no frames.')
  }

  for (const frame of value.frames) {
    if (!isObject(frame) || !Array.isArray(frame.counters) || !isObject(frame.ball)) {
      throw new Error('That pattern has a damaged frame.')
    }
    if (!frame.counters.every(isValidCounter)) {
      throw new Error('That pattern has a damaged player position.')
    }
    if (!isValidBall(frame.ball)) {
      throw new Error('That pattern has a damaged ball position.')
    }
  }

  return value as unknown as Pattern
}

function readRaw(key: string): unknown {
  const text = localStorage.getItem(key)
  if (text === null) return null
  return JSON.parse(text)
}

function writeRaw(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    lastError.value =
      name === 'QuotaExceededError'
        ? 'The browser is out of space. Export some patterns to a file and delete them to free room.'
        : 'That could not be saved to this browser.'
    return false
  }
}

const UNREADABLE_LIBRARY_MESSAGE =
  'Your saved patterns could not be read, so saving now would overwrite them. Export or clear your saved patterns first, then try again.'

type LibraryRead = {
  patterns: Pattern[]
  /** True when the top-level stored value itself could not be trusted (bad JSON, or not an array). */
  unreadable: boolean
  /** Count of individual entries that failed to parse even though the top-level value was fine. */
  dropped: number
}

/**
 * Read the library and say what kind of problem, if any, was found.
 *
 * `unreadable` is the disaster case: the stored bytes could not be trusted
 * at all, and a caller that goes on to write would permanently destroy them.
 * A merely `dropped` entry, by contrast, is a partial read of an otherwise
 * good library — writing over it is fine and expected.
 */
function readLibrary(): LibraryRead {
  let raw: unknown
  try {
    raw = readRaw(PATTERNS_KEY)
  } catch {
    return { patterns: [], unreadable: true, dropped: 0 }
  }

  if (raw === null) return { patterns: [], unreadable: false, dropped: 0 }
  if (!Array.isArray(raw)) return { patterns: [], unreadable: true, dropped: 0 }

  const patterns: Pattern[] = []
  let dropped = 0
  for (const entry of raw) {
    try {
      patterns.push(parsePattern(entry))
    } catch {
      dropped += 1
    }
  }
  return { patterns, unreadable: false, dropped }
}

function listPatterns(): Pattern[] {
  lastError.value = null
  const { patterns, unreadable, dropped } = readLibrary()

  if (unreadable) {
    lastError.value =
      'Your saved patterns could not be read. The stored data has been left untouched so it can be recovered.'
    return []
  }

  if (dropped > 0) {
    lastError.value = `${dropped} damaged pattern(s) could not be read and were skipped.`
  }
  return patterns
}

function writePatterns(patterns: Pattern[]): boolean {
  return writeRaw(PATTERNS_KEY, patterns)
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
    drawings: copy.drawings,
    frames: [{ counters: copy.counters, ball: copy.ball }],
    createdAt,
    updatedAt: nowIso(),
  }
}

function savePattern(name: string, snap: BoardSnapshot, id?: string): Pattern {
  lastError.value = null
  const { patterns, unreadable } = readLibrary()

  if (unreadable) {
    lastError.value = UNREADABLE_LIBRARY_MESSAGE
    return toPattern(name, snap, id ?? makeId(), nowIso())
  }

  const existing = id ? patterns.find((p) => p.id === id) : undefined
  const pattern = toPattern(name, snap, existing?.id ?? id ?? makeId(), existing?.createdAt ?? nowIso())

  const index = patterns.findIndex((p) => p.id === pattern.id)
  if (index === -1) patterns.push(pattern)
  else patterns[index] = pattern

  writePatterns(patterns)
  return pattern
}

function deletePattern(id: string): void {
  lastError.value = null
  const { patterns, unreadable } = readLibrary()
  if (unreadable) {
    lastError.value = UNREADABLE_LIBRARY_MESSAGE
    return
  }
  writePatterns(patterns.filter((p) => p.id !== id))
}

function renamePattern(id: string, name: string): void {
  lastError.value = null
  const { patterns, unreadable } = readLibrary()
  if (unreadable) {
    lastError.value = UNREADABLE_LIBRARY_MESSAGE
    return
  }
  const pattern = patterns.find((p) => p.id === id)
  if (!pattern) return
  pattern.name = name
  pattern.updatedAt = nowIso()
  writePatterns(patterns)
}

function patternToSnapshot(pattern: Pattern): BoardSnapshot {
  const copy = structuredClone(pattern)
  const frame = copy.frames[0]
  return {
    counters: frame.counters,
    ball: frame.ball,
    drawings: copy.drawings,
    pitch: copy.pitch,
  }
}

function saveDraft(snap: BoardSnapshot): void {
  lastError.value = null
  writeRaw(DRAFT_KEY, snap)
}

function loadDraft(): BoardSnapshot | null {
  try {
    const raw = readRaw(DRAFT_KEY)
    if (!isObject(raw) || !Array.isArray(raw.counters) || !isObject(raw.pitch)) return null
    return raw as unknown as BoardSnapshot
  } catch {
    return null
  }
}

function exportPatternsJson(patterns: Pattern[]): string {
  return JSON.stringify(patterns, null, 2)
}

/**
 * Validate an exported file whole, then merge. A pattern whose id already
 * exists is added under a NEW id with a suffixed name, so importing can
 * never silently overwrite the coach's existing work.
 */
function importPatterns(json: string): Pattern[] {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('That file is not valid JSON.')
  }

  if (!Array.isArray(raw)) throw new Error('That file does not contain a list of patterns.')

  const incoming = raw.map((entry) => parsePattern(entry))

  const patterns = listPatterns()
  // Tracked incrementally: a collision can be with the existing library OR
  // with an earlier entry in this same file. Either way the id must be
  // unique before it lands in localStorage.
  const seenIds = new Set(patterns.map((p) => p.id))

  const added: Pattern[] = []
  for (const pattern of incoming) {
    if (!seenIds.has(pattern.id)) {
      seenIds.add(pattern.id)
      added.push(pattern)
      continue
    }
    const renamed = { ...pattern, id: makeId(), name: `${pattern.name} (imported)` }
    seenIds.add(renamed.id)
    added.push(renamed)
  }

  writePatterns([...patterns, ...added])
  return added
}

const storage = {
  listPatterns,
  savePattern,
  deletePattern,
  renamePattern,
  patternToSnapshot,
  saveDraft,
  loadDraft,
  importPatterns,
  exportPatternsJson,
  lastError,
}

export function useStorage() {
  return storage
}
